"""tests/screening/test_interval_convert.py — interval 格式轉換函式單元測試"""
import pytest

from app.feature.screening.indicators.service import (
    interval_to_db_format,
    needs_resample,
    INTERVAL_TO_DB,
    RESAMPLE_RULES,
)

pytestmark = pytest.mark.unit


@pytest.mark.parametrize("interval,expected_db", [
    ("1D",   "1d"),
    ("1W",   "1d"),
    ("1M",   "1d"),
    ("1H",   "1h"),
    ("4H",   "1h"),
    ("1min", "1m"),
    ("3min", "1m"),
    ("5min", "5m"),
    ("15min","5m"),
    ("30min","5m"),
])
def test_interval_to_db_format_known(interval, expected_db):
    assert interval_to_db_format(interval) == expected_db


def test_interval_to_db_format_unknown_falls_back_to_1d():
    assert interval_to_db_format("unknown_interval") == "1d"


@pytest.mark.parametrize("interval,expected", [
    ("1W",   True),
    ("1M",   True),
    ("4H",   True),
    ("3min", True),
    ("15min",True),
    ("30min",True),
    ("1D",   False),
    ("1H",   False),
    ("1d",   False),
])
def test_needs_resample(interval, expected):
    assert needs_resample(interval) is expected


def test_all_resample_intervals_have_rules():
    """RESAMPLE_RULES 中每個 interval 都應有對應的 pandas resample rule"""
    for interval, rule in RESAMPLE_RULES.items():
        assert isinstance(rule, str) and len(rule) > 0
