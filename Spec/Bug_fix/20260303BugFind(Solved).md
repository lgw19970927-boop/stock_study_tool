# Stock Study Tool — 重構計畫書 (2026-03-03) (已完成該日目標)

## 背景與目標

將 `reference/backtesting_system_backup.zip` 內的原始專案，重構為以下設計原則的新架構：
- **參考範本**：`D:\Projects\petshop\petshop` 的目錄設計
- **後端**：FastAPI + Jinja2（HTML Server-side Rendering）
- **分頁切換**：HTMX（TradingView 風格 header，無整頁跳轉）
- **資料庫**：SQLite → MySQL（兩個獨立 schema：`market_data` / `user_data`）
- **CSS 策略**：混合 — `styles.css`、`screening.css`、`chart-settings-modal.css` **保留不重寫**（避免大量工時與風險）；HTML 元素可同時加 Tailwind utility class 補充微調；新建結構（header、GoldenLayout 容器）優先使用 Tailwind CSS。最終視覺結果必須與原版完全一致
- **面板 Dock**：GoldenLayout（右側篩選結果區 + K線圖區可自由拖移，Sidebar 獨立 CSS 控制）
- **部署**：docker-compose（MySQL + FastAPI + Nginx）

---

## 注意事項

> [!IMPORTANT]
> **SQLite → MySQL 遷移**：所有後端 Python 檔案中的 SQL 語法（`sqlite3` 特有語法如 `?` 佔位符、`AUTOINCREMENT` 等）將全面改為 MySQL 語法（`%s` 佔位符、`AUTO_INCREMENT`、`mysql.connector`）。
>
> **現有資料遷移**：`market_data.db`（~700MB）的資料需另行透過腳本匯入 MySQL，本次重構不包含此步驟。

> [!WARNING]
> **前端路徑全面更新**：所有 `<script src="...">` 與 `<link href="...">` 的相對路徑將改為 FastAPI Static 掛載的絕對 URL 路徑（如 `/static/js/utils/chartRenderer.js`）。

---

## UI 設計決策

### Header Bar（單一列，TradingView 風格）

```
┌──────────────────────────────────────────────────────────────────┐
│ ☰  🔷 Stock AI Filter PRO │📊 股票篩選 ×│📈 回測 ×│📊 比較 ×│ ＋│
└──────────────────────────────────────────────────────────────────┘
  ↑漢堡收合        ↑Logo              ↑HTMX 分頁（含 × 關閉）    ↑重開
```

- **☰ 漢堡按鈕**：點擊收合/展開左側 Sidebar（CSS transition 滑動）
- **分頁 × 關閉**：關閉後 tab 消失，header 右側出現 `＋` 按鈕重新開啟
- **齒輪設定按鈕**：已移除（原為未實作的佔位元素）
- **HTMX**：點擊分頁無整頁跳轉，只更新 `#content` 區域，URL 同步更新

### 頁面佈局（Screening 頁面）

```
┌──────────────────┬──────────────────────────────┐
│                  │  篩選結果區（GoldenLayout）   │
│  左側 Sidebar    ├──────────────────────────────┤
│  （獨立 CSS）    │  K線圖區（GoldenLayout）      │
│  ☰ 可收合       │                              │
└──────────────────┴──────────────────────────────┘
```

- **左側 Sidebar**：原 CSS 結構不變，`☰` 按鈕控制收合/展開，展開時右側自動縮小（非覆蓋）
- **右側面板**：GoldenLayout 管理「篩選結果區」和「K線圖區」，panel header 極細（僅作拖移手把），不顯示文字
- **面板操作**：可上下互換、左右並排、堆疊成 Tab、拉出為浮動視窗
- **佈局儲存**：自動存入 `localStorage`，下次開啟恢復上次排列

---

## 完整新檔案結構

