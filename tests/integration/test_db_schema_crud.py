"""
tests/integration/test_db_schema_crud.py — MySQL schema 完整性 + CRUD 測試
需要 MYSQL_ROOT_PASSWORD 環境變數才執行，否則 test_db_session fixture 會 skip。
"""
import pytest

pytestmark = pytest.mark.integration


EXPECTED_MARKET_TABLES = {"market_data_ohlcv", "stock_meta"}
EXPECTED_USER_TABLES = {"strategies"}


def _get_tables(conn, db_name: str) -> set:
    cursor = conn.cursor()
    cursor.execute(f"USE {db_name}")
    cursor.execute("SHOW TABLES")
    return {row[0] for row in cursor.fetchall()}


def test_market_data_tables_exist(test_db_session):
    tables = _get_tables(test_db_session, "market_data_test")
    for table in EXPECTED_MARKET_TABLES:
        assert table in tables, f"Table '{table}' not found in market_data_test"


def test_user_data_tables_exist(test_db_session):
    tables = _get_tables(test_db_session, "user_data_test")
    for table in EXPECTED_USER_TABLES:
        assert table in tables, f"Table '{table}' not found in user_data_test"


def test_market_data_ohlcv_crud(test_db_session):
    cursor = test_db_session.cursor()
    cursor.execute("USE market_data_test")

    # Insert
    cursor.execute(
        "INSERT INTO market_data_ohlcv (symbol, timeframe, datetime, open, high, low, close, volume) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
        ("_TEST_SYMBOL_", "1d", "2025-01-01", 100.0, 105.0, 99.0, 102.0, 50000),
    )
    test_db_session.commit()

    # Read
    cursor.execute("SELECT * FROM market_data_ohlcv WHERE symbol = '_TEST_SYMBOL_'")
    rows = cursor.fetchall()
    assert len(rows) >= 1

    # Delete
    cursor.execute("DELETE FROM market_data_ohlcv WHERE symbol = '_TEST_SYMBOL_'")
    test_db_session.commit()
    cursor.execute("SELECT * FROM market_data_ohlcv WHERE symbol = '_TEST_SYMBOL_'")
    assert cursor.fetchone() is None


def test_strategies_crud(test_db_session):
    import json
    cursor = test_db_session.cursor()
    cursor.execute("USE user_data_test")

    config_json = json.dumps({"indicators": []})

    # Insert
    cursor.execute(
        "INSERT INTO strategies (name, configuration) VALUES (%s, %s)",
        ("_Test Strategy_", config_json),
    )
    test_db_session.commit()
    strategy_id = cursor.lastrowid

    # Read
    cursor.execute("SELECT * FROM strategies WHERE id = %s", (strategy_id,))
    row = cursor.fetchone()
    assert row is not None

    # Delete
    cursor.execute("DELETE FROM strategies WHERE id = %s", (strategy_id,))
    test_db_session.commit()
    cursor.execute("SELECT * FROM strategies WHERE id = %s", (strategy_id,))
    assert cursor.fetchone() is None
