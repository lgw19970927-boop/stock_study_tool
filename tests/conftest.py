"""tests/conftest.py — 全域 fixture，供所有子資料夾的測試共用"""
import pytest
from pathlib import Path


@pytest.fixture(scope="session")
def project_root() -> Path:
    """回傳專案根目錄的 Path 物件"""
    return Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session")
def read_project_file(project_root):
    """回傳一個函式，傳入相對路徑字串即可讀取專案內的文字檔案"""
    def _read(path: str) -> str:
        return (project_root / path).read_text(encoding="utf-8")
    return _read


@pytest.fixture(scope="session")
def file_exists_checker(project_root):
    """回傳一個函式，傳入相對路徑字串，回傳該路徑是否存在"""
    def _exists(path: str) -> bool:
        return (project_root / path).exists()
    return _exists
