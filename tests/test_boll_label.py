import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from app.feature.screening.service import screen_single_stock


def _build_cursor_cm(rows):
    cm = MagicMock()
    cursor = MagicMock()
    cursor.fetchall.return_value = rows
    cm.__enter__.return_value = cursor
    return cm


def test_boll_insufficient_label_includes_period_abbr():
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

    with patch("app.feature.screening.service.get_market_cursor") as mock_cursor, patch(
        "app.feature.screening.service.evaluate_condition", return_value=pd.Series([True] * 10)
    ):
        mock_cursor.return_value = _build_cursor_cm(db_rows)
        result = screen_single_stock("2330", "TSMC", "listed", indicators, "1d")

    assert result is not None
    assert result["data_insufficient"] is True
    assert "BOLL(50,2.5) (D)資料不足" in result["insufficient_indicators"]
