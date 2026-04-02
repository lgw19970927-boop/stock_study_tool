import os
from pathlib import Path
from typing import Type


def _read_secret(var_name: str, default: str | None = None) -> str | None:
    """讀取 Docker secret 檔案或環境變數。仿 petshop config.py 設計。"""
    # 優先讀取 _FILE 指向的檔案
    file_env = os.environ.get(f"{var_name}_FILE")
    if file_env:
        path = Path(file_env)
        if path.is_file():
            return path.read_text(encoding="utf-8").strip()

    # 嘗試讀取 /run/secrets/<var_name lower>
    secrets_path = Path("/run/secrets") / var_name.lower()
    if secrets_path.is_file():
        return secrets_path.read_text(encoding="utf-8").strip()

    # 從環境變數取值
    value = os.environ.get(var_name)
    if value is not None:
        return value

    return default


def _read_int(var_name: str, default: int) -> int:
    raw = os.environ.get(var_name)
    if raw is None:
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


class BaseConfig:
    SECRET_KEY = _read_secret("SECRET_KEY", "dev-secret")

    # MySQL 連線設定
    MYSQL_HOST     = os.environ.get("MYSQL_HOST", "localhost")
    MYSQL_USER     = os.environ.get("MYSQL_USER", "stockapp")
    MYSQL_PASSWORD = _read_secret("MYSQL_PASSWORD", "stockapp_password")
    MYSQL_PORT     = int(os.environ.get("MYSQL_PORT", 3306))
    MYSQL_CHARSET  = "utf8mb4"

    # Connection pool sizes (per process).
    # Keep defaults conservative because FastAPI uses multiple worker processes.
    MYSQL_MARKET_POOL_SIZE = _read_int("MYSQL_MARKET_POOL_SIZE", 10)
    MYSQL_USER_POOL_SIZE   = _read_int("MYSQL_USER_POOL_SIZE", 2)

    # 兩個獨立 schema
    MYSQL_MARKET_DB = os.environ.get("MYSQL_MARKET_DB", "market_data")
    MYSQL_USER_DB   = os.environ.get("MYSQL_USER_DB", "user_data")


class DevelopmentConfig(BaseConfig):
    DEBUG = True


class TestingConfig(BaseConfig):
    TESTING = True
    MYSQL_MARKET_DB = os.environ.get("MYSQL_MARKET_DB", "market_data_test")
    MYSQL_USER_DB   = os.environ.get("MYSQL_USER_DB", "user_data_test")


class ProductionConfig(BaseConfig):
    DEBUG = False


_CONFIG_MAP: dict[str, Type[BaseConfig]] = {
    "development": DevelopmentConfig,
    "testing":     TestingConfig,
    "production":  ProductionConfig,
}


def get_config(env_name: str | None = None) -> Type[BaseConfig]:
    name = (
        env_name
        or os.environ.get("APP_ENV")
        or "development"
    ).lower()
    return _CONFIG_MAP.get(name, DevelopmentConfig)
