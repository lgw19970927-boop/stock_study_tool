"""tests/integration/conftest.py — 整合測試 fixture（需 FastAPI + DB）"""
import os
import pytest
import requests


@pytest.fixture(scope="session")
def base_url():
    """FastAPI 測試 server 基底 URL"""
    return os.environ.get("TEST_BASE_URL", "http://localhost:8000")


@pytest.fixture(scope="session")
def http_get(base_url):
    """帶 timeout 的 GET helper"""
    def _get(path, **kwargs):
        return requests.get(f"{base_url}{path}", timeout=10, **kwargs)
    return _get


@pytest.fixture(scope="session")
def http_post(base_url):
    """帶 timeout 的 POST helper"""
    def _post(path, **kwargs):
        return requests.post(f"{base_url}{path}", timeout=30, **kwargs)
    return _post


@pytest.fixture(scope="session")
def test_db_session():
    """
    建立 test schema → 套用 migration → yield → 清除。
    需設定環境變數 MYSQL_HOST / MYSQL_ROOT_PASSWORD 才會啟動，
    否則跳過（避免本地無 MySQL 時失敗）。
    """
    if not os.environ.get("MYSQL_ROOT_PASSWORD"):
        pytest.skip("MYSQL_ROOT_PASSWORD not set; skipping DB schema setup")

    import mysql.connector

    conn = mysql.connector.connect(
        host=os.environ.get("MYSQL_HOST", "127.0.0.1"),
        user="root",
        password=os.environ.get("MYSQL_ROOT_PASSWORD", "test_root_pw"),
    )
    cursor = conn.cursor()
    cursor.execute("CREATE DATABASE IF NOT EXISTS market_data_test")
    cursor.execute("CREATE DATABASE IF NOT EXISTS user_data_test")
    conn.commit()

    os.environ["APP_ENV"] = "testing"
    from app.config import get_config
    from app.lib.db import init_db
    init_db(get_config())

    yield conn

    cursor.execute("DROP DATABASE IF EXISTS market_data_test")
    cursor.execute("DROP DATABASE IF EXISTS user_data_test")
    conn.commit()
    conn.close()
