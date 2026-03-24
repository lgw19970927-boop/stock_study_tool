# 20260325 Bug Fix Plan

**關聯需求**：使用者回報問題（2026/03/25）  
**涉及檔案**：
- `App/Feature/Screening/screening.js`
- `App/Feature/Screening/chartController.js`

---

## Bug 1：指標+型態篩選中途停止後，篩選結果缺少指標標籤

### 現象
策略為「指標+型態」時（如 MA20>MA50 + 盤整區），於型態篩選進行中按「停止篩選」→ 勾選「顯示目前篩到的結果」→ 確認後，結果列表的篩選標籤只有型態標籤（如「盤整區」），沒有指標標籤（如「MA20>MA50」）。

### 根因
情況三（指標+型態）流程如下：

1. `_streamIndicators` → 完成 → 存入 `_lastStageResults`（含 `matched_indicators`）
2. `_streamPatterns` → **進行中** → 進度事件產生 `_currentPartialResults`（partial_stocks，**尚未合併指標標籤**）
3. 用戶中途停止 → `_confirmStop` 取 `_currentPartialResults` → 直接 `_renderResults`

問題關鍵：`patternResult.stocks.forEach(...)` 的合併邏輯在 `_streamPatterns` **完全結束後**才執行，中途停止拿到的 `_currentPartialResults` 永遠跳過了合併步驟。

### 修復方案
在 `_confirmStop()` 中，若 `_currentPartialResults`（型態階段中途結果）與 `_lastStageResults`（指標階段完整結果）**同時存在**，先從 `_lastStageResults` 建立 `indicatorMap`，再將 `matched_indicators` / `insufficient_indicators` 合併進每支股票，再行渲染。

**修改位置**：`screening.js` → `_confirmStop()`

---

## Bug 2：日K↔周K 切換時顯示最新資料而非 analysis_end_date

### 現象
在「自訂分析時間範圍」（如 2025/01/01~2025/12/31）模式下，點選股票後日K正確對齊 2025/12/31。但點擊「1W」切換周K後，最右側跳到最新一筆資料（如 2026/03 附近），必須再次點選篩選列表中的股票才能恢復正確範圍。

### 根因
`bindTimeframeButtons` 的 click handler 呼叫 `this.loadStock(currentSymbol)`（無 opts），導致 `opts.fromFilterClick` 為 `false`，走 `setVisibleRangeToLastYear` 而非 `setVisibleRangeToAnalysisEndDate`。

### 修復方案
改傳 `{ fromFilterClick: !!(window.state?.filters?.analysis_end_date) }` 給 `loadStock`：
- 有設 end_date → 走 `setVisibleRangeToAnalysisEndDate`（對齊篩選終止日）
- 無設 end_date（快捷按鈕或今天模式）→ `setVisibleRangeToAnalysisEndDate` 內部 fallback 到 `setVisibleRangeToLastYear`，行為不變

**修改位置**：`chartController.js` → `bindTimeframeButtons()`

---

## Bug 3：雙邊模式開啟後點選篩選結果股票，只顯示右側座標軸

### 現象
先進入圖表設定 → 座標軸 → 雙邊模式 → 確定（此時尚未載入任何股票）→ 執行篩選 → 點選結果中的股票 → K線圖只顯示右側座標軸，左側空白。

### 根因
`applyAxisSettings` 中 `placement === 'dual'` 時會呼叫 `_ensureMirrorSeries()`，但該方法開頭有防衛判斷：

```js
const data = this.currentChartData;
if (!data || data.length === 0 || !this.chart) return;
```

若 apply 時尚無股票載入（`currentChartData === null`），`_mirrorSeries` 從未建立。之後 `loadStock` 中只有 `if (this._mirrorSeries)` 才更新，但 `_mirrorSeries` 還是 null，左軸無 series 掛靠 → 只有右軸顯示。

### 修復方案
1. 新增 `_currentAxisPlacement: 'right'` 屬性到 `ChartController` 初始狀態
2. `applyAxisSettings` 執行時更新 `this._currentAxisPlacement = placement`
3. `loadStock` 中，`currentChartData = chartData` 之後，加入判斷：若 `_currentAxisPlacement === 'dual'` 且 `_mirrorSeries === null`，呼叫 `_ensureMirrorSeries()`（此時 `currentChartData` 已就緒）

**修改位置**：`chartController.js` → 初始狀態、`applyAxisSettings()`、`loadStock()`

---

## Bug 4：圖表設定套用後切換周K，圖表自動捲至最左邊（雙邊模式）

