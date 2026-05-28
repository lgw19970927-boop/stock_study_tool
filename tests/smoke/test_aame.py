"""tests/smoke/test_aame.py — DB-backed screening smoke test"""
import os
import pytest

from app.feature.screening.service import screen_single_stock


@pytest.mark.smoke
@pytest.mark.skipif(
    os.environ.get("RUN_SCREENING_DB_SMOKE") != "1",
    reason="Set RUN_SCREENING_DB_SMOKE=1 to run DB-backed screening smoke test.",
)
def test_aame_screening_smoke(db_init):
    indicators = [
        {
            "type": "sma",
            "timeframe": "1d",
            "parameters": {"period": 20},
            "conditions": [{"left": "MA20", "operator": ">", "right": "MA50"}],
        }
    ]

    result = screen_single_stock(
        symbol="AAME",
        name="Atlantic American Corporation",
        market="listed",
        indicators=indicators,
        timeframe="1d",
        start_date="2025-01-01",
        end_date="2025-02-25",
    )

    assert result is None or isinstance(result, dict)
