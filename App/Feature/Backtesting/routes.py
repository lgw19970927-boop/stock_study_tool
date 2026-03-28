"""
App/Feature/Backtesting/routes.py
回測頁面路由（目前為空結構，備用）
"""
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

router = APIRouter()


@router.get("/backtesting", response_class=HTMLResponse)
async def backtesting_page(request: Request):
    """回測頁面（空佔位）"""
    templates = request.app.state.templates
    if request.headers.get("HX-Request"):
        return templates.TemplateResponse("backtesting/backtesting_fragment.html", {"request": request})
    return templates.TemplateResponse("backtesting/backtesting.html", {"request": request})

