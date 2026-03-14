"""
App/Feature/Screening/service.py
股票篩選引擎核心邏輯（MySQL 版）
原 backend/services/screening_service.py 轉換
"""
import pandas as pd
from typing import List, Dict, Any, Optional
import logging

from ...Feature.data_sync.db import get_market_cursor
from .indicators.service import calculate_indicators, evaluate_condition

logger = logging.getLogger(__name__)


# ==========================================
# 數據重採樣
# ==========================================

def resample_data(df: pd.DataFrame, target_timeframe: str) -> pd.DataFrame:
    """將日線數據重採樣為目標週期 (周線、月線)"""
    if df.empty:
        return df

    if "datetime" in df.columns:
        df["datetime"] = pd.to_datetime(df["datetime"])
        df.set_index("datetime", inplace=True)

    rule_map = {
        "1w":     "W-FRI",
        "1wk":    "W-FRI",
        "Weekly": "W-FRI",
        "1M":     "ME",
        "1mo":    "ME",
        "Monthly":"ME",
    }
    rule = rule_map.get(target_timeframe)
    if not rule:
        return df.reset_index()

    agg = {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}
    resampled = df.resample(rule).agg(agg).dropna()
    return resampled.reset_index()


# ==========================================
# 單支股票篩選
# ==========================================

from datetime import datetime, timedelta

