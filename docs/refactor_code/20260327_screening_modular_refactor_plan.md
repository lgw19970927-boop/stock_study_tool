# Screening 功能模組化重構計畫書（審查修訂版 v3）

**日期：** 2026-03-27  
**更新：** 2026-03-28（Step 1 完成；Q&A 決策整合）  
**狀態：** 實作中（Step 1 ✅ / Step 2 進行中）  
**原則：** 按功能模組化 (Modular by Feature) — 每個資料夾為自給自足的垂直切片

---

## 0. 核心約束

### 0.1 功能完全一致保證

> [!CAUTION]
> **本次重構為「純結構搬移 + 拆分」，禁止任何功能、排版、風格上的變更。**

| 保證項目 | 說明 |
|:--------|:-----|
| 功能 | 所有篩選、圖表、策略、型態識別功能行為與重構前 100% 一致 |
| 排版 | 所有頁面的 HTML 結構、CSS 佈局、元素尺寸與重構前逐像素一致 |
| 風格 | 所有顏色、字體、動畫、過渡效果、hover 狀態與重構前一致 |
| JS 行為 | 所有 `window.state`、事件監聽、DOM 操作邏輯不做任何修改 |
| Python API | 所有端點路徑、請求/回應格式不做任何修改 |

**實施原則**：
1. CSS 拆分時，只做「剪下 → 貼上」到新檔案，**不修改任何選擇器或屬性值**
2. JS 拆分時，只做「函式搬移」，搬出的函式保持原有簽名，透過全域物件或 import 串接
3. HTML 片段化時，只做「剪下 → 貼上」到 `ui.html`，**不修改任何 class、id、屬性**
4. 每完成一個 Step，必須在瀏覽器中逐項驗證（見第 17 節清單）

### 0.2 全專案小寫命名規範

> [!IMPORTANT]
> **所有目錄名稱與檔案名稱一律使用小寫 + 底線（snake_case）。**
> CSS 檔案依業界慣例使用 kebab-case（小寫 + 連字號）。

本次重構將一併把既有的 PascalCase 目錄全部改為小寫，**包含專案頂層的 `App/` 與 `Env/`**。

### 0.3 審查問答記錄（2026-03-28 確認）

> [!NOTE]
> 以下為實作前審查所提問題與確認後的決策結果，已納入本計畫書約束範圍。

#### Q1 — Windows 大小寫重命名（Step 1 封鎖器）

**問題**：Windows NTFS 不區分大小寫，無法直接將 `App/` 改為 `app/`（系統視為同一資料夾）。須走兩步：`App/ → App_tmp_ / → app/`。是否接受這種中介名稱方式？

**決策（A1）**：
> 接受中介名稱處理方式。因專案使用 Git，為確保 Git 能正確追蹤大小寫變更，**必須使用 `git mv` 指令**執行兩步驟（先 `git mv App App_tmp_`，再 `git mv App_tmp_ app`），不可只用系統內建重新命名，以免遠端儲存庫與本地端大小寫不一致。

---

#### Q2 — HTMX 導航的 Script 重載問題（Step 7 隱藏邏輯）

**問題**：`screening_fragment.html` 底部需完整 `<script>` 區塊才能讓 HTMX 切換後 JS 重新初始化，但計畫書 §8 的新 `screening.html` 把所有 scripts 放在 `{% block extra_scripts %}`，HTMX 只返回 fragment（沒有 `extra_scripts` block），JS 不會重跑。

**決策（A2）**：
> 完全同意。**沿用 `risk_management_fragment.html` 已實作的模式**，在 `screening_fragment.html` 底部使用 `{% if not screening_full_page %}` 判斷式載入 JS，確保直接進入與 HTMX 切換兩種情境都能正常載入。重構 `routes.py` 時需正確傳遞 `screening_full_page` 變數給模板。

---

#### Q3 — God Object 拆分的「新增程式碼」問題（Step 5）

**問題**：計畫書說「禁止任何功能變更」，但 Step 5 的拆分需要寫全新的橋接程式碼（如 `registerTab(name, renderFn, saveFn)` 介面、`ChartTooltip.init(chart)` 初始化橋接、`window.ScreeningApp` 事件掛載等）。這些橋接程式碼屬於本次重構範圍嗎？

**決策（A3）**：
> **確認屬於本次重構範圍**。「禁止任何功能變更」指的是「業務邏輯與使用者體驗」不變。為解耦 God Object 所必須新增的結構性橋接邏輯（如 `registerTab`、`init()` 或事件掛載）是絕對必要的。執行時需確保全域物件的掛載與初始化順序安全。

---

#### Q4 — `pattern/service.py` DB 層搬移（§13.D）

**問題**：§13.D 提到將 `fetch_stock_prices()`、`get_stocks_by_markets()` 從 `pattern/service.py` 移至 `screening/service.py`，但 Step list（§15）的 10 個步驟中沒有對應的 Step。這是否在本次實作範圍內？

**決策（A4）**：
> **忽略 §13.D 的指示，維持現狀**。為貫徹按功能模組化（自給自足的垂直切片）的核心原則，這兩個負責提供資料給 YOLO 模型的資料庫查詢函式應保留在 `pattern/service.py`，不需要移至 `screening/service.py`。§13.D 標記為已確認不實作：*[**經確認不實作，原因為：違反按功能模組化原則**]*

---

#### Q5 — `input.css` 重建時間點

**問題**：CSS 路徑在 Step 4（chart 拆分）、Step 6（CSS 搬移）都會改變，但 Tailwind 重建（`npm run build:css`）只在 Step 6 才跑。中間 Steps（4、5）期間，`input.css` 的 `@import` 路徑會暫時有 404。

**決策（A5）**：
> **接受「每個涉及 CSS 異動的 Step 完成後立即更新 `input.css` + 重建 CSS」的做法**，確保每個 Step 都能進行嚴格的視覺驗證，避免因為 `@import` 404 導致跑版。具體時點：Step 4、Step 5（如有 CSS 影響）、Step 6 完成後各執行一次 `npm run build:css`。

---

#### Q6 — `scheduler.py` 搬移問題

**問題**：`env/data_sync/scheduler.py` 裡有 `from App.Feature.DataManagement.sync.sync_market_data import ...`。此檔案在 Step 1 後目錄變為小寫，Python import 路徑也需要跟著改。`data_sync` container 是獨立 Python 環境，使用絕對路徑 import，重命名後會影響到它嗎？請確認 `Dockerfile` 的 `PYTHONPATH` 設定。

