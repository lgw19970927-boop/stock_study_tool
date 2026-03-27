# Screening 功能架構大重構：按功能模組化 (Modular by Feature) 全手冊

本文件為 `App/Feature/Screening/` 及全專案架構轉型的最終技術規範。整合了 100% 的原始審查細節、建築原則以及未來擴充藍圖。

---

## 1. 現狀審查與痛點分析 (God Object Audit)

經過對專案代碼的全面掃描，以下「萬能物件」是本次重構的重點對象：

| 檔案名稱 | 約略行數 | 目前職責描述 | 重構/拆解方案 |
| :--- | :--- | :--- | :--- |
| **`chartSettingsModal.js`** | 1,729 | 包含所有指標(MA/BOLL/各項參數)、型態設定、圖表外觀、座標軸管理、色板 | **完全拆分**：將指標設定與型態設定歸還至功能垂直切片。 |
| **`screening.js`** | 1,164 | 處理 HTMX 請求、SSE 讀取、結果渲染、排序、佈局管理、全螢幕切換 | **模組化**：拆分為單一職責之 UI 與控制組件。 |
| **`chartController.js`** | 1,140 | 封裝圖表引擎、K線載入、指標渲染、Tooltip 計算、座標軸同步 | **分層**：基礎引擎提升至共享零件層。 |
| **`pattern_annotation.js`** | 529 | 處理 SVG 圖層繪製、型態框標註、Y軸拖拉補強邏輯 | **封裝**：移入 `Pattern/` 目錄，作為圖表的一個標註插件。 |
| **`strategyManager.js`** | 396 | 策略 CRUD 操作、列表渲染、狀態備份 | 表現良好的獨立模組，將保留其設計思維。 |

### 目前存在的問題：
*   **按類型分層 (Layered by Type)**：JS、CSS、HTML 散落在 `Static/` 和 `Template/` 中，修改一個功能需切換 5 個目錄。
*   **樣式與邏輯分散**：所有 CSS 堆疊在 `screening.css`，所有 JS 邏輯依賴 `window.state` 強耦合。
*   **認知負擔高**：開發者難以一眼看出功能零件間的連動關係。

---

## 2. 核心架構原則：按功能模組化 (Modular by Feature)

本架構的核心邏輯在於 **「讓程式碼的結構跟業務邏輯（生意長什麼樣）保持一致」**：

1.  **直覺的業務對應**：讓新進入者只需看資料夾名稱，就能理解系統提供了哪些功能。
2.  **降低維護的認知負擔**：修改組件時，您只需集中在一個資料夾內，裡面包含了該功能所需的所有 Python、HTML、JS、CSS。
3.  **極佳的擴展性 (Scalability)**：直接在 `Screening/` 下新增一個資料夾即可擴充功能，將「改 A 壞 B」的風險降到最低。

---

## 3. 垂直切片架構圖：細部目標清單 (Existing-to-Target Tree)

本架構圖將分散在 God Object 中的現有功能代碼提取至獨立檔案，並明確列出所有相關的 `.html`, `.css`, `.js`, `.py` 檔案。

