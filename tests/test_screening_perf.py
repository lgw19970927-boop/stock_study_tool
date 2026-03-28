import time
import os
import sys

# 手動將專案根目錄加入 path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__))))

from app.Feature.Screening.service import screen_stocks
from app.Lib.db import init_db
from app.config import Settings

if __name__ == "__main__":
    # 初始化 DB 連線設定
    config = Settings()
    init_db(config)
    
    print("開始效能測試...")
    t0 = time.time()
    
    # 執行篩選 (全部市場, 找 MA20 突破 MA60)
    indicators = [
        {
            "type": "sma", 
            "parameters": {"period": 20}, 
            "conditions": [{"left": "close", "operator": ">", "right": "MA60"}]
        }
    ]
    
    result = screen_stocks(markets=['listed', 'otc'], frequency='daily', indicators=indicators)
    
    t1 = time.time()
    print(f"篩選完成: 共找到 {result['total']} 檔股票")
    print(f"總耗時: {t1 - t0:.2f} 秒")
