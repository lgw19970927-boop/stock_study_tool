"""
App/Lib/data_sync/sync_market_data.py
市場資料同步引擎：增量更新、歷史回補、缺口補填。

本版本重點：
  - 多 timeframe 排程支援（1d/1h/5m/1m）
  - dynamic start date
  - 兩層缺口補填（coarse/fine）
  - update tier（active/inactive/suspected_delisted）
  - job_state 斷點續跑（chunk checkpoint）
"""

from __future__ import annotations

import argparse
import logging
import time
from datetime import date, datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

import pandas as pd
import yfinance as yf

from app.feature.data_management.sync import config
from app.feature.data_management.sync.data_validator import validate_market_data
from app.lib.db import get_market_cursor

logger = logging.getLogger(__name__)

_TIER_COLUMNS_AVAILABLE: bool | None = None
_JOB_STATE_AVAILABLE: bool | None = None
_PROVIDER_PROBE_CACHE: dict[str, float | bool] = {
    'checked_at': 0.0,
    'ok': True,
    'cache_seconds': 0.0,
}


# ================================================================
# 通用工具
# ================================================================

def _parse_datetime(value, end_of_day: bool = False) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        if end_of_day:
            return datetime.combine(value, datetime.max.time()).replace(microsecond=0)
        return datetime.combine(value, datetime.min.time())

    text = str(value).strip()
    if not text:
        return None

    if len(text) == 10:
        dt = datetime.strptime(text, '%Y-%m-%d')
        if end_of_day:
            dt = dt.replace(hour=23, minute=59, second=59)
        return dt

    try:
        return datetime.fromisoformat(text)
    except ValueError:
        try:
            return datetime.strptime(text, '%Y-%m-%d %H:%M:%S')
        except ValueError:
            return None


def _as_date(value) -> date | None:
    dt = _parse_datetime(value)
    return dt.date() if dt else None


def _normalize_window(start, end) -> tuple[datetime, datetime]:
    now = datetime.now()
    start_dt = _parse_datetime(start) or now
    end_dt = _parse_datetime(end, end_of_day=True) or now

    if end_dt < start_dt:
        start_dt, end_dt = end_dt, start_dt
    return start_dt, end_dt


def _interval_rows_per_day(interval: str) -> int:
    return {'1d': 1, '1h': 7, '5m': 78, '1m': 390}.get(interval, 1)


def _get_provider_probe_symbols() -> list[str]:
    configured = config.RATE_LIMIT_CONFIG.get('provider_probe_symbols')
    symbols: list[str] = []

    if isinstance(configured, str):
        symbols = [s.strip() for s in configured.split(',') if s and s.strip()]
    elif isinstance(configured, (list, tuple, set)):
        symbols = [str(s).strip() for s in configured if str(s).strip()]

    if not symbols:
        single_symbol = str(config.RATE_LIMIT_CONFIG.get('provider_probe_symbol', 'AAPL')).strip()
        if single_symbol:
            symbols = [single_symbol]

    deduped: list[str] = []
    seen: set[str] = set()
    for symbol in symbols:
        key = symbol.upper()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(symbol)

    return deduped[:5]


def _provider_probe_hard_fail_enabled() -> bool:
    return bool(config.RATE_LIMIT_CONFIG.get('provider_probe_hard_fail', False))


