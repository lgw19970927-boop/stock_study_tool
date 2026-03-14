import sys
import os
import pandas as pd

# 加入專案路徑
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from App.Feature.Screening.indicators.service import calculate_bollinger_bands
from App.Feature.data_sync.db import get_market_cursor, init_db
from App.config import get_config

def verify_real_data():
    print("初始化資料庫連線...")
    config = get_config()
    init_db(config)
    print("正在從資料庫隨機撈取 10 檔股票...")
    
    # 1. 取得 10 檔股票代碼
    with get_market_cursor() as cursor:
        cursor.execute("SELECT symbol, name FROM stock_meta WHERE status = 'Active' LIMIT 10")
        stocks = cursor.fetchall()
        
    results = []
    
    for stock in stocks:
        symbol = stock["symbol"]
        name = stock["name"]
        
        # 2. 獲取該股票最近 100 天的 K 線資料
        with get_market_cursor() as cursor:
            cursor.execute(
                """
                SELECT datetime, close 
                FROM market_data_ohlcv 
                WHERE symbol = %s AND timeframe = '1d' 
                ORDER BY datetime DESC LIMIT 100
                """, 
                (symbol,)
            )
            rows = cursor.fetchall()
            
        if len(rows) < 20: # 至少需要 20 天才能算 BOLL
            continue
            
        # 注意：我們抓出來是 DESC (從最新到最舊)，所以要反轉回來變成時間正序
        df = pd.DataFrame(rows).iloc[::-1].reset_index(drop=True)
        
        # 3. 使用專案系統的計算邏輯 (剛剛已經修正為 ddof=0 的版本)
        sys_df = df.copy()
        sys_df = calculate_bollinger_bands(sys_df, period=20, std_dev=2.0)
        
        last_record_sys = sys_df.iloc[-1]
        dt_str = str(last_record_sys["datetime"]).split(" ")[0]
        
        # 4. 使用獨立的參考算法 (嚴格對齊 TradingView 邏輯)
        # TradingView Bollinger Bands 公式:
        # Middle = 20-period SMA
        # Upper = Middle + 2 * 20-period Population Standard Deviation
        # Lower = Middle - 2 * 20-period Population Standard Deviation
        ref_df = df.copy()
        ref_middle = ref_df["close"].rolling(window=20).mean()
        ref_std = ref_df["close"].rolling(window=20).std(ddof=0)
        ref_upper = ref_middle + ref_std * 2.0
        ref_lower = ref_middle - ref_std * 2.0
        
        last_close = df.iloc[-1]["close"]
        
        results.append({
            "代號": symbol,
            "名稱": name,
            "日期": dt_str,
            "收盤價": f"{last_close:.2f}",
            "系統_UPPER": f"{last_record_sys['BB_UPPER']:.4f}",
            "獨立_UPPER": f"{ref_upper.iloc[-1]:.4f}",
            "系統_MIDDLE": f"{last_record_sys['BB_MIDDLE']:.4f}",
            "獨立_MIDDLE": f"{ref_middle.iloc[-1]:.4f}",
            "系統_LOWER": f"{last_record_sys['BB_LOWER']:.4f}",
            "獨立_LOWER": f"{ref_lower.iloc[-1]:.4f}"
        })
        
    res_df = pd.DataFrame(results)
    output_str = res_df.to_string(index=False)
    
    out_path = os.path.join(os.path.dirname(__file__), "bb_result.txt")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("[測試] === Bollinger Bands (20, 2) 真實資料跨邏輯比對測試 ===\n")
        f.write("本測試將由系統核心函數計算的結果，與腳本內獨立撰寫的母體標準差公式 (TradingView 標準) 進行精確度比對\n\n")
        f.write(output_str)
        f.write("\n\n[提示]：您可以現在開啟 TradingView，選擇上方任一股票，設定日K線及 BOLL(20, 2)。\n")
        f.write("      將游標移至表格對應的「日期」，觀察 TradingView 上的數值是否與「系統_」欄位完全一致！\n")
        
    print(f"✅ 輸出已成功寫入至 {out_path}")
    print("    將游標移至表格對應的「日期」，觀察 TradingView 上的數值是否與「系統_」欄位完全一致！")

if __name__ == "__main__":
    verify_real_data()
