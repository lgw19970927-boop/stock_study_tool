# CSS Tailwind 化計畫書 v3（input.css @import 深化收斂版）

建立日期：2026-03-30  
適用範圍：input.css 目前 @import 的 source CSS

---

## 1. 目標與原則

本版目標：在不改變視覺與功能行為的前提下，進一步 Tailwind 化 input.css 所引用的 CSS，並逐步降低行數與 @import 數量。

約束維持：
1. 視覺風格與互動行為需與現況一致。
2. 可讀性優先，不為了極限壓縮而犧牲維護性。
3. scrollbar、偽元素、第三方耦合高風險樣式可保留。
4. JS 綁定 class 名稱不變。

---

## 2. input.css 現況盤點（Wave E 後）

目前 import：
1. 全域：variables.css、animations.css、layout.css、components.css、tabs.css
2. screening：screening.css、chart-area.css、chart-modal.css
3. 其他：risk_management.css

觀察重點：
1. results-table.css 與 screening.css 已完成整併，input.css 不再匯入 results-table.css。
2. chart-modal.css 的 general/axis 區段可優先改為模板 utility class，降低大檔維護負擔。
3. backtesting.css 已改為極簡 placeholder 樣式，並退出 input.css 編譯鏈。

---

## 3. v3 分波策略

### Wave E（本次先實作）

目標：移除一條 @import，維持等價樣式。

執行：
1. 將 toggle-switch、toggle-slider、chart-options 等 chart 控制列樣式搬到 chart-area.css。
2. 將 strategies-list 與 strategy-card 必要狀態收斂到 screening.css。
3. 從 input.css 移除 strategy-manager.css 的 @import。
4. 保留 strategy-manager.css 檔案本體做回溯，不參與編譯。

驗證：
1. npm run build:css
2. pytest tests/test_tailwind_migration_guard.py
3. 人工檢查：
   - chart 區塊兩個 toggle 開關外觀/可點擊區
   - 已儲存策略卡片 hover/active 顯示

### Wave F（本輪已實作）

目標：再減少 1~2 條 @import（視風險）。

候選：
1. results-table.css 與 screening.css 的 state/empty/progress 區段再整併。
2. backtesting.css 若模板 utility 化比例再提高，可評估部分規則搬回模板並瘦身。

### Wave G（本輪已實作，採保守分段）

目標：chart-modal.css 分段 utility-first 化。

說明：
1. chart-modal.css 是當前最大檔，收益高但耦合高。
2. 需以小批次分段（面板、設定列、色盤）實施與驗證。

---

## 4. 風險與對策

1. 風險：移除 strategy-manager.css 後細節樣式漂移。  
   對策：僅移除 import，不改 class 名稱；先搬移必要樣式再移除 import。

2. 風險：不同區塊使用同名 selector 時出現覆蓋差異。  
   對策：保留 selector 與屬性等價，並在目標檔案維持接近原有語義區塊。

3. 風險：編譯通過但互動態樣式漏掉。  
   對策：build + guard test + 指定 UI 手動檢查清單。

---

## 5. 本版結論

1. input.css 的 @import 仍有進一步收斂空間。
2. v3 先選擇低風險、可立即落地的 Wave E：先移除 strategy-manager.css 的編譯依賴。
3. 完成 Wave E 後，再以同樣方法逐步挑戰下一條 @import，避免一次性大改造成回歸風險。

---

## 6. Wave E 實作結果（本次已完成）

已完成項目：
1. chart toggle 相關樣式已搬至 app/feature/screening/chart/kline_viewer/chart-area.css。
2. strategies-list 與 strategy-card 關鍵狀態樣式已收斂至 app/feature/screening/screening.css。
3. app/static/css/input.css 已移除 strategy-manager.css 的 @import。
4. strategy-manager.css 保留於專案供回溯，但不再參與 input.css 編譯鏈。

驗證結果：
1. npm run build:css：通過。
2. pytest tests/test_tailwind_migration_guard.py：5 passed。

本輪收益：
1. input.css import 數量再減 1。
2. chart 控制樣式歸位到 chart-area，模組邊界更清楚。
3. 保持既有 class 與互動流程，降低回歸風險。

---

## 7. Wave F + Wave G 實作結果（本輪一次完成）

### Wave F 實作

已完成項目：
1. `results_table/templates/ui.html` 與 `results_table.js` 已完成 utility-first 改寫（含標籤、進度區、動態列）。
2. screening.css 已補齊 Wave F 最小必要規則（scrollbar、selected 狀態、排序/狀態控制），並移除 input.css 對 results-table.css 的匯入。
3. backtesting.css 已深度瘦身為 placeholder 最小樣式，input.css 同步移除 backtesting.css 匯入。
4. risk_management 區塊已完成第一批深瘦：
   - params / overview / portfolio 模板改為 utility-first
   - portfolio_block.js 動態列（徽章、方向按鈕、批次輸入/按鈕）改為 utility-first
   - risk_management.css 移除大量已不再被引用的 helper selector（btn/rm-th/rm-foot/rm-row-input/pm-*）

### Wave G 實作

已完成項目：
1. chart_settings_modal.js 的常規設定與坐標軸設定模板改為 utility-first（select、row、toggle group 直接內嵌 utility class）。
2. chart-modal.css 移除對應已被模板承接的 general/toggle 規則。
3. chart-modal.css 清除未使用的 axis-mode 相關樣式（dead CSS）。

收益：
1. chart-modal.css 進一步縮小，降低後續維護成本。
2. 保持 class toggle 與既有 JS 行為，降低互動回歸風險。
3. Wave F 的最終收斂改為「先完整搬移再移除 import」，避免視覺回歸。

---

## 8. v3 To do list（完成勾選）

- [x] Wave E：移除 strategy-manager.css 的 input.css 編譯依賴
- [x] Wave F：整併 results-table.css 至 screening.css 並移除 @import
- [x] Wave G：chart modal（general/axis）分段 utility-first 化
- [x] Wave G：移除 chart-modal.css 對應 dead / 已承接規則
- [x] Backtesting 深度瘦身（退出 input.css 編譯鏈，僅保留 placeholder 最小樣式）
- [x] RiskManagement 深度瘦身第一批（模板 + 動態列 utility-first，risk_management.css 大幅收斂）
