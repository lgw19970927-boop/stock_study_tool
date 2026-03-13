"""
Pattern Recognition Service
核心型態辨識邏輯：
- YOLO 推理（W底、頭肩頂底、三角收斂）
- 規則法（盤整區，無 YOLO 模型支援）
"""
import io
import sys
import os
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from datetime import date, timedelta

import pandas as pd
import numpy as np

# ── 專案路徑與模組匯入 ──────────────────────────────────────────────────
from .pattern_mapping import map_yolo_to_frontend, get_display_name

logger = logging.getLogger(__name__)

# ── 模型路徑 ──────────────────────────────────────────────────────
MODEL_PATH = Path(__file__).resolve().parent / "models" / "foduucom_stock_patterns.pt"

# YOLO 模型（延遲載入，避免啟動時佔用記憶體）
_yolo_model = None

def get_yolo_model():
    """延遲載入 YOLO 模型（單例）"""
    global _yolo_model
    if _yolo_model is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(
                f"YOLO 模型不存在：{MODEL_PATH}\n"
                "請先下載模型"
            )
        import torch
        from ultralytics import YOLO
        logger.info(f"載入 YOLO 模型：{MODEL_PATH}")
        _yolo_model = YOLO(str(MODEL_PATH))
        
        # 確保模型載入 GPU (如果可用)
        if torch.cuda.is_available():
            logger.info("檢測到 CUDA，將 YOLO 移至 GPU，啟用加速")
            _yolo_model.to('cuda')
        else:
            logger.info("未檢測到 CUDA，YOLO 降級使用 CPU")

    return _yolo_model

# ═══════════════════════════════════════════════════════════════════
# ① 日期解析
# ═══════════════════════════════════════════════════════════════════
def resolve_analysis_dates(
    time_range: Optional[str],
    start_date: Optional[str],
    end_date: Optional[str]
) -> Tuple[str, str]:
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

# ═══════════════════════════════════════════════════════════════════
# ② Interval 格式轉換
# ═══════════════════════════════════════════════════════════════════
INTERVAL_TO_DB = {
    "1D":   "1d",
    "1W":   "1d",    
    "1M":   "1d",    
    "1H":   "1h",    
    "4H":   "1h",    
    "1min": "1m",
    "3min": "3m",
    "5min": "5m",
    "15min":"15m",
    "30min":"30m",
}

RESAMPLE_RULES = {
    "1W": "W-FRI",
    "1M": "ME",
    "4H": "4h",
}

def interval_to_db_format(interval: str) -> str:
    return INTERVAL_TO_DB.get(interval, "1d")

def needs_resample(interval: str) -> bool:
    return interval in RESAMPLE_RULES

def resample_prices(df: pd.DataFrame, interval: str) -> pd.DataFrame:
    rule = RESAMPLE_RULES.get(interval)
    if not rule or df.empty:
        return df

    if "datetime" in df.columns:
        df["datetime"] = pd.to_datetime(df["datetime"])
        df = df.set_index("datetime")

    ohlc_dict = {
        "open":   "first",
        "high":   "max",
        "low":    "min",
        "close":  "last",
        "volume": "sum",
    }
    resampled = df.resample(rule).agg(ohlc_dict).dropna()
    return resampled.reset_index().rename(columns={"index": "datetime"})

# ═══════════════════════════════════════════════════════════════════
# ③ 資料查詢 (MySQL)
# ═══════════════════════════════════════════════════════════════════
def fetch_stock_prices(
    symbol: str,
    db_interval: str,
    start_date: str,
    end_date: str
) -> List[Dict[str, Any]]:
    # datetime in MySQL requires valid strings or bindings
    from ....Lib.db import get_market_cursor
    try:
        with get_market_cursor() as cursor:
            # 轉換為包含時分的比較
            end_dt_str = end_date if " " in end_date else f"{end_date} 23:59:59"
            query = """
                SELECT datetime AS time, open, high, low, close, volume
                FROM market_data_ohlcv
                WHERE symbol = %s AND timeframe = %s
                  AND datetime >= %s AND datetime <= %s
                ORDER BY datetime ASC
            """
            cursor.execute(query, (symbol, db_interval, start_date, end_dt_str))
            rows = cursor.fetchall()
            
        if not rows:
            return []
            
        # JSON 序列化需要確保 datetime 物件能正確轉字串，讓前方 pandas 可以吃
        for r in rows:
            if hasattr(r["time"], "strftime"):
                r["time"] = r["time"].strftime("%Y-%m-%d %H:%M:%S")

        return rows
    except Exception as e:
        logger.error(f"{symbol}: fetch_stock_prices 失敗 - {e}")
        return []

def get_stocks_by_markets(markets: List[str]) -> List[Dict[str, Any]]:
    from ....Lib.db import get_market_cursor
    try:
        with get_market_cursor() as cursor:
            markets_lower = [m.lower() for m in markets]
            placeholders = ",".join(["%s"] * len(markets_lower))
            query = f"SELECT symbol, name, market FROM stock_meta WHERE LOWER(market) IN ({placeholders}) AND status = 'Active'"
            cursor.execute(query, markets_lower)
            rows = cursor.fetchall()
            return [{"symbol": r["symbol"], "name": r["name"], "market": r["market"]} for r in rows]
    except Exception as e:
        logger.error(f"get_stocks_by_markets 失敗 - {e}")
        return []