### 現象
座標軸設為雙邊模式 → 看 AAPL 日K → 開啟圖表設定改某一設定 → 確定 → 點擊「1W」切換周K → 圖表自動捲到最左邊（無手動拖拉操作）。切日K也可能發生相同問題（從周K切回日K）。

### 根因
`loadStock` 原順序：

```
1. clearIndicatorSeries()
2. candleSeries.setData(chartData)      ← mirrorSeries 仍是舊頻率資料
3. currentChartData = chartData
4. setVisibleRange(end_date / lastYear) ← 正確設定的範圍
5. renderIndicators(chartData)
6. mirrorSeries.setData(newData)        ← LW setData 觸發 auto-fit → 覆蓋步驟 4 的範圍
```

當 `mirrorSeries.setData()` 以全新時間軸資料（頻率不同的周K）呼叫時，LightweightCharts 會重新計算時間軸並觸發 auto-fit scroll（捲到最左邊），覆蓋第 4 步已設好的可視範圍。

### 修復方案
將 `mirrorSeries.setData()` 移到 `candleSeries.setData()` 及 `setVisibleRange` **之前**：

```
新順序：
1. clearIndicatorSeries()
2. mirrorSeries.setData(chartData) [MOVED FIRST]  ← 在 setVisibleRange 前先同步
3. candleSeries.setData(chartData)
4. currentChartData = chartData
5. (Bug3 Fix) 若 dual 且 mirrorSeries 尚未建立 → _ensureMirrorSeries()
6. setVisibleRange(end_date / lastYear)            ← 此時兩個 series 皆已同步，不再被覆蓋
7. renderIndicators(chartData)
8. PatternAnnotation / IndicatorTopBar
```

**修改位置**：`chartController.js` → `loadStock()`

---

## 追加 Bug：左軸模式下左側座標軸刻度完全消失

### 現象
圖表設定 → 座標軸 → 只顯示左側 → 確定 → K線圖左側座標軸完全空白（無任何價格刻度）。

### 根因
`applyAxisSettings` 中 `placement !== 'dual'` 時呼叫 `_removeMirrorSeries()`，該方法的副作用是：
```js
if (this.candleSeries) {
    this.candleSeries.applyOptions({ priceScaleId: 'right' }); // 歸還到右軸
}
```
接著設定 `rightPriceScale: { visible: false }`、`leftPriceScale: { visible: true }`，結果 candleSeries 掛在不可見的右軸，左軸沒有任何 series → 空白無刻度。

另外，`_switchChartSeries` 每次重建 candleSeries 時未套用當前 placement，會重置回右軸。

### 修復方案
1. `applyAxisSettings` 中，`_removeMirrorSeries()` 之後，若 `placement === 'left'`，將 candleSeries 移至左軸：
   ```js
   if (placement === 'left' && this.candleSeries) {
       try { this.candleSeries.applyOptions({ priceScaleId: 'left' }); } catch (e) {}
   }
   ```
2. 新增 `_applyScalePlacement()` 輔助方法，根據 `_currentAxisPlacement` 設定 candleSeries 的 priceScaleId
3. 在 `_switchChartSeries` 重建 series 後呼叫 `_applyScalePlacement()`，確保切換圖表類型不會重置座標

**修改位置**：`chartController.js` → `applyAxisSettings()`、`_switchChartSeries()`、新增 `_applyScalePlacement()`

---

---

## Bug 5（新增）：初始化時座標軸設定未套用至圖表，與 Modal 顯示不一致

### 現象
Ctrl+Shift+R 重新載入後，打開圖表管理，座標軸顯示「雙邊模式」（正確反映 localStorage 儲存值）。關閉 Modal → 跑篩選 → 點選股票 → K線圖卻只有右側座標軸，左軸空白。

### 根因
`ChartSettingsModal.loadFromLocalStorage()` 載入 `_axisConfig` 後，只呼叫 `applyGeneralSettings`（已有「Bug1/4 Fix」），**從未呼叫 `applyAxisSettings`**。  
`ChartController.init()` 建立圖表後也無任何套用座標軸設定的邏輯。  
結果：`_currentAxisPlacement` 永遠保持初始值 `'right'`；Bug3 Fix 補建 mirrorSeries 的條件 `_currentAxisPlacement === 'dual'` 從未成真。

### 修復方案
**雙重保險**，涵蓋「loadFromLocalStorage 先於 init」與「init 先於 loadFromLocalStorage」兩種時序：

