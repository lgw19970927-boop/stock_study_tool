"""tests/screening/test_calculate_indicators.py — calculate_indicators() 單元測試"""
import pytest
import pandas as pd

from app.feature.screening.indicators.service import calculate_indicators

pytestmark = pytest.mark.unit


def test_calculate_sma_indicator(sample_ohlcv_df):
    indicators = [{"type": "sma", "parameters": {"period": 20}, "conditions": []}]
    df = calculate_indicators(sample_ohlcv_df.copy(), indicators)
    assert "MA20" in df.columns


def test_calculate_bollinger_indicator(sample_ohlcv_df):
    indicators = [{"type": "bollinger", "parameters": {"period": 20, "std_dev": 2.0}, "conditions": []}]
    df = calculate_indicators(sample_ohlcv_df.copy(), indicators)
    assert "BB_UPPER" in df.columns
    assert "BB_MIDDLE" in df.columns
    assert "BB_LOWER" in df.columns


def test_calculate_multiple_indicators(sample_ohlcv_df):
    indicators = [
        {"type": "sma", "parameters": {"period": 10}, "conditions": []},
        {"type": "bollinger", "parameters": {"period": 20, "std_dev": 2.0}, "conditions": []},
    ]
    df = calculate_indicators(sample_ohlcv_df.copy(), indicators)
    assert "MA10" in df.columns
    assert "BB_UPPER" in df.columns


def test_calculate_ma_from_conditions(sample_ohlcv_df):
    """conditions 中的 MA 欄位應被自動解析並計算"""
    indicators = [
        {
            "type": "sma",
            "parameters": {"period": 5},
            "conditions": [{"left": "MA50", "operator": ">", "right": "MA5"}],
        }
    ]
    df = calculate_indicators(sample_ohlcv_df.copy(), indicators)
    assert "MA50" in df.columns  # 從 conditions 解析出 MA50


def test_calculate_unknown_indicator_skipped(sample_ohlcv_df):
    """未知 type 的指標不應引發例外"""
    indicators = [{"type": "unknown_future_indicator", "parameters": {}, "conditions": []}]
    df = calculate_indicators(sample_ohlcv_df.copy(), indicators)
    assert df is not None  # 正常回傳，不崩潰


def test_calculate_empty_indicators_returns_unchanged(sample_ohlcv_df):
    df = calculate_indicators(sample_ohlcv_df.copy(), [])
    # 無指標計算，欄位數不變
    assert list(df.columns) == list(sample_ohlcv_df.columns)
