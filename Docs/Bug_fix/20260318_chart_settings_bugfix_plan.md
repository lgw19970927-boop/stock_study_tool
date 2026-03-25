# 5 個 Bug / 功能計畫書

## 背景說明

本次修正 5 個問題，主要涉及 `chartController.js`、`chartSettingsModal.js`、`chart-settings-modal.css` 三個檔案。

---

## BUG 1：常規設定新增背景顏色下拉選單

### 說明
「圖表管理 → 常規設定」新增「背景顏色」下拉選單，選項：
- **時尚暗黑**（當前風格，`#131722`）
- **淡雅銀灰**（僅 UI 選項，暫不實作切換邏輯）

本次僅需：
1. 在 `defaultGeneralConfig` 加入 `bgTheme: 'dark'`
2. 在 `renderGeneralSettings()` HTML 插入下拉選單 UI
3. 在 `_switchChartSeries` / `_applySeriesVisualOptions` 中讀取 `bgTheme`，作為**四式陰陽燭的顏色判斷依據**（見 BUG3）

---

## BUG 2：懸浮窗（Tooltip）完整實作

### 現狀問題
目前 `_updateCrosshairTooltip` 僅依賴 LW 的 `subscribeCrosshairMove` 事件，但此事件在**滑鼠停在空白區**時不觸發 `param.time`，導致無法顯示懸浮窗。吸附邏輯、邊界切換邏輯也尚未實作。

### 修正方案

在 `chartController.js` 的 `init()` 中新增 **DOM 原生 mousemove / mouseleave 事件監聽**，以 `chartContainer` 為目標：

#### 共用邏輯
- `mousemove`：取 `event.offsetX/Y`，用 LW 的 `timeScale().coordinateToLogical(x)` 取得 logical index，再從 `currentChartData` 查找最近的 bar（吸附）
- `mouseleave`：隱藏 tooltip

#### 模式 A：固定懸浮窗（`_tooltipMode === 'floating'`）
- 定義邊界區：`threshold = chartWidth * 0.15`
- 狀態變數：`_tooltipSide = 'right' | 'left'`（初始由進入側決定）
- `mousemove`：
  - `offsetX < threshold` → side = `'right'`（tooltip 顯示右上角）
  - `offsetX > width - threshold` → side = `'left'`（tooltip 顯示左上角）
  - 中間區域：保持原狀（防抖/鎖定）
- CSS 定位：`top: 8px; right: 8px;` 或 `top: 8px; left: 8px;`

#### 模式 B：跟隨懸浮窗（`_tooltipMode === 'crosshair'`）
- X 軸：同模式 A 的邊界邏輯，決定 tooltip 在游標右側或左側
  - 右側：`left = offsetX + 16px`
  - 左側：`right = width - offsetX + 16px`（用 `right` CSS 屬性）
- Y 軸碰撞偵測：若 `offsetY < tooltipHeight + 16`，tooltip 顯示在游標**下方**，否則顯示在游標**上方**

#### 狀態變數新增（於 `window.ChartController`）
```js
_tooltipSide: 'right',   // 固定懸浮窗目前顯示側
_tooltipEnterFromLeft: true,  // 初次進入側判斷
```

---

## BUG 3：四式陰陽燭顏色邏輯

### 說明
| 設定 | 暗黑背景 | 白色背景 |
|------|---------|---------|
| 實心陽線 | 白色實心（`#ffffff`） | 白色實心（`#ffffff`） |
| 空心陽線 | 淡雅銀灰邊框（`#c8ccd4`）透明填充 | 黑色邊框透明填充 |
| 陰線 | 灰色邊框（`#888`）黑色填充 | 黑色邊框黑色填充 |

### 完整 monochrome_candle 選項對照

| 背景主題 | bullStyle | upColor | borderUpColor | downColor | borderDownColor |
|---------|-----------|---------|---------------|-----------|-----------------|
| dark | hollow | `transparent` | `#c8ccd4`（銀灰） | `#000000` | `#888888` |
| dark | solid | `#ffffff` | `#c8ccd4` | `#000000` | `#888888` |
| light | hollow | `transparent` | `#000000` | `#000000` | `#000000` |
| light | solid | `#ffffff` | `#000000` | `#000000` | `#000000` |

> [!IMPORTANT]
> 四式陰陽燭模式下，**隱藏**「陽線顏色」與「陰線顏色」設定行（`generalBullColorRow` / `generalBearColorRow`）。

