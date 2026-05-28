"""tests/screening/test_sma.py — calculate_sma() 單元測試"""
import pytest
import pandas as pd
import numpy as np

from app.feature.screening.indicators.modules.sma.sma import calculate_sma

pytestmark = pytest.mark.unit


def test_sma_adds_ma_column(sample_ohlcv_df):
    df = calculate_sma(sample_ohlcv_df.copy(), period=20)
    assert "MA20" in df.columns


def test_sma_correct_value(sample_ohlcv_df):
    df = calculate_sma(sample_ohlcv_df.copy(), period=5)
    expected = sample_ohlcv_df["close"].rolling(window=5).mean()
    pd.testing.assert_series_equal(df["MA5"], expected, check_names=False)


def test_sma_empty_dataframe():
    empty_df = pd.DataFrame()
    result = calculate_sma(empty_df, period=20)
    assert result.empty


def test_sma_missing_close_column():
    df = pd.DataFrame({"open": [1, 2, 3], "high": [2, 3, 4]})
    with pytest.raises(ValueError, match="close"):
        calculate_sma(df, period=2)


@pytest.mark.parametrize("period", [5, 10, 20, 50])
def test_sma_different_periods(sample_ohlcv_df, period):
    df = calculate_sma(sample_ohlcv_df.copy(), period=period)
    col = f"MA{period}"
    assert col in df.columns
    # 前 period-1 筆應為 NaN
    assert df[col].iloc[:period - 1].isna().all()
    # 第 period 筆開始應有值
    assert df[col].iloc[period - 1:].notna().all()


def test_sma_default_period(sample_ohlcv_df):
    df = calculate_sma(sample_ohlcv_df.copy())
    assert "MA20" in df.columns