**決策（A6）**：
> **將 `env/data_sync/scheduler.py` 的 import 路徑修改（改為小寫 `app.feature...`）納入本次實作範圍**。同時確認 `env/data_sync/Dockerfile` 的 `PYTHONPATH` 設定：Dockerfile 使用 `WORKDIR /workspace` + `COPY . /workspace`，Python 的 working directory 即 workspace 根目錄，`app` 套件路徑可正常解析，無需額外設定 `PYTHONPATH`。

---

## 1. 核心架構原則：按功能模組化 (Modular by Feature)

本架構的核心邏輯在於 **「讓程式碼的結構跟業務邏輯（生意長什麼樣）保持一致」**：

1.  **直覺的業務對應**：讓新進入者只需看資料夾名稱，就能理解系統提供了哪些功能。
2.  **降低維護的認知負擔**：修改組件時，您只需集中在一個資料夾內，裡面包含了該功能所需的所有 Python、HTML、JS、CSS。
3.  **極佳的擴展性 (Scalability)**：直接在 `screening/` 下新增一個資料夾即可擴充功能，將「改 A 壞 B」的風險降到最低。

---

## 2. 現狀痛點分析

| 問題 | 說明 |
|:---|:---|
| `function_block/` 命名不直觀 | 看不出是「UI 組件」，7 個 JS 混在同一層 |
| 3 個 God Object | `chartSettingsModal.js`(1544)、`screening.js`(1023)、`chartController.js`(1010) 跨多個業務職責 |
| 工具 JS 放在 `Static/js/utils/` | `chartIndicators.js`、`chartRenderer.js`、`indicatorRegistry.js` 只有 Screening 使用 |
| 5 份 CSS 在 `Static/css/` 歸屬錯誤 | 包含 Screening / Backtesting 專屬樣式 |
| `screening.html` 與 `screening_fragment.html` 幾乎完全重複 | 584 vs 578 行，HTML 主體逐行相同 |
| `indicators/` 下 JS 與 Python 混放 | `sma.js` 等 4 個 JS 直接放在與 `service.py` 同層 |
| `pattern/` 遺漏檔案 | `pattern_mapping.py`、`utils/chart_generator.py` 未列入原計畫 |
| 目錄大小寫不一致 | `App/`、`Env/`、`Feature/`、`Static/`、`Template/`、`Lib/` 使用 PascalCase |

---

## 3. God Object 拆分計畫

### 3.1 `chartSettingsModal.js`（1,544 行）→ 拆為 3 個檔案

此 Modal 有 5 個分頁，其中「指標參數設定」和「型態顯示設定」可歸還至各自的功能切片。

| 拆出內容 | 目標檔案 | 預估行數 | 說明 |
|:---------|:--------|:---------|:-----|
| Modal 框架 + 圖表外觀 + 座標軸 + 色板 | `chart/chart_management/chart_settings_modal.js` | ~800 | 核心 Modal 骨架與圖表管理設定 |
| 指標參數設定分頁（MA/BOLL 等） | `indicators/indicator_settings_tab.js` | ~500 | 拆出後由 Modal 透過 callback 呼叫 |
| 型態顯示設定分頁 | `pattern/pattern_settings_tab.js` | ~250 | 拆出後由 Modal 透過 callback 呼叫 |

**拆分策略**：Modal 主體保留一個 `registerTab(name, renderFn, saveFn)` 介面，指標/型態設定各自實作 `renderFn` 和 `saveFn` 後註冊回去。原有的 `window.ChartSettingsModal` 全域物件不變。

### 3.2 `screening.js`（1,023 行）→ 拆為 3 個檔案

| 拆出內容 | 目標檔案 | 預估行數 | 說明 |
|:---------|:--------|:---------|:-----|
| 核心 init + 狀態管理 + Tab 切換 + 事件協調 | `screening.js` | ~350 | 保留為入口調度器 |
| SSE 串流 + 進度條更新 | `components/progress_area/progress_area.js` | ~300 | 從 `initSSEConnection()` / `updateProgress()` 等函式搬出 |
| 結果列表渲染 + 排序 + CSV 匯出 | `components/results_table/results_table.js` | ~350 | 從 `renderStockList()` / `sortStocks()` 等函式搬出 |

**拆分策略**：搬出的函式掛回 `window.ScreeningApp` 或透過全域事件派發，確保 HTML 中現有的 `onclick` / `id` 引用不受影響。

### 3.3 `chartController.js`（1,010 行）→ 拆為 2 個檔案

| 拆出內容 | 目標檔案 | 預估行數 | 說明 |
|:---------|:--------|:---------|:-----|
| 圖表引擎 + K 線載入 + 指標渲染 + 座標軸同步 | `chart/kline_viewer/chart_controller.js` | ~750 | K 線圖顯示核心引擎 |
| Tooltip 計算 + 懸浮窗渲染 | `chart/kline_viewer/chart_tooltip.js` | ~260 | 從 `createTooltip()` / `updateTooltipContent()` 搬出 |

**拆分策略**：Tooltip 模組接收 `chartInstance` 參考，由 `chart_controller.js` 在初始化時呼叫 `ChartTooltip.init(chart)`。

---

## 4. `chart/` 子目錄拆分 — 圖表管理 vs K 線圖顯示

`chart/` 內的功能可再依業務區分為兩個子模組：

### 4.1 `chart/chart_management/` — 圖表管理（設定 Modal、外觀、色板）

| 檔案 | 來源 | 說明 |
|:-----|:-----|:-----|
| `chart_settings_modal.js` | [SPLIT] ← `chartSettingsModal.js` | Modal 框架 + 圖表外觀/座標軸設定 |
| `chart_settings_modal_template.js` | [RENAMED] ← `ChartSettingsModalTemplate.js` | Modal HTML 模板 |
| `color_picker_template.js` | [RENAMED] ← `ColorPickerTemplate.js` | 色板選擇器模板 |
| `chart-modal-core.css` | (不動) | Modal 核心樣式 |
| `chart-modal-sidebar.css` | (不動) | Modal 側邊欄樣式 |
| `chart-modal-indicators.css` | (不動) | Modal 指標分頁樣式 |
| `chart-modal-patterns.css` | (不動) | Modal 型態分頁樣式 |
| `chart-modal-color-picker.css` | (不動) | 色板選擇器樣式 |
| `chart-modal-general.css` | (不動) | Modal 通用樣式 |

### 4.2 `chart/kline_viewer/` — K 線圖顯示（引擎、渲染、Tooltip）

