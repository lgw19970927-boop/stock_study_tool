# 專案檔案關係與架構全覽圖 (Detailed File Architecture)

依照您的需求，這份關係圖將 **每一份關鍵檔案**（前後端邏輯、靜態資源、環境設定）的依賴關係與資料流向完全繪製出來。
因為 FastAPI 後端的內容（如 Feature 模組下的細節）非常多，這裡以樹狀關聯與箭頭完整還原了程式碼內部的 `import`、`render` 與 `include` 關係。

```mermaid
flowchart LR
    %% ================= 樣式定義 =================
    classDef python fill:#3b82f6,stroke:#1e40af,stroke-width:2px,color:#fff
    classDef html fill:#f97316,stroke:#c2410c,stroke-width:2px,color:#fff
    classDef js fill:#facc15,stroke:#ca8a04,stroke-width:2px,color:#000
    classDef css fill:#06b6d4,stroke:#0891b2,stroke-width:2px,color:#fff
    classDef config fill:#64748b,stroke:#475569,stroke-width:2px,color:#fff
    classDef container fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff
    classDef database fill:#6366f1,stroke:#4338ca,stroke-width:2px,color:#fff

    %% ================= Docker 容器層 =================
    subgraph Docker [🐳 Docker Containers]
        direction TB
        ContNginx["nginx (Port 80)"]:::container
        ContFastAPI["fastapi (Port 8000)"]:::container
        ContSync["data_sync (Crawler)"]:::container
        ContMySQL[("mysql (Port 3306)")]:::database

        ContNginx -.->|Reverse Proxy| ContFastAPI
        ContFastAPI -.->|Query/Write| ContMySQL
        ContSync -.->|Write Market Data| ContMySQL
    end

    %% ================= Env 基礎設施設定 =================
    subgraph EnvDir [📁 Env 目錄 (基礎設施)]
        direction TB
        E_Nginx["nginx/nginx.conf"]:::config
        E_FastAPI["fastapi/Dockerfile\nfastapi/requirements.txt"]:::config
        E_MySQL["mysql/init.sql\nmysql/seed/*.sql"]:::config
        E_Sync["data_sync/Dockerfile\ndata_sync/scheduler.py"]:::config

        E_Nginx -.->|Configures| ContNginx
        E_FastAPI -.->|Builds Env| ContFastAPI
        E_MySQL -.->|Initializes DB Schema| ContMySQL
        E_Sync -.->|Builds & Runs| ContSync
    end

    %% ================= App 核心邏輯 =================
    subgraph AppDir [📁 App 目錄 (原始碼)]
        direction TB

        %% App 根目錄
        AppConfig["config.py"]:::python
        AppMain["app.py (主程式)"]:::python
        AppConfig -->|Loads Settings| AppMain
        AppMain ==>|運行於| ContFastAPI

        %% Lib（後端跨 Feature 共用函式）
        subgraph LibDir [Lib (後端共用函式)]
            LibDB["db.py (DB連線池)"]:::python
        end

        %% Feature: DataManagement
        subgraph FeatureDataMgmt [Feature / DataManagement (市場資料管理)]
            direction TB
            subgraph DMSync [sync/]
                DM_Sync["config.py\nsync_market_data.py\nfetch_tickers.py\nfetch_basis_data.py\ndata_validator.py\ngap_scanner.py\nmarket_data.py\nmigrate_sqlite_to_mysql.py"]:::python
            end
            subgraph DMBackup [backup/]
                DM_Backup["backup_mysql.py"]:::python
            end
        end

        %% Feature: Screening
        subgraph FeatureScreening [Feature / Screening (股票篩選)]
            direction TB
            S_Routes["routes.py"]:::python
            S_Service["service.py"]:::python
            S_Models["models.py"]:::python
            S_Ind_Service["indicators/service.py"]:::python
            S_Pat_Service["pattern/service.py"]:::python
            S_Pat_Model["pattern/models/*.pt (AI模型)"]:::config

            S_HTML["screening.html\nscreening_fragment.html"]:::html
            S_CSS["screening.css"]:::css
            S_JS["screening.js"]:::js
            S_Block_JS["function_block/*.js\n(strategyManager, indicator_block,\ntime_range, pattern_block...)"]:::js
            S_Ind_JS["indicators/*.js\n(bollinger, sma, volume...)"]:::js

            subgraph ChartDir [chart/]
                direction TB
                S_Chart_JS["chartController.js\nchartSettingsModal.js"]:::js
                S_Chart_TPL["templates/\nChartSettingsModalTemplate.js\nColorPickerTemplate.js"]:::js
                S_Chart_CSS["chart-modal-*.css (×6)"]:::css
            end

            %% Python 邏輯依賴
            S_Routes -->|呼叫業務邏輯| S_Service
            S_Service -->|資料庫定義| S_Models
            S_Service -->|計算技術指標| S_Ind_Service
            S_Service -->|呼叫 AI 辨識| S_Pat_Service
            S_Pat_Service -.->|載入權重檔| S_Pat_Model
            S_Models -.->|對應Schema| ContMySQL

            %% 前後端橋接
            S_Routes -->|渲染 Jinja/HTMX| S_HTML

            %% 前端資源引入
            S_HTML -->|引用 UI 邏輯| S_JS
            S_HTML -->|引用 區塊邏輯| S_Block_JS
            S_HTML -->|引用 指標邏輯| S_Ind_JS
            S_HTML -->|引用 圖表控制| S_Chart_JS
            S_Chart_JS -->|引用 模板| S_Chart_TPL
            S_HTML -->|引用 樣式表| S_CSS
        end

        %% Feature: RiskManagement
        subgraph FeatureRisk [Feature / RiskManagement (資金與風險)]
            direction TB
            R_Routes["routes.py"]:::python
            R_HTML["risk_management_fragment.html\nrisk_management.html"]:::html
            R_JS["risk_management.js"]:::js
            R_Block_JS["function_block/*.js\n(overview, params, portfolio...)"]:::js
            R_CSS["risk_management.css"]:::css

            R_Routes -->|渲染 Jinja/HTMX| R_HTML
            R_HTML -->|引用 邏輯| R_JS
            R_HTML -->|引用 區塊模組| R_Block_JS
            R_HTML -->|引用 樣式表| R_CSS
        end

        %% Feature: Backtesting
        subgraph FeatureBacktest [Feature / Backtesting (模擬交易)]
            direction TB
            B_Routes["routes.py"]:::python
            B_HTML["backtesting_fragment.html\nbacktesting.html"]:::html
            B_Routes -->|渲染 Jinja/HTMX| B_HTML
        end

        %% App 路由掛載
        AppMain -->|include_router| S_Routes
        AppMain -->|include_router| R_Routes
        AppMain -->|include_router| B_Routes

        %% Lib/db.py 被引用
        AppMain -->|import db| LibDB
        S_Service -->|import db| LibDB
        DM_Sync -->|import db| LibDB

        %% scheduler.py 呼叫 DataManagement
        E_Sync -.->|import DataManagement.sync| DM_Sync
        E_Sync -.->|import DataManagement.backup| DM_Backup

        %% Global Static & Template
        subgraph GlobalFrontend [Static & Template (全域前端)]
            direction TB
            BaseHTML["Template/base.html"]:::html
            StaticJS["Static/js/\n(htmx.org, layout.js,\nlightweight-charts.standalone.js)"]:::js
            StaticCSS["Static/css/\ninput.css → tailwind.output.css\nlayout.css"]:::css

            StaticJS -.->|直接提供服務| ContNginx
            StaticCSS -.->|直接提供服務| ContNginx
        end

        %% 繼承關係
        S_HTML -->|extends| BaseHTML
        R_HTML -->|extends| BaseHTML
        B_HTML -->|extends| BaseHTML
        BaseHTML -->|全域引入| StaticJS
        BaseHTML -->|全域引入| StaticCSS
        StaticCSS -->|@import postcss| S_Chart_CSS
    end
```