1. `ChartController.init()` 末尾：若 `ChartSettingsModal._generalConfig` / `_axisConfig` 已存在，立即套用  
   - 呼叫 `applyGeneralSettings` 時 `currentChartData = null`，`_switchChartSeries` 會直接 return（安全）  
   - 呼叫 `applyAxisSettings` 時 `_ensureMirrorSeries` 也因 data=null 直接 return，但 `_currentAxisPlacement` 已正確寫入、chart.applyOptions 座標軸可見性已設定 → 之後 `loadStock` 的 Bug3 Fix 就能補建 mirrorSeries  
2. `ChartSettingsModal.loadFromLocalStorage()` 中：在現有 `applyGeneralSettings` 之後，補加 `applyAxisSettings`（同樣只在 chart 已存在時才呼叫）

**修改位置**：`chartController.js` → `init()` 末尾；`chartSettingsModal.js` → `loadFromLocalStorage()`

---

## Bug 6（新增）：懸浮窗日期與十字線日期不符（有左側座標軸時）

### 現象
在圖表管理套用任意設定後（尤其是座標軸改為雙邊或左軸模式），滑鼠移到 K 線圖上，懸浮窗顯示的日期與十字線垂直線指向的 K 棒日期不一致（可能差數根）。

### 根因
`_snapToNearestBar(offsetX)` 中：
```js
const logical = this.chart.timeScale().coordinateToLogical(offsetX);
```
`coordinateToLogical` 期待的座標是相對於**繪圖區域（drawing area）左邊**，而 `offsetX = e.clientX - rect.left` 是相對於**整個圖表容器左邊**（包含左側座標軸區域）。

`PatternAnnotation._leftOffset` 已用 `chart.priceScale('left').width()` 記錄左軸寬度並在 SVG 繪製時加回——這正是該偏移量存在的證明。

初始狀態無左軸 → `leftOffset = 0` → 座標一致 → 正常顯示。  
套用設定後出現左軸（雙邊/左軸模式）→ `leftOffset > 0` → `coordinateToLogical` 收到偏大的 x → 算出偏右的 bar index → 日期錯位。

### 修復方案
`_snapToNearestBar(offsetX)` 中，呼叫 `coordinateToLogical` 前先減去左軸寬度：

```js
let adjustedX = offsetX;
try { adjustedX = offsetX - (this.chart.priceScale('left').width() || 0); } catch (_) {}
const logical = this.chart.timeScale().coordinateToLogical(adjustedX);
```

**修改位置**：`chartController.js` → `_snapToNearestBar()`

### 懸浮窗其他內容驗證
比對截圖與 `_buildTooltipHTML` 程式碼：
- 開/高/低/收：`.toFixed(3)` ✓  
- 漲跌額/漲跌幅：前一根收盤差值，顏色 up=綠/down=紅（與美股慣例一致）✓  
- 成交量：`toLocaleString()` 格式 ✓  
- 成交額/換手率/市盈率：標示 "To Do" ✓（尚未實作）  
→ 修正座標後，懸浮窗所有已實作欄位內容均正確。

---

## 修改檔案彙整

| 檔案 | 修改函式/位置 |
|------|------------|
| `screening.js` | `_confirmStop()` |
| `chartController.js` | 初始狀態（`_currentAxisPlacement`）、`init()`末尾（新增套用已儲存設定）、`loadStock()`、`bindTimeframeButtons()`、`applyAxisSettings()`、`_switchChartSeries()`、`_snapToNearestBar()`、新增 `_applyScalePlacement()` |
| `chartSettingsModal.js` | `loadFromLocalStorage()`（補加 `applyAxisSettings`） |

---

## 驗證步驟

1. **Bug 1**：執行指標+型態策略 → 於型態階段中途停止 → 勾選「顯示目前篩到的結果」→ 確認結果列表同時顯示指標標籤（如 MA20>MA50）與型態標籤（如 盤整區）
2. **Bug 2**：設 2025/01/01~2025/12/31 → 篩選 → 點 AAPL（確認日K對齊 2025/12/31）→ 切換「1W」→ 確認周K最右側仍在 2025/12/31 附近
3. **Bug 3**：先進圖表設定設雙邊 → 確定（無股票）→ 篩選 → 點股票 → 確認左右兩軸皆有刻度
4. **Bug 4**：雙邊模式看日K → 開圖表設定改一個設定 → 確定 → 切「1W」→ 確認圖表不會跑到最左邊
5. **追加 Bug**：圖表設定 → 座標軸 → 左側 → 確定 → 確認左軸刻度正常顯示
6. **Bug 5**：Ctrl+Shift+R → 不開設定直接篩選 → 點股票 → 確認座標軸與 Modal 設定一致（雙邊模式有雙軸）
7. **Bug 6**：雙邊模式下，移動滑鼠至不同 K 棒 → 確認懸浮窗日期、OHLC 與十字線指向的 K 棒一致