# ═══════════════════════════════════════════════════════════════════
# ④ 盤整區規則法（Consolidation Rule-Based）
# ═══════════════════════════════════════════════════════════════════
def _detect_consolidation(
    prices: List[Dict[str, Any]],
    min_bars: int,
    max_bars: int,
    sensitivity: int
) -> List[Dict[str, Any]]:
    if len(prices) < min_bars:
        return []

    threshold = 0.05 + (sensitivity / 100) * 0.08
    results = []
    total = len(prices)
    step = max(1, min_bars // 2)

    for start in range(0, total - min_bars + 1, step):
        for window_size in range(min_bars, min(max_bars + 1, total - start + 1)):
            chunk = prices[start : start + window_size]
            if len(chunk) < min_bars:
                break

            highs  = [float(c["high"])  for c in chunk]
            lows   = [float(c["low"])   for c in chunk]
            closes = [float(c["close"]) for c in chunk]

            max_high = max(highs)
            min_low  = min(lows)

            if min_low == 0:
                continue

            amplitude = (max_high - min_low) / min_low
            if amplitude > threshold:
                continue

            x = np.arange(len(closes))
            slope = np.polyfit(x, closes, 1)[0]
            mean_close = np.mean(closes)
            if mean_close > 0 and abs(slope / mean_close) > 0.005:
                continue

            upper_band = max_high * 0.98
            lower_band = min_low  * 1.02
            touches_upper = any(h >= upper_band for h in highs)
            touches_lower = any(l <= lower_band for l in lows)
            if not (touches_upper and touches_lower):
                continue

            confidence = round(max(0.0, (threshold - amplitude) / threshold) * 100, 1)

            results.append({
                "name":         "consolidation",
                "display_name": "盤整區",
                "confidence":   confidence,
                "start_date":   str(chunk[0]["time"]).split(" ")[0],
                "end_date":     str(chunk[-1]["time"]).split(" ")[0],
            })
            break

    results.sort(key=lambda r: r["confidence"], reverse=True)
    return results[:3]

# ═══════════════════════════════════════════════════════════════════
# ⑤ YOLO 推理（W底、頭肩頂底、三角收斂）
# ═══════════════════════════════════════════════════════════════════
def _detect_with_yolo(
    prices: List[Dict[str, Any]],
    target_patterns: List[str],
    min_bars: int,
    max_bars: int,
    sensitivity: int
) -> List[Dict[str, Any]]:
    yolo_targets = [p for p in target_patterns if p != "consolidation"]
    if not yolo_targets or not prices:
        return []

    try:
        model = get_yolo_model()
    except FileNotFoundError as e:
        logger.error(str(e))
        return []

    from PIL import Image
    chart_gen_path = Path(__file__).resolve().parent / "utils" / "chart_generator.py"
    import importlib.util
    spec = importlib.util.spec_from_file_location("chart_generator", chart_gen_path)
    chart_gen = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(chart_gen)
    generate_chart_image = chart_gen.generate_chart_image

    conf_threshold = sensitivity / 100.0   
    WINDOW_SIZE = max(max_bars + 20, 150)
    OVERLAP     = WINDOW_SIZE // 3
    total       = len(prices)

    if total < min_bars:
        return []

    steps = (
        [0] if total < WINDOW_SIZE
        else range(0, max(1, total - WINDOW_SIZE + 1), WINDOW_SIZE - OVERLAP)
    )

    results    = []
    seen_keys  = set()

    for start_idx in steps:
        end_idx = min(start_idx + WINDOW_SIZE, total)
        chunk   = prices[start_idx:end_idx]

        if len(chunk) < min_bars:
            continue

        img_buf = generate_chart_image(chunk, width=640, height=640)
        if not img_buf:
            continue

        try:
            pil_img      = Image.open(img_buf)
            yolo_results = model(pil_img, verbose=False, conf=conf_threshold)
        except Exception as e:
            logger.warning(f"YOLO 推理失敗 (step={start_idx}): {e}")
            continue

        chunk_len = len(chunk)
        img_width = 640

        for r in yolo_results:
            for box in r.boxes:
                conf     = float(box.conf[0])
                cls_id   = int(box.cls[0])
                cls_name = model.names.get(cls_id, str(cls_id)) if hasattr(model.names, "get") else model.names[cls_id]

                frontend_value = map_yolo_to_frontend(cls_name)
                if frontend_value not in yolo_targets:
                    continue

                coords          = box.xyxy[0].tolist()
                x1, x2         = coords[0], coords[2]
                local_start     = int((x1 / img_width) * chunk_len)
                local_end       = int((x2 / img_width) * chunk_len)
                local_start     = max(0, min(local_start, chunk_len - 1))
                local_end       = max(0, min(local_end,   chunk_len - 1))
                pattern_len     = local_end - local_start

                if not (min_bars <= pattern_len <= max_bars):
                    continue

                s_date = str(chunk[local_start]["time"]).split(" ")[0]
                e_date = str(chunk[local_end  ]["time"]).split(" ")[0]

                key = f"{frontend_value}|{s_date}"
                if key in seen_keys:
                    continue
                seen_keys.add(key)

                results.append({
                    "name":         frontend_value,
                    "display_name": get_display_name(frontend_value),
                    "confidence":   round(conf * 100, 1),
                    "start_date":   s_date,
                    "end_date":     e_date,
                })

    return results

# ═══════════════════════════════════════════════════════════════════
# ⑥ 主入口
# ═══════════════════════════════════════════════════════════════════
def recognize_patterns(
    prices: List[Dict[str, Any]],
    patterns: List[str],
    sensitivity: int,
    min_bars: int,
    max_bars: int,
) -> List[Dict[str, Any]]:
    if not prices or not patterns:
        return []

    found = []

    yolo_patterns = [p for p in patterns if p != "consolidation"]
    if yolo_patterns:
        yolo_results = _detect_with_yolo(prices, yolo_patterns, min_bars, max_bars, sensitivity)
        found.extend(yolo_results)

    if "consolidation" in patterns:
        cons_results = _detect_consolidation(prices, min_bars, max_bars, sensitivity)
        found.extend(cons_results)

    return found