| 檔案 | 來源 | 說明 |
|:-----|:-----|:-----|
| `chart_controller.js` | [RENAMED+SPLIT] ← `chartController.js` | K 線引擎核心 |
| `chart_tooltip.js` | [NEW] ← 從 `chart_controller.js` 拆出 | 懸浮窗渲染 |
| `chart_renderer.js` | [MOVED+RENAMED] ← `static/js/utils/chartRenderer.js` | 底層渲染工具 |
| `chart-area.css` | [MOVED+MERGED] ← `static/css/chart.css` + toggle 樣式 | K 線圖容器佈局 |
| `templates/chart_area_ui.html` | [NEW] ← 從 screening.html 提取 | K 線圖 HTML 區塊 |

---

## 5. `static/` CSS 審計與拆分

### 5.1 CSS 歸屬判定

| CSS 檔案 | 行數 | 使用範圍 | 結論 |
|:---------|:-----|:---------|:-----|
| `variables.css` | 85 | 全域 CSS 變數 | ✅ 留 static |
| `layout.css` | 158 | navbar、sidebar、content-area | ✅ 留 static |
| `input.css` | 28 | Tailwind 入口 | ✅ 留 static |
| `tailwind.output.css` | — | 編譯輸出 | ✅ 留 static |
| `animations.css` | 108 | L1-45 全域；L60-62 + L76-107 Screening 專屬 | ⚠️ 拆分 |
| `components.css` | 408 | L1-127 全域；L128-407 Screening 專屬 | ⚠️ 拆分 |
| `tabs.css` | 384 | L1-85 + L298-383 全站；L86-296 Screening 專屬 | ⚠️ 拆分 |
| `stock-list.css` | 206 | Screening 專屬 | ❌ 移走 |
| `chart.css` | 104 | Screening 專屬 | ❌ 移走 |
| `backtest.css` | 236 | Backtesting 專屬 | ❌ 移走 |

### 5.2 拆分對照

| 來源 | 目標 | 內容 |
|:-----|:-----|:-----|
| `components.css` L128-189 | `components/time_range_selector/time-range-selector.css` | `.time-range-*`、`.date-input*` |
| `components.css` L191-237 | `components/market_selection/market-selection.css` | `.checkbox-*` |
| `components.css` L239-286 | `indicators/indicator-styles.css` | `.indicator-*`、`.param-*` |
| `components.css` L312-407 | `pattern/pattern-styles.css` | `.pattern-*`、`.range-*` |
| `tabs.css` L86-296 | `components/strategy_manager/strategy-manager.css` | `.strategy-card*` 等 |
| `animations.css` L60-62 | `components/results_table/results-table.css`（合併） | `.stock-item` 動畫 |
| `animations.css` L76-107 | `screening.css`（合併） | sidebar 響應式 |
| `stock-list.css` 全部 | `components/results_table/results-table.css` | 股票列表樣式 |
| `chart.css` 全部 | `chart/kline_viewer/chart-area.css` | K 線圖佈局 |
| `backtest.css` 全部 | `backtesting/backtesting.css` | 回測頁面樣式 |

---

## 6. 全專案小寫轉換 — 影響範圍

### 6.1 頂層目錄重新命名

| 原目錄 | 新目錄 | 說明 |
|:------|:------|:-----|
| `App/` | `app/` | 應用主目錄（Python 套件名） |
| `Env/` | `env/` | Docker 環境設定 |
| `Docs/` | `docs/` | 文件 |
| `Test/` | `test/` | 測試 |

### 6.2 `app/` 下子目錄重新命名

| 原目錄 | 新目錄 |
|:------|:------|
| `app/Feature/` | `app/feature/` |
| `app/Static/` | `app/static/` |
| `app/Template/` | `app/template/` |
| `app/Lib/` | `app/lib/` |
| `app/feature/Screening/` | `app/feature/screening/` |
| `app/feature/Backtesting/` | `app/feature/backtesting/` |
| `app/feature/RiskManagement/` | `app/feature/risk_management/` |
| `app/feature/DataManagement/` | `app/feature/data_management/` |

### 6.3 受影響的程式碼引用

#### Python 引用

| 檔案 | 修改前 | 修改後 |
|:-----|:------|:------|
| `app/app.py` | `from .Lib.db import init_db` | `from .lib.db import init_db` |
| `app/app.py` | `from .Feature import register_features` | `from .feature import register_features` |
| `app/app.py` | `StaticFiles(directory=..., "Static")` | `StaticFiles(directory=..., "static")` |
| `app/app.py` | `StaticFiles(directory=..., "Feature")` | `StaticFiles(directory=..., "feature")` |
| `app/app.py` | `Jinja2Templates(directory=[..., "Template", ..., "Feature"])` | `Jinja2Templates(directory=[..., "template", ..., "feature"])` |
| `app/feature/__init__.py` | `from .Screening import router` | `from .screening import router` |
| `app/feature/__init__.py` | `from .Backtesting import router` | `from .backtesting import router` |
| `app/feature/__init__.py` | `from .RiskManagement import router` | `from .risk_management import router` |
| `app/feature/__init__.py` | `from .DataManagement.sync.market_data import router` | `from .data_management.sync.market_data import router` |
| `screening/routes.py` | `"Screening/screening*.html"` | `"screening/screening*.html"` |
| `screening/routes.py` L116 | `from App.Lib.db import get_market_cursor` | `from app.lib.db import get_market_cursor` |
| `risk_management/routes.py` | `"RiskManagement/risk_management*.html"` | `"risk_management/risk_management*.html"` |
| `backtesting/routes.py` | `"Backtesting/backtesting*.html"` | `"backtesting/backtesting*.html"` |
| `data_management/sync/sync_market_data.py` | `from App.Feature.DataManagement.*` | `from app.feature.data_management.*` |
| `data_management/sync/migrate_sqlite_to_mysql.py` | 同上模式 | 同上模式 |
| `data_management/sync/gap_scanner.py` | 同上模式 | 同上模式 |
| `data_management/backup/backup_mysql.py` | 同上模式 | 同上模式 |

#### Docker / Build 引用