```text
stock_study_tool/
├── App/
│   ├── app.py                          # FastAPI create_app()，掛載 Jinja2/Static/Router
│   ├── config.py                       # MySQL 連線設定（仿 petshop config.py）
│   ├── Feature/
│   │   ├── __init__.py                 # 統一登錄所有 Feature Router
│   │   ├── Screening/                  # 頁面一：股票篩選
│   │   │   ├── routes.py               # 頁面路由（GET /screening）+ API 路由
│   │   │   ├── service.py              # 業務邏輯（原 screening_service.py）
│   │   │   ├── repository.py           # MySQL 查詢（原 database.py screening 相關）
│   │   │   ├── screening.html          # Jinja2 template（extends base.html）
│   │   │   ├── screening.js            # 前端主控制器
│   │   │   ├── screening.css           # 前端樣式
│   │   │   ├── chartController.js
│   │   │   ├── chartSettingsModal.js
│   │   │   ├── strategyManager.js
│   │   │   ├── chart-settings-modal.css
│   │   │   ├── indicators/             # 指標子功能（前後端共存）
│   │   │   │   ├── routes.py           # /api/indicators/*
│   │   │   │   ├── service.py          # 原 indicator_service.py
│   │   │   │   ├── indicator_block.js
│   │   │   │   ├── time_range_block.js
│   │   │   │   ├── sma.js
│   │   │   │   ├── bollinger.js
│   │   │   │   ├── volume.js
│   │   │   │   └── amount.js
│   │   │   ├── market/
│   │   │   │   └── market_block.js
│   │   │   ├── pattern/                # 型態辨識子功能（前後端共存）
│   │   │   │   ├── routes.py           # 原 routers/pattern_recognition.py
│   │   │   │   ├── service.py          # 原 pattern_service.py
│   │   │   │   ├── pattern_block.js
│   │   │   │   └── models/             # YOLO 模型檔案
│   │   │   └── templates/              # JS Template 模組
│   │   │       ├── ChartSettingsModalTemplate.js
│   │   │       └── ColorPickerTemplate.js
│   │   └── Backtesting/                # 頁面二（空結構，備用）
│   │       ├── routes.py
│   │       ├── service.py
│   │       ├── repository.py
│   │       └── backtesting.html        # extends base.html（空佔位）
│   ├── Lib/                            # 後端共用函式（仿 petshop lib/）
│   │   ├── db.py                       # MySQL 連線工具（取代 SQLite database.py）
│   │   ├── market_data.py              # 共用市場數據查詢（原 routers/market_data.py）
│   │   ├── stocks.py                   # 共用股票清單查詢（原 routers/stocks.py）
│   │   └── data_sync/                  # 數據同步/爬蟲模組（SQL 全改 MySQL）
│   │       ├── sync_market_data.py
│   │       ├── fetch_tickers.py
│   │       ├── fetch_basis_data.py
│   │       ├── gap_scanner.py
│   │       ├── validate_db.py
│   │       ├── data_validator.py
│   │       ├── check_db_count.py
│   │       ├── verify_setup.py
│   │       └── config.py
│   ├── Static/                         # 公開前端靜態資源
│   │   ├── css/
│   │   │   └── styles.css              # 全域樣式（原根目錄 styles.css）
│   │   └── js/
│   │       ├── layout.js               # GoldenLayout 初始化與面板 Dock 設定
│   │       ├── app.js                  # 全域腳本
│   │       └── utils/                  # 共用前端工具
│   │           ├── chartRenderer.js
│   │           ├── chartIndicators.js
│   │           └── indicatorRegistry.js
│   ├── Template/                       # 全域 layout（仿 petshop templates/）
│   │   └── base.html                   # 主框架：Header + HTMX 分頁 + GoldenLayout 容器
│   └── Env/                            # 環境設定（仿 petshop env/）
│       ├── fastapi/
│       │   └── Dockerfile
│       ├── mysql/
│       │   └── init.sql                # MySQL Schema（market_data + user_data）
│       ├── nginx/
│       │   └── nginx.conf
│       └── requirements.txt
├── Test/                               # 測試與除錯腳本
│   ├── check_db_simple.py
│   ├── tmp_check_db.py
│   └── debug/                          # 原 debug/ 資料夾
├── Spec/                               # 所有文件（.md）
│   ├── project_structure.md            # 更新為新架構說明
│   ├── filter_v4.5.md
│   └── ...（其他歷史備忘錄）
├── secrets/                            # 敏感資料（加入 .gitignore）
│   ├── mysql_root_password.txt
│   ├── mysql_user_password.txt
│   └── secret_key.txt
├── docker-compose.yml                  # MySQL + FastAPI + Nginx
├── start_server.bat                    # 啟動腳本（docker-compose up）
└── .gitignore
```

