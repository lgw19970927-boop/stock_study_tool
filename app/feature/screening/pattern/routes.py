"""
Pattern Recognition Router
型態辨識 API：SSE 串流端點
GET /api/screening/pattern-recognition/stream
"""
import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from .service import (
    resolve_analysis_dates,
    interval_to_db_format,
    needs_resample,
    resample_prices,
    fetch_stock_prices,
    get_stocks_by_markets,
    recognize_patterns,
)

logger = logging.getLogger(__name__)
router = APIRouter()

def sse_message(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

@router.get("/api/screening/pattern-recognition/stream")
async def pattern_recognition_stream(
    markets_str:       Optional[str] = None,
    patterns_str:      Optional[str] = None,
    sensitivity:       int           = 75,
    pattern_min:       int           = 20,
    pattern_max:       int           = 60,
    interval:          str           = "1D",
    time_range:        Optional[str] = None,
    start_date:        Optional[str] = None,
    end_date:          Optional[str] = None,
    stock_symbols_str: Optional[str] = None,
):
    markets       = [m.strip() for m in (markets_str or "listed,otc").split(",") if m.strip()]
    patterns      = [p.strip() for p in (patterns_str or "").split(",") if p.strip()]
    stock_symbols = [s.strip() for s in (stock_symbols_str or "").split(",") if s.strip()]

    async def event_stream():
        try:
            s_date, e_date = resolve_analysis_dates(time_range, start_date, end_date)
            db_interval    = interval_to_db_format(interval)

            if stock_symbols:
                all_stocks = {s["symbol"]: s for s in get_stocks_by_markets(markets)}
                stock_list = [all_stocks.get(sym, {"symbol": sym, "name": sym, "market": ""})
                              for sym in stock_symbols]
            else:
                stock_list = get_stocks_by_markets(markets)

            total = len(stock_list)
            if total == 0:
                yield sse_message({"type": "error", "message": "無符合條件的股票"})
                return

            matched_stocks = []
            matched_count  = 0

            for idx, stock in enumerate(stock_list):
                symbol = stock["symbol"]
                name   = stock.get("name", symbol)
                market = stock.get("market", "")

                yield sse_message({
                    "type":    "progress",
                    "current": idx + 1,
                    "total":   total,
                    "matched": matched_count,
                    "partial_stocks":     matched_stocks,
                    "partial_statistics": {
                        "total":   matched_count,
                        "gainers": sum(1 for s in matched_stocks if s["change_percent"] > 0),
                        "losers":  sum(1 for s in matched_stocks if s["change_percent"] < 0),
                    },
                })

                if idx % 10 == 0:
                    await asyncio.sleep(0)

                prices_raw = await asyncio.get_event_loop().run_in_executor(
                    None,
                    fetch_stock_prices,
                    symbol, db_interval, s_date, e_date
                )
                
                if not prices_raw:
                    continue

                if needs_resample(interval):
                    import pandas as pd
                    df = pd.DataFrame(prices_raw).rename(columns={"time": "datetime"})
                    df = resample_prices(df, interval)
                    prices_raw = df.rename(columns={"datetime": "time"}).to_dict(orient="records")

                if not prices_raw:
                    continue

                found = await asyncio.get_event_loop().run_in_executor(
                    None,
                    recognize_patterns,
                    prices_raw, patterns, sensitivity, pattern_min, pattern_max
                )

                if not found:
                    continue

                last  = prices_raw[-1]
                prev  = prices_raw[-2] if len(prices_raw) > 1 else last
                price = float(last.get("close", 0))
                change_pct = 0.0
                prev_close = float(prev.get("close", 0))
                if prev_close != 0:
                    change_pct = ((price - prev_close) / prev_close) * 100

                matched_stocks.append({
                    "symbol":             symbol,
                    "name":               name,
                    "market":             market,
                    "price":              round(price, 2),
                    "change_percent":     round(change_pct, 2),
                    "volume":             int(last.get("volume", 0)),
                    "matched_indicators": [],
                    "patterns_found":     found,
                    "data_insufficient":  False,
                })
                matched_count += 1

            gainers = sum(1 for s in matched_stocks if s["change_percent"] > 0)
            losers  = sum(1 for s in matched_stocks if s["change_percent"] < 0)

            patterns_breakdown: dict = {}
            for stock in matched_stocks:
                for pf in stock["patterns_found"]:
                    key = pf["display_name"]
                    patterns_breakdown[key] = patterns_breakdown.get(key, 0) + 1

            yield sse_message({
                "type":   "done",
                "stocks": matched_stocks,
                "statistics": {
                    "total":              len(matched_stocks),
                    "gainers":            gainers,
                    "losers":             losers,
                    "patterns_breakdown": patterns_breakdown,
                },
            })

        except Exception as e:
            logger.exception(f"pattern_recognition_stream 錯誤: {e}")
            yield sse_message({"type": "error", "message": str(e)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":               "no-cache",
            "X-Accel-Buffering":           "no",
            "Access-Control-Allow-Origin": "*",
        },
    )
