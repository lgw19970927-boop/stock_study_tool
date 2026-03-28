import sys
import os
import pandas as pd

# Add App to Python Path so we can mimic imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.Feature.Screening.indicators.service import calculate_indicators
from app.Feature.Screening.service import screen_single_stock

import json
from unittest.mock import patch, MagicMock

# Mock out DB calls
with patch("App.Feature.Screening.service.get_market_cursor") as mock_cursor:
    # Setup mock data context
    def mock_get_market_cursor():
        cm = MagicMock()
        cursor = MagicMock()
        
        # Fake OHLCV Data 
        dates = pd.date_range("2026-01-01", periods=10) # Less than 50
        db_rows = [{"datetime": d.strftime("%Y-%m-%d"), "open":100, "high":100, "low":100, "close": 100, "volume": 1000} for d in dates]
        cursor.fetchall.return_value = db_rows
        
        cm.__enter__.return_value = cursor
        return cm
        
    mock_cursor.side_effect = mock_get_market_cursor
    
    # Test: Insufficient Data with custom period 50 and std_dev 2.5
    ind2 = [{
        "type": "bollinger",
        "parameters": {"period": 50, "std_dev": 2.5},
        "conditions": [{"left": "BB_UPPER", "operator": ">", "right": "close", "display": "BOLL UPPER50_2.5>收盤價"}]
    }]
    
    with patch("App.Feature.Screening.service.evaluate_condition", return_value=pd.Series([True]*10)):
        res3 = screen_single_stock("2330", "TSMC", "listed", ind2, "1d")
        print("Test (Insufficient Data) Label:", res3["insufficient_indicators"])
