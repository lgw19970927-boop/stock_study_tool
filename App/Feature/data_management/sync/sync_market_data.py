"""
App/Lib/data_sync/sync_market_data.py
市場資料同步引擎：增量更新、歷史回補、K 線資料插入
（由 reference/extracted/backend/data_sync/sync_market_data.py 移植，SQLite → MySQL）

主要修改：
  - sys.path hack 移除，改用 App 模組路徑
  - get_market_db_connection() → get_market_cursor()（自動 commit）
  - INSERT OR REPLACE INTO market_data → INSERT ... ON DUPLICATE KEY UPDATE market_data_ohlcv
  - ? → %s
  - conn.commit() 移除（cursor context manager 已處理）
  - interval 欄位 → interval_type
  - incremental_update / progressive_backfill 完成後觸發 backup_market_data()
"""
import yfinance as yf
import pandas as pd
import time
import argparse
import logging
import sys
from datetime import datetime, timedelta

from app.lib.db import get_market_cursor
from app.feature.data_management.sync import config
from app.feature.data_management.sync.data_validator import validate_market_data

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════
# DB 輔助函式（取代 database.py 中對應函式）
# ══════════════════════════════════════════════════════════════════

def get_tickers_from_db(market: str = None) -> list[str]:
    """從 stock_meta 取得所有 Active 股票代碼。"""
    with get_market_cursor() as cursor:
        if market:
            cursor.execute(
                "SELECT symbol FROM stock_meta WHERE market = %s AND status != 'Delisted'",
                (market,)
            )
        else:
            cursor.execute("SELECT symbol FROM stock_meta WHERE status != 'Delisted'")
        return [r['symbol'] for r in cursor.fetchall() if r['symbol']]


def get_last_data_date(symbol: str, interval: str):
    """查詢某股票在指定 timeframe 的最新 datetime，回傳 datetime 物件或 None。"""
    with get_market_cursor() as cursor:
        cursor.execute(
            "SELECT MAX(datetime) AS dt FROM market_data_ohlcv WHERE symbol = %s AND timeframe = %s",
            (symbol, interval)
        )
        row = cursor.fetchone()
        if row and row['dt']:
            return pd.to_datetime(row['dt']).to_pydatetime()
    return None


def get_oldest_date_in_db(interval: str):
    """查詢指定 timeframe 全部股票中最早的 datetime，用於 progressive_backfill 起點。"""
    with get_market_cursor() as cursor:
        cursor.execute(
            "SELECT MIN(datetime) AS dt FROM market_data_ohlcv WHERE timeframe = %s",
            (interval,)
        )
        row = cursor.fetchone()
        if row and row['dt']:
            return pd.to_datetime(row['dt']).to_pydatetime()
    return None


def get_last_backfill_progress(interval: str):
    """查詢 backfill_history 中最早一次已完成記錄（決定繼續回補的起點）。"""
    with get_market_cursor() as cursor:
        cursor.execute(
            """
            SELECT start_date, end_date FROM backfill_history
            WHERE interval_type = %s AND status = 'completed'
            ORDER BY start_date ASC LIMIT 1
            """,
            (interval,)
        )
        row = cursor.fetchone()
        if row:
            return {
                'start_date': pd.to_datetime(row['start_date']).to_pydatetime(),
                'end_date':   pd.to_datetime(row['end_date']).to_pydatetime(),
            }
    return None


def check_data_completeness(symbol: str, interval: str, start_date, end_date) -> float:
    """計算指定股票在區間內的資料完整度（0.0 ~ 1.0）。"""
    def _to_str(d):
        return d.strftime('%Y-%m-%d') if isinstance(d, datetime) else str(d)

    expected_days = len(pd.bdate_range(start=start_date, end=end_date))
    if expected_days == 0:
        return 1.0

    multiplier = {'1h': 7, '5m': 78, '1m': 390}.get(interval, 1)

    with get_market_cursor() as cursor:
        cursor.execute(
            """
            SELECT COUNT(*) AS cnt FROM market_data_ohlcv
            WHERE symbol = %s AND timeframe = %s
              AND datetime >= %s AND datetime <= %s
            """,
            (symbol, interval, _to_str(start_date), _to_str(end_date))
        )
        actual = cursor.fetchone()['cnt']

    expected_rows = expected_days * multiplier
    return min(actual / expected_rows, 1.0) if expected_rows else 1.0


