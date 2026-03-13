"""
App/Feature/Screening/indicators/service.py
指標計算服務（原 backend/services/indicator_service.py）+
日期解析工具（原 backend/pattern_recognition/pattern_service.py 中與 DB 無關的純函式）

此模組只包含純函式（pandas/numpy），不直接操作 DB。
"""
import pandas as pd
import numpy as np
from typing import Dict, Any, List, Optional, Tuple
from datetime import date, timedelta
import logging

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════
# SMA（Simple Moving Average）
# ══════════════════════════════════════════════

def calculate_sma(df: pd.DataFrame, period: int = 20) -> pd.DataFrame:
    """計算簡單移動平均線，回傳加入 MA{period} 欄位的 DataFrame"""
    if df.empty:
        return df
    if "close" not in df.columns:
        raise ValueError("DataFrame must contain 'close' column")
    df[f"MA{period}"] = df["close"].rolling(window=period).mean()
    return df


# ══════════════════════════════════════════════
# Bollinger Bands
# ══════════════════════════════════════════════

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


# ══════════════════════════════════════════════
# 條件評估
# ══════════════════════════════════════════════

def evaluate_condition(df: pd.DataFrame, condition: Dict[str, Any]) -> pd.Series:
    """評估單一條件，回傳布林 Series"""
    left     = condition["left"]
    operator = condition["operator"]
    right    = condition["right"]

    if left not in df.columns:
        raise ValueError(f"Column '{left}' not found in DataFrame")
    left_val = df[left]

    if isinstance(right, str) and right in df.columns:
        right_val = df[right]
    else:
        try:
            right_val = float(right)
        except (ValueError, TypeError):
            raise ValueError(f"Invalid right operand: {right}")

    ops = {">": left_val.__gt__, "<": left_val.__lt__,
           ">=": left_val.__ge__, "<=": left_val.__le__, "=": left_val.__eq__}
    if operator not in ops:
        raise ValueError(f"Unsupported operator: {operator}")
    return ops[operator](right_val)


# ══════════════════════════════════════════════
# 批次指標計算
# ══════════════════════════════════════════════

def calculate_indicators(df: pd.DataFrame, indicators: list) -> pd.DataFrame:
    """批次計算多個指標，回傳加入所有指標欄位的 DataFrame"""
    needed_ma_periods: set = set()

    for indicator in indicators:
        ind_type = indicator.get("type", "").lower()
        params   = indicator.get("parameters", {})

        if ind_type == "sma":
            needed_ma_periods.add(params.get("period", 20))

        elif ind_type == "bollinger":
            p = params.get("period", params.get("p", 20))
            std = params.get("std_dev", params.get("std", 2.0))
            try:
                p = int(p)
                std = float(std)
            except (ValueError, TypeError):
                p = 20
                std = 2.0
            try:
                df = calculate_bollinger_bands(
                    df, p, std
                )
            except Exception as e:
                logger.warning(f"Failed to calculate bollinger: {e}")

        # 從條件中解析額外 MA 依賴
        for cond in indicator.get("conditions", []):
            for key in ("left", "right"):
                val = cond.get(key)
                if isinstance(val, str) and val.startswith("MA"):
                    try:
                        needed_ma_periods.add(int(val[2:]))
                    except ValueError:
                        pass

    for period in needed_ma_periods:
        try:
            df = calculate_sma(df, period)
        except Exception as e:
            logger.warning(f"Failed to calculate MA{period}: {e}")

    return df


# ══════════════════════════════════════════════
# 日期解析（原 pattern_service.resolve_analysis_dates）
# ══════════════════════════════════════════════

def resolve_analysis_dates(
    time_range:  Optional[str],
    start_date:  Optional[str],
    end_date:    Optional[str],
) -> Tuple[str, str]:
    """
    統一解析分析時間範圍，回傳 (start_date, end_date) 字串 (YYYY-MM-DD)。
    - 有自訂日期優先使用
    - 否則依 time_range 往今天推算
    """
    if start_date and end_date:
        return start_date, end_date

    today = date.today()
    delta_map = {
        "1D": timedelta(days=1),
        "1W": timedelta(weeks=1),
        "1M": timedelta(days=30),
        "3M": timedelta(days=90),
        "6M": timedelta(days=180),
        "1Y": timedelta(days=365),
    }
    delta = delta_map.get(time_range or "1M", timedelta(days=30))
    return (today - delta).isoformat(), today.isoformat()


# ══════════════════════════════════════════════
# Interval 格式轉換（原 pattern_service）
# ══════════════════════════════════════════════

INTERVAL_TO_DB = {
    "1D": "1d", "1W": "1d", "1M": "1d",
    "1H": "1h", "4H": "1h",
    "1min": "1m", "3min": "3m", "5min": "5m",
    "15min": "15m", "30min": "30m",
}

RESAMPLE_RULES = {"1W": "W-FRI", "1M": "ME", "4H": "4h"}


def interval_to_db_format(interval: str) -> str:
    return INTERVAL_TO_DB.get(interval, "1d")


def needs_resample(interval: str) -> bool:
    return interval in RESAMPLE_RULES


def resample_prices(df: pd.DataFrame, interval: str) -> pd.DataFrame:
    """將日線重採樣為目標週期（週線/月線/4H）"""
    rule = RESAMPLE_RULES.get(interval)
    if not rule or df.empty:
        return df

    if "datetime" in df.columns:
        df["datetime"] = pd.to_datetime(df["datetime"])
        df = df.set_index("datetime")

    agg = {"open": "first", "high": "max", "low": "min",
           "close": "last", "volume": "sum"}
    resampled = df.resample(rule).agg(agg).dropna()
    return resampled.reset_index().rename(columns={"index": "datetime"})