def _probe_yfinance_provider(force: bool = False) -> bool:
    if not bool(config.RATE_LIMIT_CONFIG.get('provider_probe_enabled', True)):
        return True

    cache_seconds = int(config.RATE_LIMIT_CONFIG.get('provider_probe_cache_seconds', 120))
    now_ts = time.time()

    checked_at = float(_PROVIDER_PROBE_CACHE.get('checked_at', 0.0) or 0.0)
    cached_ttl = float(_PROVIDER_PROBE_CACHE.get('cache_seconds', cache_seconds) or cache_seconds)
    if not force and checked_at > 0 and (now_ts - checked_at) < cached_ttl:
        return bool(_PROVIDER_PROBE_CACHE.get('ok', False))

    probe_symbols = _get_provider_probe_symbols()
    timeout_seconds = int(config.RATE_LIMIT_CONFIG.get('download_timeout_seconds', 30))
    timeout_seconds = max(5, min(timeout_seconds, 20))

    retry_after_seconds = 0

    def _probe_symbol(symbol: str) -> bool:
        nonlocal retry_after_seconds

        probe_url = (
            f"https://query1.finance.yahoo.com/v8/finance/chart/{quote(symbol)}"
            "?interval=1d&range=5d"
        )

        http_ok = False
        try:
            request = Request(
                probe_url,
                headers={
                    'User-Agent': (
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                        'AppleWebKit/537.36 (KHTML, like Gecko) '
                        'Chrome/123.0.0.0 Safari/537.36'
                    )
                },
            )

            with urlopen(request, timeout=timeout_seconds) as response:
                status_code = int(getattr(response, 'status', 200) or 200)
                content_type = str(response.headers.get('Content-Type', '')).lower()
                sample = response.read(256)

            sample_text = sample.decode('utf-8', errors='ignore').lower()
            http_ok = status_code == 200 and (
                ('json' in content_type) or ('chart' in sample_text)
            )

            if not http_ok:
                logger.warning(
                    f"Provider probe unexpected response for {symbol}: "
                    f"status={status_code}, content_type={content_type}"
                )
                return False
        except HTTPError as probe_error:
            retry_after = None
            if probe_error.headers:
                retry_after = probe_error.headers.get('Retry-After')

            if retry_after:
                try:
                    retry_after_seconds = max(retry_after_seconds, int(retry_after))
                except (TypeError, ValueError):
                    pass

            if int(probe_error.code) == 429:
                retry_after_seconds = max(retry_after_seconds, 300)
                logger.warning(
                    f"Provider probe HTTP 429 for {symbol}; cooldown {retry_after_seconds}s"
                )
            else:
                logger.warning(
                    f"Provider probe HTTP {probe_error.code} for {symbol}: {probe_error.reason}"
                )
            return False
        except URLError as probe_error:
            logger.warning(f"Provider probe network error for {symbol}: {probe_error.reason}")
            return False
        except Exception as probe_error:
            logger.warning(f"Provider probe failed for {symbol}: {probe_error}")
            return False

        yf_logger = logging.getLogger('yfinance')
        previous_level = yf_logger.level
        try:
            # Use an actual yfinance call for final confirmation, but silence noisy internal logs.
            yf_logger.setLevel(logging.CRITICAL)
            probe_df = yf.download(
                symbol,
                period='5d',
                interval='1d',
                auto_adjust=True,
                threads=False,
                progress=False,
                timeout=timeout_seconds,
            )
            if probe_df is None or probe_df.empty:
                logger.warning(f"Provider probe yfinance returned empty for {symbol}")
                return False
            return True
        except Exception as probe_error:
            logger.warning(f"Provider probe yfinance error for {symbol}: {probe_error}")
            return False
        finally:
            yf_logger.setLevel(previous_level)

    ok = False
    for probe_symbol in probe_symbols:
        if _probe_symbol(probe_symbol):
            ok = True
            break

    cache_ttl = float(max(cache_seconds, retry_after_seconds))

    _PROVIDER_PROBE_CACHE['checked_at'] = now_ts
    _PROVIDER_PROBE_CACHE['ok'] = ok
    _PROVIDER_PROBE_CACHE['cache_seconds'] = cache_ttl

    if not ok:
        logger.warning(
            f"Provider probe failed for symbols={','.join(probe_symbols)}; "
            f"next probe after {int(cache_ttl)}s."
        )

    return ok


def _ensure_provider_ready(max_wait_seconds: int | None = None, retry_interval_seconds: int = 30) -> bool:
    """Provider readiness gate. Default behavior is best-effort (non-blocking)."""
    if _probe_yfinance_provider():
        return True

    if not _provider_probe_hard_fail_enabled():
        logger.warning(
            'Provider probe failed; continue in best-effort mode '
            '(set provider_probe_hard_fail=true to enforce blocking).'
        )
        return True

    if max_wait_seconds is None:
        max_wait_seconds = int(config.RATE_LIMIT_CONFIG.get('provider_probe_wait_seconds', 300))

    if max_wait_seconds <= 0:
        return False

    logger.warning(
        f"Provider unavailable. Will retry probe for up to {max_wait_seconds}s "
        f"(interval={retry_interval_seconds}s)."
    )

    started_at = time.time()
    while (time.time() - started_at) < max_wait_seconds:
        time.sleep(max(1, retry_interval_seconds))
        if _probe_yfinance_provider(force=True):
            logger.info('Provider recovered; continue sync flow.')
            return True

    logger.warning(f"Provider still unavailable after waiting {max_wait_seconds}s.")
    return False


# ================================================================
# DB 輔助函式
# ================================================================

def get_tickers_from_db(market: str | None = None) -> list[str]:
    """從 stock_meta 取得所有 Active 股票代碼。"""
    with get_market_cursor() as cursor:
        if market:
            cursor.execute(
                "SELECT symbol FROM stock_meta WHERE market = %s AND status != 'Delisted' ORDER BY symbol ASC",
                (market,),
            )
        else:
            cursor.execute("SELECT symbol FROM stock_meta WHERE status != 'Delisted' ORDER BY symbol ASC")
        return [r['symbol'] for r in cursor.fetchall() if r['symbol']]


