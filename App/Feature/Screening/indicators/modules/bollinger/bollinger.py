"""
indicators/modules/bollinger/bollinger.py
Bollinger Bands 計算邏輯 — 從 indicators/service.py 拆出
"""
import pandas as pd


def calculate_bollinger_bands(
    df: pd.DataFrame,
    period: int = 20,
    std_dev: float = 2.0,
) -> pd.DataFrame:
    """計算布林通道（BB_UPPER / BB_MIDDLE / BB_LOWER）"""
    if df.empty:
        return df
    if "close" not in df.columns:
        raise ValueError("DataFrame must contain 'close' column")
    df["BB_MIDDLE"] = df["close"].rolling(window=period).mean()
    rolling_std = df["close"].rolling(window=period).std(ddof=0)
    df["BB_UPPER"] = df["BB_MIDDLE"] + rolling_std * std_dev
    df["BB_LOWER"] = df["BB_MIDDLE"] - rolling_std * std_dev
    return df
