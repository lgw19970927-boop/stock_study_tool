# CSS Tailwind 化計畫書 v5（維護性優先落地版）

建立日期：2026-03-31
最後整理：2026-03-31
適用範圍：`app/static/css/input.css` 目前標示引用之 9 個 CSS 檔案

---

## 0. 文件導覽

1. 本文件已重整為單一路線：目標 -> 範圍 -> 風險 -> 分波 -> To do -> 工單 -> 更新步驟 -> 驗收。
2. 本案目標是 Tailwind-first，不是 100% Tailwind 或 0 custom CSS。
3. 立即啟動順序：
   - P0：TW5-00、TW5-01
   - P1：TW5-11、TW5-12、TW5-10、TW5-13
   - P2：TW5-20、TW5-30、TW5-40

---

## 1. 目標與邊界

### 1.1 核心目標

在不破壞既有風格、排版、配色、字體、互動行為的前提下，完成 9 個目標 CSS 的 Tailwind-first 收斂，並維持可讀性與可維護性。

### 1.2 非目標

1. 不追求 100% Tailwind。
2. 不追求 0 custom CSS。
3. 不為了「歸零」而破壞可讀性與互動穩定性。

### 1.3 Tailwind-first 定義

1. 可用 utility 表達的樣式，優先移至模板（HTML / JS template string）。
2. 重複樣式以 `@layer components` / `@layer utilities` 收斂。
3. 允許保留白名單 custom CSS：
   - scrollbar 偽元素
   - 複雜 pseudo-element（例如客製 checkbox/radio）
   - `@keyframes` 本體
   - 與圖表/互動高耦合、轉換後可讀性明顯下降者

### 1.4 完成定義（DoD）

1. 9 個目標檔達成「Tailwind-first + 極小且可解釋保留 CSS」。
2. `npm run build:css` + `pytest tests/test_tailwind_migration_guard.py` 通過。
3. Screening / K 線 / Chart Modal / RiskManagement 手動回歸通過。
4. 每次變更有規則去向、測試結果、回退點可追溯。

---

## 2. 範圍與現況

### 2.1 目標檔案

| 模組 | 檔案 | 行數 |
|---|---|---|
| Global | `app/static/css/variables.css` | 80 |
| Global | `app/static/css/animations.css` | 70 |
| Global | `app/static/css/layout.css` | 127 |
| Global | `app/static/css/components.css` | 110 |
| Global | `app/static/css/tabs.css` | 128 |
| Screening | `app/feature/screening/screening.css` | 626 |
| K 線 | `app/feature/screening/chart/kline_viewer/chart-area.css` | 258 |
| Chart Modal | `app/feature/screening/chart/chart_management/chart-modal.css` | 626 |
| Risk Management | `app/feature/risk_management/risk_management.css` | 555 |

### 2.2 高風險語法分佈

1. scrollbar：`layout.css`、`screening.css`、`chart-modal.css`
2. pseudo-element checkbox/radio：`screening.css`、`chart-area.css`、`chart-modal.css`
3. `@keyframes`：`animations.css`
4. `!important` 熱區：`risk_management.css`、`chart-area.css`
5. 特殊效果：`layout.css` 含 `backdrop-filter`、`color-mix`

### 2.3 隱藏耦合風險地圖

1. Chart Modal
   - 檔案：`chart_settings_modal_template.js`、`chart_settings_modal.js`
   - 風險：`.active`、`.is-hidden`、`.chart-tab-btn` 等狀態 class 由 JS 切換
2. K 線區
   - 檔案：`chart-area.css`
   - 風險：全螢幕段依賴 `!important` 優先級
3. RiskManagement 動態列
   - 檔案：`portfolio_block.js`
   - 風險：JS 直接輸出 class 字串（`.pm-*`）
4. Screening 策略卡與勾選
   - 檔案：`screening.css`
   - 風險：checkbox 幾何、selected/active 狀態由 class 驅動

### 2.4 存量維護性指標（2026-03-31）

1. inline style：217
2. 超長 class 字串（>=120 字元）：51
3. JS `className = ...` 指派次數：6
4. source CSS `!important`：41

---

## 3. 執行原則（收斂版）

### 3.1 該做（DO）

1. 同一組 utility 在 3 處以上重複即抽成語意 class（`@layer components`）。
2. purely-presentational inline style 優先回收為 class。
3. truly dynamic style（進度寬度、即時色值）可保留 inline，但集中函式管理。
4. `!important` 逐條盤點來源，能替代就替代。
5. 每次變更附規則去向對照與回退點。

### 3.2 不該做（DON'T）