在 `renderGeneralSettings()` 和 `_onGeneralChartTypeChange()` 中：
- 新增條件：`isMonochrome = type === 'monochrome_candle'`
- `isMonochrome` 時隱藏 `generalBullColorRow` 和 `generalBearColorRow`

---

## BUG 4：型態標示不顯示

### 現狀診斷
在 `chartController.js` 的 `loadStock()` 中：
```js
window.PatternAnnotation.setData(
    stockData?.patterns_found || [],
    chartData
);
```

**問題根本原因**：`pattern_annotation.js` 的 `setData()` 呼叫 `this._subscribeRedraw()`（訂閱 timeScale 縮放事件）但**初始渲染沒有立刻呼叫 `render()`**，或者 `this._enabled` 初始值為 `false`。

需要查看 `setData()` 的實作：

```js
setData(patterns, chartData) {
    this._patterns  = patterns;
    this._chartData = chartData;
    this._subscribeRedraw();  // 只訂閱縮放，沒有立刻 render！
}
```

### 修正方案
在 `pattern_annotation.js` 的 `setData()` 末尾加上一行：
```js
this.render();  // 立刻初次渲染
```

> [!NOTE]
> 如果 `this._enabled` 預設為 `false`，同時也要確認初始值。

---

## BUG 5：陽線顏色預設值

### 說明
`defaultGeneralConfig.bullColor` 已正確設為 `'#26a69a'`，`bearColor` 為 `'#ef5350'`。

但 `_generalConfig` 在彈窗未曾開啟前是 `null`，第一次套用設定時 `cfg.bullColor` fallback 到 `#26a69a` 是正確的。

**顏色按鈕初始顯示错誤的可能原因**：`renderGeneralSettings()` 中顏色按鈕使用的是 `cfg.bullColor`，而 `cfg` 來自 `this._generalConfig || this.defaultGeneralConfig`——如果第一次開啟 modal，`_generalConfig` 是 `null`，才使用 `defaultGeneralConfig`，顏色應正確。

需實際測試確認，並在 `open()` 函式中確保 `_generalConfig` 總是以 `defaultGeneralConfig` 為基礎初始化：
```js
if (!this._generalConfig) {
    this._generalConfig = JSON.parse(JSON.stringify(this.defaultGeneralConfig));
}
```

---

## 修改檔案清單

### [MODIFY] [chartController.js](file:///d:/Projects/stock_study_tool/App/Feature/Screening/chartController.js)
- BUG 2：init() 新增 mousemove/mouseleave 事件監聽
- BUG 2：實作固定懸浮窗邊界切換邏輯
- BUG 2：實作跟隨懸浮窗 X/Y 位移邏輯
- BUG 3：`_switchChartSeries` / `_applySeriesVisualOptions` 讀取 `bgTheme` 控制 monochrome_candle 顏色
- BUG 3：隱藏 monochrome_candle 的顏色設定欄位

### [MODIFY] [chartSettingsModal.js](file:///d:/Projects/stock_study_tool/App/Feature/Screening/chartSettingsModal.js)
- BUG 1：`defaultGeneralConfig` 加入 `bgTheme: 'dark'`
- BUG 1：`renderGeneralSettings()` 新增背景顏色下拉選單
- BUG 3：`_onGeneralChartTypeChange()` 對 monochrome_candle 隱藏顏色行
- BUG 5：`open()` 確保 `_generalConfig` 以 defaultGeneralConfig 初始化

### [MODIFY] [pattern_annotation.js](file:///d:/Projects/stock_study_tool/App/Feature/Screening/function_block/pattern_annotation.js)
- BUG 4：`setData()` 末尾加入 `this.render()`

### [MODIFY] [chart-settings-modal.css](file:///d:/Projects/stock_study_tool/App/Feature/Screening/chart-settings-modal.css)
- BUG 2：新增 tooltip 的 `right` 屬性版本（跟隨模式的左側定位）

---

## 驗證計畫

| Bug | 驗證步驟 |
|-----|---------|
| BUG1 | 圖表管理→常規設定→確認有「背景顏色」下拉 |
| BUG2 | 移動滑鼠到 K 線圖，確認浮窗顯示；移至左右邊界確認切換 |
| BUG3 | 四式陰陽燭：確認空心=透明+銀灰框，實心=白色；顏色設定欄位隱藏 |
| BUG4 | 型態篩選後點股票，確認 K 線圖有型態標示矩形/折線 |
| BUG5 | 開啟圖表管理→常規設定，確認顏色按鈕顯示綠/紅色 |
