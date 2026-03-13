"""
App/Lib/data_sync/migrate_sqlite_to_mysql.py
一次性遷移腳本 — SQLite → MySQL

用途：將舊版 SQLite 資料庫（market_data.db + user_data.db）
      的資料遷移至新的 MySQL 環境。

執行環境：host 本機（MySQL container 必須已啟動）

執行方式：
    cd d:\\Projects\\stock_study_tool
    conda activate marketing_system
    python -m App.Lib.data_sync.migrate_sqlite_to_mysql

注意：
  - SQLite 的 K 線資料表名為 `market_data`，MySQL 中為 `market_data_ohlcv`（自動對應）
  - 使用 executemany 分批寫入，避免記憶體爆炸
  - 遷移完成後自動呼叫 backup_mysql 產生初始備份檔
"""

import sqlite3
import logging
import os
import sys
from pathlib import Path
from datetime import datetime

import mysql.connector
from mysql.connector import Error as MySQLError

# ─── 路徑設定 ─────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parents[3]
SQLITE_DATA_DIR = PROJECT_ROOT / "reference" / "extracted" / "backend" / "data"
MARKET_DB_PATH = SQLITE_DATA_DIR / "market_data.db"
USER_DB_PATH   = SQLITE_DATA_DIR / "user_data.db"

# ─── 日誌設定 ─────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(PROJECT_ROOT / "migrate.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)

# ─── MySQL 連線設定（讀取 config） ─────────────────────────────────
def _get_mysql_config() -> dict:
    """讀取 App/config.py 的 MySQL 設定。"""
    from App.config import get_config
    cfg = get_config()
    return {
        "host":     cfg.MYSQL_HOST,
        "user":     cfg.MYSQL_USER,
        "password": cfg.MYSQL_PASSWORD,
        "port":     cfg.MYSQL_PORT,
        "charset":  "utf8mb4",
    }

BATCH_SIZE = 500  # 每批寫入筆數


# ══════════════════════════════════════════════════════════════════
# market_data.db  →  MySQL market_data schema
# ══════════════════════════════════════════════════════════════════

def migrate_market_data(mysql_cfg: dict) -> None:
    """遷移 market_data.db 的所有資料表至 MySQL market_data schema。"""
    if not MARKET_DB_PATH.exists():
        logger.error(f"找不到 SQLite 檔案：{MARKET_DB_PATH}")
        raise FileNotFoundError(MARKET_DB_PATH)

    logger.info(f"開始遷移 market_data.db → MySQL market_data schema")
    sqlite_conn = sqlite3.connect(str(MARKET_DB_PATH))
    sqlite_conn.row_factory = sqlite3.Row

    mysql_conn = mysql.connector.connect(**mysql_cfg, database="market_data")
    mysql_cur  = mysql_conn.cursor()

    try:
        # ── 1. stock_meta ──────────────────────────────────────────
        _migrate_stock_meta(sqlite_conn, mysql_cur)
        mysql_conn.commit()

        # ── 2. market_data（SQLite）→ market_data_ohlcv（MySQL）──────
        _migrate_ohlcv(sqlite_conn, mysql_cur, mysql_conn)
        mysql_conn.commit()

        # ── 3. download_failures ───────────────────────────────────
        _migrate_download_failures(sqlite_conn, mysql_cur)
        mysql_conn.commit()

        # ── 4. backfill_history ────────────────────────────────────
        _migrate_backfill_history(sqlite_conn, mysql_cur)
        mysql_conn.commit()

        # ── 5. data_gaps ───────────────────────────────────────────
        _migrate_data_gaps(sqlite_conn, mysql_cur)
        mysql_conn.commit()

        logger.info("✅ market_data 遷移完成")

    finally:
        mysql_cur.close()
        mysql_conn.close()
        sqlite_conn.close()