def _has_tier_columns() -> bool:
    global _TIER_COLUMNS_AVAILABLE
    if _TIER_COLUMNS_AVAILABLE is not None:
        return _TIER_COLUMNS_AVAILABLE

    try:
        with get_market_cursor() as cursor:
            cursor.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = 'stock_meta'
                  AND column_name IN ('dollar_vol_20d_avg', 'last_trade_date', 'update_tier', 'last_tier_updated')
                """
            )
            cnt = int(cursor.fetchone()['cnt'])
            _TIER_COLUMNS_AVAILABLE = (cnt >= 4)
    except Exception as e:
        logger.warning(f"Unable to check stock_meta tier columns: {e}")
        _TIER_COLUMNS_AVAILABLE = False

    return _TIER_COLUMNS_AVAILABLE


def _has_job_state_table() -> bool:
    global _JOB_STATE_AVAILABLE
    if _JOB_STATE_AVAILABLE is not None:
        return _JOB_STATE_AVAILABLE

    try:
        with get_market_cursor() as cursor:
            cursor.execute("SELECT 1 FROM job_state LIMIT 1")
            cursor.fetchone()
        _JOB_STATE_AVAILABLE = True
    except Exception as e:
        logger.warning(f"job_state table unavailable, checkpoint disabled: {e}")
        _JOB_STATE_AVAILABLE = False

    return _JOB_STATE_AVAILABLE


def get_last_data_date(symbol: str, interval: str):
    """查詢某股票在指定 timeframe 的最新 datetime，回傳 datetime 或 None。"""
    with get_market_cursor() as cursor:
        cursor.execute(
            "SELECT MAX(datetime) AS dt FROM market_data_ohlcv WHERE symbol = %s AND timeframe = %s",
            (symbol, interval),
        )
        row = cursor.fetchone()
        if row and row['dt']:
            return pd.to_datetime(row['dt']).to_pydatetime()
    return None


def get_oldest_date_in_db(interval: str):
    """查詢指定 timeframe 全部股票中最早 datetime。"""
    with get_market_cursor() as cursor:
        cursor.execute(
            "SELECT MIN(datetime) AS dt FROM market_data_ohlcv WHERE timeframe = %s",
            (interval,),
        )
        row = cursor.fetchone()
        if row and row['dt']:
            return pd.to_datetime(row['dt']).to_pydatetime()
    return None


def get_last_backfill_progress(interval: str):
    """查詢 backfill_history 中最早一次已完成記錄。"""
    with get_market_cursor() as cursor:
        cursor.execute(
            """
            SELECT start_date, end_date
            FROM backfill_history
            WHERE interval_type = %s AND status = 'completed'
            ORDER BY start_date ASC
            LIMIT 1
            """,
            (interval,),
        )
        row = cursor.fetchone()
        if row:
            return {
                'start_date': pd.to_datetime(row['start_date']).to_pydatetime(),
                'end_date': pd.to_datetime(row['end_date']).to_pydatetime(),
            }
    return None


def _get_earliest_backfill_start(interval: str):
    with get_market_cursor() as cursor:
        cursor.execute(
            """
            SELECT MIN(start_date) AS earliest_start
            FROM backfill_history
            WHERE interval_type = %s AND status = 'completed'
            """,
            (interval,),
        )
        row = cursor.fetchone()
        if row and row['earliest_start']:
            return pd.to_datetime(row['earliest_start']).to_pydatetime()
    return None


def get_dynamic_start_date(interval: str, now: datetime | None = None) -> str:
    """依 interval 回傳動態起始日（YYYY-MM-DD）。"""
    now = now or datetime.now()

    if interval == '1d':
        earliest = _get_earliest_backfill_start('1d')
        if earliest:
            return earliest.strftime('%Y-%m-%d')

    lookback_days = config.DYNAMIC_START_LOOKBACK_DAYS.get(interval, 30)
    return (now - timedelta(days=lookback_days)).strftime('%Y-%m-%d')


# ================================================================
# Tier 更新策略（Phase 5）
# ================================================================

def _get_spy_trading_days(lookback_days: int) -> set[date]:
    spy_symbol = config.TIER_CONFIG['spy_reference_symbol']
    start_dt = datetime.now() - timedelta(days=lookback_days)

    with get_market_cursor() as cursor:
        cursor.execute(
            """
            SELECT DISTINCT DATE(datetime) AS d
            FROM market_data_ohlcv
            WHERE symbol = %s AND timeframe = '1d' AND datetime >= %s
            ORDER BY d ASC
            """,
            (spy_symbol, start_dt.strftime('%Y-%m-%d')),
        )
        rows = cursor.fetchall()

    return {pd.to_datetime(r['d']).date() for r in rows if r.get('d')}


def _determine_update_tier(
    dollar_volume_20d_avg: float,
    last_trade_date: date | None,
    missing_trading_days: int,
    now: datetime,
) -> str:
    threshold = float(config.TIER_CONFIG['active_dollar_volume_threshold'])
    stale_days = int(config.TIER_CONFIG['inactive_stale_days'])
    delisted_missing = int(config.TIER_CONFIG['delisted_missing_trading_days'])

    if missing_trading_days > delisted_missing:
        return 'suspected_delisted'

    if last_trade_date is None:
        return 'suspected_delisted'

    if (now.date() - last_trade_date).days > stale_days:
        return 'inactive'

    return 'active' if dollar_volume_20d_avg > threshold else 'inactive'


def refresh_ticker_tiers(force: bool = False) -> None:
    """刷新 stock_meta 的 tier 欄位與統計欄位。"""
    if not _has_tier_columns():
        return

    now = datetime.now()
    lookback_days = int(config.TIER_CONFIG['tier_refresh_lookback_days'])
    spy_days = _get_spy_trading_days(lookback_days)

    with get_market_cursor() as cursor:
        cursor.execute(
            """
            SELECT symbol, last_tier_updated
            FROM stock_meta
            WHERE status != 'Delisted'
            ORDER BY symbol ASC
            """
        )
        rows = cursor.fetchall()

        symbols: list[str] = []
        for row in rows:
            if force:
                symbols.append(row['symbol'])
                continue

            updated_at = row.get('last_tier_updated')
            if not updated_at or pd.to_datetime(updated_at).date() < now.date():
                symbols.append(row['symbol'])

        if not symbols:
            logger.info('Tier refresh skipped: all symbols already updated today.')
            return

        logger.info(f'Tier refresh start for {len(symbols)} symbols...')
        updates = []

        for idx, symbol in enumerate(symbols, start=1):
            cursor.execute(
                """
                SELECT datetime, close, volume
                FROM market_data_ohlcv
                WHERE symbol = %s AND timeframe = '1d' AND datetime >= %s
                ORDER BY datetime DESC
                LIMIT 60
                """,
                (symbol, (now - timedelta(days=lookback_days)).strftime('%Y-%m-%d')),
            )
            bars = cursor.fetchall()

            if not bars:
                updates.append((0.0, None, 'suspected_delisted', now.strftime('%Y-%m-%d %H:%M:%S'), symbol))
                continue

            closes = []
            volumes = []
            ticker_days: set[date] = set()
            last_trade_date = None

            for row in bars:
                dt = pd.to_datetime(row['datetime']).to_pydatetime().date()
                ticker_days.add(dt)

                close_val = float(row['close']) if row['close'] is not None else 0.0
                vol_val = float(row['volume']) if row['volume'] is not None else 0.0
                closes.append(close_val)
                volumes.append(vol_val)

                if last_trade_date is None and vol_val > 0:
                    last_trade_date = dt

            if last_trade_date is None:
                last_trade_date = max(ticker_days) if ticker_days else None

            dollar_volume = pd.Series(closes) * pd.Series(volumes)
            dollar_volume_20d_avg = float(dollar_volume.head(20).mean()) if not dollar_volume.empty else 0.0

            missing_trading_days = len(spy_days - ticker_days) if spy_days else 0
            tier = _determine_update_tier(dollar_volume_20d_avg, last_trade_date, missing_trading_days, now)

            updates.append(
                (
                    round(dollar_volume_20d_avg, 2),
                    last_trade_date,
                    tier,
                    now.strftime('%Y-%m-%d %H:%M:%S'),
                    symbol,
                )
            )

            if idx % 1000 == 0:
                logger.info(f'Tier refresh progress: {idx}/{len(symbols)}')

        cursor.executemany(
            """
            UPDATE stock_meta
            SET dollar_vol_20d_avg = %s,
                last_trade_date = %s,
                update_tier = %s,
                last_tier_updated = %s
            WHERE symbol = %s
            """,
            updates,
        )

    logger.info(f'Tier refresh complete: updated {len(symbols)} symbols.')


def get_tickers_for_update(
    interval: str,
    now: datetime | None = None,
    include_inactive_always: bool = False,
) -> list[str]:
    """依 tier 規則取得本輪要更新的 ticker。"""
    if not _has_tier_columns():
        return get_tickers_from_db()

    now = now or datetime.now()
    inactive_weekday = int(config.TIER_CONFIG['inactive_update_weekday'])

    with get_market_cursor() as cursor:
        cursor.execute(
            """
            SELECT symbol, COALESCE(update_tier, 'active') AS update_tier
            FROM stock_meta
            WHERE status != 'Delisted'
            ORDER BY symbol ASC
            """
        )
        rows = cursor.fetchall()

    selected: list[str] = []
    for row in rows:
        symbol = row['symbol']
        tier = str(row.get('update_tier') or 'active').lower()

        if tier == 'suspected_delisted':
            continue

        if tier == 'inactive' and not include_inactive_always:
            if now.weekday() != inactive_weekday:
                continue

        selected.append(symbol)

    logger.info(f"Ticker selection for {interval}: selected={len(selected)} from total={len(rows)}")
    return selected


# ================================================================
# 完整度與回補
# ================================================================

def check_data_completeness(symbol: str, interval: str, start_date, end_date) -> float:
    """計算指定股票在區間內的資料完整度（0.0 ~ 1.0）。"""
    start_dt, end_dt = _normalize_window(start_date, end_date)
    expected_days = len(pd.bdate_range(start=start_dt.date(), end=end_dt.date()))

    if expected_days == 0:
        return 1.0

    expected_rows = expected_days * _interval_rows_per_day(interval)

    with get_market_cursor() as cursor:
        cursor.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM market_data_ohlcv
            WHERE symbol = %s AND timeframe = %s
              AND datetime >= %s AND datetime <= %s
            """,
            (
                symbol,
                interval,
                start_dt.strftime('%Y-%m-%d %H:%M:%S'),
                end_dt.strftime('%Y-%m-%d %H:%M:%S'),
            ),
        )
        actual = int(cursor.fetchone()['cnt'])

    return min(actual / expected_rows, 1.0) if expected_rows else 1.0


