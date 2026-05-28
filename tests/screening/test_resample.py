"""tests/screening/test_resample.py — resample_prices() / resample_data() 單元測試"""
import pytest
import pandas as pd
import numpy as np

pytestmark = pytest.mark.unit


@pytest.fixture
def daily_df():
    """250 筆日線 DataFrame（含 datetime 欄位）"""
    dates = pd.date_range("2024-01-02", periods=250, freq="B")  # 工作日
    np.random.seed(0)
    close = 100 + np.cumsum(np.random.randn(250))
    df = pd.DataFrame({
        "datetime": dates.strftime("%Y-%m-%d"),
        "open":   close - 0.5,
        "high":   close + 1.0,
        "low":    close - 1.0,
        "close":  close,
        "volume": np.random.randint(1000, 10000, 250),
    })
    return df


# ── resample_prices（indicators/service.py）──────────────────────

def test_resample_prices_daily_to_weekly(daily_df):
    from app.feature.screening.indicators.service import resample_prices
    result = resample_prices(daily_df.copy(), "1W")
    assert not result.empty
    assert len(result) < len(daily_df)
    assert "close" in result.columns


def test_resample_prices_daily_to_monthly(daily_df):
    from app.feature.screening.indicators.service import resample_prices
    result = resample_prices(daily_df.copy(), "1M")
    assert not result.empty
    assert len(result) < len(daily_df)


def test_resample_prices_no_resample_needed(daily_df):
    from app.feature.screening.indicators.service import resample_prices
    original_len = len(daily_df)
    result = resample_prices(daily_df.copy(), "1D")  # 1D 不在 RESAMPLE_RULES 中
    assert len(result) == original_len


def test_resample_prices_empty_df():
    from app.feature.screening.indicators.service import resample_prices
    result = resample_prices(pd.DataFrame(), "1W")
    assert result.empty


# ── resample_data（screening/service.py）─────────────────────────

def test_resample_data_daily_to_weekly(daily_df):
    from app.feature.screening.service import resample_data
    result = resample_data(daily_df.copy(), "1w")
    assert not result.empty
    assert len(result) < len(daily_df)
    assert "close" in result.columns


def test_resample_data_daily_to_monthly(daily_df):
    from app.feature.screening.service import resample_data
    result = resample_data(daily_df.copy(), "1M")
    assert not result.empty


def test_resample_data_unknown_timeframe_returns_unchanged(daily_df):
    from app.feature.screening.service import resample_data
    result = resample_data(daily_df.copy(), "1d")  # 不在 rule_map，原樣回傳
    assert not result.empty


def test_resample_data_empty_df():
    from app.feature.screening.service import resample_data
    result = resample_data(pd.DataFrame(), "1w")
    assert result.empty
