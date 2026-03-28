"""
indicators/modules/sma/sma.py
SMA（Simple Moving Average）計算邏輯 — 從 indicators/service.py 拆出
"""
import pandas as pd


def calculate_sma(df: pd.DataFrame, period: int = 20) -> pd.DataFrame:
    """計算簡單移動平均線，回傳加入 MA{period} 欄位的 DataFrame"""
    if df.empty:
        return df
    if "close" not in df.columns:
        raise ValueError("DataFrame must contain 'close' column")
    df[f"MA{period}"] = df["close"].rolling(window=period).mean()
    return df