1. 不為了追求 100% Tailwind 強轉 scrollbar / 複雜 pseudo / keyframes。
2. 不一次刪大量 CSS 或 import。
3. 不任意改動 JS 依賴 class（`.active`、`.is-hidden`、`.selected`）。
4. 不新增廣域覆寫 selector（尤其 `#risk-page input[...]`）。
5. 不直接修改 `tailwind.output.css`。

### 3.3 最大風險與失敗情境

最大風險：樣式遷移牽動 JS 狀態 class 與優先級，造成外觀或互動回歸。

常見失敗情境：

1. 無規則去向對照就移除 CSS。
2. 忽略 pseudo-element / scrollbar 細節。
3. 改名狀態 class 導致 JS 失效。
4. 跳過分波驗證，最終無法定位回歸來源。
5. 過度追求零 CSS 殘留，反而降低可讀性。

---

## 4. 分波更新路線（Wave 0~6）

### Wave 0：基線凍結

1. 建立三大頁面回歸基線（Screening / Chart / RiskManagement）。
2. 完成 9 檔規則分類（utility / `@layer` / 保留 custom）。
3. 產出初版規則去向對照表。

### Wave 1：Global 收斂

1. 檔案：`variables.css`、`animations.css`、`layout.css`、`components.css`、`tabs.css`
2. 做法：一般排版與狀態樣式 utility 化；保留 keyframes/token/特效白名單。

### Wave 2：Screening 收斂

1. 檔案：`screening.css`
2. 做法：先容器排版，再策略卡與狀態區；保留 scrollbar 與必要 pseudo-element。

### Wave 3：K 線區收斂

1. 檔案：`chart-area.css`
2. 做法：一般 layout utility 化，全螢幕段採等價優先級策略。

### Wave 4：Chart Modal 收斂

1. 檔案：`chart-modal.css` + `chart_settings_modal_template.js` + `chart_settings_modal.js`
2. 做法：先模板去重，再樣式白名單化，保護 tab/active/hidden 狀態。

### Wave 5：RiskManagement 收斂

1. 檔案：`risk_management.css` + `ui.html` + `portfolio_block.js`
2. 做法：按 params/overview/table/batch rows 分批；優先清理 `!important` 熱區。

### Wave 6：`input.css` 收尾

1. 僅在檔案無有效規則時移除 `@import`。
2. 產出最終 custom CSS 白名單（含理由）。

---

## 5. To do List（執行清單）

### 5.1 現在要做（P0）

- [x] TW5-00：建立基線檢查清單與固定驗證流程
- [x] TW5-01：完成 9 檔規則去向對照表

### 5.2 主線要做（P1）

- [x] TW5-11：Chart Modal 去重與狀態 class 保護
- [x] TW5-12：RiskManagement `!important` 收斂與廣域 selector 治理
- [x] TW5-10：指標模組 inline style 回收（sma/bollinger/amount/volume）
- [x] TW5-13：K 線區全螢幕優先級與 pseudo-element 收斂

### 5.3 收尾要做（P2）

- [x] TW5-20：Global 規則收斂（layout/components/tabs/animations/variables）
- [x] TW5-30：`input.css` import 收斂
- [x] TW5-40：最終白名單、回退點、guard test 補強

---

## 6. 可執行工單清單（對照表）

| 工單ID | 波次 | 優先級 | 檔案範圍 | 核心任務 | 驗收重點 |
|---|---|---|---|---|---|
| TW5-00 | Wave 0 | P0 | `tests/test_tailwind_migration_guard.py`、本文件 | 建立基線與固定驗證步驟 | build+guard test 通過、基線可勾選 |
| TW5-01 | Wave 0 | P0 | `app/static/css/input.css` + 9 檔 | 規則去向對照表 | 每個檔案都可追溯 |
| TW5-10 | Wave 2 | P1 | 4 個 indicator JS 檔 | inline style 回收為 class 常數 | inline style 降低、UI 不變 |
| TW5-11 | Wave 4 | P1 | Chart Modal 相關 JS/CSS | 超長 class 去重、保護狀態切換 | tab/radio/色票/滑桿正常 |
| TW5-12 | Wave 5 | P1 | RiskManagement CSS/HTML/JS | `!important` 收斂與排版穩定化 | `!important` 降低且可解釋 |
| TW5-13 | Wave 3 | P1 | `chart-area.css` + 對應 JS | 一般容器 utility 化、全螢幕保護 | 全螢幕/crosshair/toggle 正常 |
| TW5-20 | Wave 1 | P2 | Global 5 檔 | 重複規則抽 `@layer components` | 規則數下降、保留有理由 |
| TW5-30 | Wave 6 | P2 | `input.css` + 各 target css | import 收斂 | 移除 import 皆可追溯 |
| TW5-40 | Wave 6 | P2 | 文件 + 可選測試檔 | 白名單封版與 guard test 補強 | 可回退、可驗證、可交接 |

---

