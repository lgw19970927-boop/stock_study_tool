"""tests/core/test_data_validator.py — validate_market_data() 單元測試"""
import pytest
import pandas as pd
import numpy as np

from app.feature.data_management.sync.data_validator import validate_market_data

pytestmark = pytest.mark.unit


@pytest.fixture
def valid_df():
    """回傳一個完全合法的 OHLCV DataFrame"""
    return pd.DataFrame({
        "Open":   [10.0, 11.0, 12.0],
        "High":   [12.0, 13.0, 14.0],
        "Low":    [9.0,  10.0, 11.0],
        "Close":  [11.0, 12.0, 13.0],
        "Volume": [1000, 2000, 3000],
    })


def test_valid_data_passes(valid_df):
    ok, msg = validate_market_data(valid_df)
    assert ok is True
    assert msg == "OK"


def test_none_input_fails():
    ok, msg = validate_market_data(None)
    assert ok is False


def test_empty_dataframe_fails():
    ok, msg = validate_market_data(pd.DataFrame())
    assert ok is False
    assert "Empty" in msg


@pytest.mark.parametrize("missing_col", ["Open", "High", "Low", "Close"])
def test_missing_required_column_fails(valid_df, missing_col):
    df = valid_df.drop(columns=[missing_col])
    ok, msg = validate_market_data(df)
    assert ok is False
    assert missing_col in msg


@pytest.mark.parametrize("col", ["Open", "High", "Low", "Close"])
def test_zero_price_fails(valid_df, col):
    df = valid_df.copy()
    df.loc[0, col] = 0
    ok, msg = validate_market_data(df)
    assert ok is False


@pytest.mark.parametrize("col", ["Open", "High", "Low", "Close"])
def test_negative_price_fails(valid_df, col):
    df = valid_df.copy()
    df.loc[0, col] = -1.0
    ok, msg = validate_market_data(df)
    assert ok is False


def test_high_less_than_low_fails(valid_df):
    df = valid_df.copy()
    df.loc[0, "High"] = 8.0  # 低於 Low=9.0
    df.loc[0, "Low"] = 9.0
    ok, msg = validate_market_data(df)
    assert ok is False
    assert "High" in msg


def test_negative_volume_rows_filtered(valid_df):
    df = valid_df.copy()
    df.loc[0, "Volume"] = -1
    ok, msg = validate_market_data(df)
    # 過濾掉 1 列後剩 2 列，仍應通過
    assert ok is True


def test_all_negative_volume_fails():
    df = pd.DataFrame({
        "Open":   [10.0],
        "High":   [12.0],
        "Low":    [9.0],
        "Close":  [11.0],
        "Volume": [-100],
    })
    ok, msg = validate_market_data(df)
    assert ok is False
