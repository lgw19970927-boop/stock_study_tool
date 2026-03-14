"""
App/Lib/data_sync/fetch_basis_data.py
下載 SPY 及所有現有股票的基準 K 線資料
（由 reference/extracted/backend/data_sync/fetch_basis_data.py 移植，SQLite → MySQL）
"""
import yfinance as yf
import pandas as pd
import logging
import argparse
import time
from datetime import datetime

from App.Feature.data_sync.db import get_market_cursor

logger = logging.getLogger(__name__)

SPY_SYMBOL = "SPY"

# interval → yfinance period 上限
FETCH_CONFIG = {
    "1d":  "max",
    "1h":  "730d",
    "30m": "60d",
    "15m": "60d",
    "5m":  "60d",
    "1m":  "7d",
}


# ══════════════════════════════════════════════════════════════════
# 工具函式
# ══════════════════════════════════════════════════════════════════

def _ensure_spy_in_meta() -> None:
    """確保 SPY 存在於 stock_meta，否則插入。"""
    with get_market_cursor() as cursor:
        cursor.execute("SELECT symbol FROM stock_meta WHERE symbol = %s", (SPY_SYMBOL,))
        if not cursor.fetchone():
            logger.info(f"{SPY_SYMBOL} not found in meta, inserting...")
            cursor.execute(
                """
                INSERT IGNORE INTO stock_meta (symbol, name, market, last_updated, status)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (SPY_SYMBOL, "SPDR S&P 500 ETF Trust", "Listed",
                 datetime.now().strftime('%Y-%m-%d'), "Active")
            )


def _insert_ticker_data(cursor, symbol: str, df: pd.DataFrame, interval: str) -> int:
    """
    將 yfinance DataFrame 寫入 MySQL market_data_ohlcv。
    回傳實際寫入筆數。
    """
    df = df.reset_index()
    date_col = 'Date' if 'Date' in df.columns else 'Datetime'
    if date_col not in df.columns:
        date_col = df.columns[0]

    date_format = '%Y-%m-%d %H:%M:%S' if ('m' in interval or 'h' in interval) else '%Y-%m-%d'

    rows = []
    for _, row in df.iterrows():
        dt_val = row[date_col]
        if pd.isna(dt_val):
            continue
        try:
            if getattr(dt_val, 'tzinfo', None) is not None:
                dt_val = dt_val.tz_convert(None)
            dt_str = dt_val.strftime(date_format)
        except Exception:
            dt_str = str(dt_val)

        def _f(x):
            try:
                return None if pd.isna(x) else float(x)
            except Exception:
                return None

        c = _f(row.get('Close'))
        if c is None:
            continue

        rows.append((str(symbol), str(interval), dt_str,
                     _f(row.get('Open')), _f(row.get('High')),
                     _f(row.get('Low')), c, _f(row.get('Volume'))))

    if rows:
        cursor.executemany(
            """
            INSERT INTO market_data_ohlcv
                (symbol, timeframe, datetime, open, high, low, close, volume)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                open   = VALUES(open),
                high   = VALUES(high),
                low    = VALUES(low),
                close  = VALUES(close),
                volume = VALUES(volume)
            """,
            rows
        )
    return len(rows)


def _extract_ticker_df(data: pd.DataFrame, ticker: str):
    """從 yfinance 回傳的（可能為 MultiIndex）DataFrame 中擷取單支股票資料。"""
    if data.empty:
        return None
    if not isinstance(data.columns, pd.MultiIndex):
        return data
    for lvl in range(data.columns.nlevels):
        if ticker in data.columns.get_level_values(lvl):
            try:
                return data.xs(ticker, level=lvl, axis=1)
            except Exception:
                pass
    return None


# ══════════════════════════════════════════════════════════════════
# 主要操作函式
# ══════════════════════════════════════════════════════════════════

def fetch_and_store_spy() -> None:
    """下載 SPY 所有週期的最大允許歷史資料並寫入 MySQL。"""
    _ensure_spy_in_meta()
    total_saved = 0

    for interval, period in FETCH_CONFIG.items():
        logger.info(f"Downloading {SPY_SYMBOL} [{interval}] (period={period})...")
        try:
            data = yf.download(
                tickers=SPY_SYMBOL,
                period=period,
                interval=interval,
                auto_adjust=True,
                progress=False,
            )
            if data.empty:
                logger.warning(f"No data returned for {interval}")
                continue

            # 展平 MultiIndex（若有）
            if isinstance(data.columns, pd.MultiIndex):
                if 'Close' in data.columns.get_level_values(0):
                    data.columns = data.columns.droplevel(1)

            with get_market_cursor() as cursor:
                saved = _insert_ticker_data(cursor, SPY_SYMBOL, data, interval)
            logger.info(f"  [{interval}] saved {saved} rows")
            total_saved += saved

        except Exception as e:
            logger.error(f"Failed to fetch {SPY_SYMBOL} [{interval}]: {e}")

    logger.info(f"SPY basis fetch complete. Total rows: {total_saved}")


def get_existing_tickers() -> list[str]:
    """取得 market_data_ohlcv 中所有不含 SPY / TEST_TICKER 的股票代碼。"""
    with get_market_cursor() as cursor:
        cursor.execute(
            """
            SELECT DISTINCT symbol FROM market_data_ohlcv
            WHERE symbol NOT IN (%s, 'TEST_TICKER')
            """,
            (SPY_SYMBOL,)
        )
        return [r['symbol'] for r in cursor.fetchall()]


def fetch_all_existing_basis() -> None:
    """對 DB 內所有現有股票，補齊各週期的最大允許歷史資料。"""
    tickers = get_existing_tickers()
    if not tickers:
        logger.info("No tickers found in market_data_ohlcv.")
        return

    logger.info(f"Backfilling {len(tickers)} tickers across all timeframes...")

    batch_size     = 20
    batch_delay    = 15  # 批次間延遲（秒）
    interval_delay = 60  # 週期間延遲（秒）

    for interval, period in FETCH_CONFIG.items():
        logger.info(f"--- Interval '{interval}' (period={period}) ---")

        for i in range(0, len(tickers), batch_size):
            chunk = tickers[i:i + batch_size]
            logger.info(f"  [{interval}] Batch {i // batch_size + 1}: {len(chunk)} tickers")

            try:
                data = yf.download(
                    tickers=chunk,
                    period=period,
                    interval=interval,
                    auto_adjust=True,
                    progress=False,
                    threads=True,
                )
                if data.empty:
                    logger.warning("  No data returned.")
                else:
                    batch_saved = 0
                    with get_market_cursor() as cursor:
                        for t in chunk:
                            try:
                                df_t = _extract_ticker_df(data, t)
                                if df_t is not None and not df_t.empty:
                                    batch_saved += _insert_ticker_data(cursor, t, df_t, interval)
                            except Exception as e_t:
                                logger.warning(f"    Error saving {t}: {e_t}")
                    logger.info(f"  [{interval}] Batch saved {batch_saved} rows")

            except Exception as e:
                logger.error(f"  [{interval}] Batch API error: {e}")
                logger.info("  Sleeping 5 min due to rate limit...")
                time.sleep(300)
                continue

            if i + batch_size < len(tickers):
                time.sleep(batch_delay)

        logger.info(f"Finished interval '{interval}'. Sleeping {interval_delay}s...")
        time.sleep(interval_delay)

    logger.info("Full basis backfill complete.")


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    parser = argparse.ArgumentParser(description="Fetch basis K-line data.")
    parser.add_argument('--mode', choices=['spy', 'all'], default='spy',
                        help="'spy' 只下載 SPY；'all' 補齊所有現有股票")
    args = parser.parse_args()

    if args.mode == 'spy':
        fetch_and_store_spy()
    else:
        fetch_all_existing_basis()
