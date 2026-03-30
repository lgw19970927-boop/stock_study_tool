# CSS Tailwind 化計畫書 v4（2026-03-31 一次性修補 + 一次性瘦身完成）

建立日期：2026-03-31
適用範圍：input.css 目前引用檔（Global + Screening + RiskManagement）

---

## 1. 本輪目標（一次完成）

1. 先修正 RiskManagement 回歸 Bug（你回報的 5 項）。
2. 回答方法論與 input.css 引用問題。
3. 對 Pasted Image4 中 input.css 引用檔做一次性瘦身（不分階段）。
4. 確保 build 與 guard test 通過。

---

## 2. RiskManagement Bug 修復（已完成）

### 2.1 修復清單

1. 初始資金輸入框與 `$` 重疊
   - 修正：加大 `rm-capitalInput` 左內距（`pl-[1.4rem] -> pl-[1.7rem]`）。
   - 檔案：`app/feature/risk_management/components/params/templates/ui.html`

2. 資金使用率進度條未顯示
   - 修正：在 `risk_management.css` 明確給 `.rm-progress-bar` 背景 `var(--accent-gradient)` 作為保險樣式。
   - 檔案：`app/feature/risk_management/risk_management.css`

3. 文字錯字「盈虏比」
   - 修正：改為「盈虧比」。
   - 檔案：`app/feature/risk_management/components/portfolio/portfolio_block.js`

4. 投資組合風險明細表頭字色
   - 修正：僅針對 `#rm-portfolioTable thead tr` 覆寫為 `var(--text-primary)`（白字）。
   - 檔案：`app/feature/risk_management/risk_management.css`

5. 停損/實際出場欄位內置中
   - 修正：`$ [ ] @ [ ] %` 批次列與 `+新增停損/+新增出場` 按鈕改為欄內置中（含 planned 狀態文字置中）。
   - 檔案：`app/feature/risk_management/components/portfolio/portfolio_block.js`

### 2.2 驗證結果

1. `npm run build:css`：通過。
2. `pytest tests/test_tailwind_migration_guard.py`：`5 passed`。

---

## 3. 問題回覆（明確結論）

### Q1：Pasted Image3 的 css 是否真的沒有對應檔可套用？

結論：不是。

1. `input.css` 目前列出的引用檔都有對應實體檔。
2. 這些檔案不是「無對應」，而是「仍有有效規則被使用」，所以尚未能直接刪除 import。

### Q2：目前 tailwind 化是否是模板 utility + 少量保留 CSS + JS 動態 class 同步改？最終能否再刪 import？

結論：是，而且最終有機會再刪，但前提是該檔案內容被完全承接。

1. 現況做法確實是混合式（模板 utility + 少量保留 CSS + JS 同步）。
2. 最終可刪 import 的條件是：
   - 該檔案規則已搬到模板 utility 或共用 `@layer`。
   - 沒有 scrollbar / 偽元素 / 第三方耦合規則殘留。
   - 互動與視覺回歸驗證通過。

---

## 4. Pasted Image4 引用檔一次性瘦身（已完成）

### 4.1 本次實際瘦身動作

1. `layout.css`
   - 移除未使用 selector：`.nav-actions`。

2. `screening.css`
   - 移除重複語意註解。
   - 刪除重複宣告（`.pattern-card span` 中重複 `color`）。

3. `chart-modal.css`
   - 移除大量空白噪音行。
   - 合併相同規則：
     - 拖曳態：`.chart-modal-container.is-dragging, .color-picker-container.is-dragging`
     - 滾動條 track：`.chart-modal-content` / `.chart-modal-sidebar`
     - checkbox 基底：`.indicator-item input[type="checkbox"], .pattern-cb`
   - 保留高風險規則（itb、偽元素、圖表互動）不動。

4. `risk_management.css`
   - 本輪以 bug 修復為主，未做破壞性瘦身。

### 4.2 行數量化（一次性前後）

| 檔案 | 瘦身前 | 瘦身後 | 變化 |
|---|---:|---:|---:|
| app/static/css/layout.css | 131 | 127 | -4 |
| app/static/css/components.css | 110 | 110 | 0 |
| app/static/css/tabs.css | 128 | 128 | 0 |
| app/feature/screening/screening.css | 628 | 626 | -2 |
| app/feature/screening/chart/kline_viewer/chart-area.css | 258 | 258 | 0 |
| app/feature/screening/chart/chart_management/chart-modal.css | 671 | 626 | -45 |
| app/feature/risk_management/risk_management.css | 118 | 118 | 0 |
| **合計** | **2044** | **1993** | **-51** |

---

## 5. 為何這次沒有直接刪掉更多 import

1. 你指定的 9 個引用檔中，多數仍包含有效且被使用的規則。
2. 若強刪 import，會直接造成樣式或互動回歸。
3. 本輪遵守「風格與排版一致優先」原則，先做可保證不回歸的一次性瘦身與 bug 修補。

---

## 6. 已完成狀態（可直接作為今日基線）

1. RiskManagement 5 個 bug 已修復。
2. Build 與 guard test 通過。
3. input.css 引用檔已完成一次性安全瘦身。
4. v4 文件已記錄本輪所有變更與量化結果。