```text
App/
├── Feature/                                    (核心業務層：業務邏輯垂直切片)
│   ├── Screening/                              (選股全棧模組)
│   │   ├── routes.py                           (入口：FastAPI 路由與頁面渲染)
│   │   ├── service.py                          (核心：篩選邏輯與各指標組件調度)
│   │   ├── models.py                           (資料：定義狀態與篩選參數 Pydantic)
│   │   ├── screening.js                        (調度：Init 與全域狀態管理)
│   │   ├── screening.css                       (樣式：頁面框架基礎佈局)
│   │   ├── layout-screening.js                 (佈局：區域佈局管理 / 從 Static/js 移入)
│   │   │
│   │   ├── templates/                          (「頁面級別」外殼模板)
│   │   │   ├── screening.html                  (主頁面：導航及全螢幕組態)
│   │   │   └── screening_fragment.html         (HTMX：局部刷新槽總組合器)
│   │   │
│   │   ├── Components/                         (「功能組件」切片目錄)
│   │   │   ├── ResultsTable/                   (股票結果清單組件)
│   │   │   │   ├── templates/ui.html           (Jinja2: HTML 片段)
│   │   │   │   ├── ResultsTable.js             (邏輯：從 screening.js 拆分移入)
│   │   │   │   └── ResultsTable.css            (樣式：從 stock-list.css 與 animations.css 拆分)
│   │   │   ├── ProgressArea/                   (篩選進度顯示組件)
│   │   │   │   ├── templates/ui.html           (Jinja2: HTML 片段)
│   │   │   │   ├── ProgressArea.js             (邏輯：從 screening.js 拆分移入)
│   │   │   │   └── ProgressArea.css            (樣式：從 screening.css 拆分移入)
│   │   │   ├── StopDialog/                     (暫停確認對話框組件)
│   │   │   │   ├── templates/ui.html           (Jinja2: HTML 片段)
│   │   │   │   ├── StopDialog.js               (邏輯：從 screening.js 拆分移入)
│   │   │   │   └── StopDialog.css              (樣式：從 screening.css 拆分移入)
│   │   │   ├── MarketSelection/                (市場選擇組件)
│   │   │   │   ├── templates/ui.html           (Jinja2: HTML 片段)
│   │   │   │   ├── MarketSelection.js          (組件邏輯)
│   │   │   │   └── MarketSelection.css         (樣式：從 components.css 拆分移入)
│   │   │   ├── StrategyManager/                (策略管理組件)
│   │   │   │   ├── templates/ui.html           (Jinja2: HTML 片段)
│   │   │   │   ├── StrategyManager.js          (邏輯：從 screening.js 拆分移入)
│   │   │   │   └── StrategyManager.css         (樣式：從 screening.css 拆分移入)
│   │   │   └── TimeRangeSelector/              (時間範圍選擇組件)
│   │   │       ├── templates/ui.html           (Jinja2: HTML 片段)
│   │   │       ├── TimeRangeSelector.js        (邏輯：從 screening.js 拆分移入)
│   │   │       └── TimeRangeSelector.css       (樣式：從 components.css 拆分移入)
│   │   │
│   │   ├── Indicators/                         (「指標組合」模組)
│   │   │   ├── templates/indicator_list.html   (Jinja2: 指標篩選面板)
│   │   │   ├── IndicatorManager.js             (管理：篩選器卡片與註冊)
│   │   │   ├── IndicatorStyles.css             (樣式：從 components.css 拆分移入)
│   │   │   ├── registry.js                     (調度：指標調用中心)
│   │   │   ├── indicatorRegistry.js            (資料：指標定義註冊 / 從 Static 移入)
│   │   │   ├── chartIndicators.js              (圖表：渲染邏輯元件 / 從 Static 移入)
│   │   │   └── modules/                        (指標算法模組)
│   │   │       ├── sma/                        (SMA 算法組件)
│   │   │       │   ├── service.py              (算法：Python 數值計算邏輯)
│   │   │       │   └── config_ui.js            (介面：專屬參數設定 UI)
│   │   │       └── bollinger/                  (BOLL 算法組件)
│   │   │           ├── service.py              (算法：Python 數值計算邏輯)
│   │   │           └── config_ui.js            (介面：專屬參數設定 UI)
│   │   │
│   │   ├── Pattern/                            (「型態辨識」模組)
│   │   │   ├── templates/                      (Jinja2: 篩選與標註 UI)
│   │   │   │   ├── filter_ui.html              (HTML: 型態篩選區)
│   │   │   │   └── annotation_ui.html          (HTML: 圖表標註層)
│   │   │   ├── PatternManager.js               (管理：事件綁定與狀態)
│   │   │   ├── PatternAnnotation.js            (圖表：SVG 標註繪製噴泉)
│   │   │   ├── PatternStyles.css               (樣式：從 components.css 拆分移入)
│   │   │   ├── service.py                      (後端：YOLO 偵測核心)
│   │   │   ├── routes.py                       (端點：辨識結果串流)
│   │   │   └── models/                         (資源：AI 權重檔檔案庫)
│   │   │       ├── foduucom_stock_patterns.pt  (權重：YOLO 模型檔案)
│   │   │       └── model.pt                    (權重：輔助偵測模型)
│   │   │
│   │   └── ChartUnit/                          (圖表核心區域)
│   │       ├── ChartController.js              (引擎：圖表主控制器)
│   │       ├── ChartArea.css                   (佈局：從 Static/css/chart.css 移入)
│   │       └── chartRenderer.js                (渲染：畫布底層渲染庫 / 從 Static 移入)
│   │
│   ├── Backtesting/                            (模擬回測模組)
│   │   ├── routes.py                           (入口：回測 API)
│   │   ├── templates/                          (Jinja2: 回測頁面外殼與片段)
│   │   │   ├── backtesting.html                (頁面：回測報表主頁)
│   │   │   └── backtesting_fragment.html       (報表：局部渲染內容)
│   │   └── backtesting.css                     (樣式：從 Static/css/backtest.css 移入)
│   │
│   ├── RiskManagement/...                      (風險管理模組：略)
│   └── DataManagement/...                      (資料維護模組：略)
│
├── Lib/                                        (後端共享工具層：業務集成分離)
│   ├── __init__.py                             (包初始化)
│   └── db.py                                   (核心：資料庫連線池協定)
│
└── Static/                                     (全域資源庫：不隨頁面業務變化)
    ├── css/                                    (共用樣式庫)
    │   ├── animations.css                      (動畫：全域通用 Loading 效果)
    │   ├── components.css                      (元件：全域按鈕與 UI 原子)
    │   ├── input.css                           (樣式入口：Tailwind 原碼)
    │   ├── variables.css                       (代幣：全域設計規範定義)
    │   └── tailwind.output.css                 (輸出：編譯後生產環境樣式)
    └── js/                                     (全域邏輯庫)
        ├── app.js                              (核心：SSO 與全域生命週期)
        ├── layout.js                           (佈局：管理通用的側邊欄與標題)
        └── config.js                           (配置：前端環境變數與 API 路徑)
```
---

