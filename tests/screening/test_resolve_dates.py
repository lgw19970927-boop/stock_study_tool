"""tests/screening/test_resolve_dates.py — resolve_analysis_dates() 單元測試"""
import pytest
from datetime import date, timedelta

from app.feature.screening.indicators.service import resolve_analysis_dates

pytestmark = pytest.mark.unit


def test_both_dates_provided():
    start, end = resolve_analysis_dates(None, "2025-01-01", "2025-06-30")
    assert start == "2025-01-01"
    assert end == "2025-06-30"


def test_only_end_date_provided():
    end = "2025-06-30"
    start, returned_end = resolve_analysis_dates(None, None, end)
    assert returned_end == end
    expected_start = (date(2025, 6, 30) - timedelta(days=365)).isoformat()
    assert start == expected_start


@pytest.mark.parametrize("time_range,expected_days", [
    ("1D",  1),
    ("1W",  7),
    ("1M",  30),
    ("3M",  90),
    ("6M",  180),
    ("1Y",  365),
])
def test_time_range_sets_correct_delta(time_range, expected_days):
    start, end = resolve_analysis_dates(time_range, None, None)
    end_date = date.fromisoformat(end)
    start_date = date.fromisoformat(start)
    delta = (end_date - start_date).days
    assert delta == expected_days


def test_none_time_range_defaults_to_30_days():
    start, end = resolve_analysis_dates(None, None, None)
    end_date = date.fromisoformat(end)
    start_date = date.fromisoformat(start)
    assert (end_date - start_date).days == 30


def test_end_date_is_today_when_no_custom_dates():
    _, end = resolve_analysis_dates("1M", None, None)
    assert end == date.today().isoformat()


def test_start_date_takes_priority_over_time_range():
    """有 start_date 和 end_date 時，time_range 不影響結果"""
    start, end = resolve_analysis_dates("1Y", "2025-01-01", "2025-03-01")
    assert start == "2025-01-01"
    assert end == "2025-03-01"
