"""tests/core/conftest.py — 核心基礎設施測試專用 fixture"""
import pytest
from unittest.mock import patch


@pytest.fixture
def mock_env(monkeypatch):
    """回傳一個工廠，讓測試快速設定多個環境變數，測試結束後自動還原"""
    def _set(**kwargs):
        for key, value in kwargs.items():
            monkeypatch.setenv(key, value)
    return _set


@pytest.fixture
def clear_env(monkeypatch):
    """回傳一個工廠，讓測試快速刪除特定環境變數"""
    def _del(*keys):
        for key in keys:
            monkeypatch.delenv(key, raising=False)
    return _del
