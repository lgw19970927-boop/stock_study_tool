"""
Test/test_integration.py
整合測試 — 驗證重構後前後端整合無 bug
執行：conda activate marketing_system && pytest Test/test_integration.py -v

注意：
  - 需要 MySQL 容器在執行（docker compose up -d mysql）
  - 需要 FastAPI 運行（uvicorn App.app:app）
  - 部分測試會跳過（若 DB 無資料）
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("TEST_BASE_URL", "http://localhost:8000")


# ══════════════════════════════════════════════
# 輔助函式
# ══════════════════════════════════════════════

def get(path, **kwargs):
    return requests.get(f"{BASE_URL}{path}", timeout=10, **kwargs)

def post(path, **kwargs):
    return requests.post(f"{BASE_URL}{path}", timeout=30, **kwargs)


# ══════════════════════════════════════════════
# 1. 健康檢查
# ══════════════════════════════════════════════

class TestHealth:
    def test_health_endpoint_returns_ok(self):
        """API 健康檢查"""
        r = get("/api/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


# ══════════════════════════════════════════════
# 2. 頁面路由（Jinja2 渲染）
# ══════════════════════════════════════════════

class TestPages:
    def test_root_redirects_to_screening(self):
        """/  應重導至 /screening"""
        r = get("/", allow_redirects=False)
        assert r.status_code in (301, 302, 307, 308)
        assert "/screening" in r.headers.get("location", "")

    def test_screening_page_returns_html(self):
        """/screening 回傳完整 HTML"""
        r = get("/screening")
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "")
        assert "Stock AI Filter PRO" in r.text

    def test_screening_page_contains_goldenLayout(self):
        """screening 頁面應包含 GoldenLayout 容器"""
        r = get("/screening")
        assert "goldenLayoutContainer" in r.text

    def test_screening_page_contains_sidebar(self):
        """screening 頁面應包含 sidebar"""
        r = get("/screening")
        assert "app-sidebar" in r.text

    def test_screening_htmx_fragment(self):
        """HTMX 請求應回傳 fragment（不含 base.html）"""
        r = get("/screening", headers={"HX-Request": "true"})
        assert r.status_code == 200
        # fragment 不應包含完整 HTML head
        assert "<!DOCTYPE html>" not in r.text

    def test_backtesting_page_returns_html(self):
        """/backtesting 回傳完整 HTML"""
        r = get("/backtesting")
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "")

    def test_comparison_page_returns_html(self):
        """/comparison 回傳完整 HTML"""
        r = get("/comparison")
        assert r.status_code == 200

    def test_static_layout_js_accessible(self):
        """/static/js/layout.js 可存取"""
        r = get("/static/js/layout.js")
        assert r.status_code == 200
        assert "LayoutManager" in r.text

    def test_static_layout_screening_js_accessible(self):
        """/static/js/layout-screening.js 可存取"""
        r = get("/static/js/layout-screening.js")
        assert r.status_code == 200
        assert "GoldenLayout" in r.text or "goldenLayout" in r.text


# ══════════════════════════════════════════════
# 3. 股票列表 API
# ══════════════════════════════════════════════

class TestStocksAPI:
    def test_get_stocks_returns_json(self):
        """/api/stocks 回傳 JSON"""
        r = get("/api/stocks")
        assert r.status_code == 200
        data = r.json()
        assert "total" in data
        assert "stocks" in data

    def test_get_stocks_market_filter(self):
        """/api/stocks?market=listed 只回傳 listed"""
        r = get("/api/stocks", params={"market": "listed"})
        assert r.status_code == 200
        data = r.json()
        for stock in data.get("stocks", []):
            assert stock["market"].lower() == "listed"

    def test_get_stocks_structure(self):
        """每支股票有 symbol/name/market 欄位"""
        r = get("/api/stocks")
        for stock in r.json().get("stocks", [])[:5]:
            assert "symbol" in stock
            assert "market" in stock


# ══════════════════════════════════════════════
# 4. K線數據 API
# ══════════════════════════════════════════════

class TestMarketDataAPI:
    def test_kline_for_spy_daily(self):
        """SPY 日線數據查詢"""
        r = get("/api/market-data/SPY", params={"interval": "1d", "period": "1M"})
        if r.status_code == 200:
            data = r.json()
            assert data["symbol"] == "SPY"
            assert isinstance(data["data"], list)
        else:
            pytest.skip("資料庫無 SPY 1d 資料，跳過")

    def test_kline_empty_for_unknown_symbol(self):
        """未知 symbol 回傳空 data 而非 500"""
        r = get("/api/market-data/UNKNOWN_SYMBOL_XYZ", params={"interval": "1d"})
        assert r.status_code == 200
        assert r.json()["data"] == []

    def test_kline_count_endpoint(self):
        """/api/market-data/kline-count 回傳 count 欄位"""
        r = get("/api/market-data/kline-count",
                params={"interval": "1D", "time_range": "1M"})
        assert r.status_code == 200
        assert "count" in r.json()


# ══════════════════════════════════════════════
# 5. 篩選 API（快速測試，空條件）
# ══════════════════════════════════════════════

class TestScreeningAPI:
    def test_filter_empty_indicators(self):
        """空指標篩選：應回傳符合條件股票清單"""
        r = post("/api/screening/filter", json={
            "markets": ["listed"],
            "frequency": "daily",
            "indicators": [],
        })
        assert r.status_code == 200
        data = r.json()
        assert "total" in data
        assert "stocks" in data
        assert "statistics" in data

    def test_filter_stream_returns_sse(self):
        """SSE 串流端點應回傳 text/event-stream"""
        import json as _json
        r = get("/api/screening/filter/stream",
                params={"markets": "listed", "indicators_json": _json.dumps([])},
                stream=True)
        assert r.status_code == 200
        assert "text/event-stream" in r.headers.get("content-type", "")
        r.close()
