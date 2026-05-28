"""tests/screening/test_format_helpers.py — format_helpers.py 單元測試"""
import pytest

from app.feature.screening.indicators.shared.format_helpers import (
    to_period_abbr,
    build_tag,
    build_insufficient_tag,
    build_summary_text,
)

pytestmark = pytest.mark.unit


@pytest.mark.parametrize("value,expected", [
    ("1d",  "D"),
    ("1w",  "W"),
    ("1M",  "M"),
    ("1h",  "H"),
    (None,  "D"),
    ("日K", "D"),
    ("周K", "W"),
    ("月K", "M"),
    ("60分K", "H"),
])
def test_to_period_abbr(value, expected):
    assert to_period_abbr(value) == expected


@pytest.mark.parametrize("indicator,abbr,condition,n,expected_contains", [
    ("SMA", "D", "close>MA20", 1, "1D:"),
    ("BOLL", "W", "close>BB_UPPER", 2, "2W:"),
    ("SMA", "D", "SMA close>MA20", 1, "1D:"),  # indicator 已在 condition 中，不重複
])
def test_build_tag(indicator, abbr, condition, n, expected_contains):
    result = build_tag(indicator, abbr, condition, n)
    assert expected_contains in result


def test_build_insufficient_tag():
    result = build_insufficient_tag("BOLL(20,2.0)", "D")
    assert "BOLL(20,2.0)" in result
    assert "(D)" in result
    assert "資料不足" in result


@pytest.mark.parametrize("n,expected_prefix", [
    (1, ""),
    (2, "連續2次"),
    (3, "連續3次"),
])
def test_build_summary_text_consecutive(n, expected_prefix):
    result = build_summary_text("SMA", "日K", "close>MA20", n)
    assert expected_prefix in result
    assert "SMA" in result
    assert "close>MA20" in result
