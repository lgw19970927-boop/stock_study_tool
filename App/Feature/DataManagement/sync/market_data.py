"""
App/Lib/market_data.py
共用市場數據查詢工具（MySQL 版）
原 backend/api/routers/market_data.py + stocks.py 的共用邏輯
"""
from fastapi import APIRouter, Path, Query, HTTPException
from typing import Optional
from datetime import datetime, timedelta
import pandas as pd
import logging

from App.Lib.db import get_market_cursor
from ...models import MarketDataResponse, OHLCBar, StocksResponse, StockMeta

router = APIRouter()
logger = logging.getLogger(__name__)

# ==========================================
# 時間週期重採樣
# ==========================================

def _resample(df: pd.DataFrame, rule: str) -> pd.DataFrame:
    if "datetime" in df.columns:
        df["datetime"] = pd.to_datetime(df["datetime"])
        df = df.set_index("datetime")
    agg = {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}
    return df.resample(rule).agg(agg).dropna().reset_index()


RESAMPLE_RULES = {
    "1w": "W-MON",
    "1M": "MS",
    "1y": "YS",
}


# ==========================================
# 股票列表 API
# ==========================================

@router.get("/api/stocks", response_model=StocksResponse)
def get_stocks(
    market: Optional[str] = Query(None, description="市場類型過濾: listed, otc, ipo"),
    status: str = Query("active", description="股票狀態: active, all"),
):
    """獲取股票列表（MySQL 版）"""
    try:
        query  = "SELECT symbol, name, market FROM stock_meta WHERE 1=1"
        params: list = []

        if market:
            query += " AND market = %s"
            params.append(market)

        if status == "active":
            query += " AND status = 'Active'"

        query += " ORDER BY symbol ASC"

        with get_market_cursor() as cursor:
            cursor.execute(query, params)
            rows = cursor.fetchall()

        stocks = [StockMeta(symbol=r["symbol"], name=r["name"], market=r["market"]) for r in rows]
        return StocksResponse(total=len(stocks), stocks=stocks)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"獲取股票列表失敗: {str(e)}")


# ==========================================
# K 線數據 API
# ==========================================

@router.get("/api/market-data/kline-count")
async def get_kline_count(
    interval:            str           = Query(..., description="型態週期，例如 '1D'"),
    time_range:          Optional[str] = Query(None, description="快捷範圍，例如 '1M'"),
    analysis_start_date: Optional[str] = Query(None),
    analysis_end_date:   Optional[str] = Query(None),
):
    """獲取指定時間範圍內實際 K 線數量（MySQL 版）"""
    try:
        from ..Screening.indicators.service import resolve_analysis_dates, interval_to_db_format, needs_resample, resample_prices

        resolved_start, resolved_end = resolve_analysis_dates(
            time_range, analysis_start_date, analysis_end_date
        )
        db_timeframe    = interval_to_db_format(interval)
        preferred       = ["SPY", "AAPL", "QQQ"]
        placeholders    = ",".join(["%s"] * len(preferred))
        end_dt_str      = resolved_end if " " in resolved_end else f"{resolved_end} 23:59:59"

        with get_market_cursor() as cursor:
            # 優先找 SPY
            cursor.execute(
                f"""
                SELECT symbol FROM market_data_ohlcv
                WHERE symbol IN ({placeholders}) AND timeframe = %s AND datetime >= %s
                ORDER BY CASE symbol WHEN 'SPY' THEN 1 WHEN 'AAPL' THEN 2 WHEN 'QQQ' THEN 3 ELSE 4 END
                LIMIT 1
                """,
                (*preferred, db_timeframe, resolved_start),
            )
            row = cursor.fetchone()

            if not row:
                cursor.execute(
                    "SELECT symbol FROM market_data_ohlcv WHERE timeframe = %s AND datetime >= %s LIMIT 1",
                    (db_timeframe, resolved_start),
                )
                row = cursor.fetchone()

            if not row:
                return {"count": 0, "symbol_used": None}

            target_symbol = row["symbol"]

            cursor.execute(
                """
                SELECT datetime, open, high, low, close, volume
                FROM market_data_ohlcv
                WHERE symbol = %s AND timeframe = %s AND datetime >= %s AND datetime <= %s
                ORDER BY datetime ASC
                """,
                (target_symbol, db_timeframe, resolved_start, end_dt_str),
            )
            rows = cursor.fetchall()

        if not rows:
            return {"count": 0, "symbol_used": target_symbol}

        df = pd.DataFrame(rows)
        if needs_resample(interval):
            df = resample_prices(df, interval)

        return {"count": len(df), "symbol_used": target_symbol}

    except Exception as e:
        logger.error(f"獲取 K 線數量失敗: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"獲取 K 線數量失敗: {str(e)}")


@router.get("/api/market-data/{symbol}", response_model=MarketDataResponse)
def get_market_data(
    symbol:     str           = Path(...),
    interval:   str           = Query("1d"),
    period:     Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date:   Optional[str] = Query(None),
):
    """獲取股票 K 線數據（MySQL 版）"""
    try:
        # 週/月/年線從日線重採樣
        source_interval = "1d" if interval in RESAMPLE_RULES else interval
        do_resample     = interval in RESAMPLE_RULES

        # 計算日期範圍
        if start_date and end_date:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            end_dt   = datetime.strptime(end_date, "%Y-%m-%d")
        elif period:
            end_dt   = datetime.now()
            period_map = {
                "1D": timedelta(days=1),   "1W": timedelta(weeks=1),
                "1M": timedelta(days=30),  "3M": timedelta(days=90),
                "6M": timedelta(days=180), "1Y": timedelta(days=365),
                "5Y": timedelta(days=365*5),
            }
            if period == "max":
                start_dt = datetime(1970, 1, 1)
            elif period in period_map:
                start_dt = end_dt - period_map[period]
            else:
                raise HTTPException(status_code=400, detail=f"無效 period: {period}")
        else:
            end_dt   = datetime.now()
            start_dt = end_dt - timedelta(days=90)

        # MySQL 查詢（%s 佔位符）
        with get_market_cursor() as cursor:
            cursor.execute(
                """
                SELECT datetime, open, high, low, close, volume
                FROM market_data_ohlcv
                WHERE symbol = %s AND timeframe = %s
                  AND datetime BETWEEN %s AND %s
                ORDER BY datetime ASC
                """,
                (
                    symbol.upper(),
                    source_interval,
                    start_dt.strftime("%Y-%m-%d"),
                    end_dt.strftime("%Y-%m-%d 23:59:59"),
                ),
            )
            rows = cursor.fetchall()

        if not rows:
            return MarketDataResponse(symbol=symbol.upper(), interval=interval, data=[])

        df = pd.DataFrame(rows)

        if do_resample:
            rule = RESAMPLE_RULES[interval]
            df   = _resample(df, rule)

        bars = [
            OHLCBar(
                time=(
                    row["datetime"] if isinstance(row["datetime"], str)
                    else row["datetime"].strftime("%Y-%m-%d %H:%M:%S")
                ),
                open=float(row["open"]), high=float(row["high"]),
                low=float(row["low"]),   close=float(row["close"]),
                volume=int(row["volume"]),
            )
            for _, row in df.iterrows()
        ]

        return MarketDataResponse(symbol=symbol.upper(), interval=interval, data=bars)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查詢 K 線數據失敗: {str(e)}")
