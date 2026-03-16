# K 線圖功能擴充與 Bug 修復 — 完整計畫書

**建立日期**：2026-03-16  
**作者**：與 GitHub Copilot Claude Sonnet 4.6 共同對焦完成  
**範圍**：`App/Feature/Screening/` 前端 JS + HTML + CSS

---

## 背景

本次開發涵蓋 3 項新功能（Feature A/B/C）與 3 項 Bug 修復（Bug 1/2/3）。  
開發優先順序：**Bug Fix → SSOT 狀態重構 → Feature A → Feature B → Feature C**。  
Bug Fix 是後續所有功能的前提；Phase 1（SSOT）是 Feature B 雙向連動的必要基礎。

---

## 需求摘要與截圖說明

### Feature A — K 線圖初始視角定位與完整歷史滑動

- 畫面左側「分析時間範圍」設定（如 2025/06/01 ~ 2025/12/31）
- 點擊篩選結果股票後，圖表初始可視範圍右側對齊 `analysis_end_date`（即 2025/12/31）
- 預設可視範圍 ≈ 1 年（2025/01/01 ~ 2025/12/31）
- 資料集完整載入（含今天最新資料），使用者可自由向左/右滑動
- 技術：`chart.timeScale().setVisibleRange()` 控制視圖，不裁切資料

### Feature B — 指標控制列與 Chart Setting 彈窗雙向連動

截圖 p1~p6 展示富途牛牛風格的圖表左上角指標控制列（`MA▾ MA5: MA10: 140.594 ▲ MA20:...`）：

- **⚙ 齒輪點擊**：開啟 Chart Setting 彈窗並自動切換到對應指標設定頁籤（MA 或 BOLL）
- **✕ 叉叉點擊**：設 `isGlobalEnabled = false`，隱藏該列 + 清除畫布上所有對應線條 + 更新 modal checkbox
- **指標文字點擊**（如 MA10）：切換個別線條的 `isEnabled`，更新顯示文字與 modal checkbox，動態增刪畫布線條
- **Modal → Top Bar 逆向連動**：彈窗任何操作（勾選/值/顏色）即時反映至控制列與畫布
- **BOLL 設定頁面**：嚴格依照截圖實作，包含「計算週期」「股票特性參數」以及 MID/UPPER/LOWER 各行的勾選框、線寬、顏色、不透明度

### Feature C — 型態辨識標註框

截圖展示「型態標註」Toggle 開關與畫面上的白框：

- **型態標註 Toggle**：ON 時繪製標註到畫布，OFF 時清除/隱藏
- 每個被偵測到的型態資料（`start_date ~ end_date`）對應一個獨立標註
- 座標嚴格綁定分析時間範圍，pan/zoom 時標註隨之移動但不重新生成
- **渲染策略**：  
  - `consolidation`（盤整區）→ SVG `<rect>` 白框  
  - 其他型態（W底、頭肩頂等）→ 前端局部極值算法找轉折點 → SVG `<polyline>` 折線

### Bug 1 — 切換分頁導致圖表無法渲染

**場景**：兩種情境均會發生：
1. 從其他分頁切回篩選頁（DOM caching 復原）
2. 關閉篩選分頁後重新開啟（DOM 重建）

**根因**：`initScreeningPage()` 無防重複 flag，導致切換分頁時重複呼叫 `ChartController.init()`；DOM 重建時 `this.chart` 指向已移除的舊實例。

### Bug 2 — 指標重複渲染

**場景**：`Chart Setting` 按下確定後，原本已在圖表上的指標線條出現重疊。

**根因**：`apply()` 以新物件（無 series）覆寫 `state.chartIndicators` 後呼叫 `loadStock()`，`clearIndicatorSeries()` 找不到舊 series，舊 series 留在圖表上，新 series 疊加。

### Bug 3 — 顯示指標的狀態來源錯誤

**預期行為**：「顯示指標」按鈕為全域指標總開關（Master Visibility Toggle）：
- **ON**：渲染 Chart Setting modal 中目前所有已勾選的指標
- **OFF**：清除畫布所有指標（但不影響 modal 的勾選狀態）

---

## 技術架構決策

### SSOT（Single Source of Truth）狀態結構

舊結構（`visible` 欄位，MA 為 flat array）廢棄，改用以下結構：

