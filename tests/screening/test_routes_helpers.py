"""tests/screening/test_routes_helpers.py — routes.py 輔助函式單元測試"""
import pytest
import decimal
from datetime import datetime

pytestmark = pytest.mark.unit


# 直接從 routes 模組匯入私有輔助函式
from app.feature.screening.routes import (
    _to_iso_datetime_str,
    _parse_strategy_configuration,
    _sse_default,
)


# ── _to_iso_datetime_str() ────────────────────────────────────────

def test_to_iso_datetime_str_none():
    assert _to_iso_datetime_str(None) is None


def test_to_iso_datetime_str_datetime_object():
    dt = datetime(2025, 6, 15, 10, 30, 0)
    assert _to_iso_datetime_str(dt) == "2025-06-15 10:30:00"


def test_to_iso_datetime_str_string_passthrough():
    assert _to_iso_datetime_str("2025-06-15 10:30:00") == "2025-06-15 10:30:00"


def test_to_iso_datetime_str_date_object():
    from datetime import date
    d = date(2025, 6, 15)
    result = _to_iso_datetime_str(d)
    assert "2025-06-15" in result


# ── _parse_strategy_configuration() ──────────────────────────────

def test_parse_strategy_configuration_dict_passthrough():
    data = {"key": "value", "nested": [1, 2]}
    assert _parse_strategy_configuration(data) == data


def test_parse_strategy_configuration_valid_json_string():
    result = _parse_strategy_configuration('{"key": "value"}')
    assert result == {"key": "value"}


def test_parse_strategy_configuration_none_returns_empty_dict():
    assert _parse_strategy_configuration(None) == {}


def test_parse_strategy_configuration_empty_string_returns_empty_dict():
    assert _parse_strategy_configuration("") == {}


def test_parse_strategy_configuration_invalid_json_returns_empty_dict():
    result = _parse_strategy_configuration("{invalid json}")
    assert result == {}


# ── _sse_default() ────────────────────────────────────────────────

def test_sse_default_decimal_to_float():
    result = _sse_default(decimal.Decimal("3.14"))
    assert result == pytest.approx(3.14)
    assert isinstance(result, float)


def test_sse_default_non_serializable_raises():
    with pytest.raises(TypeError):
        _sse_default(object())