## 4. 架構關鍵運作模式 (Operation Modes)

1.  **垂直切片 (Feature Slices)**：解決「改 A 壞 B」問題，每個資料夾都是自給自足的模組。
2.  **HTML 片段化 (Fragmentation)**：主模板只負責大排版，細節透過 `{% include %}` 引入各組件。

**Page 外殼 (screening.html)**：只定義頁面大排版與導航。
**Fragment 容器 (screening_fragment.html)**：作為 HTMX 的「組件調度員」，使用 {% include %} 引入各個組件的 ui.html。
**功能切片 (Components/)**：每個資料夾都是一個「盒子」，內部包含 HTML/JS/CSS，實現真正的模組化。
HTML 片段化：
將過長的 screening.html (500+ 行) 按照組件拆分到各自的 templates/ui.html 中。
在後端 FastAPI 初始化 Jinja2Templates 時，加入多個搜尋目錄：
python
templates = Jinja2Templates(directory=["App/Feature/Screening/templates", "App/Feature/Screening/Components"])
原本 screening.js(1100+ 行) 的邏輯會依功能散佈到如 MarketSelection.js 與 ResultsTable.js 中。
原本 screening.css(500+ 行) 將被拆解，讓樣式可以隨著功能組件移動。
3.  **解決 God Object 問題**：原本 1,000 行的 `screening.js` 被拆解為單一職責的小 JS。引專屬 `StateManager.js` 管理狀態。

---

## 5. Tailwind CSS CLI + Custom CSS 整合策略

### 5.1 對架構的具體影響
1.  **樣式歸屬化**：CSS 搬進組件資料夾，實現「全棧自給自足」。
2.  **編譯管線化**：`input.css` 充當「主控清單 (Master Manifest)」。
3.  **顯性依賴管理**：必須在 `input.css` 中顯式地 `@import`。

### 5.2 運作模式
1.  **掃描配置**：`tailwind.config.js` 掃描所有 `./App/**/*.html` 與 `./App/**/*.js`。
2.  **樣式彙整**：各組件 `.css` 在 `App/Static/css/input.css` 匯總。
3.  **單一打包**：Tailwind CLI 生成單一的 `tailwind.output.css`。

---

## 6. 📉 資源搬運建議表 (Old vs New)

| 原始檔案位置 | 建議重構至新路徑 | 目的 |
| :--- | :--- | :--- |
| `Static/js/layout-screening.js` | `Screening/Components/Layout/` | 業務功能歸位 |
| `Static/css/backtest.css` | `Backtesting/` | 完成垂直切片 |
| `Static/js/utils/chartIndicators.js` | `Screening/Indicators/` | 高內聚管理 |
| `Static/css/stock-list.css` | `Screening/Components/ResultsTable/` | UI 零件化 |

---

## 7. 深度架構建議 (Advanced Architectural Insights)

1.  **分離「腦袋 (Logic)」與「面子 (UI)」**：`Indicators/` 與 `Pattern/` 應與 `Components/` **保持同級**，區分有邏輯的功能支柱與純 UI 零件。
2.  **模組調度核心**：建議在 `Screening/` 下新增一個細部調度層解決模組間的通訊解耦。

---

## 8. 本專案全域資源存放邏輯：Lib 與 Static

1.  **Lib/ (工具箱)**：存放跨功能、業務無關的底層服務（如 `db.py`）。
2.  **Static/ (資源庫)**：存放不隨頁面業務邏輯變化的靜態資產（如全域變數、編譯後 CSS）。

---

**結論：此架構將複雜系統拆解為簡單的小零件，讓程式碼「好找、好改、好測試」，是支撐本專案未來十年發展的核心基石。**