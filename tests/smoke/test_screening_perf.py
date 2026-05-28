"""tests/smoke/test_screening_perf.py — Screening 效能 smoke test"""
import os
import time
import pytest

from app.feature.screening.service import screen_single_stock
from app.lib.db import get_market_cursor


def _pick_active_stock():
    with get_market_cursor() as cursor:
        cursor.execute(
            "SELECT symbol, name, market FROM stock_meta WHERE status = 'Active' ORDER BY symbol LIMIT 1"
        )
        return cursor.fetchone()


@pytest.mark.smoke
@pytest.mark.slow
@pytest.mark.skipif(
    os.environ.get("RUN_SCREENING_PERF_TEST") != "1",
    reason="Set RUN_SCREENING_PERF_TEST=1 to run screening performance smoke test.",
)
def test_screening_single_stock_perf_smoke(db_init):
    """Optional DB-backed smoke test for screening latency on a single active symbol."""
    try:
        stock = _pick_active_stock()
    except Exception as exc:
        pytest.skip(f"DB unavailable for perf smoke test: {exc}")

    if not stock:
        pytest.skip("No active stock found in stock_meta.")

    indicators = [
        {
            "type": "sma",
            "timeframe": "1d",
            "parameters": {"period": 20},
            "conditions": [{"left": "close", "operator": ">", "right": "MA20"}],
        }
    ]

    start = time.perf_counter()
    result = screen_single_stock(
        symbol=stock["symbol"],
        name=stock["name"],
        market=stock["market"],
        indicators=indicators,
        timeframe="1d",
    )
    elapsed = time.perf_counter() - start

    max_seconds = float(os.environ.get("SCREENING_PERF_MAX_SECONDS", "15"))
    assert elapsed <= max_seconds, f"Single-stock screening took {elapsed:.2f}s (> {max_seconds:.2f}s)"
    assert result is None or isinstance(result, dict)
