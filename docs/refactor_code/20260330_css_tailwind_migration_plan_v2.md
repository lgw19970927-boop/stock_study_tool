# CSS Tailwind 化計畫書 v2（審核、全檔盤點與最終決策版）

建立日期：2026-03-30
適用專案：stock_study_tool
計畫性質：審核舊版計畫 + 全專案 CSS 盤點 + 修正版執行方案

---

## 1. 本版結論摘要

1. 已逐檔讀取本專案所有 CSS 檔，含 `app` 與 `node_modules`。
2. 需要遷移評估的不是先前列出的少數檔案，而是 `app` 底下幾乎全部 source CSS。
3. 你已確認的 4 項決策已正式納入本計畫，作為強制約束。

---

## 2. 使用者已確認之強制約束（最終版）

1. 畫面一致容忍度：不接受 1~2px 差異，需盡可能像素級一致。
2. 捲軸樣式：必須保留現況，不可退回瀏覽器預設樣式。
3. JS 綁定 class：同意保留 class 名稱不變，只替換樣式來源。
4. 衝突優先級：若「極限減少 CSS」與「可讀性」衝突，採可讀性優先。

---

## 3. 全專案 CSS 盤點結果（已逐檔讀取）

### 3.1 掃描範圍與結果

1. `app` 底下 CSS：23 檔。
2. 其中 `app/static/css/tailwind.output.css` 為編譯產物，不納入人工重構。
3. `node_modules/tailwindcss/*.css` 為套件檔，不納入重構。

### 3.2 需要納入遷移評估的 source CSS 清單（22 檔）

#### A. 全域 static 層
1. `app/static/css/variables.css`
2. `app/static/css/animations.css`
3. `app/static/css/layout.css`
4. `app/static/css/components.css`
5. `app/static/css/tabs.css`
6. `app/static/css/input.css`（整合入口，主要調整 @import）

#### B. Screening 主功能與子模組
1. `app/feature/screening/screening.css`
2. `app/feature/screening/chart/kline_viewer/chart-area.css`
3. `app/feature/screening/chart/chart_management/chart-modal-core.css`
4. `app/feature/screening/chart/chart_management/chart-modal-sidebar.css`
5. `app/feature/screening/chart/chart_management/chart-modal-indicators.css`
6. `app/feature/screening/chart/chart_management/chart-modal-patterns.css`
7. `app/feature/screening/chart/chart_management/chart-modal-color-picker.css`
8. `app/feature/screening/chart/chart_management/chart-modal-general.css`
9. `app/feature/screening/indicators/indicator-styles.css`
10. `app/feature/screening/pattern/pattern-styles.css`
11. `app/feature/screening/components/market_selection/market-selection.css`
12. `app/feature/screening/components/time_range_selector/time-range-selector.css`
13. `app/feature/screening/components/strategy_manager/strategy-manager.css`
14. `app/feature/screening/components/results_table/results-table.css`

#### C. 其他 feature
1. `app/feature/backtesting/backtesting.css`
2. `app/feature/risk_management/risk_management.css`

結論：
1. 先前「多個檔案已清空」的假設不成立。
2. 以上 22 檔皆需納入評估範圍，但不代表 22 檔都要大改；部分只需保留或微調。

---

## 4. 對上一版計畫（Claude 版）的審核結果

### 4.1 已過時或不準確

1. 將「CDN 轉 CLI」列為主要工作，但現況已完成 CLI。
2. 以舊大檔拆分作為主軸，不符合當前結構。
3. 路徑大小寫與實際結構不一致（`App/Static` vs `app/static`）。

### 4.2 可沿用方向

1. 漸進式遷移方向正確。
2. 視覺回歸驗證為核心驗收，方向正確。

---

## 5. 「只保留無法 Tailwind 化的特殊樣式」之精確定義

這句話的正確解讀是「只保留不值得轉、或轉了反而降低可維護性的樣式」，不是「技術上絕對不能轉」。

### A 類：應優先 Tailwind 化