| 檔案 | 修改前 | 修改後 |
|:-----|:------|:------|
| `env/fastapi/Dockerfile` L16 | `COPY App/ App/` | `COPY app/ app/` |
| `env/fastapi/Dockerfile` L49 | `COPY Env/fastapi/requirements.txt` | `COPY env/fastapi/requirements.txt` |
| `env/fastapi/Dockerfile` L60 | `...App/Static/css/tailwind.output.css` → 兩處 | `...app/static/css/tailwind.output.css` |
| `env/fastapi/Dockerfile` L64 | `App.app:app` | `app.app:app` |
| `env/data_sync/Dockerfile` L18 | `COPY Env/data_sync/requirements.txt` | `COPY env/data_sync/requirements.txt` |
| `env/data_sync/Dockerfile` L24 | `Env/data_sync/scheduler.py` | `env/data_sync/scheduler.py` |
| `docker-compose.yml` L15 | `./Env/mysql/init.sql` | `./env/mysql/init.sql` |
| `docker-compose.yml` L17-19 | `./Env/mysql/seed/*.sql` | `./env/mysql/seed/*.sql` |
| `docker-compose.yml` L32 | `./Env/fastapi/Dockerfile` | `./env/fastapi/Dockerfile` |
| `docker-compose.yml` L69 | `./Env/nginx/nginx.conf` | `./env/nginx/nginx.conf` |
| `docker-compose.yml` L70 | `./App/Static:/static` | `./app/static:/static` |
| `docker-compose.yml` L78 | `./Env/data_sync/Dockerfile` | `./env/data_sync/Dockerfile` |
| `package.json` build:css | `App/Static/css/input.css -o App/Static/css/tailwind.output.css` | `app/static/css/input.css -o app/static/css/tailwind.output.css` |
| `tailwind.config.js` content | `./App/**/*.html`, `./App/**/*.js` | `./app/**/*.html`, `./app/**/*.js` |

#### HTML 路徑

| 類型 | 修改前 | 修改後 |
|:-----|:------|:------|
| `<script src>` | `/feature/Screening/...` | `/feature/screening/...` |
| `{% include %}` | `"Screening/..."` | `"screening/..."` |
| `<link href>` (risk mgmt fragment) | `/feature/RiskManagement/...` | `/feature/risk_management/...` |
| `<script src>` (risk mgmt fragment) | `/feature/RiskManagement/...` | `/feature/risk_management/...` |

---

## 7. 重構後完整目錄樹

```
app/                                               [RENAMED] ← App/
├── feature/                                       [RENAMED] ← Feature/
│   ├── __init__.py                                [UPDATED] import 路徑改小寫
│   │
│   ├── screening/                                 [RENAMED] ← Screening/
│   │   ├── __init__.py                            (不動)
│   │   ├── routes.py                              [UPDATED] 模板路徑改小寫
│   │   ├── service.py                             (不動)
│   │   ├── models.py                              [MOVED] ← feature/models.py
│   │   ├── screening.js                           [SPLIT] 拆出 SSE/Progress + ResultsTable
│   │   ├── screening.css                          [MERGED] 合併 sidebar 響應式
│   │   ├── screening.html                         [REWRITE] 精簡為 extends + include + scripts
│   │   ├── screening_fragment.html                [REWRITE] {% include %} 調度員
│   │   │
│   │   ├── chart/
│   │   │   ├── chart_management/                  [NEW] 圖表管理子模組
│   │   │   │   ├── chart_settings_modal.js        [RENAMED+SPLIT] ← chartSettingsModal.js
│   │   │   │   ├── chart_settings_modal_template.js [RENAMED+MOVED] ← templates/
│   │   │   │   ├── color_picker_template.js       [RENAMED+MOVED] ← templates/
│   │   │   │   ├── chart-modal-core.css           [MOVED] ← chart/
│   │   │   │   ├── chart-modal-sidebar.css        [MOVED] ← chart/
│   │   │   │   ├── chart-modal-indicators.css     [MOVED] ← chart/
│   │   │   │   ├── chart-modal-patterns.css       [MOVED] ← chart/
│   │   │   │   ├── chart-modal-color-picker.css   [MOVED] ← chart/
│   │   │   │   └── chart-modal-general.css        [MOVED] ← chart/
│   │   │   │
│   │   │   └── kline_viewer/                      [NEW] K 線圖顯示子模組
│   │   │       ├── chart_controller.js            [RENAMED+SPLIT] ← chartController.js
│   │   │       ├── chart_tooltip.js               [NEW] ← 從 chart_controller.js 拆出
│   │   │       ├── chart_renderer.js              [MOVED+RENAMED] ← static/js/utils/
│   │   │       ├── chart-area.css                 [MOVED+MERGED] ← static/css/chart.css
│   │   │       └── templates/
│   │   │           └── chart_area_ui.html         [NEW] ← 從 screening.html 提取
│   │   │
│   │   ├── indicators/
│   │   │   ├── __init__.py                        (不動)
│   │   │   ├── service.py                         [TRIMMED] 保留 evaluate_condition() + calculate_indicators() 調度器 + 共用工具函式；各指標計算邏輯拆出至 modules/
│   │   │   ├── templates/
│   │   │   │   └── indicator_panel.html           [NEW]
│   │   │   ├── indicator_manager.js               [MOVED+RENAMED] ← function_block/indicator_block.js
│   │   │   ├── indicator_top_bar.js               [MOVED+RENAMED] ← function_block/indicator_top_bar.js
│   │   │   ├── indicator_settings_tab.js          [NEW] ← 從 chart_settings_modal.js 拆出
│   │   │   ├── indicator_registry.js              [MOVED+RENAMED] ← static/js/utils/
│   │   │   ├── chart_indicators.js                [MOVED+RENAMED] ← static/js/utils/
│   │   │   ├── indicator-styles.css               [NEW] ← 從 components.css 拆出
│   │   │   └── modules/                           [NEW] 具體指標實作（Python + JS 垂直切片）
│   │   │       ├── sma/
│   │   │       │   ├── sma.py                     [SPLIT] ← indicators/service.py（SMA 計算邏輯）
│   │   │       │   └── sma.js                     [MOVED]（名稱不變）
│   │   │       ├── bollinger/
│   │   │       │   ├── bollinger.py                 [SPLIT] ← indicators/service.py（Bollinger 計算邏輯）
│   │   │       │   └── bollinger.js               [MOVED]（名稱不變）
│   │   │       ├── amount/
│   │   │       │   └── amount.js                  [MOVED]（名稱不變；無獨立 Python 邏輯）
│   │   │       └── volume/
│   │   │           └── volume.js                  [MOVED]（名稱不變；無獨立 Python 邏輯）
│   │   │
│   │   ├── pattern/
│   │   │   ├── service.py                         (不動)
│   │   │   ├── routes.py                          (不動)
│   │   │   ├── pattern_mapping.py                 (不動；已補上)
│   │   │   ├── templates/
│   │   │   │   └── pattern_panel.html             [NEW]
│   │   │   ├── pattern_manager.js                 [MOVED+RENAMED] ← function_block/pattern_block.js
│   │   │   ├── pattern_annotation.js              [MOVED+RENAMED] ← function_block/pattern_annotation.js
│   │   │   ├── pattern_settings_tab.js            [NEW] ← 從 chart_settings_modal.js 拆出
│   │   │   ├── pattern-styles.css                 [NEW] ← 從 components.css 拆出
│   │   │   ├── utils/
│   │   │   │   └── chart_generator.py             (不動；已補上)
│   │   │   └── models/
│   │   │       ├── foduucom_stock_patterns.pt     (不動)
│   │   │       └── model.pt                       (不動)
│   │   │
│   │   └── components/                            [NEW] ← function_block/ 解散重組
│   │       ├── market_selection/
│   │       │   ├── market_selection.js             [MOVED+RENAMED]
│   │       │   ├── market-selection.css            [NEW]
│   │       │   └── templates/
│   │       │       └── ui.html                    [NEW]
│   │       ├── time_range_selector/
│   │       │   ├── time_range_selector.js         [MOVED+RENAMED]
│   │       │   ├── time-range-selector.css        [NEW]
│   │       │   └── templates/
│   │       │       └── ui.html                    [NEW]
│   │       ├── strategy_manager/
│   │       │   ├── strategy_manager.js            [MOVED+RENAMED]
│   │       │   ├── strategy-manager.css           [NEW]
│   │       │   └── templates/
│   │       │       ├── ui.html                    [NEW]
│   │       │       └── strategies_list.html       [NEW]
│   │       ├── progress_area/
│   │       │   ├── progress_area.js               [NEW] ← 從 screening.js 拆出
│   │       │   └── templates/
│   │       │       └── ui.html                    [NEW]
│   │       ├── results_table/
│   │       │   ├── results_table.js               [NEW] ← 從 screening.js 拆出
│   │       │   ├── results-table.css              [MOVED+MERGED]
│   │       │   └── templates/
│   │       │       └── ui.html                    [NEW]
│   │       └── layout/
│   │           └── layout_screening.js            [MOVED+RENAMED] ← static/js/
│   │
│   ├── backtesting/                               [RENAMED] ← Backtesting/
│   │   ├── __init__.py                            (不動)
│   │   ├── routes.py                              [UPDATED]
│   │   ├── backtesting.html                       (不動)
│   │   ├── backtesting_fragment.html              (不動)
│   │   └── backtesting.css                        [MOVED] ← static/css/backtest.css
│   │
│   ├── risk_management/                           [RENAMED] ← RiskManagement/
│   │   ├── __init__.py                            (不動)
│   │   ├── routes.py                              [UPDATED] 模板路徑改小寫
│   │   ├── risk_management.html                   (不動)
│   │   ├── risk_management_fragment.html          [UPDATED] CSS/JS 路徑改小寫
│   │   ├── risk_management.js                     (不動)
│   │   ├── risk_management.css                    (不動)
│   │   └── components/                            [RENAMED] ← function_block/（詳見第 9 節）
│   │       ├── overview/
│   │       │   └── overview_block.js              [MOVED]
│   │       ├── params/
│   │       │   └── params_block.js                [MOVED]
│   │       └── portfolio/
│   │           └── portfolio_block.js             [MOVED] (spec 實作完成後)
│   │
│   └── data_management/                           [RENAMED] ← DataManagement/
│       ├── __init__.py                            (不動)
│       ├── backup/                                [UPDATED] import 路徑改小寫
│       └── sync/                                  [UPDATED] import 路徑改小寫
│
├── lib/                                           [RENAMED] ← Lib/
│   ├── __init__.py                                (不動)
│   └── db.py                                      (不動)
│
├── template/                                      [RENAMED] ← Template/
│   └── base.html                                  (不動)
│
├── static/                                        [RENAMED] ← Static/
│   ├── js/
│   │   ├── app.js                                 (不動)
│   │   ├── config.js                              (不動)
│   │   └── layout.js                              (不動)
│   └── css/
│       ├── variables.css                          (不動)
│       ├── animations.css                         [TRIMMED]
│       ├── layout.css                             (不動)
│       ├── components.css                         [TRIMMED]
│       ├── tabs.css                               [TRIMMED]
│       ├── input.css                              [UPDATED]
│       └── tailwind.output.css                    (重新編譯)
│
├── __init__.py                                    (不動)
├── app.py                                         [UPDATED]
└── config.py                                      (不動)

docs/                                              [RENAMED] ← Docs/
└── (文件內容不動)

env/                                               [RENAMED] ← Env/
├── fastapi/
│   ├── Dockerfile                                 [UPDATED] 路徑改小寫
│   └── requirements.txt                           (不動)
├── data_sync/
│   ├── Dockerfile                                 [UPDATED] 路徑改小寫
│   ├── scheduler.py                               (不動)
│   └── requirements.txt                           (不動)
├── mysql/
│   ├── init.sql                                   (不動)
│   └── seed/                                      (不動)
└── nginx/
    └── nginx.conf                                 [UPDATED] 新增 /feature/ 路徑

test/                                              [RENAMED] ← Test/
└── (測試內容不動）
```