def screen_single_stock(
    symbol: str,
    name: str,
    market: str,
    indicators: List[Dict[str, Any]],
    timeframe: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    benchmark_date: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """篩選單支股票，回傳符合條件的股票資訊字典，否則回傳 None。"""
    try:
        # 1. 計算所需的最大 K 棒數量與安全起始日
        max_period = 20  # 預設最低要求
        needs_warmup = False
        
        for indicator in indicators:
            ind_type = indicator.get("type", "unknown").lower()
            params = indicator.get("parameters", indicator.get("params", {}))
            req_period = params.get("period", params.get("p", 20))
            try:
                req_period = int(req_period)
            except (ValueError, TypeError):
                req_period = 20
                
            # 檢查條件中是否有像是 MA60 的要求
            conditions = indicator.get("conditions", [])
            for cond in conditions:
                for key in ("left", "right"):
                    val = cond.get(key)
                    if isinstance(val, str) and val.startswith("MA"):
                        try:
                            req_period = max(req_period, int(val[2:]))
                        except ValueError:
                            pass
            
            max_period = max(max_period, req_period)
            
            # EMA, MACD, RSI 需要額外熱身期來平滑計算
            if ind_type in ["ema", "macd", "rsi"]:
                needs_warmup = True
                
        # 加總熱身期
        total_required_bars = max_period + (100 if needs_warmup else 30)
        
        # 1. 決定查詢週期（週線/月線從日線重採樣）
        query_timeframe = (
            "1d" if timeframe in ["1w", "1wk", "1M", "1mo", "Weekly", "Monthly"]
            else timeframe
        )
        
        # 根據 timeframe 與所需 K 棒換算回日曆天數 (安全起見放寬倍數)
        if query_timeframe == "1d":
            if timeframe in ["1w", "1wk", "Weekly"]:
                calendar_days_back = total_required_bars * 7 * 1.5
            elif timeframe in ["1m", "1mo", "Monthly"]:
                calendar_days_back = total_required_bars * 30 * 1.2
            else:
                calendar_days_back = total_required_bars * 1.5 + 10
        else:
            calendar_days_back = total_required_bars * 1.5 + 10
            
        # 計算安全起始日 (若有自訂 start_date 則取其早者)
        end_ref = pd.to_datetime(end_date) if end_date else pd.to_datetime('today')
        computed_safe_start = (end_ref - timedelta(days=calendar_days_back)).strftime('%Y-%m-%d')
        safe_start_date = min(start_date, computed_safe_start) if start_date else computed_safe_start

        # 2. 查詢 MySQL（帶入動態時間限制）
        with get_market_cursor() as cursor:
            cursor.execute(
                """
                SELECT datetime, open, high, low, close, volume
                FROM market_data_ohlcv
                WHERE symbol = %s AND timeframe = %s AND datetime >= %s
                ORDER BY datetime ASC
                """,
                (symbol, query_timeframe, safe_start_date),
            )
            rows = cursor.fetchall()

        if not rows:
            return None

        # 3. 大盤基準日防呆檢查 (停牌容忍)
        if benchmark_date:
            last_record_date = rows[-1]["datetime"]
            if isinstance(last_record_date, str):
                last_record_date = last_record_date.split(" ")[0]
            else:
                last_record_date = last_record_date.strftime('%Y-%m-%d')
                
            try:
                bm_dt = pd.to_datetime(benchmark_date)
                lr_dt = pd.to_datetime(last_record_date)
                if (bm_dt - lr_dt).days > 5:
                    logger.debug(f"{symbol}: 最後交易日 {last_record_date} 距離基準日 {benchmark_date} 超過 5 天，視為停牌")
                    return None
            except Exception as e:
                logger.warning(f"日期比對失敗: {e}")

        df = pd.DataFrame(rows)

        # 4. 重採樣（如有需要）
        if timeframe != query_timeframe:
            df = resample_data(df, timeframe)
            if df.empty:
                return None

        # 5. 計算所有指標
        try:
            df = calculate_indicators(df, indicators)
        except Exception as e:
            logger.error(f"{symbol}: 指標計算失敗 - {e}")
            return None

        # 6. 裁切分析區間
        if start_date or end_date:
            df["datetime_str"] = df["datetime"].apply(
                lambda x: x.strftime('%Y-%m-%d') if hasattr(x, "strftime") else str(x)
            )
            mask = pd.Series(True, index=df.index)
            if start_date:
                mask &= df["datetime_str"] >= start_date
            if end_date:
                mask &= df["datetime_str"] <= end_date
            eval_df = df[mask].copy()
        else:
            eval_df = df.copy()

        if eval_df.empty:
            return None

        # 7. 逐一評估指標條件
        all_conditions_met  = True
        matched_names       = []
        insufficient        = []

        for indicator in indicators:
            ind_type   = indicator.get("type", "unknown")
            params     = indicator.get("parameters", indicator.get("params", {}))
            conditions = indicator.get("conditions", [])

            req_period = params.get("period", params.get("p", 20))
            try:
                req_period = int(req_period)
            except (ValueError, TypeError):
                req_period = 20
                
            for cond in conditions:
                for key in ("left", "right"):
                    val = cond.get(key)
                    if isinstance(val, str) and val.startswith("MA"):
                        try:
                            req_period = max(req_period, int(val[2:]))
                        except ValueError:
                            pass

            # 資料不足：放行並標記
            if len(df) < req_period:
                if ind_type == "sma":
                    label = f"MA{req_period}"
                elif ind_type == "bollinger":
                    std_val = params.get('std_dev', params.get('std', 2.0))
                    try:
                        std_val = float(std_val)
                    except (ValueError, TypeError):
                        std_val = 2.0
                    std_str = int(std_val) if std_val == int(std_val) else std_val
                    label = f"BOLL({req_period},{std_str})"
                else:
                    label = f"{ind_type.capitalize()}({req_period})"
                insufficient.append(label)
                continue

            # 資料足夠：嚴格評估最後一根 K 棒
            indicator_met      = True
            condition_displays = []

            for cond in conditions:
                try:
                    result_series = evaluate_condition(eval_df, cond)
                    last_val = result_series.iloc[-1]
                        
                    if pd.isna(last_val) or not last_val:
                        indicator_met = False
                        break
                    
                    if "display" in cond:
                        condition_displays.append(cond["display"])
                    else:
                        left  = cond.get("left", "")
                        right = cond.get("right", "")
                        
                        if ind_type == "bollinger":
                            # 嘗試從 params 還原週期與標準差資訊
                            p = params.get("period", params.get("p", 20))
                            std = params.get("std_dev", params.get("std", 2.0))
                            std_str = int(std) if float(std) == int(std) else std
                            
                            def map_boll_operand(op_val: str) -> str:
                                if op_val == "close":
                                    return "最新價"
                                elif op_val == "BB_UPPER":
                                    return f"UPPER{p}_{std_str}"
                                elif op_val == "BB_MIDDLE":
                                    return f"MIDDLER{p}_{std_str}"
                                elif op_val == "BB_LOWER":
                                    return f"LOWER{p}_{std_str}"
                                else:
                                    return str(op_val)
                            
                            left_str = map_boll_operand(left)
                            right_str = map_boll_operand(right)
                            condition_displays.append(f"BOLL {left_str}{cond.get('operator','')}{right_str}")
                        else:
                            left_str = "價格" if left == "close" else left
                            right_str = "價格" if right == "close" else right
                            condition_displays.append(f"{left_str}{cond.get('operator','')}{right_str}")
                except Exception as e:
                    logger.warning(f"{symbol}: 條件評估失敗 - {e}")
                    indicator_met = False
                    break

            if indicator_met:
                matched_names.append(" 且 ".join(condition_displays) if condition_displays else ind_type.upper())
            else:
                all_conditions_met = False
                break

        if not all_conditions_met:
            return None

        # 8. 回傳結果
        latest = eval_df.iloc[-1]
        prev   = eval_df.iloc[-2] if len(eval_df) > 1 else latest
        change_pct = (
            ((latest["close"] - prev["close"]) / prev["close"]) * 100
            if prev["close"] != 0 else 0.0
        )

        return {
            "symbol":               symbol,
            "name":                 name,
            "market":               market,
            "price":                float(latest["close"]),
            "change_percent":       round(change_pct, 2),
            "volume":               int(latest["volume"]),
            "matched_indicators":   matched_names,
            "data_insufficient":    len(insufficient) > 0,
            "insufficient_indicators": insufficient,
        }

    except Exception as e:
        logger.error(f"{symbol}: 篩選失敗 - {e}")
        return None


# ==========================================
# 批次篩選
# ==========================================

def screen_stocks(
    markets: List[str],
    frequency: str,
    indicators: List[Dict[str, Any]],
    analysis_start_date: Optional[str] = None,
    analysis_end_date:   Optional[str] = None,
) -> Dict[str, Any]:
    """批次篩選股票，回傳結果字典。"""
    timeframe = indicators[0].get("timeframe", "1d") if indicators else "1d"
    logger.info(f"開始篩選: markets={markets}, timeframe={timeframe}")

    # 查詢大盤基準日
    with get_market_cursor() as cursor:
        cursor.execute("SELECT MAX(datetime) as max_date FROM market_data_ohlcv")
        row = cursor.fetchone()
        benchmark_date = row["max_date"] if row else None
        if benchmark_date and isinstance(benchmark_date, str):
            benchmark_date = benchmark_date.split(" ")[0]

        if markets:
            mkt_lower    = [m.lower() for m in markets]
            placeholders = ",".join(["%s"] * len(mkt_lower))
            cursor.execute(
                f"SELECT symbol, name, market FROM stock_meta "
                f"WHERE LOWER(market) IN ({placeholders}) AND status = 'Active'",
                mkt_lower,
            )
        else:
            cursor.execute("SELECT symbol, name, market FROM stock_meta WHERE status = 'Active'")
        stocks = cursor.fetchall()

    logger.info(f"待篩選股票數: {len(stocks)}")

    results = []
    for stock in stocks:
        result = screen_single_stock(
            stock["symbol"], stock["name"], stock["market"],
            indicators, timeframe,
            analysis_start_date, analysis_end_date,
            benchmark_date
        )
        if result:
            results.append(result)

    total             = len(results)
    gainers           = sum(1 for r in results if r["change_percent"] > 0)
    losers            = sum(1 for r in results if r["change_percent"] < 0)
    data_insufficient = sum(1 for r in results if r.get("data_insufficient", False))

    logger.info(f"篩選完成: 符合 {total} 支（資料不足 {data_insufficient} 支）")

    return {
        "total":  total,
        "stocks": results,
        "statistics": {
            "total":             total,
            "gainers":           gainers,
            "losers":            losers,
            "data_insufficient": data_insufficient,
        },
    }