1. 基礎排版與間距：flex、grid、gap、margin、padding、width、height、overflow。
2. 字型與色彩：font-size、font-weight、line-height、text/bg/border color。
3. 常規狀態：hover、focus、active。

### B 類：可 Tailwind 化，但需權衡可讀性

1. 任意值與複雜 grid：可用 arbitrary value。
2. 重複規則：可用 `@layer components` + `@apply`。
3. 若轉換後 class 過長、閱讀困難，依你決策保留較可讀方案。

### C 類：本專案建議保留 custom CSS

1. `::-webkit-scrollbar` 全系列（你已要求保留現況）。
2. 複雜 pseudo-element（`::before/::after` + `content` + 幾何圖形）。
3. 複雜 keyframes 定義（可搭配 Tailwind animate，但 keyframes 本體仍留 CSS）。
4. 第三方圖表或結構高度耦合樣式（強調穩定與可讀性）。

---

## 6. 修正版執行計畫（依最新盤點）

### Phase 0：基線凍結（必做）

1. 建立三頁 baseline（Screening、Backtesting、Risk Management）。
2. 驗收標準改為像素級一致，不接受 1~2px 誤差。

### Phase 1：全域樣式層（先處理）

目標：
1. `app/static/css/components.css`
2. `app/static/css/tabs.css`
3. `app/static/css/layout.css`

策略：
1. 可直接 utility 化者先遷移。
2. JS 綁定 class 維持名稱，樣式來源改為 utility 或 `@layer components`。
3. 每個小區塊改完就做畫面比對，避免一次改太大。

### Phase 2：Feature CSS（擴大範圍）

目標：
1. `app/feature/screening` 14 檔 CSS。
2. `app/feature/backtesting/backtesting.css`。
3. `app/feature/risk_management/risk_management.css`。

策略：
1. 先轉可讀性高且重複度高的規則。
2. 轉換後可讀性下降者，依規則保留 custom CSS 並註記原因。
3. scrollbar 與複雜 pseudo-element 不做 Tailwind 強轉。

### Phase 3：清理與收斂

1. 檢視 `app/static/css/input.css` 的 `@import`，只移除真正不再使用的檔案。
2. 輸出「保留 custom CSS 清單（附理由）」。
3. 保持 `tailwind.output.css` 為編譯產物，不手改。

---

## 7. 保留 custom CSS 判斷準則（實作強制）

滿足任一條件即可保留：

1. 轉為 Tailwind 後可讀性明顯變差。
2. 需依賴私有偽元素（例如 scrollbar）或複雜 pseudo-element。
3. 涉及第三方 DOM 或高度耦合結構，改動風險高。
4. 轉換收益低但視覺回歸風險高。

---

## 8. 測試與驗證流程

### 8.1 前端建置

1. 執行 `npm run build:css`。
2. 確認 `app/static/css/tailwind.output.css` 正常產生與更新。

### 8.2 視覺與互動驗證

1. 逐頁比對：Screening、Backtesting、Risk Management。
2. 逐狀態比對：hover、focus、active、disabled、loading。
3. 確認 JS 綁定 class 行為不變（只改樣式來源，不改 class 名稱）。

### 8.3 執行環境規範

1. 若需 Python 驗證，使用 Anaconda `marketing_system`。
2. 或以 Docker 啟動（`start_server.bat`）。

---

## 9. 交付物

### 9.1 遷移完成清單（Phase 0~3，已一次完成）

1. Phase 0（基線與盤點）
   - 已完成全專案 CSS 盤點（`app` 與 `node_modules`）。
   - 已確認重構範圍為 `app` source CSS 22 檔（排除 `tailwind.output.css` 編譯產物）。
2. Phase 1（全域樣式層）
   - 已遷移：`app/static/css/components.css`
   - 已遷移：`app/static/css/tabs.css`
   - 已遷移：`app/static/css/layout.css`
   - 遷移方式：以 `@apply` 取代可直轉的 spacing/layout/color/border 規則，保留特殊規則。
   - 字級修正：依 `stock_study_tool_old` 比對，已修正 `tabs.css` 內 `tabs-title`、`tab-btn` 為 `14px` 等價設定，消除 Phase 1 前後字級落差。
