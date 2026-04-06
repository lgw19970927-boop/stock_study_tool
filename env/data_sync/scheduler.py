"""
Env/data_sync/scheduler.py
資料同步排程管理 - APScheduler 定期執行爬蟲、檢查缺口、備份資料

此腳本僅在 data_sync container 內執行
"""
import logging
import sys
import threading
import time
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler

from app.config import get_config
from app.feature.data_management.backup.backup_mysql import backup_market_data, backup_user_data
from app.feature.data_management.sync.sync_market_data import (
    ensure_data,
    get_dynamic_start_date,
    get_tickers_from_db,
    incremental_update,
    progressive_backfill,
)
from app.lib.db import get_market_cursor, init_db

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
)

SYNC_LOCK = threading.Lock()
INCREMENTAL_INTERVALS = ['1d', '1h', '5m', '1m']
BACKFILL_INTERVALS = ['1d', '1h', '5m']
STARTUP_BACKFILL_INTERVALS = ['1d', '1h']


def _init_runtime_dependencies(max_retries: int = 30, retry_interval: int = 5) -> None:
    """Initialize runtime dependencies with bounded retry/backoff."""
    for attempt in range(1, max_retries + 1):
        try:
            config = get_config()
            init_db(config)
            _ensure_runtime_tables()
            _recover_stale_job_state()
            logger.info('[scheduler] DB pool initialized OK')
            return
        except Exception as error:
            if attempt >= max_retries:
                logger.error(f"[scheduler] DB init failed after {max_retries} retries: {error}")
                raise

            wait_seconds = min(retry_interval * attempt, 60)
            logger.warning(
                f"[scheduler] DB init attempt {attempt}/{max_retries} failed: {error}. "
                f"Retry in {wait_seconds}s..."
            )
            time.sleep(wait_seconds)


