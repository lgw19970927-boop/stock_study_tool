"""tests/screening/test_pattern_mapping.py — pattern_mapping.py 單元測試"""
import pytest

from app.feature.screening.pattern.pattern_mapping import (
    map_yolo_to_frontend,
    get_display_name,
)

pytestmark = pytest.mark.unit


@pytest.mark.parametrize("yolo_class,expected_value", [
    ("Head and shoulders bottom", "head_shoulders_bottom"),
    ("Head and shoulders top",    "head_shoulders_top"),
    ("M_Head",                    "head_shoulders_top"),
    ("Triangle",                  "triangle"),
    ("W_Bottom",                  "w_bottom"),
    ("StockLine",                 None),   # 應忽略
])
def test_map_yolo_to_frontend_known_classes(yolo_class, expected_value):
    assert map_yolo_to_frontend(yolo_class) == expected_value


def test_map_yolo_to_frontend_unknown_class():
    result = map_yolo_to_frontend("SomeUnknownPattern")
    assert result is None


@pytest.mark.parametrize("frontend_value,expected_name", [
    ("w_bottom",              "W底"),
    ("triangle",              "三角收斂"),
    ("head_shoulders_top",    "頭肩頂"),
    ("head_shoulders_bottom", "頭肩底"),
    ("consolidation",         "盤整區"),
])
def test_get_display_name_known_values(frontend_value, expected_name):
    assert get_display_name(frontend_value) == expected_name


def test_get_display_name_unknown_value():
    # 未知 value 應原樣回傳
    assert get_display_name("unknown_value") == "unknown_value"
