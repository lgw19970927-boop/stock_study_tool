# 架構 Refactor 計畫 - 最終確認版本

## 概述
本次 refactor 目標是將專案容器化架構調整為**四個獨立 container** 的微服務架構。

---

## 目標架構

```
docker-compose up
├── mysql          → DB container
├── fastapi        → API container（FastAPI 應用 + Uvicorn 多 worker）
├── nginx          → 反向代理 + 負載均衡 container
└── data_sync      → 資料爬蟲 + 備份 container（定期排程）

通訊流程：
分頁請求 → Nginx (port 80) → Uvicorn Worker (port 8000) → FastAPI 應用 → MySQL
```

---

## 核心決策

| 項目 | 決策 | 原因 |
|------|------|------|
| **container 數量** | 4 個 | 職責分離、易於維護 |
| **FastAPI 和 Uvicorn** | 同一 container | FastAPI 是應用，Uvicorn 是服務器（不是分開） |
| **Uvicorn 多 worker** | 支持多 worker（4～8） | 並列處理多個分頁的 HTTP 請求 |
| **Nginx 角色** | 獨立 container | 反向代理 + 負載均衡到 Uvicorn worker |
| **分頁請求流程** | HTTP → Nginx 分配 → Uvicorn worker → FastAPI | 實現並行處理 |
| **data_sync 位置** | `App/Feature/data_sync/` | Feature 一部分 |
| **資料備份 & 同步** | 同一 container，python 排程 | 定期自動執行 |
| **seed SQL 位置** | `Env/mysql/seed/` | **✅ 已遷移至根目錄 Env/** |
| **requirements.txt** | `Env/fastapi/` | **✅ 已遷移至根目錄 Env/** |
| **data_sync requirements** | `Env/data_sync/` | **✅ 新建專用最小化版本** |
| **Python 環境** | Anaconda `marketing_system` | 本機開發與 container 統一 |

---

## ⚠️ 環境先決條件

**所有 Python 腳本執行必須在 Anaconda `marketing_system` 環境下**

```bash
# 啟動環境
conda activate marketing_system

# 檢查環境
conda info --envs
python --version
```

---

## 實施步驟

### 第一階段：目錄與代碼遷移

#### 1.1 建立新目錄結構

```bash
mkdir -p App\Feature\data_sync
mkdir -p App\Env\mysql\seed
mkdir -p App\Env\data_sync
```

#### 1.2 遷移 App/Lib → App/Feature/data_sync

```bash
# Windows
move App\Lib\* App\Feature\data_sync\
```

複製 `App/Feature/data_sync/__init__.py`（若不存在）：

```python
"""
App/Feature/data_sync/__init__.py
資料同步 Feature 模組
"""
```

#### 1.3 遷移 seed SQL 到 mysql/seed

```bash
move App\Env\data\seed_*.sql App\Env\mysql\seed\
```

#### 1.4 遷移 requirements.txt

```bash
move App\Env\requirements.txt App\Env\fastapi\requirements.txt
```

#### 1.5 修改所有 Python imports

在整個專案中搜尋並取代：
- **搜尋**：`from App.Lib`
- **取代**：`from App.Feature.data_sync`
- **搜尋**：`import App.Lib`
- **取代**：`import App.Feature.data_sync`

**需修改的檔案**：
- `App/app.py`
- `Test/test_*.py`
- `Test/verify_*.py`
- `Test/data_sync/*.py`
- `App/Feature/data_sync/` 內所有檔案

#### 1.6 修改 backup_mysql.py 路徑

編輯 `App/Feature/data_sync/data_sync/backup_mysql.py`：

```python
# 找到這行：
BACKUP_DIR = PROJECT_ROOT / "App" / "Env" / "data"

# 改為：
BACKUP_DIR = PROJECT_ROOT / "App" / "Env" / "mysql" / "seed"
```

### 第二階段：Docker 檔案建立

#### 2.1 建立 App/Env/fastapi/Dockerfile

編輯 `App/Env/fastapi/Dockerfile`，修改 requirements.txt 路徑；支持多 worker：

```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    default-libmysqlclient-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# ✅ 改為 fastapi/requirements.txt
COPY App/Env/fastapi/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY App/ .

# ✅ 開啟多 worker（預設 4 個；也可改為 8）
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

**多 worker 負載均衡原理**：
- Uvicorn 啟動 4 個 Python worker 進程，各佔一個 CPU
- Nginx 在 upstream 中配置將請求平衡分配到這 4 個 worker
- 多個分頁的並行請求不會互相阻塞

#### 2.2 建立 App/Env/data_sync/Dockerfile

新建檔案 `App\Env\data_sync\Dockerfile`：

```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    default-libmysqlclient-dev \
    pkg-config \
    docker.io \
    && rm -rf /var/lib/apt/lists/*

# 複製 requirements.txt
COPY App/Env/fastapi/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# 新增排程套件
RUN pip install --no-cache-dir APScheduler

COPY App/ .

COPY App/Env/data_sync/scheduler.py /app/scheduler.py
CMD ["python", "scheduler.py"]
```

#### 2.3 建立 App/Env/data_sync/scheduler.py

新建檔案 `App\Env\data_sync\scheduler.py`，完整內容如下：

```python
"""
App/Env/data_sync/scheduler.py
資料同步排程管理 - APScheduler 定期執行爬蟲、檢查缺口、備份資料

此腳本僅在 data_sync container 內執行
"""
import logging
import sys
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler

# ✅ 使用新路徑
from App.Feature.data_sync.data_sync.sync_market_data import (
    incremental_update,
    progressive_backfill,
    ensure_data
)
from App.Feature.data_sync.data_sync.backup_mysql import backup_user_data, backup_market_data

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)

def run_scheduler():
    """啟動排程任務"""
    scheduler = BackgroundScheduler()
    scheduler.daemon = True
    
    logger.info("[scheduler] 初始化排程任務...")
    
    # 週一至週五 18:00 增量更新
    scheduler.add_job(
        lambda: incremental_update(interval='1d'),
        'cron',
        day_of_week='0-4',
        hour=18,
        minute=0,
        id='incremental_update',
        name='Daily Incremental Update (Mon-Fri 18:00)'
    )
    logger.info("✅ incremental_update (Mon-Fri 18:00)")
    
    # 每日 02:00 歷史回補
    scheduler.add_job(
        lambda: progressive_backfill(interval='1d'),
        'cron',
        hour=2,
        minute=0,
        id='progressive_backfill',
        name='Daily Progressive Backfill (02:00)'
    )
    logger.info("✅ progressive_backfill (Daily 02:00)")
    
    # 週日 03:00 缺口掃描
    scheduler.add_job(
        lambda: ensure_data(['all'], '1d', '2024-01-01', None),
        'cron',
        day_of_week=6,
        hour=3,
        minute=0,
        id='gap_scanner',
        name='Weekly Gap Scanner (Sun 03:00)'
    )
    logger.info("✅ gap_scanner (Sun 03:00)")
    
    # 每日 23:55 使用者資料備份
    scheduler.add_job(
        backup_user_data,
        'cron',
        hour=23,
        minute=55,
        id='backup_user_data',
        name='Daily User Data Backup (23:55)'
    )
    logger.info("✅ backup_user_data (Daily 23:55)")
    
    # 每日 23:59 市場資料備份
    scheduler.add_job(
        backup_market_data,
        'cron',
        hour=23,
        minute=59,
        id='backup_market_data',
        name='Daily Market Data Backup (23:59)'
    )
    logger.info("✅ backup_market_data (Daily 23:59)")
    
    logger.info("[scheduler] ✅ 所有排程已設定，準備啟動...")
    scheduler.start()
    
    try:
        while True:
            pass
    except KeyboardInterrupt:
        logger.info("[scheduler] 正在關閉排程...")
        scheduler.shutdown()
        sys.exit(0)

if __name__ == '__main__':
    run_scheduler()
```

### 第三階段：修改 docker-compose.yml

編輯 `docker-compose.yml`，進行以下修改：

**1. 修改 mysql service 的 volume：**

```yaml
mysql:
  # ... 現有設定 ...
  volumes:
    - mysql_data:/var/lib/mysql
    # ✅ 改為 mysql/seed/
    - ./App/Env/mysql/init.sql:/docker-entrypoint-initdb.d/01_init.sql
    - ./App/Env/mysql/seed/seed_market_data.sql:/docker-entrypoint-initdb.d/02_seed_market_data.sql
    - ./App/Env/mysql/seed/seed_user_data.sql:/docker-entrypoint-initdb.d/03_seed_user_data.sql
```

**2. 新增 data_sync service（在 nginx 後面）：**

```yaml
  data_sync:
    build:
      context: .
      dockerfile: ./App/Env/data_sync/Dockerfile
    container_name: stock-data-sync
    environment:
      MYSQL_HOST: mysql
      MYSQL_USER: stockapp
      MYSQL_PASSWORD_FILE: /run/secrets/mysql_user_password
      TZ: Asia/Taipei
    volumes:
      - ./App:/app
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      mysql:
        condition: service_healthy
    secrets:
      - mysql_user_password
```

### 第四階段：驗證與啟動

#### 4.1 本機驗證（Anaconda 環境）

```bash
# 啟動環境
conda activate marketing_system

# 進入專案目錄
cd d:\Projects\stock_study_tool

# 驗證 imports
python -c "from App.Feature.data_sync.db import get_market_cursor; print('✅ Import OK')"

# 執行測試
pytest Test/ -v
```

#### 4.2 Docker Compose 啟動

```bash
# 確保 Docker Desktop 已啟動

# 建置並啟動
docker-compose up --build

# 新開終端機，檢查 container
docker ps

# 應該看到 4 個 container：
# stock-mysql, stock-fastapi, stock-nginx, stock-data-sync
```

#### 4.3 驗證排程執行

```bash
# 監看 data_sync 日誌
docker logs stock-data-sync -f

# 應該看到「所有排程已設定」的訊息
```

---

## ✅ 檢查清單

### 第一階段：代碼重構 ✅ 2026-03-14
- [x] 建立目錄：`App/Feature/data_sync`、`App/Env/mysql/seed`、`App/Env/data_sync` ✅
- [x] 移動檔案：`Lib` → `Feature/data_sync`、seed SQL → `mysql/seed`、requirements.txt → `fastapi/` ✅
- [x] 修改全部 imports（`App.Lib` → `App.Feature.data_sync`） ✅
- [x] 修改 `backup_mysql.py` BACKUP_DIR 路徑 ✅
- [x] 建立 `App/Env/data_sync/Dockerfile` ✅
- [x] 建立 `App/Env/data_sync/scheduler.py` ✅
- [x] 修改 `docker-compose.yml`（mysql volume + 新增 data_sync service） ✅
- [x] 修改 `App/Env/fastapi/Dockerfile` requirements 路徑 ✅
- [x] 本機驗證通過（conda + pytest） ✅

### 第二階段：完整微服務架構重構 ✅ 2026-03-14
- [x] 建立新 Env/ 目錄結構（根目錄） ✅
- [x] 遷移 `App/Env/*` → `Env/*` ✅
- [x] 更新 Dockerfile 路徑（fastapi & data_sync） ✅
- [x] 更新 docker-compose.yml 路徑（mysql volume & dockerfile） ✅
- [x] 建立 data_sync 專用 requirements.txt ✅
- [x] 更新 scheduler.py 與 backup_mysql.py 中的路徑 ✅
- [x] 本機導入驗證通過 ✅

### 第三階段：Docker 驗證 ⏳ 待執行
- [ ] `docker-compose up --build` 成功啟動 4 個 container ⏳ 運行 `start_server.bat`
- [ ] `docker logs stock-data-sync` 顯示排程已設定 ⏳ 運行 `start_server.bat`

---

## 本機開發 vs. Container 執行對比

| 操作 | 本機開發（Anaconda） | Container 執行 |
|------|------------------|---------------|
| 資料同步 | `python -m App.Feature.data_sync.data_sync.sync_market_data incremental` | 自動排程（每日 18:00） |
| 手動備份 | `python -m App.Feature.data_sync.data_sync.backup_mysql` | 自動排程（每日 23:55 / 23:59） |
| 運行測試 | `pytest Test/ -v`（需 marketing_system） | 無自動測試 |
| API 服務 | 需本機手動啟 uvicorn | Container 自動啟動 |
| 環境要求 | Anaconda `marketing_system` | Docker 內部自動處理 |

---

**狀態**：✅ 第一、二階段完成；⏳ 待 Docker 驗證  
**環境**：Anaconda `marketing_system` ✅ | Docker Compose ⏳  
**日期**：2026-03-14（重構開始） → 進行中
