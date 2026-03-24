# App/Feature 架構調整計畫書 (Architecture Restructuring Plan)

**日期**: 2026-03-22
**目標**: 貫徹「先分頁，後功能」之專案目錄分層原則，並因應擴展需求微調功能歸屬。

## 背景描述
目前專案的 `App/Feature` 目錄包含多個層級與不同職責的模組。為確保後續專案規模擴大時仍具備高可維護性，將 `App/Feature` 定義為「分頁與專案核心功能」的頂層容器。在進入各個分頁或核心模組層級後，再依照其具體功能單一職責劃分子目錄進行收納。

## 結論與具體執行項目 (Proposed Changes)

基於上述原則與討論結果，將對現有架構進行以下三階段的局部重構與更名調整：

### 1. 資料庫與同步功能：升級與拆分 (原 `data_sync`)
由於原 `data_sync` 模組已不只負責單純的市場數據抓取，還涵蓋了「資料庫備份與還原」等獨立職責，因此需要升級與細分：

- **[RENAME] `App/Feature/data_sync` ➔ `App/Feature/DataManagement` (或 `DataOperations`)**
  將整個模組更名，以擴展其涵蓋範圍的語意。
- **[NEW] 子功能目錄拆分**：
  在新的模組根目錄下建立職責單一的子目錄：
  - `App/Feature/DataManagement/sync/`：存放專門抓取台股數據、市場資料同步邏輯的腳本（例如 `market_data.py`）。
  - `App/Feature/DataManagement/backup/`：存放專職負責資料庫匯出、備份與還原邏輯的腳本。
  - 共用檔案（如 `db.py`）則統一保留在 `DataManagement/` 根目錄。

### 2. `Screening` (選股工具分頁)：內部目錄重構
將該分頁根目錄下散落的功能依據其特性與畫面佔比歸類至專屬或共用功能目錄。核心頁面路由與全域畫面綁定邏輯則保留於根目錄。

- **[NEW] `App/Feature/Screening/chart/` (圖表設定功能)**：
  新增專屬資料夾集中管理走勢圖、布林通道等圖表與 UI 相關的檔案：
  - `chartController.js`
  - `chartSettingsModal.js`
  - `chart-settings-modal.css`
- **[MOVE] 將 `strategyManager.js` 移入 `function_block`**：
  `strategyManager.js` 負責管理前端篩選策略的 UI 操作與邏輯生成，屬於該分頁上一個獨立的「功能區塊（Function Block）」片段。將其移入現有的 `App/Feature/Screening/function_block/`，與其他區塊並列。
- **[RETAIN] 核心與一般功能檔案維持現狀**：
  - 維持原有的 `indicators/`、`pattern/` 與 `templates/` 目錄。
  - `screening.html`, `screening_fragment.html`, `screening.css`, `screening.js`, `routes.py`, `service.py` 皆保留於 `Screening/` 根目錄，作為該分頁主程式入口。

### 3. 其餘分頁與模組維持現狀
- **`RiskManagement` (風險管理分頁)**：結構已足夠單純也初步符合分類，暫不調整。
- **`Backtesting` (回測分頁)**：架構尚單純未擴充功能，暫不調整。

---
> **備註**:
> 本文件為架構調整草案，待確認可行與時程後，方可著手進行目錄與檔案的實際搬移。搬移後須注意相應 Python `.py` 的 `import` 路徑，以及 HTML 中 `.js` / `.css` 引用路徑的全面掃描與批量修正。