def _record_backfill_progress(interval: str, start_date, end_date,
                               status: str, downloaded_count: int = 0) -> None:
    """記錄一次 backfill 執行結果至 backfill_history。"""
    with get_market_cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO backfill_history
                (interval_type, start_date, end_date, completed_at, total_tickers, downloaded_count, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (interval,
             start_date.strftime('%Y-%m-%d'),
             end_date.strftime('%Y-%m-%d'),
             datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
             None, downloaded_count, status)
        )


# ══════════════════════════════════════════════════════════════════
# 資料寫入
# ══════════════════════════════════════════════════════════════════

def insert_ticker_data(cursor, symbol: str, df: pd.DataFrame, interval: str) -> int:
    """將 yfinance DataFrame 寫入 MySQL market_data_ohlcv（ON DUPLICATE KEY UPDATE）。"""
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
    return 1  # 保持與 reference 版本相同的語意（成功回傳 1）


# ══════════════════════════════════════════════════════════════════
# 下載核心
# ══════════════════════════════════════════════════════════════════

def _extract_ticker_df(data: pd.DataFrame, ticker: str):
    """從 yfinance 多股票回傳值中擷取單一股票的 DataFrame。"""
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


def download_chunk(cursor, tickers: list, interval: str, period, start, end) -> None:
    """下載並寫入一個批次的股票資料（含自動重試）。"""
    max_retries = config.RATE_LIMIT_CONFIG['retry_attempts']
    backoff     = config.RATE_LIMIT_CONFIG['retry_backoff']

    for attempt in range(max_retries):
        try:
            def save_data(sym, df):
                is_valid, msg = validate_market_data(df)
                if not is_valid:
                    logger.warning(f"Validation failed for {sym}: {msg}")
                    cursor.execute(
                        """
                        INSERT INTO download_failures (symbol, interval_type, attempted_at, error_message)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (sym, interval, datetime.now().strftime('%Y-%m-%d %H:%M:%S'), msg)
                    )
                    return 0
                return insert_ticker_data(cursor, sym, df, interval)

            data = yf.download(
                tickers,
                period=period,
                start=start,
                end=end,
                interval=interval,
                auto_adjust=True,
                threads=True,
                progress=False,
            )

            if data.empty:
                return

            valid_cnt = 0
            for ticker in tickers:
                try:
                    ticker_df = _extract_ticker_df(data, ticker)
                    if ticker_df is not None and not ticker_df.empty:
                        valid_cnt += save_data(ticker, ticker_df)
                except Exception as e_t:
                    logger.warning(f"Error processing {ticker}: {e_t}")

            logger.info(f"   Saved {valid_cnt} / {len(tickers)} in chunk.")
            break  # 成功

        except Exception as e:
            if attempt < max_retries - 1:
                wait = backoff[attempt]
                logger.warning(f"Download failed: {e}. Retrying in {wait}s...")
                time.sleep(wait)
            else:
                logger.error(f"Batch failed after {max_retries} attempts: {e}")
                for t in tickers:
                    cursor.execute(
                        """
                        INSERT INTO download_failures (symbol, interval_type, attempted_at, error_message)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (t, interval, datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                         f"Batch error: {e}")
                    )


def sync_market_data(tickers: list, interval: str = '1d',
                     period=None, start=None, end=None) -> None:
    """核心下載函式：支援 period 或 start/end 兩種模式。"""
    if not tickers:
        logger.warning("No tickers provided.")
        return

    chunk_size = config.RATE_LIMIT_CONFIG['chunk_size']
    delay      = config.RATE_LIMIT_CONFIG['batch_delay_seconds']
    max_daily  = config.RATE_LIMIT_CONFIG['max_daily_downloads']
    total      = len(tickers)

    if total > max_daily:
        logger.warning(f"Batch size {total} exceeds daily limit {max_daily}. Capping.")
        tickers = tickers[:max_daily]
        total   = max_daily

    logger.info(f"Starting sync for {total} tickers. interval={interval} period={period} start={start} end={end}")

    with get_market_cursor() as cursor:
        for i in range(0, total, chunk_size):
            chunk = tickers[i:i + chunk_size]
            logger.info(f"[Progress: {i}/{total} ({i/total*100:.1f}%)] chunk={len(chunk)}")
            download_chunk(cursor, chunk, interval, period, start, end)
            if i + chunk_size < total:
                time.sleep(delay)

    logger.info("Sync batch completed.")


# ══════════════════════════════════════════════════════════════════
# 策略 1：Incremental Update（平日傍晚補最新資料）
# ══════════════════════════════════════════════════════════════════

