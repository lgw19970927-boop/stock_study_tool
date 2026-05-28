# Stock Study Tool — 計畫書

> **版本：** 2.0.0 | **日期：** 2026-05-26
>
> **文件定位：** 本文件以目前 Codebase 為唯一事實來源整理，供開發者在**新增功能、維護或重構**時同步更新。
> 若 docs 既有文件與程式碼不一致，**以程式碼為準，並同步修正本文件**。


---

## 目錄

1. [專案概述](#1-專案概述)
2. [技術選型](#2-技術選型)
3. [系統架構圖](#3-系統架構圖)
4. [業務驅動設計](#4-業務驅動設計)
5. [資料庫設計（ERD）](#5-資料庫設計erd)
6. [核心功能說明與流程](#6-核心功能說明與流程)
7. [API 設計規範](#7-api-設計規範)
8. [前端設計規範](#8-前端設計規範)
9. [後端設計規範](#9-後端設計規範)
10. [部署架構](#10-部署架構)
11. [測試策略](#11-測試策略)
12. [實作步驟與里程碑](#12-實作步驟與里程碑)

---

## 1. 專案概述

### 1.1 產品定位

Stock Study Tool 是一個以**美股分析**為核心的 Web 系統，提供量化條件篩選、K 線圖形型態辨識、市場資料管理與資金風險計算等功能，並透過背景排程同步完整美股 OHLCV 歷史資料。

| 對比維度 | 一般看盤工具 | 本系統 |
|---------|-------------|--------|
| 資料來源 | 即時串流 API | 本地 MySQL（yfinance 同步） |
| 篩選方式 | 固定條件組合 | 自訂指標條件（SMA、Bollinger 等） |
| 進度回饋 | 一次性查詢 | SSE 串流（逐股推送） |
| 型態辨識 | 無 | 規則法盤整 + YOLO 模型 |
| 部署方式 | 外部 SaaS | 本地 Docker Compose（支援 NVIDIA GPU） |

### 1.2 核心功能清單

| 功能 | 類型 | 優先級 | 現況 |
|------|------|--------|------|
| 股票指標篩選（含 SSE 進度） | 核心 | P0 | 實作完成 |
| K 線圖檢視（主圖 + VOL/RSI 副圖） | 核心 | P0 | 實作完成 |
| 圖表設定（雙 Y 軸、副圖高度等） | 核心 | P0 | 實作完成 |
| 型態辨識（規則法盤整 + YOLO SSE） | 進階 | P1 | 實作完成 |
| 市場資料 API（清單 / K 線 / 根數驗證） | 核心 | P0 | 實作完成 |
| 策略 CRUD（指標條件存取） | 核心 | P0 | 實作完成 |
| 資金與風險管理頁面 | 進階 | P1 | 實作完成（前端主導，無後端 API） |
| 背景資料同步（增量 / 補全 / 缺口掃描 / 備份） | 維運 | P0 | 實作完成 |
| 篩選結果 CSV 匯出 | 便利 | P2 | 實作完成（前端，results_table.js，無後端 API） |
| 模擬交易回測 | 進階 | P1 | 尚未展開（本 PLAN 暫不說明） |

> 📝 **CSV 匯出實作說明**：由 `results_table.js` 於瀏覽器端直接從 `window.state.lastResults` 生成 CSV（含 UTF-8 BOM），提供「完整篩選結果」與「僅股票代碼」兩種模式，無需後端 API 端點。

### 1.3 系統邊界

本工具**非**即時報價系統，所有價格資料來自本地 MySQL 資料庫（由 `data_sync` 容器定期從 yfinance 同步）。

依據：[../app/app.py](../app/app.py)、[../app/feature/__init__.py](../app/feature/__init__.py)

---

## 2. 技術選型

### 2.1 完整技術棧

```
後端框架      FastAPI 0.x + Uvicorn（4 workers）
資料庫        MySQL 8.0（雙 schema：market_data + user_data）
DB 存取       mysql-connector-python（手寫 SQL + Connection Pool）
模板引擎      Jinja2（full page + HTMX fragment 雙模式）
前端互動      HTMX v1.9.12（分頁切換、局部渲染）
前端 JS       Vanilla JS ES6+（window namespace 模組化）
圖表庫        Lightweight Charts v5.0.0（K 線 + 副圖）
CSS 工具鏈    Tailwind CSS v3.4.3 + PostCSS + Autoprefixer
資料同步      APScheduler（BackgroundScheduler，data_sync 容器）
資料來源      yfinance（Python）
ML 型態辨識   ultralytics YOLOv8 + PyTorch（CUDA 12.1，fastapi 容器）
反向代理      Nginx（靜態資源直出 + SSE 無緩衝代理）
容器化        Docker Compose（4 services + Docker Secrets）
```

### 2.2 技術選型理由

| 技術 | 選擇理由 |
|------|---------|
| FastAPI | 原生非同步支援 SSE/StreamingResponse，Pydantic 型別驗證，auto OpenAPI |
| Uvicorn 4 workers | 多核充分利用，每 worker 獨立連線池避免跨 worker pool 競爭 |
| MySQL 8.0 | 雙 schema 分離市場資料與用戶資料，支援複合 PK（symbol+timeframe+datetime）大量時序資料 |
| mysql-connector-python | 支援 connection pool + dictionary cursor，避免 ORM overhead（大量 OHLCV 讀取場景） |
| HTMX | 無需 SPA 框架即可實現分頁切換與 SSE，保持 Jinja2 SSR 優先 |
| Lightweight Charts v5 | 輕量（< 100KB），支援多 pane 副圖架構，滿足 VOL/RSI 副圖需求 |
| APScheduler | 純 Python 排程庫；使用 `BackgroundScheduler`（在獨立執行緒中執行定時任務，不阻塞主執行緒），無需 Redis/RabbitMQ 等外部 Broker，整合於 data_sync 容器內 |
| Tailwind CSS | JIT 模式 + PostCSS，編譯後 CSS 體積最小化，content 掃描 feature templates |
| YOLO（ultralytics） | 遷移學習容易，懶加載避免啟動延遲，CUDA runtime 已在 fastapi Dockerfile 內建 |

### 2.3 版本固定清單（關鍵依賴）

| 套件 | 版本 | 鎖定原因 |
|------|------|---------|
| HTMX | 1.9.12 | CDN 直引，介面與 HX-Request 頭部行為穩定 |
| Lightweight Charts | 5.0.0 | 副圖 pane API 在此版本穩定 |
| Tailwind CSS | 3.4.3 | `tailwind.config.js` 與 `postcss.config.js` 對應此版 |
| CUDA | 12.1 | `nvidia/cuda:12.1.0-runtime-ubuntu22.04` 基礎映像鎖定 |

依據：[../package.json](../package.json)、[../env/fastapi/Dockerfile](../env/fastapi/Dockerfile)

> 📝 **維護提示**：新增 Python 依賴 → 同步更新 `env/fastapi/requirements.txt`；新增 Node 依賴 → 更新 `package.json`。升級 Lightweight Charts 版本前請驗證副圖 `pane.setHeight()` / `pane.getHeight()` 行為。

---

## 3. 系統架構圖

### 3.1 高階系統架構

```
┌────────────────────────────────────────────────────────────────┐
│                        Client (Browser)                        │
│                                                                │
│   Jinja2-rendered HTML  ·  Tailwind CSS  ·  HTMX v1.9.12      │
│   Vanilla JS ES6+ + Lightweight Charts v5.0.0                  │
└──────────────────────────────┬─────────────────────────────────┘
                               │ HTTP / SSE
┌──────────────────────────────▼─────────────────────────────────┐
│                    Nginx (:80)  [nginx:alpine]                  │
│                                                                │
│  /static/*  ──alias──▶  app/static/       (CSS, JS, favicon)  │
│  /feature/* ──alias──▶  app/feature/      (per-feature assets) │
│  /api/*/stream ─proxy─▶ FastAPI (buffering OFF, timeout 600s)  │
│  /*         ──proxy──▶  FastAPI (buffering ON,  timeout 300s)  │
└──────────────────────────────┬─────────────────────────────────┘
                               │ upstream keepalive 32
┌──────────────────────────────▼─────────────────────────────────┐
│               FastAPI (:8000)  [uvicorn --workers 4]           │
│                                                                │
│  ┌────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │  screening     │  │ risk_management │  │ data_management│  │
│  │  /screening    │  │ /risk-management│  │ /api/stocks    │  │
│  │  /api/screen…  │  │                 │  │ /api/market-…  │  │
│  │  /api/pattern… │  │                 │  │                │  │
│  └───────┬────────┘  └─────────────────┘  └───────┬────────┘  │
│          │                                        │           │
│  ┌───────▼────────────────────────────────────────▼────────┐  │
│  │              lib/db.py  Connection Pool Layer            │  │
│  │   _market_pool (size=10/worker)  _user_pool (size=2/wkr) │  │
│  └───────┬────────────────────────────────────────┬────────┘  │
└──────────┼────────────────────────────────────────┼───────────┘
           │                                        │
┌──────────▼──────────────┐            ┌────────────▼────────────┐
│  MySQL 8.0 (:3306)      │            │  MySQL 8.0 (:3306)      │
│  schema: market_data    │            │  schema: user_data      │
│  ├─ stock_meta          │            │  ├─ strategies          │
│  ├─ market_data_ohlcv   │            │  └─ screening_results   │
│  ├─ download_failures   │            └─────────────────────────┘
│  ├─ backfill_history    │
│  ├─ data_gaps           │
│  └─ job_state           │
└─────────────────────────┘
           ▲
           │ incremental / backfill / gap_scan / backup
┌──────────┴──────────────────────────────────────────────────────┐
│              data_sync container  [APScheduler]                 │
│                                                                 │
│   startup:  incremental(1d/1h/5m/1m) → backfill(1d/1h)        │
│   Mon-Fri 18:00 → incremental_update(1d/1h/5m/1m)              │
│   Daily   02:00 → progressive_backfill(1d/1h/5m)              │
│   Sun     03:00 → gap_scanner / ensure_data                    │
│   Weekly  04:00 → backup_market_data / backup_user_data        │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 請求流轉（含 HTMX 分頁）

```
用戶點擊 Navbar Tab「股票篩選」
         │
         │ hx-get="/screening"  hx-target="#content"
         ▼
Nginx  ──▶  FastAPI  GET /screening
                      │
              HX-Request header?
              ├── 有 → TemplateResponse("screening/screening_fragment.html")
              └── 無 → TemplateResponse("screening/screening.html")
                      │
                      ▼
        瀏覽器 DOM swap #content
                      │
                      ▼
         前端 JS 初始化（DOMContentLoaded → ScreeningPage.init()）
```

### 3.3 SSE 串流流轉

```
前端 EventSource("/api/screening/filter/stream?...")
         │
Nginx    │  proxy_buffering off; proxy_read_timeout 600s;
         ▼
FastAPI  StreamingResponse(event_stream(), media_type="text/event-stream")
         │
         │  逐股 screen_single_stock（run_in_executor → thread pool）
         │
         ├──▶  data: {"type":"progress","current":N,"total":M,...}\n\n
         ├──▶  data: {"type":"progress",...}\n\n
         └──▶  data: {"type":"done","stocks":[...],"statistics":{...}}\n\n
```

**關鍵物件說明：**

| 物件 | 說明 |
|------|------|
| `EventSource` | 瀏覽器原生 Web API，訂閱 `text/event-stream` 端點，自動解析 `data: ...\n\n` 格式並觸發 `onmessage` 事件；斷線時自動重連。前端以 `new EventSource(url)` 建立連線，無需額外函式庫。 |
| `StreamingResponse` | FastAPI 串流回應類別（`fastapi.responses`）。傳入 async generator，HTTP 連線保持開啟，generator 每次 `yield` 的字串立即推送至客戶端而不緩衝整個回應。 |
| `media_type="text/event-stream"` | SSE 標準 MIME 類型，告知瀏覽器以 Server-Sent Events 協定解析回應資料流。Nginx 需設定 `proxy_buffering off` 才不會在代理層緩衝 SSE 資料。 |

### 3.4 專案目錄結構（主體）

```
stock_study_tool/
│
├── app/                              # 主應用程式
│   ├── app.py                        # FastAPI create_app 工廠
│   ├── config.py                     # 環境設定（development/testing/production）
│   ├── lib/
│   │   └── db.py                     # Connection Pool + Cursor Context Manager
│   ├── template/
│   │   └── base.html                 # 全域 Jinja2 骨架（CDN、Navbar、#content）
│   ├── static/
│   │   ├── css/
│   │   │   ├── input.css             # Tailwind 單一入口（@import 各模組）
│   │   │   ├── variables.css         # 設計 token（顏色、字型、間距）
│   │   │   ├── layout.css            # Navbar / Sidebar / Content 排版
│   │   │   ├── components.css        # 可重用元件樣式（@layer components）
│   │   │   ├── tabs.css              # 分頁列樣式
│   │   │   ├── animations.css        # 過場動畫
│   │   │   └── tailwind.output.css   # 編譯輸出（Docker Stage 1 產生）
│   │   └── js/
│   │       ├── app.js                # 全域初始化入口
│   │       ├── layout.js             # Tab 管理 + Sidebar 收合
│   │       ├── layout-screening.js   # 篩選頁專屬 layout 邏輯
│   │       └── config.js             # 前端常數設定
│   └── feature/
│       ├── __init__.py               # register_features()：掛載所有 router
│       ├── screening/                # 【業務模組】股票篩選
│       │   ├── routes.py             # /screening, /api/screening/*, /api/strategies
│       │   ├── service.py            # screen_stocks, screen_single_stock
│       │   ├── models.py             # Pydantic 模型（Request/Response）
│       │   ├── screening.html        # 完整頁（base.html 繼承）
│       │   ├── screening_fragment.html # HTMX fragment
│       │   ├── indicators/           # 指標計算子模組
│       │   │   ├── service.py        # calculate_indicators, evaluate_condition
│       │   │   └── modules/          # 垂直切片：sma/ bollinger/ volume/ amount/
│       │   ├── pattern/              # 型態辨識子模組
│       │   │   ├── routes.py         # /api/screening/pattern-recognition/stream
│       │   │   └── service.py        # recognize_patterns, detect_consolidation
│       │   ├── chart/                # K 線圖子模組
│       │   │   ├── kline_viewer/     # chart_controller.js（LW 主/副圖）
│       │   │   └── chart_management/ # 圖表設定 modal
│       │   └── components/           # 篩選頁 UI 元件（前端）
│       ├── risk_management/          # 【業務模組】資金與風險管理
│       │   ├── routes.py             # /risk-management
│       │   ├── risk_management.html
│       │   ├── risk_management_fragment.html
│       │   ├── risk_management.js    # 主控 JS
│       │   ├── risk_management.css
│       │   └── components/           # params/ overview/ portfolio/
│       └── data_management/          # 【業務模組】市場資料管理
│           ├── sync/
│           │   ├── market_data.py    # /api/stocks, /api/market-data/*
│           │   ├── sync_market_data.py # 同步引擎（增量/補全/缺口）
│           │   ├── config.py         # 同步參數設定
│           │   ├── data_validator.py  # OHLCV 資料品質驗證（純函式）
│           │   ├── fetch_tickers.py   # NASDAQ Trader 股票清單下載
│           │   ├── fetch_basis_data.py# SPY/全股基準 K 線下載工具
│           │   ├── gap_scanner.py     # 資料缺口掃描器
│           │   └── migrate_sqlite_to_mysql.py # 一次性 SQLite→MySQL 遷移
│           └── backup/
│               └── backup_mysql.py   # mysqldump 備份工具
│
├── env/
│   ├── fastapi/
│   │   ├── Dockerfile                # 雙階段：Node CSS build → CUDA Python
│   │   └── requirements.txt
│   ├── data_sync/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   └── scheduler.py              # APScheduler 排程入口
│   ├── mysql/
│   │   ├── init.sql                  # Schema DDL + 索引 + GRANT
│   │   └── seed/                     # 初始資料（還原備份用）
│   └── nginx/
│       └── nginx.conf
│
├── docker-compose.yml
├── package.json                      # Node 依賴（Tailwind CLI）
├── tailwind.config.js
├── postcss.config.js
├── secrets/                          # Docker Secrets 來源檔案
│   ├── mysql_root_password.txt
│   ├── mysql_user_password.txt
│   └── secret_key.txt
├── tools/
│   └── data_sync_observer.py         # 本機同步觀察工具
│
├── pytest.ini                        # pytest 設定（pythonpath, markers）
├── .github/
│   └── workflows/
│       ├── ci-test.yml               # Tier 1 unit+guard + lint
│       └── ci-integration.yml        # Tier 3 integration+smoke（排程/手動）
│
└── tests/                            # 測試（詳見 §11）
    ├── conftest.py                   # 全域 fixture
    ├── screening/                    # 篩選/指標測試（14 檔）
    ├── guard/                        # 檔案守護測試（1 檔）
    ├── core/                         # 核心基礎設施測試（2 檔）
    ├── integration/                  # 整合測試（3 檔）
    ├── smoke/                        # DB 煙霧測試（2 檔）
    ├── scripts/                      # 手動腳本（不被 pytest 收集）
    └── e2e/                          # E2E 測試（Playwright）
```

> 📝 **維護提示**：新增 feature 時，建立 `app/feature/<name>/` 目錄後須在 `app/feature/__init__.py` 的 `register_features()` 內 `app.include_router(...)` 才會生效。同步更新本節目錄樹。

---

## 4. 業務驅動設計

### 4.1 設計原則

本系統採用**業務模組驅動（Feature-First）+ Service Layer** 架構：

- 模組按業務功能切分，每個 feature 自帶 `routes / service / models / template / js / css`
- `routes.py` 只負責 HTTP 進出（解析、組裝、SSE 封裝）
- `service.py` 持有業務邏輯與資料計算，**不直接操作 HTTP 物件**
- 資料存取透過 `lib/db.py` 的 cursor context manager，無 ORM 抽象層

### 4.2 模組邊界圖

```
┌───────────────────────────────────────────────────────────────┐
│                    Stock Study Tool 業務核心                   │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                    screening                            │  │
│  │  routes.py ──▶ service.py ──▶ indicators/service.py    │  │
│  │                          └──▶ pattern/service.py       │  │
│  │  chart/   （前端 K 線圖，依賴 data_management API）     │  │
│  └────────────────────────────┬────────────────────────────┘  │
│                               │ 讀取 market_data_ohlcv        │
│  ┌────────────────────────────▼────────────────────────────┐  │
│  │                  data_management                        │  │
│  │  sync/market_data.py  （API 層）                         │  │
│  │  sync/sync_market_data.py （同步引擎，data_sync 容器用） │  │
│  │  backup/backup_mysql.py                                 │  │
│  └────────────────────────────┬────────────────────────────┘  │
│                               │ 讀寫 market_data / user_data  │
│  ┌────────────────────────────▼────────────────────────────┐  │
│  │                    lib/db.py                            │  │
│  │  _market_pool  ──▶  schema: market_data                 │  │
│  │  _user_pool    ──▶  schema: user_data                   │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │               risk_management  （獨立）                  │  │
│  │  routes.py（頁面路由）  ← 無後端 API，全前端計算         │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

### 4.3 模組間依賴規則

```
允許的依賴方向（→ 可以 import）：
  screening          → lib/db, indicators/*, pattern/*
  data_management    → lib/db
  risk_management    → （無後端依賴，僅頁面路由）
  lib/db             → （無業務依賴，純基礎設施）

禁止循環依賴：
  lib/db       ✗→ 任何 feature
  screening    ✗→ risk_management
  pattern/*    ✗→ screening/service.py（避免循環）
```

### 4.4 Pydantic 模型位置規則

| 模型 | 位置 | 說明 |
|------|------|------|
| `ScreeningRequest`, `ScreeningResponse`, `StockResult` | `screening/models.py` | 篩選核心模型 |
| `StrategyCreateRequest`, `StrategyUpdateRequest`, `StrategyItem` | `screening/models.py` | 策略 CRUD 模型 |
| `OHLCBar`, `MarketDataResponse`, `StocksResponse`, `StockMeta` | `screening/models.py` | K 線與股票清單模型（data_management 共用） |

依據：[../app/feature/__init__.py](../app/feature/__init__.py)、[../app/feature/screening/service.py](../app/feature/screening/service.py)、[../app/lib/db.py](../app/lib/db.py)

> 📝 **維護提示**：新增 `screening` 子功能的 Pydantic 模型請放入 `screening/models.py`；若需跨模組共用，放入 `lib/` 下的新 `schemas.py`（目前尚無，按需建立）。

---

## 5. 資料庫設計（ERD）

### 5.1 Schema 分離策略

| Schema | 用途 | 存取模組 |
|--------|------|---------|
| `market_data` | OHLCV 市場資料、同步狀態 | screening、data_management、data_sync |
| `user_data` | 用戶策略、篩選結果 | screening routes（策略 CRUD） |

### 5.2 market_data Schema 實體關係

```
┌──────────────────────────────────────────────────────────────┐
│  stock_meta                                                  │
├──────────────────────────────────────────────────────────────┤
│  symbol         VARCHAR(20)  PK                              │
│  name           VARCHAR(255)                                 │
│  market         VARCHAR(20)   ← 'Listed', 'OTC', 'IPO'      │
│  status         VARCHAR(20)   ← 'Active', 'Delisted'         │
│  update_tier    VARCHAR(20)   ← 'active','inactive','delisted'│
│  dollar_vol_20d_avg  DECIMAL(20,2)  ← tier 分類依據          │
│  last_trade_date     DATE                                    │
└──────────────┬───────────────────────────────────────────────┘
               │ 1
    ┌──────────┼──────────────────────────┐
    │ *        │ *                        │ *
┌───▼──────────────┐  ┌────────────────┐  ┌────────────────┐
│market_data_ohlcv │  │download_failures│  │  data_gaps     │
├──────────────────┤  ├────────────────┤  ├────────────────┤
│symbol   PK(複合) │  │id   INT  PK    │  │id  INT  PK     │
│timeframe PK      │  │symbol  FK      │  │symbol  FK      │
│datetime  PK      │  │interval_type   │  │interval_type   │
│open  DECIMAL     │  │attempted_at    │  │gap_start  DATE │
│high  DECIMAL     │  │error_message   │  │gap_end    DATE │
│low   DECIMAL     │  └────────────────┘  │detected_at     │
│close DECIMAL     │                      │filled_at       │
│volume BIGINT     │  ┌────────────────┐  │status          │
└──────────────────┘  │backfill_history│  └────────────────┘
                      ├────────────────┤
                      │id   INT  PK    │  ┌────────────────┐
                      │interval_type   │  │  job_state     │
                      │start_date DATE │  ├────────────────┤
                      │end_date   DATE │  │id   INT  PK    │
                      │completed_at    │  │job_name UNIKEY │
                      │total_tickers   │  │interval_type   │
                      │downloaded_count│  │status          │
                      │status          │  │last_ticker     │
                      └────────────────┘  │last_chunk_idx  │
                                          │target_start    │
                                          │target_end      │
                                          │started_at      │
                                          │updated_at      │
                                          └────────────────┘
```

### 5.3 user_data Schema 實體關係

```
┌──────────────────────────────────┐
│  strategies                      │
├──────────────────────────────────┤
│  id             INT  PK          │
│  name           VARCHAR(255)     │
│  description    TEXT             │
│  is_active      TINYINT(1)       │
│  configuration  LONGTEXT（JSON） │  ← indicators, timeframe, conditions
│  created_at     DATETIME         │
│  updated_at     DATETIME         │
└────────────┬─────────────────────┘
             │ 1
             │ * （CASCADE DELETE）
┌────────────▼─────────────────────┐
│  screening_results               │
├──────────────────────────────────┤
│  id          INT  PK             │
│  strategy_id INT  FK             │
│  symbol      VARCHAR(20)         │
│  result_date DATE                │
│  price       DECIMAL(15,4)       │
│  change_pct  DECIMAL(8,4)        │
│  volume      BIGINT              │
│  signals     LONGTEXT（JSON）    │
│  created_at  DATETIME            │
└──────────────────────────────────┘
```

### 5.4 關鍵索引策略

```sql
-- market_data_ohlcv：複合 PK 即主要查詢索引
PRIMARY KEY (symbol, timeframe, datetime)
-- 補充單欄索引（單一股票全時序 / 時間範圍掃描）
INDEX idx_data_symbol  ON market_data_ohlcv (symbol)
INDEX idx_data_time    ON market_data_ohlcv (datetime)

-- stock_meta：市場 / 狀態 / tier 過濾
INDEX idx_meta_market ON stock_meta (market)
INDEX idx_meta_status ON stock_meta (status)
INDEX idx_meta_tier   ON stock_meta (update_tier)

-- strategies / screening_results
INDEX idx_strategies_name  ON strategies (name)
INDEX idx_results_strategy ON screening_results (strategy_id)
INDEX idx_results_date     ON screening_results (result_date)
```

### 5.5 連線池策略

| Pool | 對應 Schema | 預設 Size（每 worker） | 設定來源 |
|------|------------|----------------------|---------|
| `_market_pool` | `market_data` | 10 | `MYSQL_MARKET_POOL_SIZE` env |
| `_user_pool` | `user_data` | 2 | `MYSQL_USER_POOL_SIZE` env |

FastAPI 4 workers × market pool 10 = 最多 40 條連線（需確認 MySQL `max_connections`）。

依據：[../app/lib/db.py](../app/lib/db.py)、[../app/config.py](../app/config.py)、[../env/mysql/init.sql](../env/mysql/init.sql)

> 📝 **維護提示**：新增資料表請在 `env/mysql/init.sql` 的對應 schema 區塊中加 `CREATE TABLE IF NOT EXISTS`，並同步更新上方 ERD 圖。修改欄位需加 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`（向後相容）。

---

## 6. 核心功能說明與流程

### 6.1 指標篩選（SSE 串流）

#### 6.1.1 SSE 流程

```
前端組裝 URL：GET /api/screening/filter/stream
  ?markets=listed,otc
  &indicators_json=[{"type":"sma","timeframe":"1d","parameters":{"period":20},...}]
  &time_range=1Y
         │
         ▼
routes.py → filter_stocks_stream()
  1. 解析 markets_list、indicators_list
  2. resolve_analysis_dates(time_range, start, end) → (resolved_start, resolved_end)
  3. SELECT MAX(datetime) FROM market_data_ohlcv → benchmark_date（大盤基準日）
  4. SELECT symbol,name,market FROM stock_meta WHERE status='Active'
         │
         ▼ 每股（thread pool via run_in_executor）
  5. screen_single_stock(symbol, ...) → StockResult dict 或 None
  6. 每 10 股 await asyncio.sleep(0) 讓出事件迴圈控制權
         │
         ├──▶ SSE: {"type":"progress","current":N,"total":M,"matched":K,...}
         └──▶ SSE: {"type":"done","stocks":[...],"statistics":{...}}
              （或 {"type":"error","message":"..."}）
```

**關鍵機制說明：**

| 機制 | 說明 |
|------|------|
| `run_in_executor(None, fn, *args)` | `asyncio` 方法，將同步（blocking）函式推入 thread pool 執行，以 `await` 非阻塞地等待結果。`screen_single_stock` 含 DB 查詢與 pandas 計算，屬同步/CPU-bound，用此方式推入執行緒可讓 Uvicorn worker 的事件迴圈在計算期間仍處理其他請求。`None` 表示使用 Python 預設的 `ThreadPoolExecutor`。 |
| `await asyncio.sleep(0)` | 主動讓出事件迴圈控制權（yield control），確保 SSE 進度資料及時 flush 至客戶端，避免進度條更新卡頓。每 10 股執行一次以平衡吞吐量與即時性。 |

#### 6.1.2 單股篩選邏輯 `screen_single_stock`

```
screen_single_stock(symbol, name, market, indicators, timeframe, start, end, benchmark_date)
  │
  ├── 1. 計算所需 K 棒數（max_period + warmup 30~100）
  │        EMA/MACD/RSI 需額外 100 bar warmup
  ├── 2. 換算所需日曆天數（週線×7、月線×30、日線×1.5 安全倍數）
  ├── 3. SELECT OHLCV FROM market_data_ohlcv WHERE symbol=? AND timeframe=? AND datetime>=?
  ├── 4. 若 timeframe 為 1w/1M → resample_data（週線 W-MON / 月線 MS）
  ├── 5. calculate_indicators(df, indicators) → 加入 MA/BB 欄位
  ├── 6. 依 analysis 日期範圍裁切 eval_df
  ├── 7. 逐一 evaluate_condition → matched_indicators / insufficient_indicators
  └── 8. 回傳 StockResult dict（含 price, change_percent, volume）或 None
```

#### 6.1.3 指標計算模組

| 指標型別 | 計算函式 | 位置 |
|---------|---------|------|
| `sma` | `calculate_sma(df, period)` | `indicators/modules/sma/sma.py` |
| `bollinger` | `calculate_bollinger_bands(df, period, std_dev)` | `indicators/modules/bollinger/bollinger.py` |
| `volume` | service.py 內處理 | `indicators/service.py` |
| `amount` | service.py 內處理 | `indicators/service.py` |

Bollinger 支援 preset 語意（升穿上軌/中軌、跌穿中軌/下軌），由 `_evaluate_bollinger_preset_crossover` 實作。

依據：[../app/feature/screening/routes.py](../app/feature/screening/routes.py)、[../app/feature/screening/service.py](../app/feature/screening/service.py)、[../app/feature/screening/indicators/service.py](../app/feature/screening/indicators/service.py)

> 📝 **維護提示**：新增指標 → 在 `indicators/modules/` 下建立子目錄，實作計算函式，並在 `indicators/service.py` 的 `calculate_indicators()` 中加入 `elif ind_type == "..."` 分支。同步更新本節 6.1.3 表格。

### 6.2 型態辨識（SSE 串流）

```
前端 EventSource：GET /api/screening/pattern-recognition/stream
  ?markets_str=listed,otc  &patterns_str=consolidation
  &sensitivity=75  &pattern_min=20  &pattern_max=60
  &interval=1D     &time_range=3M
         │
pattern/routes.py → pattern_recognition_stream()
  1. resolve_analysis_dates(time_range, start, end, pattern_max)
  2. interval_to_db_format(interval) → db_interval（例："1D" → "1d"）
  3. get_stocks_by_markets(markets) → stock_list
         │ 每股
  4. fetch_stock_prices(symbol, db_interval, s_date, e_date)
  5. needs_resample(interval)? → resample_prices(df, interval)
  6. recognize_patterns(df, patterns, sensitivity, pattern_min, pattern_max)
     ├── 規則法：detect_consolidation_containing_date(...)
     └── YOLO：（懶加載 ultralytics，GPU 推論）
         │
  7. SSE: progress / done / error
```

型態辨識參數：`sensitivity`（0-100，預設 75）、`pattern_min`（預設 20）、`pattern_max`（預設 60）。

依據：[../app/feature/screening/pattern/routes.py](../app/feature/screening/pattern/routes.py)、[../app/feature/screening/pattern/service.py](../app/feature/screening/pattern/service.py)

> 📝 **維護提示**：新增型態 → 在 `pattern/service.py` 的 `recognize_patterns()` 加入新 pattern key。YOLO 模型更換 → 更新懶加載路徑並驗證推論維度。

### 6.3 K 線圖瀏覽器

```
用戶點擊股票
    │
    ▼
chart_controller.js → loadStock(symbol)
    │
    ├── GET /api/market-data/{symbol}?interval=1d&time_range=1Y
    │    → FastAPI → market_data.py → MySQL → MarketDataResponse
    │
    ├── applyAxisSettings()    → 設定雙 Y 軸 / mirrorSeries
    ├── renderIndicators()     → VOL / RSI 副圖
    └── 更新 chart pane 高度   → savedHeight / _baseMainPaneHeight
```

| 副圖 | 視覺元件 | pane index |
|------|---------|------------|
| 主圖 K 線 | candlestick | pane[0] |
| VOL | histogram | pane[1] |
| RSI | line series | pane[2]（若 VOL 也啟用）|

RESAMPLE_CONFIG（`market_data.py`）：

| 輸入 interval | 來源 | 聚合規則 |
|--------------|------|---------|
| `3m` | `1m` | `3min` |
| `15m` | `5m` | `15min` |
| `30m` | `5m` | `30min` |
| `4h` | `1h` | `4h` |
| `1w` | `1d` | `W-MON` |
| `1M` | `1d` | `MS` |
| `1y` | `1d` | `YS` |

依據：[../app/feature/data_management/sync/market_data.py](../app/feature/data_management/sync/market_data.py)、[../app/feature/screening/chart/kline_viewer/chart_controller.js](../app/feature/screening/chart/kline_viewer/chart_controller.js)

> 📝 **維護提示**：新增 interval → 在 `market_data.py` 的 `RESAMPLE_CONFIG` 字典加入鍵值，並更新本節表格。新增副圖 → 更新 `chart_controller.js` 的 pane 管理邏輯與本節 pane index 表格。

### 6.4 策略 CRUD

策略設定以 JSON 格式儲存於 `user_data.strategies.configuration`：

```json
{
  "markets": ["listed", "otc"],
  "frequency": "daily",
  "indicators": [
    {
      "type": "sma",
      "timeframe": "1d",
      "parameters": {"period": 20},
      "conditions": [{"left": "close", "operator": ">", "right": "MA20"}]
    }
  ]
}
```

| Method | Path | 說明 |
|--------|------|------|
| GET | `/api/strategies` | 讀取全部策略清單 |
| POST | `/api/strategies` | 新增（`StrategyCreateRequest`） |
| PUT | `/api/strategies/{id}` | 更新（`StrategyUpdateRequest`，欄位可選） |
| DELETE | `/api/strategies/{id}` | 刪除（CASCADE 清除 screening_results） |

依據：[../app/feature/screening/routes.py](../app/feature/screening/routes.py)（策略 CRUD 段落）

### 6.5 市場資料 API

| 路徑 | 功能 | 關鍵 Query 參數 |
|------|------|----------------|
| `GET /api/stocks` | 股票清單 | `market`, `status` |
| `GET /api/market-data/kline-count` | K 線根數驗證 | `interval`, `time_range`, `analysis_start_date`, `analysis_end_date` |
| `GET /api/market-data/{symbol}` | 單一股票 K 線 | `interval`, `time_range`, `start_date`, `end_date` |

`kline-count` 端點優先查詢 `SPY` → `AAPL` → `QQQ`，計算指定期間實際 K 棒數量，供前端篩選前驗證資料量是否充足。

依據：[../app/feature/data_management/sync/market_data.py](../app/feature/data_management/sync/market_data.py)

### 6.6 資金與風險管理頁面

後端僅提供頁面路由，所有計算邏輯在前端 JS 執行（含 localStorage 持久化）。

```
GET /risk-management
  HX-Request? → risk_management_fragment.html
           : → risk_management.html

前端 JS 模組：
  window.RiskParams.*    → 參數設定（帳戶資金、風險比例等）
  window.RiskOverview.*  → 風險概況計算與顯示
  window.PortfolioBlock.*→ 持倉部位管理表格
```

依據：[../app/feature/risk_management/routes.py](../app/feature/risk_management/routes.py)、[../app/feature/risk_management/risk_management.js](../app/feature/risk_management/risk_management.js)

> 📝 **維護提示**：若需新增後端 API（例如持倉存取），在 `risk_management/routes.py` 新增端點，並評估是否需於 `user_data` schema 新增資料表（同步更新 Section 5）。

### 6.7 data_sync 排程與同步引擎

#### 排程時間表

| 任務 | Cron | Intervals | 說明 |
|------|------|-----------|------|
| `startup_incremental` | 容器啟動時 | 1d/1h/5m/1m | 啟動即增量更新 |
| `startup_backfill` | 容器啟動時 | 1d/1h | 啟動即補全 |
| `incremental_update` | `0 18 * * 1-5` | 1d/1h/5m/1m | 每個 interval 獨立 job |
| `progressive_backfill` | `0 2 * * *` | 1d/1h/5m | 每次往前 5 年，最多 20 年 |
| `gap_scanner` | `0 3 * * 0` | 1d/1h/5m/1m | ensure_data 全 timeframe |
| `backup_market_data` / `backup_user_data` | 週期 | — | mysqldump 備份 |

#### 同步核心流程

```
incremental_update(interval)
  │
  ├── provider_probe()  ← 實際 yfinance 下載 AAPL/MSFT/SPY 驗證（非僅 HTTP 200）
  │   失敗 → wait provider_probe_wait_seconds=300s
  │
  ├── get_tickers_from_db() → stock_meta WHERE status='Active'
  ├── apply_tier_strategy()
  │   ├── active:   dollar_vol_20d_avg >= 500,000 → 每日更新
  │   ├── inactive: stale_days >= 30 → 只在週一更新
  │   └── delisted: missing_trading_days >= 30 → 略過
  │
  ├── chunk(tickers, size=20)，批次間 delay=5s
  ├── 每批：yfinance 下載 → INSERT/UPDATE OHLCV，失敗 → download_failures
  └── job_state checkpoint：last_ticker + last_chunk_idx → 斷點續跑
```

`_recover_stale_job_state()`：容器重啟時，`status='running'` → `'interrupted'`，避免殭屍狀態。

#### Rate Limiting 設定

| 參數 | 值 | 說明 |
|------|-----|------|
| `chunk_size` | 20 | 每批 ticker 數 |
| `batch_delay_seconds` | 5 | 批次間延遲（秒） |
| `retry_backoff` | [5, 15, 60] | 各次重試等待（秒） |
| `provider_probe_wait_seconds` | 300 | probe 失敗後等待（秒） |
| `provider_probe_symbols` | ['AAPL','MSFT','SPY'] | probe 用標的 |

#### TIMEFRAME_SETTINGS（資料保留策略）

| timeframe | 保留策略 | DYNAMIC_START_LOOKBACK_DAYS |
|-----------|---------|----------------------------|
| `1d` | `max`（最長歷史） | 365 × 20（20 年） |
| `1h` | `2y`（滾動 2 年） | 365 × 2 |
| `5m` | `60d`（滾動 60 天） | 60 |
| `1m` | `7d`（滾動 7 天） | 7 |

依據：[../env/data_sync/scheduler.py](../env/data_sync/scheduler.py)、[../app/feature/data_management/sync/sync_market_data.py](../app/feature/data_management/sync/sync_market_data.py)、[../app/feature/data_management/sync/config.py](../app/feature/data_management/sync/config.py)

> 📝 **維護提示**：調整同步頻率 → 修改 `config.py` 的 `SCHEDULE_CONFIG[...]['schedule']` cron 字串，同步更新上方排程時間表。新增 timeframe → 在 `TIMEFRAME_SETTINGS`、`DYNAMIC_START_LOOKBACK_DAYS` 中加入新鍵，並在 `scheduler.py` 的 `INCREMENTAL_INTERVALS` / `BACKFILL_INTERVALS` 陣列中加入。

---

## 7. API 設計規範

### 7.1 路徑與命名慣例

| 類型 | 格式 | 範例 |
|------|------|------|
| 頁面路由 | `/<feature-name>` | `/screening`, `/risk-management` |
| REST API | `/api/<resource>` | `/api/stocks`, `/api/strategies` |
| SSE 串流 | `/api/<resource>/stream` | `/api/screening/filter/stream` |
| 健康檢查 | `/api/health` | — |

### 7.2 SSE 事件格式

```
data: {"type": "<event_type>", ...payload}\n\n
```

| `type` 值 | 出現時機 | 必要欄位 |
|-----------|---------|---------|
| `progress` | 每處理一股 | `current`, `total`, `matched`, `partial_stocks`, `partial_statistics` |
| `done` | 全部處理完成 | `stocks`, `statistics` |
| `error` | 例外發生 | `message` |

`Decimal` 型別由 `_sse_default` 轉為 `float` 序列化。

### 7.3 現有完整 API 清單

| Method | Path | 說明 | Request | Response |
|--------|------|------|---------|---------|
| GET | `/api/health` | 健康檢查 | — | `{"status":"ok"}` |
| GET | `/api/stocks` | 股票清單 | `?market&status` | `StocksResponse` |
| GET | `/api/market-data/kline-count` | K 線根數驗證 | `?interval&time_range` | `{"count":N}` |
| GET | `/api/market-data/{symbol}` | 單一股票 K 線 | `?interval&time_range` | `MarketDataResponse` |
| POST | `/api/screening/filter` | 同步篩選（向後相容） | `ScreeningRequest` | `ScreeningResponse` |
| GET | `/api/screening/filter/stream` | SSE 篩選 | Query params | SSE stream |
| GET | `/api/screening/pattern-recognition/stream` | SSE 型態辨識 | Query params | SSE stream |
| GET | `/api/strategies` | 策略清單 | — | `StrategyListResponse` |
| POST | `/api/strategies` | 新增策略 | `StrategyCreateRequest` | `StrategyItem` |
| PUT | `/api/strategies/{id}` | 更新策略 | `StrategyUpdateRequest` | `StrategyItem` |
| DELETE | `/api/strategies/{id}` | 刪除策略 | — | `{"deleted":true}` |

#### `/api/screening/filter/stream` Query 參數

| 參數 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `markets` | string | `"listed,otc"` | 逗號分隔市場代碼 |
| `frequency` | string | `"daily"` | 篩選頻率（保留欄位） |
| `indicators_json` | string | `"[]"` | JSON 序列化指標陣列 |
| `analysis_start_date` | string | null | YYYY-MM-DD |
| `analysis_end_date` | string | null | YYYY-MM-DD |
| `time_range` | string | null | 快捷：`1M`, `3M`, `6M`, `1Y`, `2Y`, `5Y` |

#### `resolve_analysis_dates` 解析邏輯

| 輸入 | 行為 |
|------|------|
| `start_date` + `end_date` 均有 | 直接使用 |
| 只有 `end_date` | start = end - 365 天 |
| `time_range` 快捷 | 以今日為 end，往前推算 start |
| 均無 | 以資料庫最新 K 棒日期往前 1 年 |

### 7.4 錯誤處理慣例

- Route 層以 `try/except` 包裹，拋出 `HTTPException(status_code=500)`
- SSE 串流例外 → 推送 `{"type":"error","message":"..."}` 後 return
- 尚無全域 exception handler

### 7.5 HTMX 頁面渲染慣例

```python
if request.headers.get("HX-Request"):
    return templates.TemplateResponse("feature/feature_fragment.html", context)
return templates.TemplateResponse("feature/feature.html", context)
```

依據：[../app/app.py](../app/app.py)、[../app/feature/screening/routes.py](../app/feature/screening/routes.py)、[../app/feature/data_management/sync/market_data.py](../app/feature/data_management/sync/market_data.py)

> 📝 **維護提示**：新增 API 端點 → 同步更新本節 7.3 清單。新增 SSE 端點 → 同步更新 Nginx `nginx.conf` 的 SSE proxy 規則（`proxy_buffering off`）並更新本節 7.2 事件格式說明。

---

## 8. 前端設計規範

### 8.1 模板分層架構

```
app/template/base.html
│  全域骨架（CDN 引入、Navbar、#content、{% block extra_scripts %}）
│
├── extends base.html（完整頁）
│       app/feature/screening/screening.html
│       app/feature/risk_management/risk_management.html
│
└── HTMX swap target（#content）
        app/feature/screening/screening_fragment.html
        app/feature/risk_management/risk_management_fragment.html
```

`base.html` 在 `{% block extra_scripts %}` 前只載入全域 CDN 與共用 JS（`app.js`, `layout.js`）；各 feature JS 由完整頁的 `extra_scripts` block 注入，fragment 依需要在底部條件載入。

### 8.2 全域 JS 模組（window namespace）

| 全域物件 | 位置 | 職責 |
|---------|------|------|
| `ScreeningPage` | `screening/` JS | 篩選頁主控制器（初始化、篩選流程、UI 狀態） |
| `ChartController` | `chart/kline_viewer/chart_controller.js` | LW 圖表生命週期、副圖管理、pane 高度控制 |
| `ChartSettingsModal` | `chart/chart_management/` | 圖表設定 modal（雙 Y 軸、顏色等） |
| `PatternManager` | `screening/` JS | 型態辨識流程（SSE 接收、結果標注） |
| `RiskParams` | `risk_management/components/params/` | 風險參數設定 |
| `RiskOverview` | `risk_management/components/overview/` | 風險概況計算 |
| `PortfolioBlock` | `risk_management/components/portfolio/` | 持倉部位表格管理 |

Tab 管理由 `layout.js` 的 `TABS` 陣列驅動：

```javascript
// app/static/js/layout.js
const TABS = [
  { id: 'screening',       url: '/screening',       label: '股票篩選' },
  { id: 'risk_management', url: '/risk-management', label: '資金與風險管理' },
];
```

### 8.3 CSS 層系結構

| 檔案 | 用途 | @layer |
|------|------|--------|
| `variables.css` | 設計 token（CSS 變數：顏色、字型、間距） | `:root` |
| `layout.css` | Navbar / Sidebar / Content 排版 | `utilities` |
| `components.css` | 可重用元件（按鈕、卡片、indicator-card 等） | `components` |
| `tabs.css` | 分頁列（Tab bar）樣式 | `components` |
| `animations.css` | 淡入淡出、進度條動畫 | `utilities` |

`input.css` 以 `@import` 統一匯入後由 Tailwind CLI 編譯為 `tailwind.output.css`。

### 8.4 CSS 編譯指令

```
# 開發（熱重載）
npx tailwindcss -i app/static/css/input.css -o app/static/css/tailwind.output.css --watch

# 生產（Docker Stage 1）
npm run build:css
```

`tailwind.config.js` content 掃描必須包含 `app/feature/**/*.{html,js}`，確保 feature JS 的動態 class 不被 purge。

依據：[../tailwind.config.js](../tailwind.config.js)、[../postcss.config.js](../postcss.config.js)、[../package.json](../package.json)

> 📝 **維護提示**：新增頁面 → 在 `layout.js` 的 `TABS` 陣列加入新 tab，並新增 `routes.py` 對應路由（full/fragment 雙模式）。新增全域 JS 模組 → 使用 `window.<ModuleName>` namespace，並更新本節 8.2 表格。

---

## 9. 後端設計規範

### 9.1 Application Factory 啟動流程

```
uvicorn app.app:app --workers 4
         │
         ▼
create_app(config_name=None)
  1. get_config(env_name)       ← APP_ENV 決定（development/testing/production）
  2. FastAPI(title="Stock AI Filter PRO", version="1.0.0")
  3. app.add_middleware(CORSMiddleware, allow_origins=["*"])
  4. init_db(config)            ← 建立 _market_pool(10) + _user_pool(2)
  5. app.mount("/static", StaticFiles(...))
  6. app.mount("/feature", StaticFiles(...))
  7. Jinja2Templates(directory=[template/, feature/])
  8. register_features(app)     ← 掛載 4 個 router
  9. GET "/" → RedirectResponse("/screening")
 10. GET "/api/health" → {"status":"ok"}
```

**啟動流程中的關鍵框架物件：**

| 物件 | 來源套件 | 功能說明 |
|------|---------|---------|
| `CORSMiddleware` | `fastapi.middleware.cors` | 跨來源資源共用（CORS）中介軟體。瀏覽器 Same-Origin Policy 預設禁止跨域 AJAX 請求；此 middleware 在每個回應加入 `Access-Control-Allow-Origin` 等 headers，允許指定來源的前端呼叫 API。`allow_origins=["*"]` 允許所有來源（開發便利；生產環境應改為具體 origin 清單，詳見 §9.6）。 |
| `StaticFiles` | `fastapi.staticfiles` | Starlette 靜態資源 middleware。`app.mount("/static", StaticFiles(dir))` 後，`GET /static/foo.css` 直接映射至本地檔案，不經 FastAPI 路由邏輯。本系統分別掛載 `/static`（共用靜態資源）與 `/feature`（各 feature 的 JS/CSS）；生產環境 Nginx alias 同一目錄，繞過 FastAPI 直接提供。 |
| `Jinja2Templates` | `fastapi.templating` | FastAPI 整合 Jinja2 的模板引擎包裝。`templates.TemplateResponse("page.html", {"request": req, ...})` 將 Python dict 渲染為 HTML 字串後回傳。本系統傳入 `template/`（base.html）與 `feature/`（各功能 html）兩個搜尋目錄，讓 feature html 可直接以 `{% extends "base.html" %}` 繼承基礎佈局。 |

依據：[../app/app.py](../app/app.py)

### 9.2 Config 與 Secrets 讀取機制

```
_read_secret("MYSQL_PASSWORD") 優先順序：
  1. MYSQL_PASSWORD_FILE env → 讀取其指向的檔案（Docker Secrets 標準用法）
  2. /run/secrets/mysql_password → Docker Secrets 直接掛載
  3. MYSQL_PASSWORD env → 明文 fallback（本機開發）
  4. 回傳 default
```

| 環境 | Config Class | 資料庫 |
|------|-------------|-------|
| `development` | `DevelopmentConfig` | `market_data` / `user_data` |
| `testing` | `TestingConfig` | `market_data_test` / `user_data_test` |
| `production` | `ProductionConfig` | `market_data` / `user_data` |

依據：[../app/config.py](../app/config.py)

### 9.3 DB 存取規範

```python
# 標準 cursor 使用模式（自動 commit / rollback）
with get_market_cursor() as cursor:
    cursor.execute("SELECT ...", [param])
    rows = cursor.fetchall()             # List[dict]

with get_user_cursor() as cursor:
    cursor.execute("INSERT ...", [param])
    # 成功自動 commit；例外自動 rollback
```

- 查詢參數一律用 `%s` 佔位符（防 SQL Injection）
- dictionary cursor 預設開啟，直接用鍵名存取欄位
- 不使用 ORM

依據：[../app/lib/db.py](../app/lib/db.py)

### 9.4 Feature Router 掛載順序

```python
# app/feature/__init__.py
app.include_router(market_data_router)      # /api/stocks, /api/market-data/*
app.include_router(screening_router)        # /screening, /api/screening/*
app.include_router(risk_management_router)  # /risk-management
```

具體路徑（`/api/market-data/kline-count`）需在通配路徑（`/api/market-data/{symbol}`）**之前**宣告，已透過 endpoint 宣告順序保障。

### 9.5 YOLO 懶加載規範

YOLO 模型在 `pattern/service.py` 中以懶加載初始化，避免 FastAPI 啟動延遲。FastAPI 多 worker 時，每個 worker 各自懶加載（`MPLBACKEND=Agg` + `DISPLAY=""` 防止 headless 環境報錯）。

### 9.6 已知規範缺口

- 尚未有全域 exception handler
- CORS `allow_origins=["*"]` 生產環境應改為具體 origin 清單
- logging 尚未集中化至 structured log
- 尚未抽象完整 Repository 層

依據：[../app/feature/__init__.py](../app/feature/__init__.py)、[../app/feature/screening/pattern/service.py](../app/feature/screening/pattern/service.py)

> 📝 **維護提示**：新增 feature → 在 `feature/__init__.py` 加 `include_router`。修改 config 欄位 → 同步更新三個 Config 類，並更新本節 9.2 表格。

---

## 10. 部署架構

### 10.1 容器拓樸與啟動依賴

```
┌─────────────────────────────────────────────────────────────────┐
│  docker-compose.yml                                             │
│                                                                 │
│  ┌──────────────┐                                               │
│  │   mysql      │  image: mysql:8.0                            │
│  │  (:3306)     │  healthcheck: mysqladmin ping                 │
│  └──────┬───────┘  volume: mysql_data（持久化）                 │
│         │ service_healthy                                       │
│    ┌────▼──────────────────────────┐                           │
│    │         fastapi               │  build: env/fastapi/      │
│    │         (:8000)               │  runtime: nvidia (GPU)    │
│    │  depends_on: mysql healthy    │  --workers 4              │
│    │  healthcheck: /api/health     │                           │
│    └──────┬──────────────┬─────────┘                           │
│           │ healthy      │ healthy                              │
│    ┌──────▼────────────┐ ┌──▼──────────────────────┐          │
│    │  nginx  (:80)     │ │  data_sync               │          │
│    │  image:nginx:alpine│ │  build: env/data_sync/   │          │
│    │  depends_on:fastapi│ │  depends_on: mysql       │          │
│    └───────────────────┘ │  restart: on-failure(×5) │          │
│                          └──────────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### 10.2 FastAPI Dockerfile 雙階段建置

| 階段 | 基礎映像 | 執行內容 | 輸出 |
|------|---------|---------|------|
| `css-builder` | `node:18-alpine` | `npm install` + `npm run build:css` | `tailwind.output.css` |
| 運行階段 | `nvidia/cuda:12.1.0-runtime-ubuntu22.04` | pip install + COPY app + uvicorn | 容器執行 |

強制安裝 `opencv-python-headless`（覆蓋 ultralytics 拉入的有 GUI 版本）。

依據：[../env/fastapi/Dockerfile](../env/fastapi/Dockerfile)

### 10.3 Volume 與 Secrets 掛載

| Service | 來源 | 容器內路徑 | 說明 |
|---------|------|-----------|------|
| mysql | `mysql_data` | `/var/lib/mysql` | 資料持久化 |
| mysql | `./env/mysql/init.sql` | `/docker-entrypoint-initdb.d/01_init.sql` | Schema 初始化 |
| mysql | seed 檔案 | `02_seed_*.sql` / `03_seed_*.sql` | 初次還原備份 |
| fastapi | `.` | `/workspace` | 開發時源碼熱掛載 |
| nginx | `./env/nginx/nginx.conf` | `/etc/nginx/nginx.conf:ro` | Nginx 設定 |
| nginx | `./app/static` | `/static` | 靜態資源直出 |
| nginx | `./app/feature` | `/workspace/app/feature:ro` | feature 資源直出 |
| all | secret: `mysql_root_password` | `/run/secrets/mysql_root_password` | Docker Secret |
| all | secret: `mysql_user_password` | `/run/secrets/mysql_user_password` | Docker Secret |
| fastapi | secret: `secret_key` | `/run/secrets/secret_key` | FastAPI SECRET_KEY |

### 10.4 Nginx 代理規則

| Location | 行為 | 超時 / 緩衝 |
|----------|------|------------|
| `/static/` | `alias /static/` (no-cache) | 靜態直出 |
| `/feature/` | `alias /workspace/app/feature/` (no-cache) | 靜態直出 |
| `/` | `proxy_pass fastapi` | buffering ON, read 300s |

> ⚠️ `screening/filter/stream` 與 `pattern-recognition/stream` 目前走 `/` 規則（buffering ON）。若出現緩衝問題，需補充對應 location 區塊。

依據：[../env/nginx/nginx.conf](../env/nginx/nginx.conf)

### 10.5 健康檢查機制

| Service | 指令 | 間隔 | 重試 |
|---------|------|------|------|
| mysql | `mysqladmin ping -h localhost` | 10s | 5 次 |
| fastapi | `curl -f http://localhost:8000/api/health` | 10s | 5 次（start_period 30s）|
| data_sync | restart: on-failure | — | max 5 次（delay 10s）|

依據：[../docker-compose.yml](../docker-compose.yml)

> 📝 **維護提示**：新增容器 → 更新 10.1 拓樸圖與 10.3 表格。新增 Docker Secret → 在 `docker-compose.yml` 的 `secrets:` 頂層與各 service 的 `secrets:` 清單中同步新增，並更新 `secrets/` 目錄中的來源檔案。

---

## 11. 測試策略

### 11.1 測試架構總覽

測試架構採用 **pytest** 框架，依「可共用 conftest.py fixture」原則分類至子資料夾：

```
tests/
├── conftest.py                          # 全域 fixture：project_root, read_project_file
├── screening/                           # 篩選/指標模組（14 檔）
│   ├── conftest.py                      #   sample_ohlcv_df, mock_db_cursor
│   ├── test_sma.py                      #   @unit  P0
│   ├── test_bollinger.py                #   @unit  P0
│   ├── test_evaluate_condition.py       #   @unit  P0  ★ parametrize
│   ├── test_boll_label.py               #   @unit（現有重構）
│   ├── test_calculate_indicators.py     #   @unit  P1
│   ├── test_format_helpers.py           #   @unit  P1  ★ parametrize
│   ├── test_resolve_dates.py            #   @unit  P1  ★ parametrize
│   ├── test_interval_convert.py         #   @unit  P1  ★ parametrize
│   ├── test_resample.py                 #   @unit  P1
│   ├── test_screening_models.py         #   @unit  P1
│   ├── test_routes_helpers.py           #   @unit  P1
│   ├── test_pattern_mapping.py          #   @unit  P1
│   ├── test_consolidation.py            #   @unit  P2
│   └── test_screening_service.py        #   @unit  P2（mock DB cursor）
├── guard/                               # 檔案/內容守護（1 檔）
│   └── test_tailwind_migration_guard.py #   @guard
├── core/                                # 核心基礎設施（2 檔）
│   ├── test_config.py                   #   @unit  ★ parametrize
│   └── test_data_validator.py           #   @unit  ★ parametrize
├── integration/                         # 整合測試（3 檔，需 FastAPI + DB）
│   ├── conftest.py                      #   base_url, http_get/post, test_db_session
│   ├── test_integration.py              #   @integration
│   ├── test_app_factory.py              #   @integration
│   └── test_db_schema_crud.py           #   @integration
├── smoke/                               # DB 煙霧測試（2 檔）
│   ├── conftest.py                      #   db_init fixture
│   ├── test_aame.py                     #   @smoke
│   └── test_screening_perf.py           #   @smoke
├── scripts/                             # 手動腳本（不被 pytest 收集）
│   ├── verify_A_data.py
│   ├── verify_bollinger.py / verify_bollinger_db.py / run_test.py
│   └── data_sync/ (verify_setup / validate_db / check_db_count)
└── e2e/
    └── chart_height_bug234_auto.mjs     #   Playwright
```

### 11.2 pytest 設定

`pytest.ini`（專案根目錄）統一設定 `pythonpath = .`，取代所有 `sys.path` hack。

| 項目 | 值 | 說明 |
|------|-----|------|
| `pythonpath` | `.` | 取代所有 sys.path hack |
| `testpaths` | `tests` | 測試搜尋目錄 |
| `addopts` | `-v --tb=short` | 預設輸出格式 |

自訂 markers：

| Marker | 說明 | CI Tier |
|--------|------|------|
| `@unit` | 純邏輯，無需外部依賴 | Tier 1 |
| `@guard` | 檔案存在性/內容守護 | Tier 1 |
| `@integration` | 需 FastAPI + DB | Tier 3 |
| `@smoke` | 需真實 DB + env var | Tier 3 |
| `@slow` | 執行時間較長 | — |

### 11.3 測試統計

| 子資料夾 | 測試檔數 | Marker | 共用 conftest fixture |
|----------|---------|--------|----------------------|
| `screening/` | 14 | `@unit` | `sample_ohlcv_df`, `mock_db_cursor`, `sample_indicators` |
| `guard/` | 1 | `@guard` | 繼承根 conftest |
| `core/` | 2 | `@unit` | mock env var helpers |
| `integration/` | 3 | `@integration` | `base_url`, `http_get/post`, `test_db_session` |
| `smoke/` | 2 | `@smoke` | `db_init` |
| **合計** | **22 檔（310 tests）** | | |

### 11.4 CI/CD Pipeline

```
Push/PR → Tier 1 (unit+guard) → Tier 2 (lint) → ✅ Merge Ready
                                                      │
Schedule (每日) → Tier 3 (integration+smoke+e2e) ─────┘
```

| Tier | 觸發 | Workflow | 預估時間 |
|------|------|----------|----------|
| **Tier 1** | 每次 push / PR | `.github/workflows/ci-test.yml` | ~30s |
| **Tier 2** | 每次 push / PR | 同上（ruff lint） | ~10s |
| **Tier 3** | 每日排程 / 手動 | `.github/workflows/ci-integration.yml` | ~5min |

PR Status Check：`unit-guard` 為必要檢查，`integration` 為選配參考。

依據：[../pytest.ini](../pytest.ini)、[../tests/conftest.py](../tests/conftest.py)、[../.github/workflows/ci-test.yml](../.github/workflows/ci-test.yml)、[../.github/workflows/ci-integration.yml](../.github/workflows/ci-integration.yml)

> 📝 **維護提示**：新增測試 → 依 conftest fixture 歸入對應子資料夾，加上適當 marker。新增指標/模組的單元測試放入 `tests/screening/`。完整設計細節參閱 [refactor_code/20260526_test_optimization_and_ci_plan.md](refactor_code/20260526_test_optimization_and_ci_plan.md)。

---

## 12. 實作步驟與里程碑

以下以「尚未開始實作前」視角規劃，但每一步都對應到目前已存在的 Codebase 模組。

### M0. 建立應用骨架與設定層（P0）

目標：先建立可啟動的 FastAPI 應用與環境設定。

- 建立 `create_app` 工廠與 CORS / static / template 掛載
- 建立 `config.py`（development/testing/production + `_read_secret`）
- 建立 `lib/db.py`（market pool + user pool + cursor context manager）
- 建立 Docker Compose 骨架（mysql + fastapi）與 secrets 檔案

對應：[../app/app.py](../app/app.py)、[../app/config.py](../app/config.py)、[../app/lib/db.py](../app/lib/db.py)、[../docker-compose.yml](../docker-compose.yml)

---

### M1. 建立 Feature 路由註冊與頁面基礎（P0）

目標：先有可切換的功能頁框架（HTMX 分頁）。

- 建立 `feature/__init__.py` router 註冊點
- 建立 `base.html`（Navbar、CDN、`#content`）與 `layout.js`（TABS 分頁管理）
- 完成 `screening` / `risk_management` 頁面路由（full page + HTMX fragment 雙模式）
- 建立 MySQL schema（`env/mysql/init.sql`）與 Nginx 基礎設定

對應：[../app/feature/__init__.py](../app/feature/__init__.py)、[../app/template/base.html](../app/template/base.html)、[../app/static/js/layout.js](../app/static/js/layout.js)、[../env/mysql/init.sql](../env/mysql/init.sql)

---

### M2. 完成市場資料 API 與圖表資料供應（P0）

目標：先提供前端可消費的股票清單與 K 線資料。

- 實作 `/api/stocks`（市場過濾 + status 過濾）
- 實作 `/api/market-data/{symbol}`（OHLCV + 重採樣）
- 實作 `/api/market-data/kline-count`（供前端篩選前驗證資料量）
- 建立 `RESAMPLE_CONFIG`（3m/15m/30m/4h/1w/1M/1y）

對應：[../app/feature/data_management/sync/market_data.py](../app/feature/data_management/sync/market_data.py)

---

### M3. 完成 Screening 指標引擎與 SSE（P0）

目標：提供可視化進度的篩選核心能力。

- 建立 `indicators/modules/sma/` 與 `indicators/modules/bollinger/`
- 建立 `indicators/service.py`（`calculate_indicators`, `evaluate_condition`, `resolve_analysis_dates`）
- 建立 `screening/service.py`（`screen_single_stock`, `screen_stocks`, `resample_data`）
- 建立 `/api/screening/filter/stream` SSE 端點
- 建立策略 CRUD（`/api/strategies`）

對應：[../app/feature/screening/routes.py](../app/feature/screening/routes.py)、[../app/feature/screening/service.py](../app/feature/screening/service.py)、[../app/feature/screening/indicators/service.py](../app/feature/screening/indicators/service.py)、[../app/feature/screening/models.py](../app/feature/screening/models.py)

---

### M4. 完成 K 線圖瀏覽器與圖表設定（P0）

目標：提供完整的 K 線圖檢視與設定體驗。

- 建立 `chart_controller.js`（LW 主圖 + VOL/RSI 副圖 + pane 高度管理）
- 建立圖表設定 modal（雙 Y 軸、顏色等）
- 前端串接 `/api/market-data/{symbol}` 渲染 K 線

對應：[../app/feature/screening/chart/kline_viewer/chart_controller.js](../app/feature/screening/chart/kline_viewer/chart_controller.js)、[../app/feature/screening/chart/](../app/feature/screening/chart/)

---

### M5. 完成型態辨識 SSE 與 YOLO 整合（P1）

目標：將型態辨識與篩選流程串接，支援 GPU 推論。

- 建立 `pattern/service.py`（規則法盤整偵測 + YOLO 懶加載）
- 建立 `/api/screening/pattern-recognition/stream` SSE 端點
- Dockerfile 加入 CUDA + ultralytics + opencv-python-headless

對應：[../app/feature/screening/pattern/routes.py](../app/feature/screening/pattern/routes.py)、[../app/feature/screening/pattern/service.py](../app/feature/screening/pattern/service.py)、[../env/fastapi/Dockerfile](../env/fastapi/Dockerfile)

---

### M6. 完成 Risk Management 前端模組化（P1）

目標：提供可操作的資金風險管理介面與本地計算。

- 建立 `risk_management.html` / `_fragment.html`
- 建立 params / overview / portfolio 三元件（`window.*` namespace）
- 實作 localStorage 持久化

對應：[../app/feature/risk_management/risk_management.html](../app/feature/risk_management/risk_management.html)、[../app/feature/risk_management/components](../app/feature/risk_management/components)

---

### M7. 完成容器化部署與資料同步運維（P0）

目標：可透過 Docker Compose 一鍵啟動整體服務，並自動維護資料鮮度。

- 建立 Nginx 設定（靜態資源直出 + SSE 代理 + upstream keepalive）
- 建立 `data_sync` 容器（APScheduler + incremental/backfill/gap/backup）
- 設定 `RATE_LIMIT_CONFIG` / `TIER_CONFIG` / `TIMEFRAME_SETTINGS`

對應：[../docker-compose.yml](../docker-compose.yml)、[../env/nginx/nginx.conf](../env/nginx/nginx.conf)、[../env/data_sync/scheduler.py](../env/data_sync/scheduler.py)、[../tools/data_sync_observer.py](../tools/data_sync_observer.py)

---

### M8. 完成測試架構與 CI/CD Pipeline（P1）

目標：建立可持續驗證程式碼品質的自動化測試與 CI 基礎設施。

- 建立 `pytest.ini` 與 conftest 階層（根 + 子資料夾）
- 重構現有測試（消除 sys.path hack、統一使用 fixture）
- 新增 P0~P2 單元測試（指標計算、日期解析、Config、資料驗證等，共 22 檔 310 tests）
- 建立 GitHub Actions CI（Tier 1 unit+guard / Tier 3 integration+smoke）

對應：[../pytest.ini](../pytest.ini)、[../tests/](../tests/)、[../.github/workflows/](../.github/workflows/)

---

### 備註（範圍與一致性）

- **本文件需與 Codebase 保持同步**：任何修改了路由路徑、資料表結構、容器設定、指標模組、測試架構的 PR，應同步更新對應章節