## 7. 更新步驟（每次實作都照這個順序）

### 7.1 工程更新步驟（SOP）

1. 選定本次工單（只做 1~2 張，避免變更過大）。
2. 列出變更檔案與預期規則去向。
3. 完成樣式收斂（遵守 DO / DON'T）。
4. 執行自動檢查：
   - `npm run build:css`
   - `pytest tests/test_tailwind_migration_guard.py`
5. 執行手動回歸：
   - Screening
   - K 線區
   - Chart Modal
   - RiskManagement
6. 記錄本次變更：
   - 影響檔案
   - 規則去向
   - 測試結果
   - 回退點
7. 若有未解風險，標註到下一張工單，不在本次硬解。

### 7.2 文件更新步驟（本檔維護）

1. 勾選第 5 章 To do List 對應項目。
2. 更新第 10 章「更新紀錄」。
3. 若策略改變，先更新第 1 章（目標與邊界）再更新工單表。

---

## 8. 驗收標準與交付物

### 8.1 每波驗收標準

1. build / test 穩定通過。
2. 四大頁面手動回歸通過。
3. 無破壞 JS 狀態 class。
4. 有規則去向對照與回退點。

### 8.2 最終交付物

1. 收斂後 `input.css` 結果。
2. custom CSS 白名單（含保留理由）。
3. 每波更新紀錄（含測試與回退資訊）。

---

## 9. 待確認議題（含建議回答）

1. 是否完全接受 Hybrid 定義（白名單保留 scrollbar/pseudo/keyframes/高耦合規則）？
   建議回答：接受。
   決策建議：採 Hybrid，將「可 utility 化」與「必須保留」分開治理，不追求 100% Tailwind 歸零。

2. `variables.css` 是否維持 token 唯一來源（Tailwind 僅映射）？
   建議回答：維持唯一來源。
   決策建議：短中期維持 `variables.css` 為 design token source of truth，Tailwind 只做映射，避免雙來源漂移。

3. Chart Modal / RiskManagement 的動態 inline style 是否允許保留（僅限 truly dynamic）？
   建議回答：允許，但需列白名單。
   決策建議：僅保留 truly dynamic（即時色值、進度寬度、運算定位），其餘 purely-presentational 一律回收為 class。

4. 是否導入像素級截圖比對（例如 Playwright screenshot diff）？
   建議回答：建議導入，但分階段。
   決策建議：先人工回歸穩定 1~2 波後，針對高風險頁（Chart Modal、K 線全螢幕、RiskManagement）導入 screenshot diff。

5. 是否接受新增 2~3 個 guard test（import 收斂 / Risk input 覆寫 / Modal 狀態切換）？
   建議回答：接受，且建議列為 P1 必做。
   決策建議：優先新增以下 3 項：
   - `test_tailwind_import_convergence_v5.py`
   - `test_no_broad_rm_input_override.py`
   - `test_chart_modal_state_class_guard.py`

### 9.1 操作 V5 後的預計 code 瘦身效果（估算）

估算前提：完成 Wave 0~6，且期間不新增大型 UI 功能。

| 指標 | 目前基線 | 預估完成值 | 預估改善 |
|---|---:|---:|---:|
| 9 檔目標 CSS 總行數 | 約 2,580 行 | 約 1,500 ~ 1,900 行 | 約 -26% ~ -42% |
| source CSS `!important` 行數 | 41 | 15 ~ 25 | 約 -39% ~ -63% |
| inline style 數量 | 217 | 120 ~ 160 | 約 -26% ~ -45% |
| 超長 class 字串（>=120） | 51 | 20 ~ 30 | 約 -41% ~ -61% |

補充：

1. 最大瘦身貢獻預期來自 TW5-11、TW5-12、TW5-10（Chart Modal / RiskManagement / 指標模組）。
2. Wave 0 與 Wave 1 的主要價值是建立可回歸基線與規則去向，瘦身幅度通常較小。
3. 最終目標是「可維護性與穩定性提升」，不是單純行數最小化。

### 9.2 具體手動驗證功能清單（必測）

#### A. Screening 頁

- [ ] SC-01 策略卡 `selected/active/hover` 狀態切換正常，樣式不漂移。
- [ ] SC-02 篩選條件增刪改後，結果表容器排版與欄位對齊正常。
- [ ] SC-03 進度區（執行中/停止）顯示狀態與按鈕互動正常。
- [ ] SC-04 空狀態（無資料）置中與字級樣式符合舊版。

#### B. K 線區（chart-area）

- [ ] KA-01 全螢幕切換前後，容器尺寸與工具列位置正確。
- [ ] KA-02 crosshair 模式切換後，X/Y 軸 label 可正常顯示與恢復。
- [ ] KA-03 toggle 開關（含 pseudo-element knob）點擊區與動畫正常。
- [ ] KA-04 tooltip/hover 樣式與定位無遮擋、無位移錯誤。

