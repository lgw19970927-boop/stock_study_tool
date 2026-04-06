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
from datetime import datetime

from .service import screen_stocks, screen_single_stock
from .indicators.service import resolve_analysis_dates
from .models import (
    ScreeningRequest,
    ScreeningResponse,
    StockResult,
    StrategyCreateRequest,
    StrategyUpdateRequest,
    StrategyItem,
    StrategyListResponse,
)
from ...lib.db import get_user_cursor

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
        # screening_full_page=False → fragment 底部 {% if not screening_full_page %} 會載入 JS
        return templates.TemplateResponse(
            "screening/screening_fragment.html", context
        )
    # 完整頁渲染：scripts 由 extra_scripts block 載入，fragment 內不重複載入
    context["screening_full_page"] = True
    return templates.TemplateResponse("screening/screening.html", context)


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
    timeframe       = indicators_list[0].get("timeframe", "1d") if indicators_list else "1d"

    resolved_start, resolved_end = resolve_analysis_dates(
        time_range, analysis_start_date, analysis_end_date
    )

    async def event_stream():
        try:
            from app.lib.db import get_market_cursor

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
                    "partial_stocks":     matched_stocks,
                    "partial_statistics": {
                        "total":             matched_count,
                        "gainers":           sum(1 for s in matched_stocks if s.get("change_percent", 0) > 0),
                        "losers":            sum(1 for s in matched_stocks if s.get("change_percent", 0) < 0),
                        "data_insufficient": sum(1 for s in matched_stocks if s.get("data_insufficient", False)),
                    },
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


# ═══════════════════════════════════════════════════════════════════
# API：策略管理（user_data.strategies）
# ═══════════════════════════════════════════════════════════════════

def _to_iso_datetime_str(value) -> Optional[str]:
    if value is None:
        return None
    if hasattr(value, "strftime"):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    return str(value)


def _parse_strategy_configuration(raw_value) -> dict:
    if isinstance(raw_value, dict):
        return raw_value
    if raw_value in (None, ""):
        return {}

    text = str(raw_value)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.warning("Strategy configuration JSON parse failed, fallback to empty object")
        return {}


def _normalize_strategy_row(row: dict) -> dict:
    return {
        "id": int(row["id"]),
        "name": str(row.get("name") or ""),
        "description": row.get("description"),
        "configuration": _parse_strategy_configuration(row.get("configuration")),
        "is_active": bool(row.get("is_active", 1)),
        "created_at": _to_iso_datetime_str(row.get("created_at")),
        "updated_at": _to_iso_datetime_str(row.get("updated_at")),
    }


def _load_strategy_item(strategy_id: int, include_inactive: bool = False) -> Optional[dict]:
    with get_user_cursor() as cursor:
        if include_inactive:
            cursor.execute(
                """
                SELECT id, name, description, is_active, created_at, updated_at, configuration
                FROM strategies
                WHERE id = %s
                LIMIT 1
                """,
                (strategy_id,),
            )
        else:
            cursor.execute(
                """
                SELECT id, name, description, is_active, created_at, updated_at, configuration
                FROM strategies
                WHERE id = %s AND is_active = 1
                LIMIT 1
                """,
                (strategy_id,),
            )
        row = cursor.fetchone()
    if not row:
        return None
    return _normalize_strategy_row(row)


@router.get("/api/strategies", response_model=StrategyListResponse)
def list_strategies(include_inactive: bool = Query(False)):
    try:
        with get_user_cursor() as cursor:
            if include_inactive:
                cursor.execute(
                    """
                    SELECT id, name, description, is_active, created_at, updated_at, configuration
                    FROM strategies
                    ORDER BY updated_at DESC, id DESC
                    """
                )
            else:
                cursor.execute(
                    """
                    SELECT id, name, description, is_active, created_at, updated_at, configuration
                    FROM strategies
                    WHERE is_active = 1
                    ORDER BY updated_at DESC, id DESC
                    """
                )
            rows = cursor.fetchall()

        items = [StrategyItem(**_normalize_strategy_row(row)) for row in rows]
        return StrategyListResponse(total=len(items), strategies=items)
    except Exception as e:
        logger.error(f"讀取策略失敗: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"讀取策略失敗: {str(e)}")


@router.post("/api/strategies", response_model=StrategyItem)
def create_strategy(request_body: StrategyCreateRequest):
    name = request_body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="策略名稱不可為空")

    try:
        config_json = json.dumps(request_body.configuration, ensure_ascii=False)
    except (TypeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"configuration JSON 格式錯誤: {e}")

    try:
        with get_user_cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO strategies (name, description, is_active, created_at, updated_at, configuration)
                VALUES (%s, %s, 1, NOW(), NOW(), %s)
                """,
                (name, request_body.description, config_json),
            )
            strategy_id = int(cursor.lastrowid)

        created = _load_strategy_item(strategy_id)
        if not created:
            raise HTTPException(status_code=500, detail="策略建立成功但讀取失敗")
        return StrategyItem(**created)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"新增策略失敗: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"新增策略失敗: {str(e)}")


@router.put("/api/strategies/{strategy_id}", response_model=StrategyItem)
def update_strategy(strategy_id: int, request_body: StrategyUpdateRequest):
    existing = _load_strategy_item(strategy_id)
    if not existing:
        raise HTTPException(status_code=404, detail="策略不存在")

    name = existing["name"]
    if request_body.name is not None:
        name = request_body.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="策略名稱不可為空")

    description = existing["description"]
    if request_body.description is not None:
        description = request_body.description

    configuration = existing["configuration"]
    if request_body.configuration is not None:
        configuration = request_body.configuration

    try:
        config_json = json.dumps(configuration, ensure_ascii=False)
    except (TypeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"configuration JSON 格式錯誤: {e}")

    try:
        with get_user_cursor() as cursor:
            cursor.execute(
                """
                UPDATE strategies
                SET name = %s,
                    description = %s,
                    configuration = %s,
                    updated_at = %s
                WHERE id = %s AND is_active = 1
                """,
                (name, description, config_json, datetime.now(), strategy_id),
            )

        updated = _load_strategy_item(strategy_id)
        if not updated:
            raise HTTPException(status_code=404, detail="策略不存在或已刪除")
        return StrategyItem(**updated)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新策略失敗: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"更新策略失敗: {str(e)}")


@router.delete("/api/strategies/{strategy_id}")
def delete_strategy(strategy_id: int):
    try:
        existing = _load_strategy_item(strategy_id)
        if not existing:
            raise HTTPException(status_code=404, detail="策略不存在")

        with get_user_cursor() as cursor:
            cursor.execute(
                """
                UPDATE strategies
                SET is_active = 0,
                    updated_at = %s
                WHERE id = %s AND is_active = 1
                """,
                (datetime.now(), strategy_id),
            )

        return {"ok": True, "id": strategy_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"刪除策略失敗: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"刪除策略失敗: {str(e)}")
