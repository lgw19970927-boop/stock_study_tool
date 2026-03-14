import os
import sys
import pandas as pd

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__))))

from App.Feature.Screening.service import screen_single_stock
from App.Feature.data_sync.db import init_db
from App.config import Settings

if __name__ == "__main__":
    init_db(Settings())
    
    indicators = [
        {
            "type": "sma", 
            "parameters": {"period": 20}, 
            "conditions": [{"left": "MA20", "operator": ">", "right": "MA50"}]
        }
    ]
    
    result = screen_single_stock(
        symbol="AAME", 
        name="Atlantic American Corporation", 
        market="listed", 
        indicators=indicators, 
        timeframe="1d",
        start_date="2025-01-01",
        end_date="2025-02-25"
    )
    
    print("Screening Result:", result)