def _migrate_stock_meta(sqlite_conn, mysql_cur) -> None:
    rows = sqlite_conn.execute("SELECT * FROM stock_meta").fetchall()
    if not rows:
        logger.info("stock_meta：無資料，跳過")
        return

    logger.info(f"stock_meta：遷移 {len(rows)} 筆")
    sql = """
        INSERT IGNORE INTO stock_meta
            (symbol, name, market, sector, industry, listing_date, last_updated, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """
    data = [
        (r["symbol"], r["name"], r["market"], r["sector"],
         r["industry"], r["listing_date"], r["last_updated"],
         r["status"] if "status" in r.keys() else "Active")
        for r in rows
    ]
    for i in range(0, len(data), BATCH_SIZE):
        batch = data[i:i + BATCH_SIZE]
        mysql_cur.executemany(sql, batch)
        logger.info(f"  stock_meta：已寫入 {min(i + BATCH_SIZE, len(data))}/{len(rows)} 筆")


def _migrate_ohlcv(sqlite_conn, mysql_cur, mysql_conn) -> None:
    """SQLite market_data → MySQL market_data_ohlcv（批次分頁寫入，避免 OOM）"""
    total = sqlite_conn.execute("SELECT COUNT(*) FROM market_data").fetchone()[0]
    logger.info(f"market_data_ohlcv：共 {total:,} 筆，開始分批寫入（每批 {BATCH_SIZE} 筆）")

    sql = """
        INSERT IGNORE INTO market_data_ohlcv
            (symbol, timeframe, datetime, open, high, low, close, volume)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """

    offset    = 0
    written   = 0
    page_size = 5000  # 每次從 SQLite 讀取的筆數（讀比寫大，減少 I/O 次數）

    while True:
        rows = sqlite_conn.execute(
            "SELECT symbol, timeframe, datetime, open, high, low, close, volume "
            "FROM market_data LIMIT ? OFFSET ?",
            (page_size, offset)
        ).fetchall()

        if not rows:
            break

        data = [(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7]) for r in rows]

        for i in range(0, len(data), BATCH_SIZE):
            batch = data[i:i + BATCH_SIZE]
            mysql_cur.executemany(sql, batch)

        mysql_conn.commit()
        written += len(rows)
        offset  += page_size
        logger.info(f"  market_data_ohlcv：已寫入 {written:,}/{total:,} 筆 ({written/total*100:.1f}%)")

    logger.info(f"  market_data_ohlcv：遷移完成，共寫入 {written:,} 筆")


def _migrate_download_failures(sqlite_conn, mysql_cur) -> None:
    rows = sqlite_conn.execute("SELECT * FROM download_failures").fetchall()
    if not rows:
        logger.info("download_failures：無資料，跳過")
        return

    logger.info(f"download_failures：遷移 {len(rows)} 筆")
    sql = """
        INSERT IGNORE INTO download_failures (symbol, interval_type, attempted_at, error_message)
        VALUES (%s, %s, %s, %s)
    """
    # SQLite 中欄位名為 interval，MySQL 中為 interval_type
    data = [(r["symbol"], r["interval"], r["attempted_at"], r["error_message"]) for r in rows]
    mysql_cur.executemany(sql, data)


def _migrate_backfill_history(sqlite_conn, mysql_cur) -> None:
    try:
        rows = sqlite_conn.execute("SELECT * FROM backfill_history").fetchall()
    except sqlite3.OperationalError:
        logger.info("backfill_history：資料表不存在，跳過")
        return
    if not rows:
        logger.info("backfill_history：無資料，跳過")
        return

    logger.info(f"backfill_history：遷移 {len(rows)} 筆")
    sql = """
        INSERT IGNORE INTO backfill_history
            (interval_type, start_date, end_date, completed_at, total_tickers, downloaded_count, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """
    data = [
        (r["interval"], r["start_date"], r["end_date"], r["completed_at"],
         r["total_tickers"] if "total_tickers" in r.keys() else None,
         r["downloaded_count"] if "downloaded_count" in r.keys() else None,
         r["status"])
        for r in rows
    ]
    mysql_cur.executemany(sql, data)


def _migrate_data_gaps(sqlite_conn, mysql_cur) -> None:
    try:
        rows = sqlite_conn.execute("SELECT * FROM data_gaps").fetchall()
    except sqlite3.OperationalError:
        logger.info("data_gaps：資料表不存在，跳過")
        return
    if not rows:
        logger.info("data_gaps：無資料，跳過")
        return

    logger.info(f"data_gaps：遷移 {len(rows)} 筆")
    sql = """
        INSERT IGNORE INTO data_gaps
            (symbol, interval_type, gap_start, gap_end, detected_at, filled_at, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """
    data = [
        (r["symbol"], r["interval"], r["gap_start"], r["gap_end"],
         r["detected_at"], r["filled_at"] if "filled_at" in r.keys() else None,
         r["status"])
        for r in rows
    ]
    mysql_cur.executemany(sql, data)


