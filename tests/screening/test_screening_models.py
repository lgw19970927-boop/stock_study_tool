"""tests/screening/test_screening_models.py — Pydantic models 單元測試"""
import pytest
from pydantic import ValidationError

from app.feature.screening.models import (
    ScreeningRequest,
    StrategyCreateRequest,
    OHLCBar,
    StockMeta,
    IndicatorConfig,
)

pytestmark = pytest.mark.unit


# ── ScreeningRequest ──────────────────────────────────────────────

def test_screening_request_defaults():
    req = ScreeningRequest(
        markets=["listed"],
        frequency="daily",
        indicators=[],
    )
    assert req.analysis_start_date is None
    assert req.analysis_end_date is None
    assert req.indicators == []


def test_screening_request_with_dates():
    req = ScreeningRequest(
        markets=["listed", "otc"],
        frequency="daily",
        indicators=[],
        analysis_start_date="2025-01-01",
        analysis_end_date="2025-06-30",
    )
    assert req.analysis_start_date == "2025-01-01"
    assert req.analysis_end_date == "2025-06-30"


# ── StrategyCreateRequest ─────────────────────────────────────────

def test_strategy_create_request_valid():
    req = StrategyCreateRequest(name="My Strategy", configuration={"key": "value"})
    assert req.name == "My Strategy"


def test_strategy_create_request_empty_name_raises():
    with pytest.raises(ValidationError):
        StrategyCreateRequest(name="", configuration={})


def test_strategy_create_request_description_optional():
    req = StrategyCreateRequest(name="Test", configuration={})
    assert req.description is None


# ── OHLCBar ───────────────────────────────────────────────────────

def test_ohlc_bar_valid():
    bar = OHLCBar(time="2025-01-01", open=10.0, high=12.0, low=9.0, close=11.0, volume=1000)
    assert bar.time == "2025-01-01"
    assert bar.volume == 1000


# ── StockMeta ─────────────────────────────────────────────────────

def test_stock_meta_required_fields():
    meta = StockMeta(symbol="2330", market="listed")
    assert meta.symbol == "2330"
    assert meta.name is None


def test_stock_meta_with_name():
    meta = StockMeta(symbol="2330", name="TSMC", market="listed")
    assert meta.name == "TSMC"


# ── IndicatorConfig defaults ──────────────────────────────────────

def test_indicator_config_defaults():
    ind = IndicatorConfig(type="sma", conditions=[])
    assert ind.timeframe == "1d"
    assert ind.parameters == {}