---

## 各階段修改說明

### 階段一：環境與基礎建設

#### [NEW] `docker-compose.yml`
- 包含 `mysql`（MySQL 8.0）、`fastapi`、`nginx` 三個 service
- `mysql` 掛載 `App/Env/mysql/init.sql` 初始化兩個 schema
- 仿 petshop 使用 `secrets` 管理密碼

#### [NEW] `App/Env/mysql/init.sql`
- 建立 `market_data` database（K線、股票清單）
- 建立 `user_data` database（使用者策略）
- SQLite Schema → MySQL 語法（`AUTO_INCREMENT`、`VARCHAR`、`DECIMAL` 等）

#### [NEW] `App/config.py`
- 讀取環境變數與 secrets（仿 petshop config.py）
- `DevelopmentConfig` / `TestingConfig` / `ProductionConfig`

#### [NEW] `App/Lib/db.py`
- 取代原 `backend/data_sync/database.py` 中的 SQLite 連線
- 使用 `mysql.connector`，提供 `get_db_conn()` / `get_cursor()` 工具函式
- 仿 petshop `lib/db.py` 設計

---

### 階段二：後端 FastAPI 重構

#### [NEW] `App/app.py`
- FastAPI create_app() 工廠函式
- 掛載 Jinja2Templates、StaticFiles
- 登錄所有 Feature Router

#### [MODIFY] 所有後端 Python 檔案（SQL 語法更新）
- `sqlite3` → `mysql.connector`
- `?` 佔位符 → `%s`
- `AUTOINCREMENT` → `AUTO_INCREMENT`
- `conn.execute()` → cursor 模式
- DB 路徑改為 MySQL 連線字串

#### [MODIFY] `App/Feature/Screening/routes.py`
- `GET /screening` → `TemplateResponse("screening.html")` (Jinja2)
- HTMX 請求判斷 `HX-Request` header 回傳 HTML 片段
- 保留原有 API 路由（`/api/screening`、`/api/market-data` 等）

---

### 階段三：前端 Jinja2 + HTMX + GoldenLayout 重構

#### [NEW] `App/Template/base.html`
- 引入：HTMX CDN、GoldenLayout CDN、Tailwind CSS CDN、原有 CSS、Lightweight Charts CDN
- **Header 結構**：
  ```html
  <header>
    <!-- 左側：漢堡 + Logo -->
    <button id="sidebarToggle">☰</button>
    <div class="logo">🔷 Stock AI Filter <span>PRO</span></div>

    <!-- 中間：HTMX 分頁（含 × 關閉） -->
    <div class="tab-area">
      <button class="tab-btn active" hx-get="/screening" hx-target="#content" hx-push-url="true">
        📊 股票篩選 <span class="tab-close">×</span>
      </button>
      <button class="tab-btn" hx-get="/backtesting" hx-target="#content" hx-push-url="true">
        📈 模擬交易回測 <span class="tab-close">×</span>
      </button>
      <button class="tab-btn" hx-get="/comparison" hx-target="#content" hx-push-url="true">
        📊 策略比較 <span class="tab-close">×</span>
      </button>
      <button class="tab-add" id="addTabBtn" style="display:none">＋</button>
    </div>
    <!-- 右側：無設定齒輪（已移除） -->
  </header>
  <div id="content">{% block content %}{% endblock %}</div>
  ```

