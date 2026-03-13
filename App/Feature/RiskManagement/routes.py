"""
App/Feature/RiskManagement/routes.py
資金與風險管理頁面路由
"""
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

router = APIRouter()

@router.get("/risk-management", response_class=HTMLResponse)
async def risk_management_page(request: Request):
    """資金與風險管理頁面"""
    templates = request.app.state.templates
    if request.headers.get("HX-Request"):
        return templates.TemplateResponse(
            "RiskManagement/risk_management_fragment.html",
            {"request": request}
        )
    return templates.TemplateResponse(
        "RiskManagement/risk_management.html",
        {"request": request}
    )
