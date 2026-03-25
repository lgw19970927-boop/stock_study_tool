"""
App/Feature/__init__.py
統一登錄所有 Feature Router — 仿 petshop features/__init__.py
"""
from fastapi import FastAPI

from .Screening import router as screening_router
from .Backtesting import router as backtesting_router
from .RiskManagement import router as risk_management_router
from .DataManagement.sync.market_data import router as market_data_router


def register_features(app: FastAPI) -> None:
    app.include_router(market_data_router)      # /api/stocks, /api/market-data/*
    app.include_router(screening_router)        # /screening, /api/screening/*
    app.include_router(backtesting_router)      # /backtesting
    app.include_router(risk_management_router)  # /risk-management