### 檔案關係圖的閱讀指南：

1. **模組與顏色區分：** 藍色代表 Python 後端程式碼、橘色代表 HTML 模板、黃色代表 JS 腳本、淺藍色代表 CSS 樣式表、綠色與深藍色則是 Docker 相關。
2. **`Env` 目錄的作用（左側）：** 它裡面的 `Dockerfile`、`nginx.conf` 與 `init.sql` 分別負責生成對應的 Docker 容器。`data_sync/scheduler.py` 在 Crawler 容器內排程執行，並透過 Python import 呼叫 `App/Feature/DataManagement/` 內的同步與備份腳本。
3. **`App/Lib/` 共用函式庫：**
   * `db.py` 集中管理 MySQL 連線池（SQLAlchemy），被 `app.py`、`Screening/service.py` 以及 `DataManagement/sync/*.py` 共同 import，避免重複初始化。
4. **`App` 核心與入口（下方左側）：**
   * 一切的開端在於 `app.py`，它讀取 `config.py` 後啟動整個 FastAPI。
   * 它負責將請求分配到三大模組（Screening, RiskManagement, Backtesting）的 `routes.py` API 進入點。
5. **`Feature/DataManagement/` 市場資料管理：**
   * 原 `data_sync/` 重新命名，並拆分為 `sync/`（8 支爬取/驗證腳本）與 `backup/`（DB 備份）兩個子目錄，消除了舊有的雙層巢狀結構。
6. **深入 `Screening` 功能模組內部：**
   * `routes.py` 處理完 HTTP 請求後，會把任務交給 `service.py` 進行資料處理。
   * 如果請求需要 AI 計算，`service.py` 會調用 `pattern/service.py`（並載入 `.pt` AI 模型）。
   * 如果需要算布林通道等指標，就會調用 `indicators/service.py`。
   * 資料處理完後，`routes.py` 會觸發渲染 `screening_fragment.html`。
   * `chart/` 子目錄集中存放圖表相關資源：`chartController.js`、`chartSettingsModal.js`、`templates/*.js`（Modal HTML 模板）以及 6 支分拆的 `chart-modal-*.css`。
   * `function_block/` 包含了 `strategyManager.js` 與其他 UI 區塊模組。
7. **CSS 打包架構：** `Static/css/input.css` 透過 PostCSS `@import` 引入所有分拆 CSS（含 `chart-modal-*.css`），再由 Tailwind CLI 輸出為單一 `tailwind.output.css`。`base.html` 只需引入此單一檔案，不需逐一掛載個別 CSS。
8. **前後端與容器的串連（箭頭關係）：** 圖表上的實線與虛線嚴密對應了程式碼裡的 `import` 語法、HTML 裡的 `<script src="...">` 語法，以及 Docker 的 Volume 掛載邏輯！
