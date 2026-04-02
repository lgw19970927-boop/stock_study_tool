"""
App/Feature/__init__.py
統一登錄所有 Feature Router — 仿 petshop features/__init__.py
"""
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI


def register_features(app: "FastAPI") -> None:
    from .screening import router as screening_router
    from .backtesting import router as backtesting_router
    from .risk_management import router as risk_management_router
    from .data_management.sync.market_data import router as market_data_router

    app.include_router(market_data_router)      # /api/stocks, /api/market-data/*
    app.include_router(screening_router)        # /screening, /api/screening/*
    app.include_router(backtesting_router)      # /backtesting
    app.include_router(risk_management_router)  # /risk-management