# ══════════════════════════════════════════════════════════════════
# user_data.db  →  MySQL user_data schema
# ══════════════════════════════════════════════════════════════════

def migrate_user_data(mysql_cfg: dict) -> None:
    """遷移 user_data.db 的所有資料表至 MySQL user_data schema。"""
    if not USER_DB_PATH.exists():
        logger.warning(f"找不到 SQLite 檔案：{USER_DB_PATH}，跳過 user_data 遷移")
        return

    logger.info(f"開始遷移 user_data.db → MySQL user_data schema")
    sqlite_conn = sqlite3.connect(str(USER_DB_PATH))
    sqlite_conn.row_factory = sqlite3.Row

    mysql_conn = mysql.connector.connect(**mysql_cfg, database="user_data")
    mysql_cur  = mysql_conn.cursor()

    try:
        # ── strategies ─────────────────────────────────────────────
        rows = sqlite_conn.execute("SELECT * FROM strategies").fetchall()
        if rows:
            logger.info(f"strategies：遷移 {len(rows)} 筆")
            sql = """
                INSERT IGNORE INTO strategies
                    (name, description, is_active, created_at, updated_at, configuration)
                VALUES (%s, %s, %s, %s, %s, %s)
            """
            data = [
                (r["name"], r["description"], r["is_active"],
                 r["created_at"], r["updated_at"], r["configuration"])
                for r in rows
            ]
            mysql_cur.executemany(sql, data)
            mysql_conn.commit()
            logger.info("strategies：遷移完成")
        else:
            logger.info("strategies：無資料，跳過")

        # ── screening_results ──────────────────────────────────────
        try:
            rows = sqlite_conn.execute("SELECT * FROM screening_results").fetchall()
            if rows:
                logger.info(f"screening_results：遷移 {len(rows)} 筆")
                sql = """
                    INSERT IGNORE INTO screening_results
                        (strategy_id, symbol, result_date, price, change_pct, volume, signals, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """
                data = [
                    (r["strategy_id"], r["symbol"],
                     r["date"] if "date" in r.keys() else r["result_date"],
                     r["price"], r["change_percent"] if "change_percent" in r.keys() else None,
                     r["volume"], r["signals"], r["created_at"])
                    for r in rows
                ]
                mysql_cur.executemany(sql, data)
                mysql_conn.commit()
        except sqlite3.OperationalError:
            logger.info("screening_results：資料表不存在，跳過")

        logger.info("✅ user_data 遷移完成")

    finally:
        mysql_cur.close()
        mysql_conn.close()
        sqlite_conn.close()


# ══════════════════════════════════════════════════════════════════
# 主程序
# ══════════════════════════════════════════════════════════════════

def main() -> None:
    start = datetime.now()
    logger.info("=" * 60)
    logger.info("SQLite → MySQL 一次性資料遷移 開始")
    logger.info(f"市場資料來源：{MARKET_DB_PATH}")
    logger.info(f"用戶資料來源：{USER_DB_PATH}")
    logger.info("=" * 60)

    mysql_cfg = _get_mysql_config()

    # ── Step 1：遷移 market_data ──────────────────────────────────
    migrate_market_data(mysql_cfg)

    # ── Step 2：遷移 user_data ────────────────────────────────────
    migrate_user_data(mysql_cfg)

    # ── Step 3：產生初始備份 ──────────────────────────────────────
    logger.info("=" * 60)
    logger.info("開始產生初始備份...")

    from App.Lib.data_sync.backup_mysql import backup_market_data, backup_user_data
    backup_market_data()
    backup_user_data()

    elapsed = (datetime.now() - start).total_seconds()
    logger.info("=" * 60)
    logger.info(f"✅ 全部完成！共耗時 {elapsed:.1f} 秒")
    logger.info(f"備份檔案位置：{PROJECT_ROOT / 'App' / 'Env' / 'data'}")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
