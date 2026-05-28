"""tests/screening/test_consolidation.py — 盤整辨識函式單元測試"""
import pytest
import numpy as np

from app.feature.screening.pattern.service import (
    _evaluate_consolidation_chunk,
    _detect_consolidation,
    detect_consolidation_containing_date,
)

pytestmark = pytest.mark.unit


def _make_chunk(n: int, base: float = 100.0, amplitude: float = 0.02) -> list:
    """建立 n 筆盤整中的 OHLCV dict list"""
    rows = []
    for i in range(n):
        price = base * (1 + amplitude * (i % 2 - 0.5))
        rows.append({
            "time": f"2025-01-{i + 1:02d}",
            "open":  price,
            "high":  price * 1.01,
            "low":   price * 0.99,
            "close": price,
            "volume": 1000,
        })
    return rows


# ── _evaluate_consolidation_chunk() ──────────────────────────────

def test_evaluate_consolidation_chunk_tight_range_passes():
    chunk = _make_chunk(10, base=100.0, amplitude=0.01)
    is_cons, confidence = _evaluate_consolidation_chunk(chunk, threshold=0.08)
    assert is_cons is True
    assert confidence > 0


def test_evaluate_consolidation_chunk_wide_range_fails():
    # amplitude=0.2 表示振幅 20%，超過 threshold=0.08
    chunk = _make_chunk(10, base=100.0, amplitude=0.2)
    is_cons, _ = _evaluate_consolidation_chunk(chunk, threshold=0.08)
    assert is_cons is False


def test_evaluate_consolidation_chunk_too_few_bars():
    # 0 根 bar，確保不崩潰
    chunk = _make_chunk(0)
    with pytest.raises(Exception):
        _evaluate_consolidation_chunk(chunk, threshold=0.08)


# ── _detect_consolidation() ───────────────────────────────────────

def test_detect_consolidation_returns_list():
    prices = _make_chunk(30, base=100.0, amplitude=0.01)
    results = _detect_consolidation(prices, min_bars=5, max_bars=15, sensitivity=50)
    assert isinstance(results, list)


def test_detect_consolidation_insufficient_bars_returns_empty():
    prices = _make_chunk(3)
    results = _detect_consolidation(prices, min_bars=5, max_bars=15, sensitivity=50)
    assert results == []


def test_detect_consolidation_result_has_expected_keys():
    prices = _make_chunk(30, base=100.0, amplitude=0.01)
    results = _detect_consolidation(prices, min_bars=5, max_bars=15, sensitivity=50)
    if results:
        assert "start_date" in results[0]
        assert "end_date" in results[0]
        assert "confidence" in results[0]
        assert results[0]["name"] == "consolidation"


def test_detect_consolidation_max_results_three():
    prices = _make_chunk(60, base=100.0, amplitude=0.01)
    results = _detect_consolidation(prices, min_bars=5, max_bars=20, sensitivity=50)
    assert len(results) <= 3


# ── detect_consolidation_containing_date() ───────────────────────

def test_detect_containing_date_valid_target():
    prices = _make_chunk(30, base=100.0, amplitude=0.01)
    results = detect_consolidation_containing_date(
        prices, target_date="2025-01-15", min_bars=5, max_bars=20, sensitivity=50
    )
    assert isinstance(results, list)


def test_detect_containing_date_insufficient_bars():
    prices = _make_chunk(3)
    results = detect_consolidation_containing_date(
        prices, target_date="2025-01-02", min_bars=5, max_bars=20, sensitivity=50
    )
    assert results == []


def test_detect_containing_date_invalid_target_date_returns_empty():
    prices = _make_chunk(30, base=100.0, amplitude=0.01)
    results = detect_consolidation_containing_date(
        prices, target_date="invalid-date", min_bars=5, max_bars=20, sensitivity=50
    )
    assert results == []
