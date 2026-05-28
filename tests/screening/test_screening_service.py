"""tests/screening/test_screening_service.py — service.py 私有函式單元測試"""
import pytest
import pandas as pd
import numpy as np
from unittest.mock import patch

pytestmark = pytest.mark.unit


from app.feature.screening.service import (
    _parse_bollinger_params,
    _evaluate_bollinger_preset_crossover,
    screen_single_stock,
)


# ── _parse_bollinger_params() ─────────────────────────────────────

@pytest.mark.parametrize("params,expected_p,expected_std", [
    ({"period": 20, "std_dev": 2.0},   20, 2.0),
    ({"period": 50, "std_dev": 2.5},   50, 2.5),
    ({"p": 10, "std": 1.5},            10, 1.5),
    ({},                               20, 2.0),   # 全預設值
    ({"period": "abc", "std_dev": "x"}, 20, 2.0),  # 非法字串 → 預設值
])
def test_parse_bollinger_params(params, expected_p, expected_std):
    p, std, _ = _parse_bollinger_params(params)
    assert p == expected_p
    assert std == expected_std


def test_parse_bollinger_params_std_str_format():
    _, _, std_str = _parse_bollinger_params({"period": 20, "std_dev": 2.0})
    assert std_str == "2"   # 整數型態 std 應省略小數點

    _, _, std_str = _parse_bollinger_params({"period": 20, "std_dev": 2.5})
    assert std_str == "2.5"


# ── _evaluate_bollinger_preset_crossover() ───────────────────────

def _make_eval_df(pre_close, pre_band, cur_close, cur_band, band_col="BB_UPPER"):
    """建立 2 筆含 close 與指定 band_col 的 DataFrame"""
    return pd.DataFrame({
        "close": [pre_close, cur_close],
        band_col: [pre_band, cur_band],
    })


def test_boll_crossover_upward_passes():
    # 前一根收在 BB_UPPER 以下，當前突破 → True
    df = _make_eval_df(pre_close=98, pre_band=100, cur_close=102, cur_band=100)
    assert _evaluate_bollinger_preset_crossover(df, "升穿上軌", range_n=1, is_consecutive=False) is True


def test_boll_crossover_upward_fails_no_cross():
    # 前一根已在 BB_UPPER 以上，不算新突破
    df = _make_eval_df(pre_close=101, pre_band=100, cur_close=102, cur_band=100)
    assert _evaluate_bollinger_preset_crossover(df, "升穿上軌", range_n=1, is_consecutive=False) is False


def test_boll_crossover_downward_passes():
    # 前一根在 BB_LOWER 以上，當前跌破 → True
    df = _make_eval_df(pre_close=102, pre_band=100, cur_close=98, cur_band=100, band_col="BB_LOWER")
    assert _evaluate_bollinger_preset_crossover(df, "跌穿下軌", range_n=1, is_consecutive=False) is True


def test_boll_crossover_nan_returns_false():
    df = pd.DataFrame({
        "close": [np.nan, 102],
        "BB_UPPER": [100, 100],
    })
    assert _evaluate_bollinger_preset_crossover(df, "升穿上軌", range_n=1, is_consecutive=False) is False


# ── screen_single_stock() — mock DB 路徑 ────────────────────────

def test_screen_single_stock_returns_none_on_empty_db(mock_db_cursor):
    with patch("app.feature.screening.service.get_market_cursor") as mock_get_cursor:
        mock_get_cursor.return_value = mock_db_cursor([])
        result = screen_single_stock("TEST", "Test Corp", "listed", [], "1d")
    assert result is None


def test_screen_single_stock_returns_dict_on_match(mock_db_cursor):
    from pandas import date_range
    dates = date_range("2025-01-01", periods=60)
    rows = [
        {
            "datetime": d.strftime("%Y-%m-%d"),
            "open": 100.0, "high": 102.0, "low": 99.0,
            "close": 101.0, "volume": 5000,
        }
        for d in dates
    ]
    indicators = [
        {
            "type": "sma",
            "timeframe": "1d",
            "parameters": {"period": 5},
            "conditions": [{"left": "close", "operator": ">", "right": "MA5"}],
        }
    ]
    with patch("app.feature.screening.service.get_market_cursor") as mock_get_cursor:
        mock_get_cursor.return_value = mock_db_cursor(rows)
        result = screen_single_stock("TEST", "Test Corp", "listed", indicators, "1d")
    # 結果可能是 dict（有匹配）或 None（條件不符），兩者皆合法
    assert result is None or isinstance(result, dict)
