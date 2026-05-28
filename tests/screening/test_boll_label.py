"""tests/screening/test_boll_label.py — 布林通道資料不足標籤測試"""
import pytest
import pandas as pd
from unittest.mock import patch

pytestmark = pytest.mark.unit


def test_boll_insufficient_label_includes_period_abbr(mock_db_cursor):
    from app.feature.screening.service import screen_single_stock

    dates = pd.date_range("2026-01-01", periods=10)
    db_rows = [
        {
            "datetime": d.strftime("%Y-%m-%d"),
            "open": 100,
            "high": 100,
            "low": 100,
            "close": 100,
            "volume": 1000,
        }
        for d in dates
    ]

    indicators = [
        {
            "type": "bollinger",
            "timeframe": "1d",
            "parameters": {"period": 50, "std_dev": 2.5},
            "conditions": [
                {
                    "left": "BB_UPPER",
                    "operator": ">",
                    "right": "close",
                    "display": "BOLL UPPER50_2.5>收盤價",
                }
            ],
        }
    ]

    with patch("app.feature.screening.service.get_market_cursor") as mock_get_cursor, patch(
        "app.feature.screening.service.evaluate_condition", return_value=pd.Series([True] * 10)
    ):
        mock_get_cursor.return_value = mock_db_cursor(db_rows)
        result = screen_single_stock("2330", "TSMC", "listed", indicators, "1d")

    assert result is not None
    assert result["data_insufficient"] is True
    assert "BOLL(50,2.5) (D)資料不足" in result["insufficient_indicators"]
