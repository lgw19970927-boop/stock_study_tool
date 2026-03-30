"""
App/app.py
FastAPI 應用程式入口 — 仿 petshop app.py create_app 工廠函式
"""
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

from .config import get_config
from .lib.db import init_db
from .feature import register_features


def create_app(config_name: str | None = None) -> FastAPI:
    config = get_config(config_name)

    app = FastAPI(
        title="Stock AI Filter PRO",
        description="美股篩選與回測工具",
        version="1.0.0",
    )

    # ---- 新增 CORS Middleware ----
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # 在此可指定特定的 origin 例如 ["http://localhost:8000", "http://127.0.0.1:8000"]
        allow_credentials=True,
        allow_methods=["*"],  # 允許所有 HTTP 方法
        allow_headers=["*"],  # 允許所有 Header
    )

    # ---- 資料庫初始化 ----
    init_db(config)

    # ---- 靜態資源掛載 ----
    # /static  → app/static/  （全域共用 CSS/JS）
    app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

    # /feature → app/feature/ （各 Feature 的前端 JS/CSS/HTML）
    app.mount("/feature", StaticFiles(directory=os.path.join(BASE_DIR, "feature")), name="feature")

    # ---- Jinja2 Templates ----
    # 同時搜尋 template（放 base.html）與 feature（放各功能的 html）
    templates = Jinja2Templates(directory=[os.path.join(BASE_DIR, "template"), os.path.join(BASE_DIR, "feature")])
    app.state.templates = templates

    # ---- 登錄所有 Feature Router ----
    register_features(app)

    # ---- 根路由：重導至 /screening ----
    from fastapi.responses import RedirectResponse

    @app.get("/")
    async def root():
        return RedirectResponse(url="/screening")

    @app.get("/favicon.ico")
    async def favicon():
        return RedirectResponse(url="/static/favicon.svg")

    # ---- 健康檢查 ----
    @app.get("/api/health")
    async def health():
        return {"status": "ok"}

    return app


app = create_app()