def _record_backfill_progress(
    interval: str,
    start_date,
    end_date,
    status: str,
    downloaded_count: int = 0,
) -> None:
    """記錄一次 backfill 執行結果至 backfill_history。"""
    start_dt = _parse_datetime(start_date)
    end_dt = _parse_datetime(end_date, end_of_day=True)

    if not start_dt or not end_dt:
        return

    with get_market_cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO backfill_history
                (interval_type, start_date, end_date, completed_at, total_tickers, downloaded_count, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                interval,
                start_dt.strftime('%Y-%m-%d'),
                end_dt.strftime('%Y-%m-%d'),
                datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                None,
                downloaded_count,
                status,
            ),
        )


def _get_daily_bar_counts(symbol: str, interval: str, start_dt: datetime, end_dt: datetime) -> dict[date, int]:
    with get_market_cursor() as cursor:
        cursor.execute(
            """
            SELECT DATE(datetime) AS d, COUNT(*) AS cnt
            FROM market_data_ohlcv
            WHERE symbol = %s AND timeframe = %s
              AND datetime >= %s AND datetime <= %s
            GROUP BY DATE(datetime)
            """,
            (
                symbol,
                interval,
                start_dt.strftime('%Y-%m-%d %H:%M:%S'),
                end_dt.strftime('%Y-%m-%d %H:%M:%S'),
            ),
        )
        rows = cursor.fetchall()

    out: dict[date, int] = {}
    for row in rows:
        d = pd.to_datetime(row['d']).date()
        out[d] = int(row['cnt'])
    return out


