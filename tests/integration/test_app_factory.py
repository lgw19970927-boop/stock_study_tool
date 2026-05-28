"""tests/integration/test_app_factory.py — create_app() 整合測試"""
import pytest
import sys
from unittest.mock import MagicMock, patch

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def test_app():
    """建立 FastAPI 測試 app（mock init_db 避免需要 MySQL）。
    app.py 頂層有 app = create_app()，必須在 import 前 mock app.lib.db.init_db。
    """
    # 若 app.lib.db 已 import，直接替換 init_db；若尚未 import，也無妨
    import importlib

    db_mod = importlib.import_module("app.lib.db")
    original_init_db = db_mod.init_db
    db_mod.init_db = MagicMock()

    try:
        # 強制 reimport app.app（清除舊快取），讓 create_app 用 mock init_db
        sys.modules.pop("app.app", None)
        from app.app import create_app
        return create_app("testing")
    finally:
        db_mod.init_db = original_init_db


@pytest.fixture(scope="module")
def client(test_app):
    from fastapi.testclient import TestClient
    return TestClient(test_app, raise_server_exceptions=False)


def test_app_creates_successfully(test_app):
    assert test_app is not None
    assert test_app.title == "Stock AI Filter PRO"


def test_routes_include_health(test_app):
    paths = [route.path for route in test_app.routes]
    assert "/api/health" in paths


def test_routes_include_screening(test_app):
    paths = [route.path for route in test_app.routes]
    assert "/screening" in paths


def test_routes_include_root(test_app):
    paths = [route.path for route in test_app.routes]
    assert "/" in paths


def test_health_endpoint_returns_ok(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


def test_root_redirects_to_screening(test_app):
    from starlette.testclient import TestClient
    with TestClient(test_app, raise_server_exceptions=False, follow_redirects=False) as c:
        r = c.get("/")
    assert r.status_code in (301, 302, 307, 308)
    assert "/screening" in r.headers.get("location", "")