#### [NEW] `App/Static/js/layout.js`（GoldenLayout 核心）
- 管理右側兩個面板：「篩選結果區」、「K線圖區」
- Panel header 設為極細（5px），僅作拖移手把，不顯示文字
- 支援：上下互換、左右並排、堆疊 Tab、浮動視窗
- 佈局狀態存入 `localStorage`

#### [MODIFY] `App/Feature/Screening/screening.html`
- 改為 `{% extends "base.html" %}` + `{% block content %}`
- 移除 `<html>`、`<head>`、`<body>` 外層
- 篩選結果區、K線圖區包入 GoldenLayout component 容器
- 所有 `<script src>` 改為絕對 URL

---

### 階段四：Spec 與 Test 整理

- `Spec/project_structure.md` 更新為新架構說明
- 測試腳本（`check_db_simple.py`、`debug/`）移入 `Test/`

---

## 驗證計畫

### 自動化測試
目前 reference 專案無現有測試框架。計畫在 `Test/` 建立基本健康檢查：

```bash
# 啟動環境
docker-compose up -d

# 1. 確認 FastAPI 健康狀態
curl http://localhost:8000/api/health

# 2. 確認 MySQL 連線
docker-compose exec mysql mysql -u root -p -e "SHOW DATABASES;"

# 3. 確認頁面回應
curl http://localhost/screening
```

### 手動驗證步驟
1. 開啟瀏覽器至 `http://localhost/screening`，確認股票篩選頁面正常顯示
2. 點擊頂部「📈 Backtesting」分頁，確認 HTMX 無整頁跳轉切換至回測頁面，URL 更新為 `/backtesting`
3. 點擊回「📊 Screening」分頁，確認可正常切回
4. 在篩選頁面：選擇市場範圍、頻率、新增一個 SMA 指標，點擊「執行篩選」，確認 API 正常回應
5. 點擊篩選結果中的股票，確認右側 K線圖正常顯示
6. 確認「我的策略」Tab 切換正常（內層 JS Tab 不受影響）
手動驗證：
1. `http://localhost/screening` 正常顯示
2. `☰` 點擊 → Sidebar 收合/展開，右側面板自動調整大小
3. 分頁 `×` 關閉 → tab 消失，出現 `＋`；點 `＋` 可重開
4. 拖移「篩選結果區」面板到 K線圖上方 → 佈局改變；重整確認 localStorage 恢復
5. 點分頁切換 Backtesting → HTMX 無整頁跳轉
6. 篩選功能：選市場、頻率、SMA 指標 → 執行篩選 → API 正常
7. 點股票 → K線圖顯示正常；「我的策略」Tab 正常（內層 JS 不受影響）

---

## 階段五：資料遷移與備份機制

> [!IMPORTANT]
> 使用者**每次啟動系統（包含執行篩選、更新數據）均透過 `docker compose up` 重新建立環境**。
> 因此 `App/Env/data/` 下的 `.sql` 備份檔是系統資料的唯一持久化來源，必須隨時保持最新。

---

### 5-1 新增檔案結構

```text
App/Env/
├── mysql/
│   └── init.sql                    # [既有] Schema 建表（01_）
└── data/                           # [NEW] 種子資料備份目錄
    ├── seed_market_data.sql        # [自動產生] market_data schema 完整備份
    └── seed_user_data.sql          # [自動產生] user_data schema 完整備份

App/Lib/data_sync/
├── migrate_sqlite_to_mysql.py      # [NEW] 一次性：SQLite → MySQL 遷移腳本
└── backup_mysql.py                 # [NEW] 備份工具：mysqldump → App/Env/data/

docker-compose.yml                  # [MODIFY] 掛載 App/Env/data/ 為 initdb 來源
```

---

### 5-2 Docker 自動還原機制（docker compose up 流程）

```
docker compose up
  └─▶ mysql container 啟動
        └─▶ 資料 Volume 為空（全新或 down -v 後）
              └─▶ /docker-entrypoint-initdb.d/ 依序執行：
                    01_init.sql            ← 建立 Schema 與資料表
                    02_seed_market_data.sql ← 匯入 market_data 備份（約 479 萬筆）
                    03_seed_user_data.sql   ← 匯入 user_data 備份（策略等）
```

