"""
Pattern Mapping Module
YOLO class name → 前端 value 的映射表
"""
from typing import Optional

# ----------------------------------------------------------------
# YOLO class name (foduucom model) → 前端 checkbox value
# ----------------------------------------------------------------
YOLO_TO_FRONTEND: dict[str, Optional[str]] = {
    "Head and shoulders bottom": "head_shoulders_bottom",  # 頭肩底（多頭）
    "Head and shoulders top":    "head_shoulders_top",     # 頭肩頂/M字頭（空頭）
    "M_Head":                    "head_shoulders_top",     # 雙頂，同屬空頭
    "Triangle":                  "triangle",               # 三角收斂
    "W_Bottom":                  "w_bottom",               # W底
    "StockLine":                 None,                     # 趨勢線，忽略
}

# ----------------------------------------------------------------
# 前端 value → 使用者顯示名稱
# ----------------------------------------------------------------
FRONTEND_DISPLAY_NAMES: dict[str, str] = {
    "w_bottom":              "W底",
    "triangle":              "三角收斂",
    "head_shoulders_top":    "頭肩頂",
    "head_shoulders_bottom": "頭肩底",
    "consolidation":         "盤整區",
}

# ----------------------------------------------------------------
# 工具函式
# ----------------------------------------------------------------

def map_yolo_to_frontend(yolo_class_name: str) -> Optional[str]:
    """
    將 YOLO 模型輸出的 class name 轉換為前端統一 value。
    回傳 None 表示此型態忽略（不送回前端）。
    """
    return YOLO_TO_FRONTEND.get(yolo_class_name)


def get_display_name(frontend_value: str) -> str:
    """
    取得前端 value 對應的中文顯示名稱。
    """
    return FRONTEND_DISPLAY_NAMES.get(frontend_value, frontend_value)
