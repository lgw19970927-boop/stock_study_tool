"""
Test/data_sync/check_db_count.py
快速查看 MySQL market_data_ohlcv 的股票數和資料筆數（測試工具）
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# 測試腳本直接執行時不走 FastAPI，需自行初始化 DB 設定
from app.config import get_config
from app.Lib import db as _db
_db.init_db(get_config())

from app.Lib.db import get_market_cursor


def check_data() -> None:
    print("=" * 50)
    print("MySQL 資料庫快速檢查")
    print("=" * 50)

    with get_market_cursor() as cursor:
        # stock_meta
        cursor.execute("SELECT COUNT(*) AS cnt FROM stock_meta")
        meta_count = cursor.fetchone()['cnt']
        print(f"stock_meta（股票數）：{meta_count:,}")

        # market_data_ohlcv 總筆數
        cursor.execute("SELECT COUNT(*) AS cnt FROM market_data_ohlcv")
        data_count = cursor.fetchone()['cnt']
        print(f"market_data_ohlcv（K 線筆數）：{data_count:,}")

        # 按 timeframe 分類
        cursor.execute(
            "SELECT timeframe, COUNT(*) AS cnt FROM market_data_ohlcv GROUP BY timeframe ORDER BY timeframe"
        )
        print("\n按 timeframe 統計：")
        for row in cursor.fetchall():
            print(f"  {row['timeframe']:<6}: {row['cnt']:>12,}")

        # 樣本
        if meta_count > 0:
            print("\n樣本 stock_meta（前 5 筆）：")
            cursor.execute("SELECT symbol, market, last_updated, status FROM stock_meta LIMIT 5")
            for r in cursor.fetchall():
                print(f"  {r['symbol']:<10} {r['market']:<10} {r['last_updated']} [{r['status']}]")

        if data_count > 0:
            print("\n樣本 market_data_ohlcv（AAPL 最近 5 筆，無則取任意）：")
            cursor.execute(
                "SELECT * FROM market_data_ohlcv WHERE symbol='AAPL' ORDER BY datetime DESC LIMIT 5"
            )
            rows = cursor.fetchall()
            if not rows:
                cursor.execute("SELECT * FROM market_data_ohlcv ORDER BY datetime DESC LIMIT 5")
                rows = cursor.fetchall()
            for r in rows:
                print(f"  {r['symbol']:<10} {r['datetime']} {r['close']}")

    print("=" * 50)


if __name__ == "__main__":
    check_data()
