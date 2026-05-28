"""tests/smoke/conftest.py — DB 煙霧測試專用 fixture"""
import pytest


@pytest.fixture(scope="session")
def db_init():
    """呼叫 init_db(get_config())，取代各煙霧測試重複的初始化邏輯"""
    from app.config import get_config
    from app.lib.db import init_db
    init_db(get_config())