def incremental_update(interval: str = '1d') -> None:
    logger.info(f"Running Incremental Update for {interval}...")
    tickers = get_tickers_from_db()
    now     = datetime.now()

    ticker_groups: dict[str, list] = {}
    for ticker in tickers:
        last_date = get_last_data_date(ticker, interval)
        if not last_date:
            key = 'full'
        else:
            key = last_date.strftime('%Y-%m-%d')
            start_check = last_date + timedelta(days=1)
            if start_check.date() > now.date():
                continue  # 已是最新

        ticker_groups.setdefault(key, []).append(ticker)

    logger.info(f"Identified {len(ticker_groups)} update groups.")

    for key, group_tickers in ticker_groups.items():
        if key == 'full':
            period = config.TIMEFRAME_SETTINGS[interval]['period_limit']
            sync_market_data(group_tickers, interval=interval, period=period)
        else:
            last_dt   = datetime.strptime(key, '%Y-%m-%d')
            start_dt  = last_dt + timedelta(days=1)
            logger.info(f"Group {key}: {len(group_tickers)} tickers from {start_dt.date()}")
            sync_market_data(group_tickers, interval=interval, start=start_dt, end=now)

    # ✅ 完成後自動備份 market_data
    logger.info("Incremental update done. Triggering market_data backup...")
    try:
        from app.feature.data_management.backup.backup_mysql import backup_market_data
        backup_market_data()
    except Exception as e:
        logger.error(f"market_data backup failed: {e}")


# ══════════════════════════════════════════════════════════════════
# 策略 2：Progressive Backfill（每日凌晨回補歷史）
# ══════════════════════════════════════════════════════════════════

def progressive_backfill(interval: str = '1h') -> None:
    logger.info(f"Running Progressive Backfill for {interval}...")

    last_plan = get_last_backfill_progress(interval)
    if last_plan:
        base_date = last_plan['start_date']
    else:
        oldest    = get_oldest_date_in_db(interval)
        base_date = oldest if oldest else datetime.now()

    years        = config.SCHEDULE_CONFIG['progressive_backfill']['years_per_run']
    target_start = base_date - timedelta(days=365 * years)
    target_end   = base_date - timedelta(days=1)

    max_years  = config.SCHEDULE_CONFIG['progressive_backfill']['max_history_years']
    limit_date = datetime.now() - timedelta(days=365 * max_years)

    if target_start < limit_date:
        logger.info("Max historical limit reached. Stopping backfill.")
        return

    logger.info(f"Backfill Target: {target_start.date()} to {target_end.date()}")
    tickers = get_tickers_from_db()
    sync_market_data(tickers, interval=interval, start=target_start, end=target_end)
    _record_backfill_progress(interval, target_start, target_end, 'completed', len(tickers))

    # ✅ 完成後自動備份 market_data
    logger.info("Progressive backfill done. Triggering market_data backup...")
    try:
        from app.feature.data_management.backup.backup_mysql import backup_market_data
        backup_market_data()
    except Exception as e:
        logger.error(f"market_data backup failed: {e}")


# ══════════════════════════════════════════════════════════════════
# 策略 3：Gap Fill（智能補填缺口）
# ══════════════════════════════════════════════════════════════════

def ensure_data(tickers: list, interval: str, start, end) -> None:
    """智能補填：先確認完整度，未達 90% 才下載。gap_scanner 不觸發備份。"""
    missing = [
        t for t in tickers
        if check_data_completeness(t, interval, start, end) < 0.9
    ]
    if missing:
        logger.info(f"Gap detected for {len(missing)} tickers. Filling...")
        sync_market_data(missing, interval=interval, start=start, end=end)
    else:
        logger.info("Data complete. No download needed.")


# ══════════════════════════════════════════════════════════════════
# CLI 入口
# ══════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['sync', 'incremental', 'backfill', 'gap_fill'])
    parser.add_argument('--interval', default='1d')
    parser.add_argument('--period',   default='1y')
    parser.add_argument('--tickers',  help='逗號分隔或 "all"')
    parser.add_argument('--start',    help='YYYY-MM-DD')
    parser.add_argument('--end',      help='YYYY-MM-DD')
    args = parser.parse_args()

    if args.mode == 'sync':
        target = (get_tickers_from_db() if args.tickers in ('all', None)
                  else args.tickers.split(','))
        sync_market_data(target, interval=args.interval, period=args.period,
                         start=args.start, end=args.end)
    elif args.mode == 'incremental':
        incremental_update(interval=args.interval)
    elif args.mode == 'backfill':
        progressive_backfill(interval=args.interval)