**`docker-compose.yml` 修改重點：**
```yaml
volumes:
  - ./App/Env/mysql/init.sql:/docker-entrypoint-initdb.d/01_init.sql
  - ./App/Env/data/seed_market_data.sql:/docker-entrypoint-initdb.d/02_seed_market_data.sql
  - ./App/Env/data/seed_user_data.sql:/docker-entrypoint-initdb.d/03_seed_user_data.sql
```

> [!NOTE]
> Docker 只在 Volume 完全空白時執行 `initdb.d`。
> 若已有舊資料需還原最新備份，需先執行 `docker compose down -v` 再 `docker compose up`。

---

### 5-3 一次性遷移腳本 `migrate_sqlite_to_mysql.py`

**執行時機**：僅需執行一次，將 `reference/extracted/backend/data/` 的 SQLite 資料匯入 MySQL。

**資料規模**：
| 資料表 | 筆數 | 說明 |
|--------|------|------|
| `stock_meta` | 13,052 | 股票元數據 |
| `market_data_ohlcv` | ~479 萬 | K 線資料（分批寫入） |
| `download_failures` | 89 | 下載失敗記錄 |
| `strategies` | 8 | 使用者策略 |

**設計要點**：
- 使用 `executemany()` 分批寫入（每批 500 筆），避免記憶體爆炸
- 完成後自動呼叫 `backup_mysql.py` 產生初始備份 `.sql`
- 欄位對應：SQLite `market_data` → MySQL `market_data_ohlcv`（配合 `init.sql` 新表名）

---

### 5-4 備份工具 `backup_mysql.py`

**功能**：呼叫系統 `mysqldump`，將 MySQL 最新資料匯出為 `.sql` 備份檔至 `App/Env/data/`。

```python
# 使用方式
from App.Lib.data_sync.backup_mysql import backup_all

backup_all()
# 輸出：App/Env/data/seed_market_data.sql
#       App/Env/data/seed_user_data.sql
```

---

### 5-5 爬蟲自動備份時機設計

根據 `reference/extracted/backend/data_sync/config.py` 定義的排程：

| 爬蟲模式 | 原始排程 | 備份時機 |
|----------|---------|---------|
| `incremental_update` | 週一至週五 18:00（`0 18 * * 1-5`）| **每次 `incremental_update()` 完成後自動備份** |
| `progressive_backfill` | 每日 02:00（`0 2 * * *`）| **每次 `progressive_backfill()` 完成後自動備份** |
| `gap_scanner` | 每週日 03:00（`0 3 * * 0`）| 不觸發備份（僅補漏，非新增資料） |

**實作位置**：在 `App/Lib/data_sync/sync_market_data.py` 對應函式結尾插入：

```python
# incremental_update() 結尾
from App.Lib.data_sync.backup_mysql import backup_all
logging.info("Incremental update complete. Triggering backup...")
backup_all()
logging.info("Backup written to App/Env/data/")

# progressive_backfill() 結尾（同上）
```

> [!WARNING]
> `mysqldump` 輸出的 `.sql` 檔案會覆蓋 `App/Env/data/` 舊版本。
> 如需保留歷史快照，可在備份前加上日期戳記（如 `seed_market_data_20260303.sql`），但這會使 Docker 自動還原失效（需固定檔名）。建議只保留最新版本。

---

### 5-6 執行順序（首次建立完整環境）

```bash
# Step 1：啟動 MySQL（空 Volume）
docker compose up -d mysql

# Step 2：等待 MySQL 就緒（約 20 秒）

# Step 3：執行一次性遷移（SQLite → MySQL）
python App/Lib/data_sync/migrate_sqlite_to_mysql.py
# → 自動備份至 App/Env/data/seed_market_data.sql
# → 自動備份至 App/Env/data/seed_user_data.sql

# Step 4：往後每次啟動只需：
docker compose down -v && docker compose up -d mysql
# MySQL 啟動時自動從 .sql 還原所有資料
```
