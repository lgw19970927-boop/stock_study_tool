"""tests/screening/test_bollinger.py — calculate_bollinger_bands() 單元測試"""
import pytest
import pandas as pd

from app.feature.screening.indicators.modules.bollinger.bollinger import calculate_bollinger_bands

pytestmark = pytest.mark.unit


def test_bollinger_adds_three_columns(sample_ohlcv_df):
    df = calculate_bollinger_bands(sample_ohlcv_df.copy(), period=20, std_dev=2.0)
    assert "BB_UPPER" in df.columns
    assert "BB_MIDDLE" in df.columns
    assert "BB_LOWER" in df.columns


def test_bollinger_middle_equals_sma(sample_ohlcv_df):
    period = 20
    df = calculate_bollinger_bands(sample_ohlcv_df.copy(), period=period, std_dev=2.0)
    expected_middle = sample_ohlcv_df["close"].rolling(window=period).mean()
    pd.testing.assert_series_equal(df["BB_MIDDLE"], expected_middle, check_names=False)


def test_bollinger_uses_ddof_zero(sample_ohlcv_df):
    """ddof=0（母體標準差）驗算"""
    period = 20
    std_dev = 2.5
    df = calculate_bollinger_bands(sample_ohlcv_df.copy(), period=period, std_dev=std_dev)
    rolling_std = sample_ohlcv_df["close"].rolling(window=period).std(ddof=0)
    middle = sample_ohlcv_df["close"].rolling(window=period).mean()
    expected_upper = middle + rolling_std * std_dev
    expected_lower = middle - rolling_std * std_dev
    pd.testing.assert_series_equal(df["BB_UPPER"], expected_upper, check_names=False)
    pd.testing.assert_series_equal(df["BB_LOWER"], expected_lower, check_names=False)


def test_bollinger_upper_above_lower(sample_ohlcv_df):
    df = calculate_bollinger_bands(sample_ohlcv_df.copy(), period=20, std_dev=2.0)
    valid = df.dropna(subset=["BB_UPPER", "BB_LOWER"])
    assert (valid["BB_UPPER"] >= valid["BB_LOWER"]).all()


def test_bollinger_empty_dataframe():
    empty_df = pd.DataFrame()
    result = calculate_bollinger_bands(empty_df, period=20, std_dev=2.0)
    assert result.empty


def test_bollinger_missing_close_column():
    df = pd.DataFrame({"open": [1, 2, 3], "high": [2, 3, 4]})
    with pytest.raises(ValueError, match="close"):
        calculate_bollinger_bands(df, period=2, std_dev=2.0)


@pytest.mark.parametrize("period,std_dev", [
    (10, 1.5),
    (20, 2.0),
    (20, 2.5),
    (50, 2.0),
])
def test_bollinger_different_params(sample_ohlcv_df, period, std_dev):
    df = calculate_bollinger_bands(sample_ohlcv_df.copy(), period=period, std_dev=std_dev)
    assert "BB_UPPER" in df.columns
    assert "BB_MIDDLE" in df.columns
    assert "BB_LOWER" in df.columns
    assert df["BB_UPPER"].iloc[period - 1:].notna().all()