```javascript
window.state.chartIndicators = {
    MA: {
        isGlobalEnabled: true,    // ✕ 叉叉控制（整個 MA 群組）
        lines: [                  // 每條 MA 線的設定
            { period: 5,   color: '#ff0000', lineWidth: 1, opacity: 100, isEnabled: false, series: null },
            { period: 10,  color: '#ff8800', lineWidth: 1, opacity: 100, isEnabled: true,  series: null },
            { period: 20,  color: '#ffff00', lineWidth: 1, opacity: 100, isEnabled: true,  series: null },
            { period: 40,  color: '#0000ff', lineWidth: 1, opacity: 100, isEnabled: false, series: null },
            { period: 50,  color: '#00ff00', lineWidth: 1, opacity: 100, isEnabled: false, series: null },
            { period: 150, color: '#00ffff', lineWidth: 1, opacity: 100, isEnabled: false, series: null },
            { period: 200, color: '#8800ff', lineWidth: 1, opacity: 100, isEnabled: false, series: null },
        ]
    },
    BOLL: {
        isGlobalEnabled: false,   // ✕ 叉叉控制（整個 BOLL 群組）
        period: 20,
        stdDev: 2,
        lines: {
            middle: { color: '#ffb6c1', lineWidth: 1, opacity: 100, isEnabled: true, series: null },
            upper:  { color: '#808080', lineWidth: 1, opacity: 100, isEnabled: true, series: null },
            lower:  { color: '#00ffff', lineWidth: 1, opacity: 100, isEnabled: true, series: null }
        }
    }
}
```

三個消費者（頂部控制列/Canvas/Modal）**共讀同一份**，以此為單一資料來源。

### Feature B Overlay 技術細節

- 控制列容器設定 `position: absolute; top: 8px; left: 8px; z-index: 10; pointer-events: none`
- 外層 `pointer-events: none`（空白處可穿透到 K 線圖）
- 互動元素（⚙、✕、MA10 文字）設 `pointer-events: auto`
- 容器透明背景（無純色 background），讓 K 線圖可隱約透視

### Feature C 渲染技術

- SVG overlay 放在 `#chartWrapper` 內，`position: absolute; inset: 0; z-index: 5; pointer-events: none`
- 訂閱 `chart.timeScale().subscribeVisibleLogicalRangeChange()` 確保 pan/zoom 時座標更新
- 座標轉換：`timeScale.timeToCoordinate(time)` + `candleSeries.priceToCoordinate(price)`
- 後端 API 確認只提供 `start_date`、`end_date`，**無** `top_price`/`bottom_price`
  → 前端從 chartData slice 計算 `max high` / `min low` 作為框的上下邊界
- 局部極值算法（`windowSize = 3`）用於 W底等型態的折線繪製

---

## 完整對焦決策記錄

| 決策點 | 結論 |
|--------|------|
| Feature A 視角對齊觸發時機 | **只在從篩選結果列表點擊載入時觸發**（`fromFilterClick: true`）；後續 timeframe 切換、滑動、縮放等操作均不重觸發 |
| Feature A 快捷按鈕的 end_date | 快捷按鈕時 end_date = 今天 → 視角等同當前行為（對齊最新資料右側） |
| Feature B 控制列位置 | **圖表畫布左上角 overlay（絕對定位）**，仿 TradingView / 富途牛牛 |
| Feature B 數值更新 | **隨 crosshair 移動即時更新**（`subscribeCrosshairMove`） |
| Feature B BOLL 設定頁面 | 補上 MID/UPPER/LOWER 的個別 checkbox（可單獨開關各線條） |
| Feature C 型態框範圍 | **每個型態各自的 start_date ~ end_date**（一個型態一個框/折線） |
| Feature C Top/Bottom 計算 | API 無提供，**前端從 K 線 slice 計算 max high / min low** |
| Feature C 渲染技術 | **SVG overlay** + consolidation → `<rect>`；其他型態 → 局部極值 → `<polyline>` |
| Bug 1 重現情境 | **兩種情況都會發生**（DOM cache + DOM 重建），都需要修復 |
| Bug 3 預期行為 | 「顯示指標」是**全域總開關**，綁定 Chart Setting modal 的勾選狀態；OFF 時僅隱藏畫布，不清空 modal 勾選 |
| `_screeningPageInit` flag 機制 | 使用 `htmx:afterSwap` + 路徑比對 `/screening` 重設 flag；直接確認使用，不需追加限制 |
| Python 測試腳本環境 | **anaconda `marketing_system` 環境**（Python 3.10.19） |

