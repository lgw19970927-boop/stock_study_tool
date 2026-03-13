"""
App/Lib/db.py
MySQL 連線工具 — 仿 petshop lib/db.py 設計
提供 market_data 和 user_data 兩個獨立 schema 的連線
"""
from contextlib import contextmanager
from typing import Generator

import mysql.connector
from mysql.connector import pooling
from mysql.connector.connection import MySQLConnection
from mysql.connector.cursor import MySQLCursor


# ==========================================
# 連線配置（由 config.py 注入）
# ==========================================

_config: dict = {}
_market_pool: pooling.MySQLConnectionPool = None
_user_pool: pooling.MySQLConnectionPool = None


def init_db(config) -> None:
    """由 app.py 呼叫，注入 MySQL 設定並初始化 Connection Pool。"""
    global _config, _market_pool, _user_pool
    _config = {
        "host":     config.MYSQL_HOST,
        "user":     config.MYSQL_USER,
        "password": config.MYSQL_PASSWORD,
        "port":     config.MYSQL_PORT,
        "charset":  config.MYSQL_CHARSET,
    }
    _config["market_db"] = config.MYSQL_MARKET_DB
    _config["user_db"]   = config.MYSQL_USER_DB
    
    # 建立 Market DB 連線池 (篩選模組極度依賴並行，需要較大的 pool_size)
    _market_pool = pooling.MySQLConnectionPool(
        pool_name="market_pool",
        pool_size=32,
        pool_reset_session=True,
        **{k: v for k, v in _config.items() if k not in ("market_db", "user_db")},
        database=_config["market_db"]
    )
    
    # 建立 User DB 連線池
    _user_pool = pooling.MySQLConnectionPool(
        pool_name="user_pool",
        pool_size=5,
        pool_reset_session=True,
        **{k: v for k, v in _config.items() if k not in ("market_db", "user_db")},
        database=_config["user_db"]
    )

# ==========================================
# 連線 Context Manager
# ==========================================

@contextmanager
def get_market_db_conn() -> Generator[MySQLConnection, None, None]:
    """從 Connection Pool 取得 market_data 的 MySQL 連線。"""
    conn = _market_pool.get_connection()
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def get_user_db_conn() -> Generator[MySQLConnection, None, None]:
    """從 Connection Pool 取得 user_data 的 MySQL 連線。"""
    conn = _user_pool.get_connection()
    try:
        yield conn
    finally:
        conn.close()


# ==========================================
# Cursor Context Manager（帶自動 commit）
# ==========================================

@contextmanager
def get_market_cursor(dictionary: bool = True) -> Generator[MySQLCursor, None, None]:
    """
    取得 market_data 的 cursor，結束後自動 commit。
    dictionary=True 時，fetchone/fetchall 回傳 dict 而非 tuple。
    """
    with get_market_db_conn() as conn:
        cursor = conn.cursor(dictionary=dictionary)
        try:
            yield cursor
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cursor.close()


@contextmanager
def get_user_cursor(dictionary: bool = True) -> Generator[MySQLCursor, None, None]:
    """取得 user_data 的 cursor，結束後自動 commit。"""
    with get_user_db_conn() as conn:
        cursor = conn.cursor(dictionary=dictionary)
        try:
            yield cursor
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cursor.close()
