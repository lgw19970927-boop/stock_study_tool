# Wave 0~2 實作紀錄（2026-04-01）

## 1. Wave 0 基線檢查清單（TW5-00）

固定驗證流程（每次 CSS/模板/JS 樣式異動後執行）：

1. `npm run build:css`
2. `pytest tests/test_tailwind_migration_guard.py`
3. 手動回歸（至少）：
   - Screening：策略卡切換、結果表狀態切換、進度條顯示
   - Chart：K 線載入、時間框切換、crosshair 模式切換
   - Chart Modal：開關、tab、顏色選擇
   - RiskManagement：動態列欄寬、表格輸入框布局

本次基線重點：

1. 鎖定 `stockList` 三態 class 合約（`state-idle/state-progressing/state-result`）
2. 鎖定四個 indicator 模組禁用 inline style 模板寫法
3. 鎖定 Screening fragment 根容器移除 inline layout style

---

## 2. Wave 0 規則去向對照表（TW5-01）

| 目標檔案 | Utility / `@layer` 收斂 | 保留 custom CSS（白名單） | 備註 |
|---|---|---|---|
| `app/static/css/variables.css` | N/A（token source） | `:root` tokens、base reset | 維持唯一 token 來源 |
| `app/static/css/animations.css` | 容器/對齊類可逐步 utility 化 | `@keyframes`、spinner 邊框動畫 | `@keyframes` 不強轉 |
| `app/static/css/layout.css` | 版面容器與尺寸類 | `backdrop-filter`、`color-mix`、scrollbar | 新增 `.page-content--fill` |
| `app/static/css/components.css` | 按鈕/面板/輸入共用類 | gradient、glow、精細視覺值 | 不追求 0 custom |
| `app/static/css/tabs.css` | tab 佈局與結構 utility | VSCode-like tab 細節與少量優先級 | 狀態 class 保持不改名 |
| `app/feature/screening/screening.css` | indicator/strategy/filter 共用樣式抽類 | checkbox pseudo、`:has()`、scrollbar | 本次新增 indicator shared classes |
| `app/feature/screening/chart/kline_viewer/chart-area.css` | 後續 Wave 3 收斂 | fullscreen 優先級、pseudo 高耦合 | 本次未改 |
| `app/feature/screening/chart/chart_management/chart-modal.css` | 後續 Wave 4 收斂 | tab/active/is-hidden 狀態樣式 | 本次未改 |
| `app/feature/risk_management/risk_management.css` | 後續 Wave 5 收斂 | 高耦合表格/動態列覆寫規則 | 本次未改 |

---

## 3. Wave 1 實作摘要（已啟動）

1. `screening_fragment.html` 根容器移除 inline layout style。
2. `layout.css` 新增 `.page-content--fill`，改為 class-based 版面尺寸控制。

---

## 4. Wave 2 實作摘要（TW5-10 落地）

已完成四個 indicator 模組 inline style 回收：

1. `app/feature/screening/indicators/modules/sma/sma.js`
2. `app/feature/screening/indicators/modules/bollinger/bollinger.js`
3. `app/feature/screening/indicators/modules/amount/amount.js`
4. `app/feature/screening/indicators/modules/volume/volume.js`

同步變更：

1. `app/feature/screening/screening.css` 新增 indicator 共用樣式（config/footer/summary/param 等）。
2. `app/feature/screening/indicators/indicator_manager.js` 移除 `card.style.*` 操作，改為 `indicator-card--summary` 狀態類。
3. `app/feature/screening/components/strategy_manager/strategy_manager.js` 空清單改為 class 樣式（`strategy-list-empty`）。

驗收準則：

1. 四個模組模板不再出現 `style="..."`。
2. `indicator_manager` 不再直接寫 `card.style`。
3. Summary/config 切換行為維持既有互動。
