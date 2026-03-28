# 20260329 十字線標籤修復計畫

**關聯需求**：重構後 K 線圖十字線缺失 X/Y 軸標籤，需恢復舊版可用性並新增格式與主題自適應。  
**目標基準**：以舊版正常互動體驗為基準，在新模組化架構中做最小修補。  
**涉及模組**：
- `app/feature/screening/chart/kline_viewer/chart_controller.js`
- `app/feature/screening/chart/kline_viewer/chart_tooltip.js`

---

## 1. 問題定義

### 現象
1. 滑鼠移動時，十字線雖可顯示，但 X/Y 軸標籤在新架構中缺失或未穩定顯示。  
2. 需求要求時間標籤統一格式：`YYYY/MM/DD 週X`。  
3. 需求要求標籤依主題自適應：
- 深色模式：半透明深灰底 + 白字
- 淺色模式：半透明淺灰底 + 深字

### 初步根因
1. 十字線在 `hidden` 模式會把 `labelVisible` 關閉；切回非 hidden 模式時未明確恢復 `labelVisible=true`，可能造成標籤持續不可見。  
2. 目前未提供統一的 crosshair 時間格式化函式。  
3. 目前未集中管理十字線標籤配色與背景主題同步。

---

## 2. 實作策略（最小改動）

### A. 恢復 X/Y 軸標籤顯示穩定性
1. 在 `_applyTooltipMode(mode)` 中：
- `mode === 'hidden'`：維持 `visible=false` 與 `labelVisible=false`
- 其他模式：明確設定 `visible=true` 且 `labelVisible=true`
2. 目的：避免曾經切到 hidden 後，標籤永久不回復。

### B. 統一時間格式（X 軸）
1. 在 `ChartController` 新增時間格式化函式，輸出固定格式：`YYYY/MM/DD 週X`。  
2. 在 `createChart` 初始化選項中透過 `localization.timeFormatter` 掛入該函式。  
3. 目的：滑鼠移動十字線時，時間標籤與需求格式一致。

### C. 主題自適應標籤配色
1. 在 `ChartController` 新增十字線標籤主題樣式函式（dark/silver）。  
2. 在圖表初始化與 `applyGeneralSettings`（背景主題切換）時套用：
- `crosshair.vertLine.labelBackgroundColor`
- `crosshair.horzLine.labelBackgroundColor`
- 保持與目前 layout textColor 同步，確保深淺底對比可讀。  
3. 目的：兩種視覺風格都清晰可讀，且與既有主題切換機制一致。

---

## 3. 風格一致性要求

1. 僅修改既有 ChartController/tooltip 模組，不新增額外框架。  
2. 沿用現有命名與註解語氣（含 BUG/Feature 註記風格）。  
3. 不改動 API 與其他功能模組（指標、型態、SSE）。

---

## 4. 驗證計畫

1. 深色主題 + tooltipMode=floating：移動滑鼠，確認 X/Y 軸標籤同步顯示。  
2. 淺色主題（silver）+ tooltipMode=floating：確認標籤背景與文字對比清楚。  
3. 切換 tooltipMode：floating → hidden → floating，確認標籤可恢復。  
4. 切換 tooltipMode：crosshair/hidden/floating 多次，確認無殘留顯示問題。  
5. 驗證時間文字格式固定為 `YYYY/MM/DD 週X`。

---

## 5. 風險與回退

1. 風險：Lightweight Charts 對 `timeFormatter` 的 time 型別在不同週期可能是 timestamp/businessDay，需做容錯。  
2. 風險：若使用者 localStorage 保存非常舊的設定，第一次套用時需保持無錯誤降級。  
3. 回退：若格式化或配色異常，可先保留 `labelVisible=true` 修復，暫時退回預設 timeFormatter。

---

## 6. 待確認事項（不阻塞本次修復）

1. 分時週期（1m/3m/5m/15m/30m/1h/4h）是否也固定只顯示日期與星期，不顯示時分。  
2. 淺色模式標籤透明度是否需再細分為 X 軸與 Y 軸不同值。