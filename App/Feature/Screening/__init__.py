"""
App/Feature/Screening/__init__.py
"""
from fastapi import APIRouter
from .routes import router as main_router
from .pattern.routes import router as pattern_router

router = APIRouter()
router.include_router(main_router)
router.include_router(pattern_router)