> [!NOTE]
> `layout-screening.js` 為未來 GoldenLayout 實作預留，本次重構只搬移位置，不刪除。

---

## 8. `screening_fragment.html` 與 `screening.html` 改寫

`screening_fragment.html`（`{% include %}` 調度員）：
```html
<div class="page-content active" id="page-screening" style="display:flex; width:100%; height:100%;">
    <aside class="sidebar" id="app-sidebar">
        {% include "screening/components/time_range_selector/templates/ui.html" %}
        <div class="tabs-wrapper">
            <div class="tabs-header">...</div>
            <div id="filter-design-tab" class="tab-content active">
                {% include "screening/components/market_selection/templates/ui.html" %}
                {% include "screening/indicators/templates/indicator_panel.html" %}
                {% include "screening/pattern/templates/pattern_panel.html" %}
                {% include "screening/components/strategy_manager/templates/ui.html" %}
            </div>
            <div id="my-strategies-tab" class="tab-content" style="display:none;">
                {% include "screening/components/strategy_manager/templates/strategies_list.html" %}
            </div>
        </div>
    </aside>
    <div id="sidebarResizeHandle" class="sidebar-resize-handle"></div>
    <div class="content-area">
        {% include "screening/components/results_table/templates/ui.html" %}
        <div id="verticalResizeHandle" class="vertical-resize-handle"></div>
        {% include "screening/chart/kline_viewer/templates/chart_area_ui.html" %}
    </div>
</div>
{% include "screening/components/progress_area/templates/ui.html" %}
```