def _missing_days_to_ranges(days: list[date]) -> list[tuple[date, date]]:
    if not days:
        return []

    ranges: list[tuple[date, date]] = []
    start = days[0]
    prev = days[0]

    for d in days[1:]:
        if (d - prev).days == 1:
            prev = d
            continue
        ranges.append((start, prev))
        start = d
        prev = d

    ranges.append((start, prev))
    return ranges


def _fill_missing_points(symbol: str, interval: str, start_date, end_date) -> None:
    """精修：僅補資料不足的日期段。"""
    start_dt, end_dt = _normalize_window(start_date, end_date)
    counts = _get_daily_bar_counts(symbol, interval, start_dt, end_dt)

    expected_daily_rows = _interval_rows_per_day(interval)
    business_days = [d.date() for d in pd.bdate_range(start=start_dt.date(), end=end_dt.date())]

    missing_days = [d for d in business_days if counts.get(d, 0) < expected_daily_rows]
    ranges = _missing_days_to_ranges(missing_days)

    if not ranges:
        return

    logger.info(f"Fine fill for {symbol} ({interval}) ranges={len(ranges)}")

    for range_start, range_end in ranges:
        start_str = range_start.strftime('%Y-%m-%d')
        end_dt_plus = datetime.combine(range_end, datetime.min.time()) + timedelta(days=1)
        sync_market_data(
            [symbol],
            interval=interval,
            start=start_str,
            end=end_dt_plus,
            job_name=f'gap_fine_{interval}_{symbol}',
            enable_resume=False,
        )


# ================================================================
# job_state checkpoint（Phase 6）
# ================================================================