---

## 實作範圍與相關檔案

### 修改既有檔案

| 檔案 | 修改原因 |
|------|----------|
| `App/Feature/Screening/chartController.js` | Bug1（init destroy guard）、Bug3（toggleIndicatorsVisibility）、SSOT（renderIndicators/clearIndicatorSeries）、Feature A（setVisibleRangeToAnalysisEndDate）、Feature B（crosshair subscribe）、Feature C（loadStock 後呼叫 PatternAnnotation） |
| `App/Feature/Screening/chartSettingsModal.js` | Bug2（apply 前 clearSeries）、SSOT（讀寫新結構）、open(target)（指定頁籤）、BOLL checkbox、init guard |
| `App/Feature/Screening/screening.js` | SSOT 初始狀態、Feature A（onStockClick 傳 fromFilterClick）、Bug1（initScreeningPage flag） |
| `App/Feature/Screening/screening.html` | Feature B HTML overlay、Feature C SVG overlay、`<script>` tags |
| `App/Feature/Screening/screening_fragment.html` | 同上 |
| `App/Feature/Screening/chart-settings-modal.css` | Feature B top bar 樣式、BOLL checkbox 樣式 |
| `App/Feature/Screening/indicators/bollinger.js` | BOLL per-band 顏色/寬度讀取 |
| `App/Static/js/utils/chartRenderer.js` | `renderBands` 支援 per-band lineWidth |

### 新建檔案

| 檔案 | 功能 |
|------|------|
| `App/Feature/Screening/function_block/indicator_top_bar.js` | Feature B：圖表左上角指標控制列 |
| `App/Feature/Screening/function_block/pattern_annotation.js` | Feature C：型態標註 SVG 圖層 |

---

## Bug Fix 詳細方案

### Bug 1：`_screeningPageInit` flag + destroy guard

**`screening.js`**：
```javascript
window._screeningPageInit = false;

document.addEventListener('htmx:afterSwap', function (evt) {
    const path = evt.detail?.requestConfig?.path || '';
    if (path.includes('/screening')) {
        window._screeningPageInit = false;
    }
});

function initScreeningPage() {
    if (window._screeningPageInit) return;
    if (!document.getElementById('patternBarsMin')) return;
    window._screeningPageInit = true;
    window.ScreeningPage.init();
}
```

**`chartController.js` `init()`**：
```javascript
// Destroy guard - 防止記憶體洩漏
if (this.chart) {
    if (this._resizeObserver) {
        this._resizeObserver.disconnect();
        this._resizeObserver = null;
    }
    try { this.chart.remove(); } catch (e) {}
    this.chart = null;
    this.candleSeries = null;
    this.currentChartData = null;
    this.currentSymbol = null;
}
```

### Bug 2：`apply()` 先清除再覆寫

```javascript
apply() {
    // ✅ Bug2 修復: 先清除所有舊 series
    if (window.ChartController) {
        window.ChartController.clearIndicatorSeries();
    }
    // ... 覆寫 state ...
    // 使用本地 K 線資料重渲染（不重新 fetch）
    if (window.ChartController) {
        window.ChartController.renderIndicatorsFromState();
    }
}
```

### Bug 3：`toggleIndicatorsVisibility()` 使用本地資料

```javascript
toggleIndicatorsVisibility() {
    this.isIndicatorsVisible = !this.isIndicatorsVisible;
    this.renderIndicatorsFromState(); // 使用 currentChartData，不重打 API
}

renderIndicatorsFromState() {
    if (!this.currentChartData || !this.currentChartData.length) return;
    this.renderIndicators(this.currentChartData);
    if (window.IndicatorTopBar) window.IndicatorTopBar.render();
}
```

---

## Feature A 詳細方案

**`screening.js` `onStockClick`**：
```javascript
onStockClick: function (symbol) {
    if (window.ChartController) {
        window.ChartController.loadStock(symbol, { fromFilterClick: true });
    }
},
```

**`chartController.js` 新增 `setVisibleRangeToAnalysisEndDate()`**：
- 讀取 `window.state.filters.analysis_end_date`
- 若空（快捷按鈕模式）→ fallback 到 `setVisibleRangeToLastYear()`（= 今天往前 1 年）
- 否則 → `chart.timeScale().setVisibleRange({ from: endDate-365天, to: endDate })`

---

## Feature B 詳細方案