`screening.html`（精簡版）：
```html
{% extends "base.html" %}
{% block title %}股票篩選 - Stock AI Filter PRO{% endblock %}
{% block content %}
    {% include "screening/screening_fragment.html" %}
{% endblock %}
{% block extra_scripts %}
    <script src="/static/js/config.js"></script>
    <script src="/static/js/app.js"></script>

    <!-- indicators -->
    <script src="/feature/screening/indicators/indicator_registry.js"></script>
    <script src="/feature/screening/chart/kline_viewer/chart_renderer.js"></script>
    <script src="/feature/screening/indicators/chart_indicators.js"></script>
    <script src="/feature/screening/indicators/modules/sma/sma.js"></script>
    <script src="/feature/screening/indicators/modules/bollinger/bollinger.js"></script>
    <script src="/feature/screening/indicators/modules/volume/volume.js"></script>
    <script src="/feature/screening/indicators/modules/amount/amount.js"></script>
    <script src="/feature/screening/indicators/indicator_settings_tab.js"></script>

    <!-- components -->
    <script src="/feature/screening/components/market_selection/market_selection.js"></script>
    <script src="/feature/screening/components/time_range_selector/time_range_selector.js"></script>
    <script src="/feature/screening/components/progress_area/progress_area.js"></script>
    <script src="/feature/screening/components/results_table/results_table.js"></script>

    <!-- pattern -->
    <script src="/feature/screening/pattern/pattern_manager.js"></script>
    <script src="/feature/screening/pattern/pattern_annotation.js"></script>
    <script src="/feature/screening/pattern/pattern_settings_tab.js"></script>
    <script src="/feature/screening/indicators/indicator_manager.js"></script>
    <script src="/feature/screening/indicators/indicator_top_bar.js"></script>

    <!-- chart: kline_viewer -->
    <script src="/feature/screening/chart/kline_viewer/chart_controller.js"></script>
    <script src="/feature/screening/chart/kline_viewer/chart_tooltip.js"></script>

    <!-- chart: chart_management -->
    <script src="/feature/screening/chart/chart_management/chart_settings_modal_template.js"></script>
    <script src="/feature/screening/chart/chart_management/color_picker_template.js"></script>
    <script src="/feature/screening/chart/chart_management/chart_settings_modal.js"></script>

    <!-- strategy + main -->
    <script src="/feature/screening/components/strategy_manager/strategy_manager.js"></script>
    <script src="/feature/screening/screening.js"></script>
{% endblock %}
```

---

## 9. 資金與風險管理頁面重構（搭配 portfolio_risk_table_spec）

> [!IMPORTANT]
> 此重構的執行時點為 `20260327_portfolio_risk_table_spec.md` 實作完成之後。
> Spec 實作會大幅改寫 `portfolio_block.js`（新增狀態機、批次管理、多空計算），因此 `function_block/` 重組應在 spec 實作後進行，避免二次搬移。

### 9.1 重構前結構

```
risk_management/                                   [RENAMED] ← RiskManagement/
├── __init__.py
├── routes.py
├── risk_management.html
├── risk_management_fragment.html
├── risk_management.js                             (~818 bytes)
├── risk_management.css                            (~7.8 KB)
└── function_block/
    ├── overview_block.js                          (~2.9 KB) 概覽卡片彙總
    ├── params_block.js                            (~1.7 KB) 風險參數設定
    └── portfolio_block.js                         (~12.5 KB) 投資組合表格（spec 實作後會重寫）
```

### 9.2 重構後結構

```
risk_management/
├── __init__.py                                    (不動)
├── routes.py                                      [UPDATED] 模板路徑改小寫
├── risk_management.html                           (不動)
├── risk_management_fragment.html                  [UPDATED] CSS/JS 路徑 + {% include %} 調度
├── risk_management.js                             (不動)
├── risk_management.css                            (不動)
│
└── components/                                    [RENAMED] ← function_block/
    ├── overview/
    │   ├── overview_block.js                      [MOVED] 概覽卡片
    │   └── templates/
    │       └── ui.html                            [NEW] 概覽卡片 HTML 區塊
    ├── params/
    │   ├── params_block.js                        [MOVED] 風險參數設定
    │   └── templates/
    │       └── ui.html                            [NEW] 風險參數設定 HTML 區塊
    └── portfolio/
        ├── portfolio_block.js                     [MOVED] 投資組合（spec 實作後的新版本）
        └── templates/
            └── ui.html                            [NEW] 表格骨架 + 公式說明
```

### 9.3 路徑更新

`risk_management_fragment.html` 中的引用需更新：

| 修改前 | 修改後 |
|:------|:------|
| `href="/feature/RiskManagement/risk_management.css"` | `href="/feature/risk_management/risk_management.css"` |
| `src="/feature/RiskManagement/function_block/params_block.js"` | `src="/feature/risk_management/components/params/params_block.js"` |
| `src="/feature/RiskManagement/function_block/overview_block.js"` | `src="/feature/risk_management/components/overview/overview_block.js"` |
| `src="/feature/RiskManagement/function_block/portfolio_block.js"` | `src="/feature/risk_management/components/portfolio/portfolio_block.js"` |
| `src="/feature/RiskManagement/risk_management.js"` | `src="/feature/risk_management/risk_management.js"` |

---

## 10. `input.css` @import 路徑更新

```css
/* ===== Global ===== */
@import "./variables.css";
@import "./animations.css";
@import "./layout.css";
@import "./components.css";
@import "./tabs.css";

/* ===== Feature: screening ===== */
@import "../../feature/screening/screening.css";
@import "../../feature/screening/chart/kline_viewer/chart-area.css";
@import "../../feature/screening/chart/chart_management/chart-modal-core.css";
@import "../../feature/screening/chart/chart_management/chart-modal-sidebar.css";
@import "../../feature/screening/chart/chart_management/chart-modal-indicators.css";
@import "../../feature/screening/chart/chart_management/chart-modal-patterns.css";
@import "../../feature/screening/chart/chart_management/chart-modal-color-picker.css";
@import "../../feature/screening/chart/chart_management/chart-modal-general.css";
@import "../../feature/screening/indicators/indicator-styles.css";
@import "../../feature/screening/pattern/pattern-styles.css";
@import "../../feature/screening/components/market_selection/market-selection.css";
@import "../../feature/screening/components/time_range_selector/time-range-selector.css";
@import "../../feature/screening/components/strategy_manager/strategy-manager.css";
@import "../../feature/screening/components/results_table/results-table.css";

/* ===== Feature: backtesting ===== */
@import "../../feature/backtesting/backtesting.css";

/* ===== Feature: risk_management ===== */
@import "../../feature/risk_management/risk_management.css";

@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

## 11. Docker / Nginx 影響

### 11.1 Container 維持不變 ✅

重構後容器數量與名稱完全不變：

| # | Container | 名稱 | 說明 |
|:--|:----------|:-----|:-----|
| 1 | `stock-mysql` | MySQL 資料庫 | 不受影響 |
| 2 | `stock-fastapi` | FastAPI 應用 | Dockerfile 路徑更新 |
| 3 | `stock-nginx` | Nginx 反向代理 | nginx.conf 新增 /feature/ |
| 4 | `stock-data-sync` | 資料同步排程 | Dockerfile 路徑更新 |

### 11.2 `start_server.bat` 無需改動 ✅

`start_server.bat` 只呼叫 `docker-compose up --build`，不含硬編碼路徑。重構後您仍然可以透過 `start_server.bat` 一鍵啟動，不需要任何額外操作。

### 11.3 Nginx 新增靜態路徑

`env/nginx/nginx.conf` 新增：
```nginx
location /feature/ {
    alias /workspace/app/feature/;
    expires -1;
    add_header Cache-Control "no-cache, must-revalidate";
}
```

`docker-compose.yml` nginx volumes 新增：
```yaml
nginx:
  volumes:
    - ./env/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    - ./app/static:/static
    - ./app/feature:/workspace/app/feature:ro        # [NEW]
