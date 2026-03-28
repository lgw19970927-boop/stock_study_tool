import sys
import os
import pandas as pd
import numpy as np

# 加入專案路徑
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..")))
from app.Feature.Screening.indicators.service import calculate_bollinger_bands

def verify():
    # 建立模擬測試資料
    np.random.seed(42)
    prices = np.random.normal(100, 5, 100)
    df = pd.DataFrame({"close": prices})
    
    # 1. 使用專案內的計算函數 (有很大機率使用了預設的 ddof=1)
    project_df = df.copy()
    project_df = calculate_bollinger_bands(project_df, period=20, std_dev=2.0)
    
    # 2. 金融業界標準的 Bollinger Bands (TradingView, TA-Lib 等都是使用 ddof=0, 即母體標準差)
    standard_df = df.copy()
    standard_df["BB_MIDDLE"] = standard_df["close"].rolling(window=20).mean()
    # 注意這裡的 ddof=0
    std_0 = standard_df["close"].rolling(window=20).std(ddof=0)
    standard_df["BB_UPPER"] = standard_df["BB_MIDDLE"] + std_0 * 2.0
    standard_df["BB_LOWER"] = standard_df["BB_MIDDLE"] - std_0 * 2.0
    
    # 比對結果
    last_idx = -1
    print("=== 專案目前計算邏輯 (Pandas 預設樣本標準差 ddof=1) ===")
    print(f"UPPER:  {project_df['BB_UPPER'].iloc[-1]:.4f}")
    print(f"MIDDLE: {project_df['BB_MIDDLE'].iloc[-1]:.4f}")
    print(f"LOWER:  {project_df['BB_LOWER'].iloc[-1]:.4f}")
    
    print("\n=== 業界標準邏輯 (母體標準差 ddof=0，例如 TradingView) ===")
    print(f"UPPER:  {standard_df['BB_UPPER'].iloc[-1]:.4f}")
    print(f"MIDDLE: {standard_df['BB_MIDDLE'].iloc[-1]:.4f}")
    print(f"LOWER:  {standard_df['BB_LOWER'].iloc[-1]:.4f}")
    
    diff = project_df['BB_UPPER'].iloc[-1] - standard_df['BB_UPPER'].iloc[-1]
    print(f"\n差異 (UPPER): {diff:.4f}")
    
    if abs(diff) > 1e-5:
        print("\n[警告] 專案目前的計算邏輯與一般看盤軟體 (如 TradingView) 有微小差異。")
        print("原因: Pandas 的 .std() 預設使用母體樣本標準差 (ddof=1)，而一般布林通道公式使用母體標準差 (ddof=0)。")
        print("修正建議: 將 df['close'].rolling(window=period).std() 改為 df['close'].rolling(window=period).std(ddof=0)")
    else:
        print("\n[通過] 計算邏輯與標準一致。")

if __name__ == "__main__":
    verify()
