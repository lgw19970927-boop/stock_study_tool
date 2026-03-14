"""
App/Feature/data_sync/data_sync/backup_mysql.py
備份工具 — 僅備份 user_data schema
透過 docker exec 呼叫容器內的 mysqldump，不需在 host 安裝 MySQL Client。

使用方式：
    from App.Feature.data_sync.data_sync.backup_mysql import backup_user_data
    backup_user_data()
"""
import subprocess
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

# ── 設定值（可由環境變數覆蓋）─────────────────────────────────────
CONTAINER_NAME  = os.environ.get("MYSQL_CONTAINER", "stock-mysql")
MYSQL_USER      = os.environ.get("MYSQL_USER",      "stockapp")
MYSQL_PASSWORD  = os.environ.get("MYSQL_PASSWORD",  "stockapp_password")

# 專案根目錄 = 此檔案往上四層（data_sync → Lib → App → project root）
PROJECT_ROOT   = Path(__file__).resolve().parents[3]
BACKUP_DIR     = PROJECT_ROOT / "Env" / "mysql" / "seed"
USER_DATA_FILE = BACKUP_DIR / "seed_user_data.sql"


def backup_user_data() -> None:
    """
    將 MySQL user_data schema 備份至 Env/mysql/seed/seed_user_data.sql。
    透過 `docker exec` 呼叫容器內的 mysqldump，覆寫舊備份檔。
    """
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    cmd = [
        "docker", "exec", CONTAINER_NAME,
        "mysqldump",
        f"-u{MYSQL_USER}",
        f"-p{MYSQL_PASSWORD}",
        "--single-transaction",
        "--routines",
        "--triggers",
        "user_data",
    ]

    logger.info(f"[backup_mysql] 開始備份 user_data → {USER_DATA_FILE}")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=300,
        )

        if result.returncode != 0:
            # mysqldump 會把密碼警告輸出到 stderr，過濾後再判斷
            stderr = result.stderr
            if "Using a password on the command line interface can be insecure" in stderr:
                stderr_clean = "\n".join(
                    line for line in stderr.splitlines()
                    if "Using a password" not in line
                )
            else:
                stderr_clean = stderr

            if stderr_clean.strip():
                raise RuntimeError(f"mysqldump 失敗: {stderr_clean.strip()}")

        USER_DATA_FILE.write_text(result.stdout, encoding="utf-8")
        logger.info(f"[backup_mysql] user_data 備份完成 ({USER_DATA_FILE.stat().st_size / 1024:.1f} KB)")

    except subprocess.TimeoutExpired:
        raise RuntimeError(f"mysqldump 超時（超過 300 秒），請確認 container '{CONTAINER_NAME}' 仍在運作")
    except FileNotFoundError:
        raise RuntimeError("找不到 'docker' 指令，請確認 Docker Desktop 已安裝並在 PATH 中")


def backup_market_data() -> None:
    """
    將 MySQL market_data schema 備份至 Env/mysql/seed/seed_market_data.sql。
    此函數由爾蹫（sync_market_data.py）在 incremental_update /
    progressive_backfill 完成後自動呼叫。
    """
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    market_file = BACKUP_DIR / "seed_market_data.sql"

    cmd = [
        "docker", "exec", CONTAINER_NAME,
        "mysqldump",
        f"-u{MYSQL_USER}",
        f"-p{MYSQL_PASSWORD}",
        "--single-transaction",
        "--routines",
        "--triggers",
        "market_data",
    ]

    logger.info(f"[backup_mysql] 開始備份 market_data → {market_file}")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=1800,   # market_data ~700MB，給 30 分鐘
        )

        if result.returncode != 0:
            stderr = result.stderr
            if "Using a password on the command line interface can be insecure" in stderr:
                stderr_clean = "\n".join(
                    line for line in stderr.splitlines()
                    if "Using a password" not in line
                )
            else:
                stderr_clean = stderr

            if stderr_clean.strip():
                raise RuntimeError(f"mysqldump 失敗: {stderr_clean.strip()}")

        market_file.write_text(result.stdout, encoding="utf-8")
        logger.info(f"[backup_mysql] market_data 備份完成 ({market_file.stat().st_size / 1024 / 1024:.1f} MB)")

    except subprocess.TimeoutExpired:
        raise RuntimeError("market_data 備份超時（超過 30 分鐘）")
    except FileNotFoundError:
        raise RuntimeError("找不到 'docker' 指令，請確認 Docker Desktop 已安裝並在 PATH 中")