#### C. Chart Modal

- [ ] CM-01 modal 開啟/關閉與遮罩層級正常（無穿透點擊）。
- [ ] CM-02 tab 切換時 `.active` / `.is-hidden` 狀態正確。
- [ ] CM-03 checkbox/radio 外觀、點擊區、勾選狀態一致。
- [ ] CM-04 色票、滑桿、指標設定列排版在不同內容高度下不崩版。

#### D. RiskManagement 頁

- [ ] RM-01 動態列新增/刪除/重排後，欄寬與對齊維持穩定。
- [ ] RM-02 input 不可被廣域 selector 拉成 100% 而破壞表格布局。
- [ ] RM-03 停損/出場 batch rows 與狀態徽章樣式正確。
- [ ] RM-04 進度條、警示區塊、按鈕群樣式與互動正常。
- [ ] RM-05 F5 全頁刷新後，相關 script path 無 404 且功能可用。

#### E. 全域驗證

- [ ] GL-01 `npm run build:css` 成功且無編譯錯誤。
- [ ] GL-02 `pytest tests/test_tailwind_migration_guard.py` 通過。
- [ ] GL-03 主要頁面 scrollbar 視覺一致（深色主題下無突兀回退）。
- [ ] GL-04 常用元件（按鈕、tabs、表單）在桌面主流解析度下無破版。

---

## 10. 更新紀錄（Update Log）

| 日期 | 工單ID | 變更檔案 | build/test 結果 | 手動回歸 | 回退點 | 狀態 |
|---|---|---|---|---|---|---|
| 2026-03-31 | 文件重整 | `docs/refactor_code/20260331_css_tailwind_migration_plan_v5.md` | N/A | N/A | Git 歷史版本 | 完成 |
| 2026-04-01 | TW5-00、TW5-01 | `tests/test_tailwind_migration_guard.py`、`docs/refactor_code/20260401_wave0_wave2_execution.md` | `npm run build:css` ✅ / `pytest tests/test_tailwind_migration_guard.py` ✅ | 待下一輪集中回歸 | Git 歷史版本 | 完成 |
| 2026-04-01 | TW5-10 | `screening.css`、`indicator_manager.js`、`sma.js`、`bollinger.js`、`amount.js`、`volume.js`、`strategy_manager.js` | `npm run build:css` ✅ / `pytest tests/test_tailwind_migration_guard.py` ✅ | 待下一輪集中回歸 | Git 歷史版本 | 完成 |
| 2026-04-01 | TW5-13 | `chart-area.css`、`screening.js`、`tests/test_tailwind_migration_guard.py` | `npm run build:css` ✅ / `pytest tests/test_tailwind_migration_guard.py` ✅ | 待下一輪集中回歸 | Git 歷史版本 | 完成 |
| 2026-04-01 | TW5-11 | `chart-modal.css`、`chart_settings_modal_template.js`、`chart_settings_modal.js`、`indicator_settings_tab.js`、`pattern_settings_tab.js`、`tests/test_tailwind_migration_guard.py` | `npm run build:css` ✅ / `pytest tests/test_tailwind_migration_guard.py` ✅ | 待下一輪集中回歸 | Git 歷史版本 | 完成 |
| 2026-04-01 | TW5-20（部分） | `layout.css`、`screening_fragment.html` | `npm run build:css` ✅ | 待下一輪集中回歸 | Git 歷史版本 | 進行中 |
| 2026-04-01 | TW5-12、TW5-20、TW5-30 | `risk_management.css`、`risk_management_fragment.html`、`portfolio_block.js`、`params/overview/portfolio templates`、`input.css`、`tests/test_tailwind_migration_guard.py`、`docs/refactor_code/20260401_wave5_wave6_execution.md` | `npm run build:css` ✅ / `pytest tests/test_tailwind_migration_guard.py` ✅ (18 passed) | 待下一輪集中回歸 | Git 歷史版本 | 完成 |
| 2026-04-01 | TW5-40 + Bugfix | `screening.css`、`params_block.js`、`portfolio_block.js`、`risk_management.css`、`tests/test_tailwind_migration_guard.py`、`docs/refactor_code/20260401_tw5_40_finalization.md` | `npm run build:css` ✅ / `pytest tests/test_tailwind_migration_guard.py` ✅ | 待下一輪集中回歸 | Git 歷史版本 | 完成 |

---

## 11. 附註

1. 本版已將分散段落整併為單一路線，方便執行與追蹤。
2. 已保留核心資訊：9 檔範圍、Wave 0~6、維護性指標、工單 ID、驗收要求。
3. 後續請優先維護第 5、7、10 章，確保執行與文件同步。