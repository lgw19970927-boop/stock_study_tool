"""
App/Feature/Screening/routes.py
股票篩選頁面路由 + API 路由
整合 HTMX：GET /screening 回傳 Jinja2 頁面或 HTML 片段
"""
from fastapi import APIRouter, Request, HTTPException, Query
from fastapi.responses import StreamingResponse, HTMLResponse
from typing import Optional
import json
import asyncio
import logging

from .service import screen_stocks, screen_single_stock
from .indicators.service import resolve_analysis_dates
from ..models import ScreeningRequest, ScreeningResponse, StockResult

router = APIRouter()
logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════
# 頁面路由（Jinja2 / HTMX）
# ═══════════════════════════════════════════════════════════════════

@router.get("/screening", response_class=HTMLResponse)
async def screening_page(request: Request):
    """
    股票篩選頁面。
    - 一般請求 → 完整 Jinja2 rendered HTML（base.html 包裹）
    - HTMX 請求（HX-Request header）→ 只回傳 #content 內容片段
    """
    templates = request.app.state.templates
    context = {"request": request}

    if request.headers.get("HX-Request"):
        # HTMX 切換分頁：只回傳內容片段（不含 base.html）
        return templates.TemplateResponse(
            "Screening/screening_fragment.html", context
        )
    return templates.TemplateResponse("Screening/screening.html", context)


# ═══════════════════════════════════════════════════════════════════
# API：篩選（同步版，向後相容）
# ═══════════════════════════════════════════════════════════════════

@router.post("/api/screening/filter")
def filter_stocks(request_body: ScreeningRequest):
    """執行股票篩選（同步版本，保留向後相容）"""
    try:
        logger.info(
            f"收到篩選請求: markets={request_body.markets}, "
            f"frequency={request_body.frequency}"
        )
        result = screen_stocks(
            markets=request_body.markets,
            frequency=request_body.frequency,
            indicators=[ind.dict() for ind in request_body.indicators],
            analysis_start_date=request_body.analysis_start_date,
            analysis_end_date=request_body.analysis_end_date,
        )
        stocks = [StockResult(**s) for s in result["stocks"]]
        return ScreeningResponse(
            total=result["total"],
            stocks=stocks,
            statistics=result["statistics"],
        )
    except Exception as e:
        logger.error(f"篩選失敗: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"篩選失敗: {str(e)}")


# ═══════════════════════════════════════════════════════════════════
# API：SSE 串流篩選（含進度條）
# ═══════════════════════════════════════════════════════════════════

import decimal

def _sse_default(obj):
    if isinstance(obj, decimal.Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False, default=_sse_default)}\n\n"


@router.get("/api/screening/filter/stream")
async def filter_stocks_stream(
    markets:             Optional[str] = None,
    frequency:           str           = "daily",
    indicators_json:     Optional[str] = None,
    analysis_start_date: Optional[str] = None,
    analysis_end_date:   Optional[str] = None,
    time_range:          Optional[str] = None,
):
    """
    指標篩選 SSE 串流端點。
    SSE 格式：
      進度 → {"type":"progress","current":N,"total":M,"matched":K}
      完成 → {"type":"done","stocks":[...],"statistics":{...}}
      錯誤 → {"type":"error","message":"..."}
    """
    markets_list    = [m.strip() for m in (markets or "listed,otc").split(",") if m.strip()]
    indicators_list = json.loads(indicators_json or "[]")
    with open("debug_indicators.json", "w", encoding="utf-8") as f:
        json.dump(indicators_list, f, ensure_ascii=False, indent=2)
    timeframe       = indicators_list[0].get("timeframe", "1d") if indicators_list else "1d"

    resolved_start, resolved_end = resolve_analysis_dates(
        time_range, analysis_start_date, analysis_end_date
    )

    async def event_stream():
        try:
            from ...Feature.data_sync.db import get_market_cursor

            with get_market_cursor() as cursor:
                # 取得大盤基準日 (以資料庫最新的一筆 K 線時間為準)
                cursor.execute("SELECT MAX(datetime) as max_date FROM market_data_ohlcv")
                row = cursor.fetchone()
                benchmark_date = row["max_date"] if row else None
                if benchmark_date and isinstance(benchmark_date, str):
                    # 確保格式一致
                    benchmark_date = benchmark_date.split(" ")[0]

                mkt_lower    = [m.lower() for m in markets_list]
                placeholders = ",".join(["%s"] * len(mkt_lower))
                cursor.execute(
                    f"SELECT symbol, name, market FROM stock_meta "
                    f"WHERE LOWER(market) IN ({placeholders}) AND status = 'Active'",
                    mkt_lower,
                )
                stock_list = cursor.fetchall()

            total         = len(stock_list)
            matched_stocks = []
            matched_count  = 0

            for idx, stock in enumerate(stock_list):
                symbol = stock["symbol"]
                name   = stock["name"]
                market = stock["market"]

                yield _sse({
                    "type":    "progress",
                    "current": idx + 1,
                    "total":   total,
                    "matched": matched_count,
                })

                if idx % 10 == 0:
                    await asyncio.sleep(0)

                result = await asyncio.get_event_loop().run_in_executor(
                    None,
                    screen_single_stock,
                    symbol, name, market,
                    indicators_list, timeframe,
                    resolved_start, resolved_end,
                    benchmark_date
                )

                if result:
                    result["patterns_found"] = []
                    matched_stocks.append(result)
                    matched_count += 1

            gainers           = sum(1 for s in matched_stocks if s.get("change_percent", 0) > 0)
            losers            = sum(1 for s in matched_stocks if s.get("change_percent", 0) < 0)
            data_insufficient = sum(1 for s in matched_stocks if s.get("data_insufficient", False))

            yield _sse({
                "type":   "done",
                "stocks": matched_stocks,
                "statistics": {
                    "total":             len(matched_stocks),
                    "gainers":           gainers,
                    "losers":            losers,
                    "data_insufficient": data_insufficient,
                },
            })

        except Exception as e:
            logger.exception(f"filter_stocks_stream 錯誤: {e}")
            yield _sse({"type": "error", "message": str(e)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
