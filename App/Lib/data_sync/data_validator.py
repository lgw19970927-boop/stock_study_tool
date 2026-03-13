"""
App/Lib/data_sync/data_validator.py
OHLCV 資料品質驗證（無 DB 依賴，直接沿用 reference 版本）
"""
import pandas as pd
import logging


def validate_market_data(df) -> tuple[bool, str]:
    """
    驗證 OHLCV 資料品質。

    Args:
        df: Pandas DataFrame，需包含欄位 ['Open', 'High', 'Low', 'Close', 'Volume']

    Returns:
        (is_valid: bool, error_message: str)
    """
    if df is None or df.empty:
        return False, "Empty dataframe"

    required_cols = ['Open', 'High', 'Low', 'Close']
    for col in required_cols:
        if col not in df.columns:
            return False, f"Missing column: {col}"

    try:
        if (df[required_cols] <= 0).any().any():
            invalid_rows = df[(df[required_cols] <= 0).any(axis=1)]
            return False, f"Found {len(invalid_rows)} rows with zero or negative prices"

        if (df['High'] < df['Low']).any():
            invalid_rows = df[df['High'] < df['Low']]
            return False, f"Found {len(invalid_rows)} rows where High < Low"

        if (df['High'] < df['Open']).any() or (df['High'] < df['Close']).any():
            invalid_rows = df[(df['High'] < df['Open']) | (df['High'] < df['Close'])]
            return False, f"Found {len(invalid_rows)} rows where High is not the maximum"

        if (df['Low'] > df['Open']).any() or (df['Low'] > df['Close']).any():
            invalid_rows = df[(df['Low'] > df['Open']) | (df['Low'] > df['Close'])]
            return False, f"Found {len(invalid_rows)} rows where Low is not the minimum"

    except Exception as e:
        return False, f"Validation exception: {str(e)}"

    return True, "OK"