def _upsert_job_state(
    job_name: str,
    interval: str,
    status: str,
    last_ticker: str | None,
    last_chunk_idx: int | None,
    target_start,
    target_end,
) -> None:
    if not _has_job_state_table():
        return

    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    target_start_date = _as_date(target_start)
    target_end_date = _as_date(target_end)

    with get_market_cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO job_state
                (job_name, interval_type, status, last_ticker, last_chunk_idx,
                 target_start, target_end, started_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                status = VALUES(status),
                last_ticker = VALUES(last_ticker),
                last_chunk_idx = VALUES(last_chunk_idx),
                target_start = COALESCE(VALUES(target_start), target_start),
                target_end = COALESCE(VALUES(target_end), target_end),
                updated_at = VALUES(updated_at),
                started_at = IFNULL(started_at, VALUES(started_at))
            """,
            (
                job_name,
                interval,
                status,
                last_ticker,
                last_chunk_idx,
                target_start_date,
                target_end_date,
                now,
                now,
            ),
        )


def _get_running_job_state(job_name: str, interval: str, target_start, target_end):
    if not _has_job_state_table():
        return None

    start_date = _as_date(target_start)
    end_date = _as_date(target_end)

    with get_market_cursor() as cursor:
        cursor.execute(
            """
            SELECT last_ticker, last_chunk_idx, target_start, target_end, updated_at, status
            FROM job_state
            WHERE job_name = %s AND interval_type = %s
              AND status IN ('running', 'interrupted')
            ORDER BY updated_at DESC, id DESC
            LIMIT 1
            """,
            (job_name, interval),
        )
        row = cursor.fetchone()

    if not row:
        return None

    row_start = _as_date(row.get('target_start'))
    row_end = _as_date(row.get('target_end'))

    # window 不一致時不套用舊 checkpoint，避免錯誤續跑。
    if start_date and row_start and start_date != row_start:
        return None
    if end_date and row_end and end_date != row_end:
        return None

    return row


# ================================================================
# 資料寫入
# ================================================================

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
            ts = pd.to_datetime(dt_val)
            if getattr(ts, 'tzinfo', None) is not None:
                ts = ts.tz_convert(None)
            dt_str = ts.strftime(date_format)
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

        rows.append(
            (
                str(symbol),
                str(interval),
                dt_str,
                _f(row.get('Open')),
                _f(row.get('High')),
                _f(row.get('Low')),
                c,
                _f(row.get('Volume')),
            )
        )

    if rows:
        cursor.executemany(
            """
            INSERT INTO market_data_ohlcv
                (symbol, timeframe, datetime, open, high, low, close, volume)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                open = VALUES(open),
                high = VALUES(high),
                low = VALUES(low),
                close = VALUES(close),
                volume = VALUES(volume)
            """,
            rows,
        )

    return 1


# ================================================================
# 下載核心
# ================================================================

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


def _record_download_failure(cursor, symbol: str, interval: str, message: str) -> None:
    cursor.execute(
        """
        INSERT INTO download_failures (symbol, interval_type, attempted_at, error_message)
        VALUES (%s, %s, %s, %s)
        """,
        (symbol, interval, datetime.now().strftime('%Y-%m-%d %H:%M:%S'), message[:1000]),
    )


def download_chunk(cursor, tickers: list[str], interval: str, period, start, end) -> None:
    """下載並寫入一個批次的股票資料（含自動重試）。"""
    max_retries = config.RATE_LIMIT_CONFIG['retry_attempts']
    backoff = config.RATE_LIMIT_CONFIG['retry_backoff']
    timeout_seconds = int(config.RATE_LIMIT_CONFIG.get('download_timeout_seconds', 30))
    fallback_delay = float(config.RATE_LIMIT_CONFIG.get('single_ticker_fallback_delay_seconds', 0.35))

    for attempt in range(max_retries):
        try:
            def save_data(sym, df):
                is_valid, msg = validate_market_data(df)
                if not is_valid:
                    logger.warning(f"Validation failed for {sym}: {msg}")
                    _record_download_failure(cursor, sym, interval, msg)
                    return 0
                return insert_ticker_data(cursor, sym, df, interval)

            def single_ticker_fallback() -> int:
                logger.warning(
                    f"Fallback to single ticker download for chunk size={len(tickers)} interval={interval}"
                )
                fallback_valid_cnt = 0
                for single_ticker in tickers:
                    try:
                        one_data = yf.download(
                            single_ticker,
                            period=period,
                            start=start,
                            end=end,
                            interval=interval,
                            auto_adjust=True,
                            threads=False,
                            progress=False,
                            timeout=timeout_seconds,
                        )
                        one_df = _extract_ticker_df(one_data, single_ticker)
                        if one_df is None or one_df.empty:
                            _record_download_failure(cursor, single_ticker, interval, 'Empty response from yfinance')
                        else:
                            fallback_valid_cnt += save_data(single_ticker, one_df)
                    except Exception as fallback_error:
                        logger.warning(f"Fallback download failed for {single_ticker}: {fallback_error}")
                        _record_download_failure(cursor, single_ticker, interval, f"Fallback error: {fallback_error}")

                    if fallback_delay > 0:
                        time.sleep(fallback_delay)

                return fallback_valid_cnt

            data = yf.download(
                tickers,
                period=period,
                start=start,
                end=end,
                interval=interval,
                auto_adjust=True,
                threads=False,
                progress=False,
                timeout=timeout_seconds,
            )

            if data.empty:
                provider_ok = _probe_yfinance_provider(force=True)
                if len(tickers) > 1 and (not provider_ok) and _provider_probe_hard_fail_enabled():
                    raise RuntimeError('yfinance provider unavailable during batch download')
                valid_cnt = single_ticker_fallback()
                logger.info(f"Saved {valid_cnt}/{len(tickers)} in chunk (fallback after empty batch).")
                break

            valid_cnt = 0
            for ticker in tickers:
                try:
                    ticker_df = _extract_ticker_df(data, ticker)
                    if ticker_df is not None and not ticker_df.empty:
                        valid_cnt += save_data(ticker, ticker_df)
                    else:
                        _record_download_failure(cursor, ticker, interval, 'Ticker dataframe empty in batch response')
                except Exception as ticker_error:
                    logger.warning(f"Error processing {ticker}: {ticker_error}")
                    _record_download_failure(cursor, ticker, interval, f"Process error: {ticker_error}")

            if valid_cnt == 0 and len(tickers) > 1:
                provider_ok = _probe_yfinance_provider(force=True)
                if (not provider_ok) and _provider_probe_hard_fail_enabled():
                    raise RuntimeError('yfinance provider unavailable during zero-valid chunk')
                valid_cnt = single_ticker_fallback()
                logger.info(f"Saved {valid_cnt}/{len(tickers)} in chunk (single ticker fallback).")
                break

            logger.info(f"Saved {valid_cnt}/{len(tickers)} in chunk.")
            break

        except Exception as e:
            if attempt < max_retries - 1:
                wait = backoff[attempt]
                logger.warning(f"Download failed: {e}. Retrying in {wait}s...")
                time.sleep(wait)
            else:
                logger.error(f"Batch failed after {max_retries} attempts: {e}")
                for ticker in tickers:
                    _record_download_failure(cursor, ticker, interval, f"Batch error: {e}")


def sync_market_data(
    tickers: list[str],
    interval: str = '1d',
    period=None,
    start=None,
    end=None,
    job_name: str = 'sync_market_data',
    enable_resume: bool = True,
) -> None:
    """核心下載函式：支援 period 或 start/end 兩種模式。"""
    if not tickers:
        logger.warning('No tickers provided.')
        return

    provider_probe_ok = _probe_yfinance_provider()
    if not provider_probe_ok and _provider_probe_hard_fail_enabled():
        logger.warning(
            f"Skip sync for job={job_name} interval={interval}: provider unavailable and hard-fail is enabled."
        )
        return
    if not provider_probe_ok:
        logger.warning(
            f"Provider probe failed for job={job_name} interval={interval}; "
            'continuing with best-effort download flow.'
        )

    chunk_size = int(config.RATE_LIMIT_CONFIG['chunk_size'])
    delay = float(config.RATE_LIMIT_CONFIG['batch_delay_seconds'])
    max_daily = int(config.RATE_LIMIT_CONFIG['max_daily_downloads'])
    total = len(tickers)

    if total > max_daily:
        logger.warning(
            f"Ticker count {total} exceeds configured max_daily_downloads={max_daily}. "
            'Soft cap only; processing all tickers without truncation.'
        )

    start_dt = _parse_datetime(start)
    end_dt = _parse_datetime(end, end_of_day=True)

    resume_state = None
    if enable_resume:
        resume_state = _get_running_job_state(job_name, interval, start_dt, end_dt)

    start_chunk_idx = 0
    if resume_state and resume_state.get('last_chunk_idx') is not None:
        start_chunk_idx = int(resume_state['last_chunk_idx']) + 1
        logger.info(
            f"Resume from checkpoint for {job_name}/{interval}: chunk_idx={start_chunk_idx}"
        )

    if start_chunk_idx * chunk_size >= total:
        logger.info(f"{job_name}/{interval} already completed by checkpoint, skipping.")
        _upsert_job_state(job_name, interval, 'completed', tickers[-1], (total - 1) // chunk_size, start_dt, end_dt)
        return

    logger.info(
        f"Starting sync for {total} tickers. interval={interval} period={period} "
        f"start={start} end={end} job={job_name}"
    )

    last_ticker = None
    last_chunk_idx = start_chunk_idx - 1

    _upsert_job_state(job_name, interval, 'running', None, last_chunk_idx, start_dt, end_dt)

    try:
        with get_market_cursor() as cursor:
            start_i = start_chunk_idx * chunk_size
            for chunk_idx, i in enumerate(range(start_i, total, chunk_size), start=start_chunk_idx):
                chunk = tickers[i:i + chunk_size]
                progress = (i / total) * 100 if total else 100
                logger.info(f"[Progress: {i}/{total} ({progress:.1f}%)] chunk={len(chunk)}")

                download_chunk(cursor, chunk, interval, period, start, end)

                last_ticker = chunk[-1]
                last_chunk_idx = chunk_idx
                _upsert_job_state(
                    job_name,
                    interval,
                    'running',
                    last_ticker,
                    last_chunk_idx,
                    start_dt,
                    end_dt,
                )

                if i + chunk_size < total:
                    time.sleep(delay)

        _upsert_job_state(
            job_name,
            interval,
            'completed',
            tickers[-1],
            (total - 1) // chunk_size,
            start_dt,
            end_dt,
        )
        logger.info('Sync batch completed.')

    except Exception:
        _upsert_job_state(
            job_name,
            interval,
            'interrupted',
            last_ticker,
            last_chunk_idx,
            start_dt,
            end_dt,
        )
        raise


# ================================================================
# 策略 1：Incremental Update
# ================================================================

def incremental_update(interval: str = '1d') -> None:
    logger.info(f"Running Incremental Update for {interval}...")
    if not _ensure_provider_ready():
        logger.warning(f"Skip incremental update for {interval}: yfinance provider unavailable.")
        return

    now = datetime.now()

    # Tier 計算只在日線增量前刷新一次。
    if interval == '1d':
        refresh_ticker_tiers(force=False)

    tickers = get_tickers_for_update(interval, now=now, include_inactive_always=False)
    if not tickers:
        logger.info(f'No tickers selected for incremental update ({interval}).')
        return

    ticker_groups: dict[str, list[str]] = {}
    for ticker in tickers:
        last_date = get_last_data_date(ticker, interval)
        if not last_date:
            key = 'full'
        else:
            key = last_date.strftime('%Y-%m-%d')
            if (last_date + timedelta(days=1)).date() > now.date():
                continue

        ticker_groups.setdefault(key, []).append(ticker)

    logger.info(f"Identified {len(ticker_groups)} update groups for {interval}.")

    for key, group_tickers in ticker_groups.items():
        if key == 'full':
            period = config.TIMEFRAME_SETTINGS[interval]['period_limit']
            sync_market_data(
                group_tickers,
                interval=interval,
                period=period,
                job_name=f'incremental_{interval}_full',
            )
        else:
            last_dt = datetime.strptime(key, '%Y-%m-%d')
            start_dt = last_dt + timedelta(days=1)
            sync_market_data(
                group_tickers,
                interval=interval,
                start=start_dt,
                end=now,
                job_name=f'incremental_{interval}_{key}',
            )

    logger.info('Incremental update done. Triggering market_data backup...')
    try:
        from app.feature.data_management.backup.backup_mysql import backup_market_data

        backup_market_data()
    except Exception as e:
        logger.error(f"market_data backup failed: {e}")


# ================================================================
# 策略 2：Progressive Backfill
# ================================================================

def progressive_backfill(interval: str = '1d') -> None:
    logger.info(f"Running Progressive Backfill for {interval}...")
    if not _ensure_provider_ready():
        logger.warning(f"Skip progressive backfill for {interval}: yfinance provider unavailable.")
        return

    now = datetime.now()
    dynamic_floor = _parse_datetime(get_dynamic_start_date(interval, now=now)) or now

    last_plan = get_last_backfill_progress(interval)
    if last_plan:
        base_date = last_plan['start_date']
    else:
        oldest = get_oldest_date_in_db(interval)
        base_date = oldest if oldest else now

    years_per_run = int(config.SCHEDULE_CONFIG['progressive_backfill']['years_per_run'])
    target_start = base_date - timedelta(days=365 * years_per_run)
    if target_start < dynamic_floor:
        target_start = dynamic_floor

    target_end = base_date - timedelta(days=1)

    if target_end < dynamic_floor or target_end < target_start:
        logger.info(f"Backfill stop for {interval}: reached dynamic floor {dynamic_floor.date()}")
        return

    tickers = get_tickers_for_update(interval, now=now, include_inactive_always=True)
    if not tickers:
        logger.info(f'No tickers selected for backfill ({interval}).')
        return

    logger.info(f"Backfill Target: {target_start.date()} to {target_end.date()} ({interval})")
    sync_market_data(
        tickers,
        interval=interval,
        start=target_start,
        end=target_end,
        job_name=f'backfill_{interval}',
    )
    _record_backfill_progress(interval, target_start, target_end, 'completed', len(tickers))

    logger.info('Progressive backfill done. Triggering market_data backup...')
    try:
        from app.feature.data_management.backup.backup_mysql import backup_market_data

        backup_market_data()
    except Exception as e:
        logger.error(f"market_data backup failed: {e}")


# ================================================================
# 策略 3：Gap Fill
# ================================================================

def ensure_data(tickers: list[str], interval: str, start, end) -> None:
    """智能補填：70% 以下整段補，70~90% 針對缺失區段精修。"""
    if not tickers:
        logger.info(f'ensure_data skipped for {interval}: no tickers.')
        return

    if not _ensure_provider_ready():
        logger.warning(f"Skip ensure_data for {interval}: yfinance provider unavailable.")
        return

    start_dt, end_dt = _normalize_window(start, end)
    coarse_threshold = float(config.SCHEDULE_CONFIG['gap_scanner'].get('coarse_threshold', 0.7))
    fine_threshold = float(config.SCHEDULE_CONFIG['gap_scanner'].get('fine_threshold', 0.9))

    coarse: list[str] = []
    fine: list[str] = []

    for ticker in tickers:
        completeness = check_data_completeness(ticker, interval, start_dt, end_dt)
        if completeness < coarse_threshold:
            coarse.append(ticker)
        elif completeness < fine_threshold:
            fine.append(ticker)

    logger.info(
        f"ensure_data({interval}) window={start_dt.date()}~{end_dt.date()} coarse={len(coarse)} fine={len(fine)}"
    )

    if coarse:
        sync_market_data(
            coarse,
            interval=interval,
            start=start_dt,
            end=end_dt,
            job_name=f'gap_coarse_{interval}',
        )

    for ticker in fine:
        _fill_missing_points(ticker, interval, start_dt, end_dt)


# ================================================================
# CLI 入口
# ================================================================

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['sync', 'incremental', 'backfill', 'gap_fill'])
    parser.add_argument('--interval', default='1d')
    parser.add_argument('--period', default='1y')
    parser.add_argument('--tickers', help='逗號分隔或 "all"')
    parser.add_argument('--start', help='YYYY-MM-DD')
    parser.add_argument('--end', help='YYYY-MM-DD')
    args = parser.parse_args()

    if args.mode == 'sync':
        target = get_tickers_from_db() if args.tickers in ('all', None) else args.tickers.split(',')
        sync_market_data(
            target,
            interval=args.interval,
            period=args.period,
            start=args.start,
            end=args.end,
            job_name=f'manual_sync_{args.interval}',
            enable_resume=False,
        )

    elif args.mode == 'incremental':
        incremental_update(interval=args.interval)

    elif args.mode == 'backfill':
        progressive_backfill(interval=args.interval)

    elif args.mode == 'gap_fill':
        target = get_tickers_from_db() if args.tickers in ('all', None) else args.tickers.split(',')
        start = args.start or get_dynamic_start_date(args.interval)
        end = args.end or datetime.now().strftime('%Y-%m-%d')
        ensure_data(target, args.interval, start, end)
