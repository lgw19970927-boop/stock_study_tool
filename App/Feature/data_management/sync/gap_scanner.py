"""
App/Lib/data_sync/gap_scanner.py
掃描並回報 market_data_ohlcv 中的資料缺口
（由 reference/extracted/backend/data_sync/gap_scanner.py 移植，SQLite → MySQL）
"""
import logging
import argparse
from datetime import datetime, timedelta

import pandas as pd

from app.lib.db import get_market_cursor
from app.feature.data_management.sync.sync_market_data import get_tickers_from_db, sync_market_data

logger = logging.getLogger(__name__)

GAP_THRESHOLD = timedelta(days=7)


def _record_data_gap(cursor, symbol: str, interval: str, gap_start: datetime, gap_end: datetime) -> None:
    """將缺口寫入 data_gaps 資料表。"""
    cursor.execute(
        """
        INSERT INTO data_gaps (symbol, interval_type, gap_start, gap_end, detected_at, status)
        VALUES (%s, %s, %s, %s, %s, 'detected')
        """,
        (symbol, interval,
         gap_start.strftime('%Y-%m-%d'),
         gap_end.strftime('%Y-%m-%d'),
         datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    )


def scan_gaps(tickers: list = None, interval: str = '1d', auto_fill: bool = False) -> None:
    """
    掃描指定股票的資料缺口。

    Args:
        tickers:   指定股票清單，None 則查詢全部 Active 股票。
        interval:  K 線週期（預設 '1d'）。
        auto_fill: 是否自動下載並補填缺口。
    """
    if not tickers:
        tickers = get_tickers_from_db()

    logger.info(f"Starting Gap Scan for {len(tickers)} tickers. Interval: {interval}")

    total_gaps = 0

    with get_market_cursor() as cursor:
        for ticker in tickers:
            cursor.execute(
                """
                SELECT datetime FROM market_data_ohlcv
                WHERE symbol = %s AND timeframe = %s
                ORDER BY datetime ASC
                """,
                (ticker, interval)
            )
            rows = cursor.fetchall()
            if not rows or len(rows) < 2:
                continue

            dates = [pd.to_datetime(r['datetime']) for r in rows]

            for i in range(len(dates) - 1):
                diff = dates[i + 1] - dates[i]
                if diff > GAP_THRESHOLD:
                    gap_start = dates[i]     + timedelta(days=1)
                    gap_end   = dates[i + 1] - timedelta(days=1)

                    logger.warning(
                        f"Gap detected for {ticker}: {gap_start.date()} → {gap_end.date()} ({diff.days} days)"
                    )
                    _record_data_gap(cursor, ticker, interval, gap_start, gap_end)
                    total_gaps += 1

                    if auto_fill:
                        logger.info(f"Auto-filling gap for {ticker}...")
                        sync_market_data([ticker], interval=interval,
                                         start=gap_start, end=dates[i + 1])

    logger.info(f"Scan complete. Found {total_gaps} gaps.")


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    parser = argparse.ArgumentParser()
    parser.add_argument('--interval', default='1d')
    parser.add_argument('--fill', action='store_true', help='Auto fill gaps found')
    parser.add_argument('--tickers', help='Specific tickers (comma-separated)')
    args = parser.parse_args()

    target_tickers = args.tickers.split(',') if args.tickers else None
    scan_gaps(target_tickers, args.interval, args.fill)
