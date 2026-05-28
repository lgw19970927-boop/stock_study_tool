"""tests/core/test_config.py — config.py 單元測試"""
import pytest
import os
from unittest.mock import patch, mock_open

from app.config import (
    get_config,
    _read_int,
    DevelopmentConfig,
    TestingConfig,
    ProductionConfig,
)

pytestmark = pytest.mark.unit


# ── get_config() ──────────────────────────────────────────────────

@pytest.mark.parametrize("env_name,expected_class", [
    ("development", DevelopmentConfig),
    ("testing",     TestingConfig),
    ("production",  ProductionConfig),
    ("DEVELOPMENT", DevelopmentConfig),   # 大小寫不敏感
    ("TESTING",     TestingConfig),
])
def test_get_config_known_envs(env_name, expected_class):
    assert get_config(env_name) is expected_class


def test_get_config_unknown_falls_back_to_development():
    assert get_config("nonexistent_env") is DevelopmentConfig


def test_get_config_reads_app_env_from_environment(mock_env):
    mock_env(APP_ENV="testing")
    assert get_config() is TestingConfig


def test_get_config_default_is_development(clear_env):
    clear_env("APP_ENV")
    assert get_config() is DevelopmentConfig


# ── TestingConfig 使用 test DB 名 ──────────────────────────────────

def test_testing_config_market_db_default():
    assert "test" in TestingConfig.MYSQL_MARKET_DB


def test_testing_config_user_db_default():
    assert "test" in TestingConfig.MYSQL_USER_DB


# ── _read_int() ───────────────────────────────────────────────────

@pytest.mark.parametrize("value,default,expected", [
    ("10",  5,  10),
    ("0",   5,  0),
    (None,  5,  5),     # 環境變數不存在 → 回傳 default
    ("abc", 5,  5),     # 非法字串 → 回傳 default
    ("",    5,  5),     # 空字串 → 回傳 default
])
def test_read_int(monkeypatch, value, default, expected):
    if value is None:
        monkeypatch.delenv("_TEST_INT_VAR", raising=False)
    else:
        monkeypatch.setenv("_TEST_INT_VAR", value)
    assert _read_int("_TEST_INT_VAR", default) == expected


# ── _read_secret()：從 env var 讀取 ──────────────────────────────

def test_read_secret_from_env_var(monkeypatch):
    from app.config import _read_secret
    monkeypatch.setenv("MY_SECRET", "supersecret")
    assert _read_secret("MY_SECRET") == "supersecret"


def test_read_secret_returns_default_when_missing(monkeypatch):
    from app.config import _read_secret
    monkeypatch.delenv("MY_SECRET", raising=False)
    monkeypatch.delenv("MY_SECRET_FILE", raising=False)
    result = _read_secret("MY_SECRET", default="fallback")
    assert result == "fallback"
