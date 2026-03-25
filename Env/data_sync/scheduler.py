"""
Env/data_sync/scheduler.py
資料同步排程管理 - APScheduler 定期執行爬蟲、檢查缺口、備份資料

此腳本僅在 data_sync container 內執行
"""
import logging
import sys
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler

# ✅ 使用新路徑
from App.Feature.DataManagement.sync.sync_market_data import (
    incremental_update,
    progressive_backfill,
    ensure_data
)
from App.Feature.DataManagement.backup.backup_mysql import backup_user_data, backup_market_data

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)

def run_scheduler():
    """啟動排程任務"""
    scheduler = BackgroundScheduler()
    scheduler.daemon = True
    
    logger.info("[scheduler] 初始化排程任務...")
    
    # 週一至週五 18:00 增量更新
    scheduler.add_job(
        lambda: incremental_update(interval='1d'),
        'cron',
        day_of_week='0-4',
        hour=18,
        minute=0,
        id='incremental_update',
        name='Daily Incremental Update (Mon-Fri 18:00)'
    )
    logger.info("✅ incremental_update (Mon-Fri 18:00)")
    
    # 每日 02:00 歷史回補
    scheduler.add_job(
        lambda: progressive_backfill(interval='1d'),
        'cron',
        hour=2,
        minute=0,
        id='progressive_backfill',
        name='Daily Progressive Backfill (02:00)'
    )
    logger.info("✅ progressive_backfill (Daily 02:00)")
    
    # 週日 03:00 缺口掃描
    scheduler.add_job(
        lambda: ensure_data(['all'], '1d', '2024-01-01', None),
        'cron',
        day_of_week=6,
        hour=3,
        minute=0,
        id='gap_scanner',
        name='Weekly Gap Scanner (Sun 03:00)'
    )
    logger.info("✅ gap_scanner (Sun 03:00)")
    
    # 每日 23:55 使用者資料備份
    scheduler.add_job(
        backup_user_data,
        'cron',
        hour=23,
        minute=55,
        id='backup_user_data',
        name='Daily User Data Backup (23:55)'
    )
    logger.info("✅ backup_user_data (Daily 23:55)")
    
    # 每日 23:59 市場資料備份
    scheduler.add_job(
        backup_market_data,
        'cron',
        hour=23,
        minute=59,
        id='backup_market_data',
        name='Daily Market Data Backup (23:59)'
    )
    logger.info("✅ backup_market_data (Daily 23:59)")
    
    logger.info("[scheduler] ✅ 所有排程已設定，準備啟動...")
    scheduler.start()
    
    try:
        while True:
            pass
    except KeyboardInterrupt:
        logger.info("[scheduler] 正在關閉排程...")
        scheduler.shutdown()
        sys.exit(0)

if __name__ == '__main__':
    run_scheduler()