### 頂部控制列 HTML
```html
<!-- 放在 #chartWrapper 內，chart-wrapper 需要 position: relative -->
<div id="indicatorTopBar"
     style="position:absolute; top:8px; left:8px; z-index:10;
            pointer-events:none; display:flex; flex-direction:column; gap:2px;">
</div>
```

### `indicator_top_bar.js` 關鍵函數

| 函數 | 說明 |
|------|------|
| `init()` | 初始化，呼叫 `render()` |
| `render()` | 讀 SSOT 狀態，生成 MA / BOLL 各行 HTML |
| `updateValues(param)` | `subscribeCrosshairMove` callback，更新每個 `<span>` 的數值 |
| `onGearClick(type)` | 呼叫 `ChartSettingsModal.open(type)` |
| `onXClick(type)` | 設 `isGlobalEnabled = false`，清除畫布，更新 modal checkbox |
| `onLineClick(type, id)` | 切換 `isEnabled`，同步 modal checkbox，重渲染 |

### `chartSettingsModal.js` 更新

- `open(target = null)` — 加 `_renderTarget` 支援，傳入 `'MA'` 或 `'BOLL'` 時強制顯示對應設定頁
- `apply()` — 寫入新 SSOT 結構後呼叫 `renderIndicatorsFromState()` + `IndicatorTopBar.render()`
- `renderBOLLSettings()` — 補上 MID/UPPER/LOWER 各自的 checkbox

---

## Feature C 詳細方案

### SVG Overlay HTML
```html
<!-- 放在 #chart 之後，#chartWrapper 內 -->
<svg id="patternAnnotationSVG"
     style="position:absolute; top:0; left:0; width:100%; height:100%;
            pointer-events:none; z-index:5;"></svg>
```

### `pattern_annotation.js` 關鍵函數

| 函數 | 說明 |
|------|------|
| `setData(patternsFound, chartData)` | 儲存資料並呼叫 `render()` |
| `clear()` | 清空 SVG |
| `setEnabled(bool)` | Toggle ON/OFF |
| `render()` | 依型態選擇渲染策略，轉換座標後寫入 SVG |
| `_drawRect(svg, pattern, slice, ...)` | consolidation → `<rect>` |
| `_drawPolyline(svg, pattern, slice, ...)` | 其他型態 → 找局部極值 → `<polyline>` |
| `_findLocalExtrema(slice, windowSize=3)` | 局部極值尋找算法，回傳 `[{time, price}]` |
| `_subscribeRedraw()` | 訂閱 `subscribeVisibleLogicalRangeChange` |

### 事件綁定
```javascript
// in chartController.js loadStock() 成功後：
if (window.PatternAnnotation) {
    const stockData = window.state.lastResults?.find(s => s.symbol === symbol);
    window.PatternAnnotation.setData(stockData?.patterns_found || [], chartData);
}

// patternAnnotationToggle:
document.getElementById('patternAnnotationToggle')
    .addEventListener('change', e => PatternAnnotation.setEnabled(e.target.checked));
```

---

## 驗證清單

- [ ] **Bug 1**: 切換到「資金風險管理」→ 切回「股票篩選」→ 點擊股票 → 圖表正常顯示
- [ ] **Bug 1**: 關閉篩選分頁 + 重新開啟 → 點擊股票 → 圖表正常顯示  
- [ ] **Bug 2**: 已有 MA10 → 開啟 Chart Setting 修改 → Apply → 圖表上只有新設定（不疊加）
- [ ] **Bug 3**: 初始無指標 → 顯示指標 OFF → 圖表空白；Chart Setting 設 MA10 → Apply → 顯示指標 ON → 顯示 MA10；顯示指標 OFF → modal checkbox 不變
- [ ] **Feature A**: 分析時間設 2025/06/01~2025/12/31 → 點股票 → 視角右側對齊 2025/12/31；可往兩側自由滑動
- [ ] **Feature B**: ⚙ 點擊 → modal 開啟且切換到對應頁籤；✕ 點擊 → 列消失 + canvas 清除 + modal checkbox 取消；MA10 文字點擊 → 文字變暗 + modal 同步 + canvas 移除 MA10；modal 操作即時反映控制列
- [ ] **Feature C**: 型態篩選完成 → 點股票 → SVG 框/折線顯示於正確時間範圍；Toggle OFF → 消失；Pan/zoom → 框跟著移動
