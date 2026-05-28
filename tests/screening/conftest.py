"""tests/screening/conftest.py — 篩選/指標模組專用 fixture"""
import pytest
import pandas as pd
import numpy as np
from unittest.mock import MagicMock


@pytest.fixture
def sample_ohlcv_df():
    """回傳含 100 筆標準 OHLCV 的 DataFrame，供 SMA / BOLL / resample 等測試共用"""
    np.random.seed(42)
    dates = pd.date_range("2025-01-01", periods=100, freq="D")
    close = 100 + np.cumsum(np.random.randn(100))
    high = close + np.abs(np.random.randn(100))
    low = close - np.abs(np.random.randn(100))
    open_ = close + np.random.randn(100) * 0.5
    volume = (np.random.randint(1000, 10000, size=100)).astype(int)
    return pd.DataFrame(
        {"open": open_, "high": high, "low": low, "close": close, "volume": volume},
        index=dates,
    )


@pytest.fixture
def mock_db_cursor():
    """回傳一個工廠函式，傳入 rows 即可建立 mock cursor context manager"""
    def _factory(rows: list):
        cm = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = rows
        cursor.fetchone.return_value = rows[0] if rows else None
        cm.__enter__ = MagicMock(return_value=cursor)
        cm.__exit__ = MagicMock(return_value=False)
        return cm
    return _factory


@pytest.fixture
def sample_indicators():
    """回傳常見指標設定 list（SMA20、BOLL20_2），供多個測試共用"""
    return [
        {
            "type": "sma",
            "timeframe": "1d",
            "parameters": {"period": 20},
            "conditions": [{"left": "close", "operator": ">", "right": "MA20"}],
        },
        {
            "type": "bollinger",
            "timeframe": "1d",
            "parameters": {"period": 20, "std_dev": 2.0},
            "conditions": [
                {
                    "left": "BB_UPPER",
                    "operator": ">",
                    "right": "close",
                    "display": "BOLL UPPER>收盤價",
                }
            ],
        },
    ]