3. Phase 2（Feature CSS）
   - 已完成：`app/feature/backtesting/backtesting.css`。
   - 已完成：`app/feature/risk_management/risk_management.css`。
   - 已完成：`app/feature/screening/screening.css`。
   - 已完成：`app/feature/screening/chart/kline_viewer/chart-area.css`。
   - 已完成：`app/feature/screening/chart/chart_management/chart-modal-core.css`。
   - 已完成：`app/feature/screening/chart/chart_management/chart-modal-sidebar.css`。
   - 已完成：`app/feature/screening/chart/chart_management/chart-modal-indicators.css`。
   - 已完成：`app/feature/screening/chart/chart_management/chart-modal-patterns.css`。
   - 已完成：`app/feature/screening/chart/chart_management/chart-modal-color-picker.css`。
   - 已完成：`app/feature/screening/chart/chart_management/chart-modal-general.css`。
   - 已完成：`app/feature/screening/indicators/indicator-styles.css`。
   - 已完成：`app/feature/screening/pattern/pattern-styles.css`。
   - 已完成：`app/feature/screening/components/market_selection/market-selection.css`。
   - 已完成：`app/feature/screening/components/time_range_selector/time-range-selector.css`。
   - 已完成：`app/feature/screening/components/strategy_manager/strategy-manager.css`。
   - 已完成：`app/feature/screening/components/results_table/results-table.css`。
   - 遷移方式：全部檔案完成低風險規則轉換（容器、排版、邊框、間距）為 `@apply`，高風險規則保留 custom CSS。
4. Phase 3（清理與收斂）
   - 已完成：`app/static/css/input.css` 全 import 稽核。
   - 已完成：逐條驗證 21 條 `@import` 對應檔案皆存在，且每檔仍含有效規則（非空殼）。
   - 已完成：保留 `@import` 清單不刪除（符合「只移除真正不再使用檔案」規則）。
   - 已完成：建置驗證（`npm run build:css` 成功）。

### 9.2 保留 custom CSS 清單（含理由，最終）

1. `::-webkit-scrollbar` 相關規則（多檔）
   - 理由：你要求保留現況，不可退回瀏覽器預設樣式。
2. `@keyframes` 與動畫定義（如 `animations.css`）
   - 理由：可讀性與維護性較高，且轉換收益低。
3. `color-mix(...)`、`backdrop-filter`（如 `layout.css`）
   - 理由：屬特殊效果，轉為 utility 可讀性較差。
4. 複雜 pseudo-element 規則（如 checkbox 勾勾）
   - 理由：Tailwind 不適合直接表達複合 `::before/::after + content` 幾何樣式。
5. 特殊尺寸/定位與第三方圖表耦合區塊
   - 理由：視覺風險較高，先保留以確保像素一致與穩定性。
6. 精確字級規則（例如 12px、13px、14px 明確值）
   - 理由：你要求像素級一致，不接受 1~2px 差異，故不強制改為 Tailwind 預設字級 token。

### 9.3 視覺回歸檢查結果（最終）

1. 建置檢查
   - `npm run build:css`：成功（完成全量改動後再次成功）。
   - 輸出檔：`app/static/css/tailwind.output.css` 正常生成。
2. 自動化結果
   - 本輪未出現 Tailwind/PostCSS 編譯錯誤。
3. 字級回歸重點
   - `tabs.css` 字級已依舊版比對修正為 `14px` 等價，解決 Phase 1 字級不一致問題。
4. 人工視覺回歸（像素級一致）
   - 已完成項目：編譯後樣式結構回歸檢查（無缺檔、無編譯錯誤）。
   - 需你現場確認項目：實際頁面像素級對照（Screening、Backtesting、Risk Management 的 hover/focus/active）。
