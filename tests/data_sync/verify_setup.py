"""
Test/data_sync/verify_setup.py
驗證 MySQL 環境與 data_sync 模組是否正確設置（測試工具）
（取代 reference 的 SQLite 版 verify_setup.py）
"""
import sys
from pathlib import Path
from datetime import datetime

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# 測試腳本直接執行時不走 FastAPI，需自行初始化 DB 設定
from app.config import get_config
from app.Lib import db as _db
_db.init_db(get_config())

from app.Lib.db import get_market_cursor, get_user_cursor


def verify_setup() -> None:
    print("=== MySQL 環境驗證開始 ===")

    # ── 1. 確認 market_data 資料表 ─────────────────────────────────
    print("\n[1] 驗證 market_data schema 資料表...")
    expected_market = ['stock_meta', 'market_data_ohlcv', 'download_failures',
                       'backfill_history', 'data_gaps']
    with get_market_cursor() as cursor:
        cursor.execute(
            "SELECT TABLE_NAME FROM information_schema.TABLES "
            "WHERE TABLE_SCHEMA = 'market_data'"
        )
        tables = [r['TABLE_NAME'] for r in cursor.fetchall()]
        print(f"  Found tables: {tables}")
        missing = [t for t in expected_market if t not in tables]
        if missing:
            print(f"❌ 缺少資料表: {missing}")
        else:
            print("✅ 所有 market_data 資料表存在")

    # ── 2. 確認 user_data 資料表 ───────────────────────────────────
    print("\n[2] 驗證 user_data schema 資料表...")
    expected_user = ['strategies', 'screening_results']
    with get_user_cursor() as cursor:
        cursor.execute(
            "SELECT TABLE_NAME FROM information_schema.TABLES "
            "WHERE TABLE_SCHEMA = 'user_data'"
        )
        tables = [r['TABLE_NAME'] for r in cursor.fetchall()]
        print(f"  Found tables: {tables}")
        missing = [t for t in expected_user if t not in tables]
        if missing:
            print(f"❌ 缺少資料表: {missing}")
        else:
            print("✅ 所有 user_data 資料表存在")

    # ── 3. 測試 market_data_ohlcv 寫入/讀取 ───────────────────────
    print("\n[3] 測試 market_data_ohlcv 寫入/讀取...")
    test_symbol = 'TEST_TICKER'
    test_dt     = '2026-01-01 00:00:00'

    with get_market_cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO market_data_ohlcv (symbol, timeframe, datetime, close)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE close = VALUES(close)
            """,
            (test_symbol, '1d', test_dt, 100.0)
        )
        cursor.execute(
            "SELECT datetime FROM market_data_ohlcv WHERE symbol=%s AND timeframe='1d' ORDER BY datetime DESC LIMIT 1",
            (test_symbol,)
        )
        row = cursor.fetchone()

    if row and str(row['datetime'])[:10] == '2026-01-01':
        print(f"✅ market_data_ohlcv 寫入/讀取成功（{row['datetime']}）")
    else:
        print(f"❌ market_data_ohlcv 寫入失敗（got: {row}）")

    # ── 4. 測試 strategies 寫入/讀取 ─────────────────────────────
    print("\n[4] 測試 strategies 寫入/讀取...")
    test_name = f'__verify_test_{datetime.now().strftime("%H%M%S")}__'

    with get_user_cursor() as cursor:
        cursor.execute(
            "INSERT INTO strategies (name, configuration, created_at, updated_at) VALUES (%s, %s, %s, %s)",
            (test_name, '{"rules": []}',
             datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
             datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
        )
        cursor.execute("SELECT name FROM strategies WHERE name = %s", (test_name,))
        row = cursor.fetchone()
        # 清除測試資料
        cursor.execute("DELETE FROM strategies WHERE name = %s", (test_name,))

    if row:
        print(f"✅ strategies 寫入/讀取成功（{row['name']}）")
    else:
        print("❌ strategies 寫入失敗")

    print("\n=== 驗證完成 ===")


if __name__ == '__main__':
    verify_setup()