def _ensure_runtime_tables() -> None:
    try:
        with get_market_cursor() as cursor:
            cursor.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM information_schema.tables
                WHERE table_schema = DATABASE() AND table_name = 'job_state'
                """
            )
            exists = int(cursor.fetchone()['cnt']) > 0
    except Exception as error:
        logger.warning(f"[scheduler] Unable to check job_state table: {error}")
        return

    if exists:
        return

    logger.warning('[scheduler] job_state table missing; attempting one-time auto-create...')
    try:
        with get_market_cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE job_state (
                    id             INT          NOT NULL AUTO_INCREMENT,
                    job_name       VARCHAR(50)  NOT NULL,
                    interval_type  VARCHAR(10)  NOT NULL,
                    status         VARCHAR(20)  NOT NULL,
                    last_ticker    VARCHAR(20),
                    last_chunk_idx INT,
                    target_start   DATE,
                    target_end     DATE,
                    started_at     DATETIME,
                    updated_at     DATETIME,
                    PRIMARY KEY (id),
                    UNIQUE KEY uq_job_state_name_interval (job_name, interval_type),
                    INDEX idx_job_state_status (status)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )
        logger.info('[scheduler] job_state table created')
    except Exception as error:
        logger.warning(
            f"[scheduler] Auto-create job_state failed (likely missing CREATE privilege). "
            f"Proceeding without checkpoint table: {error}"
        )


def _recover_stale_job_state() -> None:
    """Container restart may leave stale 'running' rows; mark them interrupted."""
    try:
        with get_market_cursor() as cursor:
            cursor.execute(
                """
                UPDATE job_state
                SET status = 'interrupted',
                    updated_at = NOW()
                WHERE status = 'running'
                """
            )
            affected = int(cursor.rowcount or 0)

        if affected > 0:
            logger.warning(
                f"[scheduler] Recovered {affected} stale running job_state row(s) as interrupted"
            )
    except Exception as error:
        logger.warning(f"[scheduler] Unable to recover stale job_state rows: {error}")


def _run_with_lock(job_name: str, fn, *args, **kwargs) -> None:
    if not SYNC_LOCK.acquire(blocking=False):
        logger.warning(f"[{job_name}] skipped: another sync job is still running")
        return

    try:
        logger.info(f"[{job_name}] started")
        fn(*args, **kwargs)
        logger.info(f"[{job_name}] completed")
    except Exception:
        logger.exception(f"[{job_name}] failed")
    finally:
        SYNC_LOCK.release()


def _run_incremental(interval: str) -> None:
    incremental_update(interval=interval)


def _run_backfill(interval: str) -> None:
    progressive_backfill(interval=interval)


def _run_ensure_data_all_intervals() -> None:
    tickers = get_tickers_from_db()
    if not tickers:
        logger.warning('[gap_scanner] no tickers found, skip ensure_data')
        return

    now = datetime.now()
    end = now.strftime('%Y-%m-%d')

    for interval in INCREMENTAL_INTERVALS:
        start = get_dynamic_start_date(interval, now=now)
        logger.info(f"[gap_scanner] ensure_data interval={interval} window={start}~{end}")
        ensure_data(tickers, interval, start, end)


def _run_startup_jobs() -> None:
    logger.info('[startup] running sequential incremental updates...')
    for interval in INCREMENTAL_INTERVALS:
        _run_with_lock(f'startup_incremental_{interval}', _run_incremental, interval)

    logger.info('[startup] running sequential progressive backfill...')
    for interval in STARTUP_BACKFILL_INTERVALS:
        _run_with_lock(f'startup_backfill_{interval}', _run_backfill, interval)


def run_scheduler() -> None:
    """啟動排程任務"""
    _init_runtime_dependencies()

    scheduler = BackgroundScheduler()
    scheduler.daemon = True

    logger.info('[scheduler] 初始化排程任務...')

    # Startup trigger: container 啟動就先跑一次
    _run_startup_jobs()

    # 週一至週五增量更新（錯開 10 分鐘）
    incremental_time_map = {'1d': 0, '1h': 10, '5m': 20, '1m': 30}
    for interval, minute in incremental_time_map.items():
        scheduler.add_job(
            lambda i=interval: _run_with_lock(f'incremental_update_{i}', _run_incremental, i),
            'cron',
            day_of_week='0-4',
            hour=18,
            minute=minute,
            id=f'incremental_update_{interval}',
            name=f'Incremental Update {interval} (Mon-Fri 18:{minute:02d})',
            coalesce=True,
            max_instances=1,
        )
        logger.info(f"✅ incremental_update_{interval} (Mon-Fri 18:{minute:02d})")

    # 每日歷史回補
    backfill_time_map = {'1d': 0, '1h': 20, '5m': 40}
    for interval, minute in backfill_time_map.items():
        scheduler.add_job(
            lambda i=interval: _run_with_lock(f'progressive_backfill_{i}', _run_backfill, i),
            'cron',
            hour=2,
            minute=minute,
            id=f'progressive_backfill_{interval}',
            name=f'Progressive Backfill {interval} (Daily 02:{minute:02d})',
            coalesce=True,
            max_instances=1,
        )
        logger.info(f"✅ progressive_backfill_{interval} (Daily 02:{minute:02d})")

    # 週日缺口補齊
    scheduler.add_job(
        lambda: _run_with_lock('gap_scanner', _run_ensure_data_all_intervals),
        'cron',
        day_of_week=6,
        hour=3,
        minute=0,
        id='gap_scanner',
        name='Weekly ensure_data (Sun 03:00)',
        coalesce=True,
        max_instances=1,
    )
    logger.info('✅ gap_scanner (Sun 03:00)')

    # user_data 備份：每 15 分鐘
    scheduler.add_job(
        backup_user_data,
        'interval',
        minutes=15,
        id='backup_user_data_frequent',
        name='User Data Backup (every 15 min)',
        coalesce=True,
        max_instances=1,
    )
    logger.info('✅ backup_user_data_frequent (Every 15 min)')

    scheduler.add_job(
        backup_market_data,
        'cron',
        hour=23,
        minute=59,
        id='backup_market_data',
        name='Daily Market Data Backup (23:59)',
        coalesce=True,
        max_instances=1,
    )
    logger.info('✅ backup_market_data (Daily 23:59)')

    logger.info('[scheduler] ✅ 所有排程已設定，準備啟動...')
    scheduler.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info('[scheduler] 正在關閉排程...')
        scheduler.shutdown()
        sys.exit(0)


if __name__ == '__main__':
    run_scheduler()
