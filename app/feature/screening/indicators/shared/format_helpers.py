"""Shared formatting helpers for indicator summary/tag labels."""

from __future__ import annotations

from typing import Iterable

PERIOD_ABBR = {
    "日K": "D",
    "周K": "W",
    "月K": "M",
    "60分K": "H",
    "1d": "D",
    "1w": "W",
    "1M": "M",
    "1h": "H",
}

DB_TIMEFRAME_TO_TEXT = {
    "1d": "日K",
    "1w": "周K",
    "1M": "月K",
    "1h": "60分K",
}


def to_period_text(period_value: str | None) -> str:
    if not period_value:
        return "日K"
    return DB_TIMEFRAME_TO_TEXT.get(period_value, period_value)


def to_period_abbr(period_value: str | None) -> str:
    period_text = to_period_text(period_value)
    return PERIOD_ABBR.get(period_text, PERIOD_ABBR.get(period_value or "", "D"))


def build_summary_text(indicator: str, period_text: str, condition: str, n: int = 1) -> str:
    prefix = f"連續{n}次" if n > 1 else ""
    return f"{indicator}-{prefix}{period_text}: {condition}"


def build_summary_lines(indicator: str, period_text: str, conditions: Iterable[str], n: int = 1) -> list[str]:
    return [build_summary_text(indicator, period_text, condition, n) for condition in conditions if condition]


def build_tag(indicator: str, period_abbr: str, condition: str, n: int = 1) -> str:
    cond = str(condition or "").strip()
    has_indicator = indicator in cond or cond.startswith("價格")
    indicator_prefix = "" if has_indicator else f"{indicator} "
    return f"{n}{period_abbr}: {indicator_prefix}{cond}"


def build_insufficient_tag(missing_line: str, period_abbr: str) -> str:
    return f"{missing_line} ({period_abbr})資料不足"