```

### 11.4 Tailwind 確認

| 設定 | 影響 |
|:-----|:-----|
| `tailwind.config.js` content → `./app/**/*.html`, `./app/**/*.js` | ✅ |
| `postcss.config.js` | ✅ 不變 |

---

## 12. 可刪除的根目錄檔案

| 檔案 | 用途 | 建議 |
|:----|:-----|:-----|
| `diagnose.bat` | 空檔案（0 bytes） | ✅ 刪除 |
| `find_imports.py` | 一次性 import 搜尋腳本 | ✅ 刪除 |
| `refactor_copy.py` | 舊架構遷移複製腳本 | ✅ 刪除 |
| `debug_indicators.json` | routes.py debug 輸出 | ✅ 刪除 |

---

## 13. 隱藏邏輯問題

### A. `debug_indicators.json` 硬編碼輸出
`routes.py` L106：`with open("debug_indicators.json", "w")`。
**修正**：移除此 debug 程式碼，或改為 `logging.debug()` 輸出。

### B. `pattern/models/.cache/` 目錄
YOLO 推理快取未列入 `.gitignore`。
**修正**：加入 `.gitignore`。

### C. `layout-screening.js` 為 GoldenLayout 預留
`screening.html` 中被 TODO 註解包裹的 `<script src="/static/js/layout-screening.js">`。
**處理**：搬移至 `components/layout/layout_screening.js`，保留 TODO 註解，不刪除。

### D. `pattern/service.py` 混合 DB 查詢層與 ML 推理層
`pattern/service.py` 包含兩種層次的邏輯，違反「降低認知負擔」原則：
- **資料存取層**（應集中管理）：`fetch_stock_prices()`、`get_stocks_by_markets()` — 直接查 MySQL
- **ML 推理層**（正確放置）：`recognize_patterns()`、`_detect_with_yolo()`、`_detect_consolidation()`

**修正**：將 `fetch_stock_prices()`、`get_stocks_by_markets()` 移至 `screening/service.py`，`pattern/routes.py` 改為 `from ..service import fetch_stock_prices, get_stocks_by_markets`。[**經確認不實作，原因為：違反按功能模組化原則**]

---

## 14. 逐檔案異動對照表

### JS 搬移 + 改名

| 原路徑 | 目標路徑 | 異動 |
|:---|:---|:---|
| `function_block/market_block.js` | `components/market_selection/market_selection.js` | MOVE+RENAME |
| `function_block/time_range_block.js` | `components/time_range_selector/time_range_selector.js` | MOVE+RENAME |
| `function_block/strategyManager.js` | `components/strategy_manager/strategy_manager.js` | MOVE+RENAME |
| `function_block/indicator_block.js` | `indicators/indicator_manager.js` | MOVE+RENAME |
| `function_block/indicator_top_bar.js` | `indicators/indicator_top_bar.js` | MOVE |
| `function_block/pattern_block.js` | `pattern/pattern_manager.js` | MOVE+RENAME |
| `function_block/pattern_annotation.js` | `pattern/pattern_annotation.js` | MOVE |
| `static/js/layout-screening.js` | `components/layout/layout_screening.js` | MOVE+RENAME |
| `static/js/utils/chartIndicators.js` | `indicators/chart_indicators.js` | MOVE+RENAME |
| `static/js/utils/chartRenderer.js` | `chart/kline_viewer/chart_renderer.js` | MOVE+RENAME |
| `static/js/utils/indicatorRegistry.js` | `indicators/indicator_registry.js` | MOVE+RENAME |
| `indicators/sma.js` | `indicators/modules/sma/sma.js` | MOVE |
| `indicators/bollinger.js` | `indicators/modules/bollinger/bollinger.js` | MOVE |
| `indicators/amount.js` | `indicators/modules/amount/amount.js` | MOVE |
| `indicators/volume.js` | `indicators/modules/volume/volume.js` | MOVE |

### JS 改名 + 拆分

| 原路徑 | 目標路徑 | 異動 |
|:---|:---|:---|
| `chart/chartController.js` | `chart/kline_viewer/chart_controller.js` | RENAME+SPLIT+MOVE |
| （拆出） | `chart/kline_viewer/chart_tooltip.js` | NEW |
| `chart/chartSettingsModal.js` | `chart/chart_management/chart_settings_modal.js` | RENAME+SPLIT+MOVE |
| （拆出） | `indicators/indicator_settings_tab.js` | NEW |
| （拆出） | `pattern/pattern_settings_tab.js` | NEW |
| `screening.js` | `screening.js` | SPLIT |
| （拆出） | `components/progress_area/progress_area.js` | NEW |
| （拆出） | `components/results_table/results_table.js` | NEW |
| `chart/templates/ChartSettingsModalTemplate.js` | `chart/chart_management/chart_settings_modal_template.js` | RENAME+MOVE |
| `chart/templates/ColorPickerTemplate.js` | `chart/chart_management/color_picker_template.js` | RENAME+MOVE |

### CSS 搬移 / 拆分

| 原路徑 | 目標路徑 | 異動 |
|:---|:---|:---|
| `static/css/stock-list.css` | `components/results_table/results-table.css` | MOVE+MERGE |
| `static/css/chart.css` | `chart/kline_viewer/chart-area.css` | MOVE+MERGE |
| `static/css/backtest.css` | `backtesting/backtesting.css` | MOVE |
| `chart/chart-modal-*.css` (6 個) | `chart/chart_management/chart-modal-*.css` | MOVE |
| `static/css/components.css` L128-407 | 各組件 CSS | SPLIT |
| `static/css/tabs.css` L86-296 | `strategy-manager.css` | SPLIT |
| `static/css/animations.css` L60-107 | `results-table.css` / `screening.css` | SPLIT |

---

## 15. 實施步驟

### Step 1 — 頂層目錄改小寫 ✅（已完成）
1. `App/` → `app/`、`Env/` → `env/`（使用 `git mv` 兩步驟：先 `App_tmp_` 再 `app/`，詳見 §0.3 Q1）
2. 更新 `docker-compose.yml` 所有路徑
3. 更新 `env/fastapi/Dockerfile` 路徑（含 `app.app:app`）
4. 更新 `env/data_sync/Dockerfile` 路徑
5. 更新 `tailwind.config.js`、`package.json`
6. ✅ 驗證：`start_server.bat` 啟動成功

### Step 2 — app/ 下子目錄改小寫 ✅（已完成）
7. `feature/Screening/` → `feature/screening/` 等全部重命名（使用 `git mv` 兩步驟）
8. 更新所有 Python import 路徑（`app.py`、`feature/__init__.py`、各 `routes.py`、`data_management/` 下所有檔案、`env/data_sync/scheduler.py`）
9. 更新所有 HTML 模板路徑（`routes.py` 中的 template 名稱）
10. ✅ 驗證：所有頁面正常渲染

### Step 3 — JS 搬移與改名
11. 建立各 `components/` 子目錄，搬移+改名 `function_block/` 下 JS
12. 搬移 `static/js/utils/` 至 `indicators/` 和 `chart/`
13. 建立 `indicators/modules/`，搬移 4 個指標 JS
14. 改名所有 PascalCase / camelCase JS 檔案
15. 刪除空目錄 `function_block/`、`static/js/utils/`
16. 更新所有 `<script src>` 路徑
17. ✅ 驗證：所有 JS 功能正常

### Step 4 — chart/ 拆分為 chart_management/ + kline_viewer/
18. 建立 `chart/chart_management/`，搬移 Modal 相關 JS + CSS
19. 建立 `chart/kline_viewer/`，搬移 K 線相關 JS + CSS
20. ✅ 驗證：圖表與設定 Modal 正常

### Step 5 — God Object 拆分
21. 拆分 `chart_settings_modal.js` → 核心 + `indicator_settings_tab.js` + `pattern_settings_tab.js`
22. 拆分 `screening.js` → 核心 + `progress_area.js` + `results_table.js`
23. 拆分 `chart_controller.js` → 核心 + `chart_tooltip.js`
24. ✅ 驗證：所有 Modal 分頁、SSE、結果渲染、Tooltip 正常

### Step 6 — CSS 搬移與拆分
25. 搬移 `stock-list.css`、`chart.css`、`backtest.css`
26. 拆分 `components.css`、`tabs.css`、`animations.css` Screening 專屬部分
27. 更新 `input.css` 所有 @import 路徑
28. ✅ 驗證：`npm run build:css` 無錯誤，排版風格一致

### Step 7 — HTML 片段化
29. 從 `screening.html` / `screening_fragment.html` 提取各 UI 區塊
30. 改寫為 `{% include %}` 調度員
31. ✅ 驗證：HTMX 切換正常

### Step 8 — Docker / Nginx 更新
32. 更新 `nginx.conf` 新增 `/feature/` 路徑
33. 更新 `docker-compose.yml` 新增 feature volume
34.  ✅ 驗證：Nginx 直接服務 feature 靜態資源

### Step 9 — models.py 歸位
35. 移動 `feature/models.py` → `screening/models.py`
36. 更新 `screening/routes.py` 中 `from ..models import ...` → `from .models import ...`
37. ✅ 驗證：API 正常

### Step 10 — 清理
38. 刪除 `diagnose.bat`、`find_imports.py`、`refactor_copy.py`、`debug_indicators.json`
39. 移除 `routes.py` 中 debug 程式碼
40. 加入 `pattern/models/.cache/` 至 `.gitignore`
41. ✅ 最終全面驗證

### Step 11 — 資金與風險管理重構（portfolio_risk_table_spec 實作完成後）
42. 將 `risk_management/function_block/` 改組為 `risk_management/components/`
43. 提取 `risk_management_fragment.html` 為 `{% include %}` 調度員
44. 更新 CSS/JS 路徑
45. ✅ 驗證：風險管理頁面功能正常

---

## 16. 重構後行數估計

| 檔案 | 原行數 | 重構後行數 | 說明 |
|:----|:--------|:----------|:-----|
| `chart_settings_modal.js` | 1,544 | ~800 ✅ | 拆出指標/型態設定 |
| `screening.js` | 1,023 | ~350 ✅ | 拆出 SSE/Progress + ResultsTable |
| `chart_controller.js` | 1,010 | ~750 ✅ | 拆出 Tooltip |
| `indicator_settings_tab.js` | — | ~500 (NEW) | |
| `results_table.js` | — | ~350 (NEW) | |
| `progress_area.js` | — | ~300 (NEW) | |
| `chart_tooltip.js` | — | ~260 (NEW) | |
| `pattern_settings_tab.js` | — | ~250 (NEW) | |
| `screening.html` | 584 | ~50 ✅ | |
| `screening_fragment.html` | 578 | ~40 ✅ | |

> **全部檔案均低於 1000 行** ✅

---

## 17. 驗證清單

| # | 驗證事項 | 通過條件 |
|:---|:---|:---|
| T1 | `npm run build:css` | 無錯誤，`tailwind.output.css` 正常生成 |
| T2 | `/screening` 頁面載入 | 無 404 / console error |
| T3 | HTMX 切換至 /screening | fragment 正常渲染 |
| T4 | 市場選擇 + 篩選執行 | SSE 進度條正常、結果顯示 |
| T5 | K 線圖載入 | LW Charts 正常顯示 |
| T6 | 圖表設定 Modal | 5 分頁正常開關，色板正常 |
| T7 | 型態識別 | YOLO 推理 + 標註框正常 |
| T8 | 策略保存 / 載入 | localStorage 正常 |
| T9 | 指標 Toggle / Top Bar | overlay 正常 |
| T10 | 全螢幕切換 | 正常 |
| T11 | Tooltip 懸浮窗 | 資料正確 |
| T12 | Nginx 靜態資源 | `/feature/screening/...` 正常載入 |
| T13 | Docker 啟動 | `start_server.bat` 一鍵成功 |
| T14 | 排版對比 | 重構前後逐像素對比無差異 |
| T15 | `/backtesting` 頁面 | 正常 |
| T16 | `/risk-management` 頁面 | 正常 |
| T17 | Container 數量 | 仍為 4 個（mysql, fastapi, nginx, data_sync）|
