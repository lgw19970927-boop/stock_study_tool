"""tests/screening/test_evaluate_condition.py — evaluate_condition() 單元測試"""
import pytest
import pandas as pd

from app.feature.screening.indicators.service import evaluate_condition

pytestmark = pytest.mark.unit


@pytest.fixture
def df():
    return pd.DataFrame({
        "close": [10.0, 20.0, 30.0, 20.0, 10.0],
        "MA20":  [15.0, 15.0, 15.0, 15.0, 15.0],
    })


# ── 6 種運算子 × column right ─────────────────────────────────────

@pytest.mark.parametrize("operator,expected", [
    (">",  [False, True,  True,  True,  False]),
    ("<",  [True,  False, False, False, True]),
    (">=", [False, True,  True,  True,  False]),
    ("<=", [True,  False, False, False, True]),
    ("=",  [False, False, False, False, False]),
])
def test_operator_column_right(df, operator, expected):
    result = evaluate_condition(df, {"left": "close", "operator": operator, "right": "MA20"})
    assert list(result) == expected


# ── 6 種運算子 × 常數 right ───────────────────────────────────────

@pytest.mark.parametrize("operator,constant,expected", [
    (">",  "15", [False, True,  True,  True,  False]),
    ("<",  "15", [True,  False, False, False, True]),
    (">=", "20", [False, True,  True,  True,  False]),
    ("<=", "20", [True,  True,  False, True,  True]),
    ("=",  "20", [False, True,  False, True,  False]),
])
def test_operator_constant_right(df, operator, constant, expected):
    result = evaluate_condition(df, {"left": "close", "operator": operator, "right": constant})
    assert list(result) == expected


# ── 錯誤處理 ────────────────────────────────────────────────────────

def test_invalid_left_column_raises(df):
    with pytest.raises(ValueError, match="NONEXISTENT"):
        evaluate_condition(df, {"left": "NONEXISTENT", "operator": ">", "right": "close"})


def test_invalid_right_string_raises(df):
    with pytest.raises(ValueError, match="not_a_number"):
        evaluate_condition(df, {"left": "close", "operator": ">", "right": "not_a_number"})


def test_unsupported_operator_raises(df):
    with pytest.raises(ValueError, match="!="):
        evaluate_condition(df, {"left": "close", "operator": "!=", "right": "MA20"})
