# 副圖功能 & 右側面板延伸實作計畫

**日期**：2026-04-06  
**涵蓋任務**：任務一（K 線圖副圖：VOL、RSI）、任務二（副圖開啟時右側面板 scrollbar 延伸）

---

## 一、背景與現況

目前 K 線圖使用 `LightweightCharts v4.1.0`，僅有單一主圖（K 線 + MA + BOLL）。
圖表管理 Modal 的「副圖」區段已存在骨架（換手率、MI），但全部 disabled。

本計畫實作：
1. 升級至 `LightweightCharts v5.x`（支援 native multi-pane）
2. 副圖 VOL（成交量）、RSI（相對強弱指標）可透過圖表管理 Modal 開啟/關閉
3. 副圖控制列（⚙ ✕ 指標名稱 即時數值 展開/縮小圖示）
4. 副圖放大/縮小（expand/collapse）
5. 主副圖均可拖拉調整高度（利用 LW v5 built-in pane resize）
6. 時間軸固定在最後一個副圖下方（LW v5 built-in）
7. 開啟副圖時右側面板以 scrollbar 向下延伸，不壓縮主圖

---

## 二、升級 LightweightCharts v4 → v5

### 2.1 影響範圍

| 檔案 | 變更類型 |
|------|--------|
| `app/template/base.html` | CDN URL 版本號 v4.1.0 → v5.x.x |
| `chart_controller.js` | `createChart()` 選項微調；新增 pane 管理方法 |
| `chart_renderer.js` | series 建立 API 加入 `pane` 參數 |
| `chart_indicators.js` | 指標 series 指定 pane（主圖 pane 0） |
| `chart_tooltip.js` | crosshair subscribe API 確認相容性 |

### 2.2 主要新增 v5 API

```js
// 建立 chart（容器同 v4）
const chart = LightweightCharts.createChart(container, options);

// 主 pane index 0 自動建立，sub-pane 呼叫 addPane()
const volPane = chart.addPane();    // 回傳 IPane
const rsiPane = chart.addPane();

// Series 建立時指定 pane
const candleSeries = chart.addCandlestickSeries({ pane: 0 });
const volSeries    = chart.addHistogramSeries({ pane: 1 });
const rsiSeries1   = chart.addLineSeries({ pane: 2 });

// 取得各 pane 高度（供控制列定位用）
const heights = chart.panes().map(p => p.height());

// 移除 pane
chart.removePane(volPane);
```

### 2.3 升級最大風險

- **最大風險**：v5 breaking change 可能導致現有 MA / BOLL / crosshair / tooltip 功能異常，需全功能回歸測試。
- **失敗情境**：v5 API 改動導致現有程式碼集體失效，修復工量難以預估。
- **緩解措施**：feature branch 開發；升級後先跑人工回歸（MA/BOLL 顯示、十字線標籤、懸浮 tooltip、圖表設定 Modal 所有 tab）再合併。

### 2.4 替代方案（若升級風險過高）

改用**多 chart 實例方案（原 Q1 方案 A）**：
- 每個副圖為獨立 `createChart()` 容器，疊加在同一 HTML column
- 優點：不升級版本，現有功能零影響
- 缺點：需自行同步 crosshair X 軸位置（可用 LW v4 `subscribeVisibleTimeRangeChange` 達成）、手動管理多個 resize 監聽器

---

## 三、任務一：副圖功能

### 3.1 狀態管理

在 `window.state.chartIndicators` 新增副圖狀態：

```js
// 新增於現有 MA / BOLL 之後
VOL: {
    isGlobalEnabled: false,  // 圖表管理 Modal 勾選狀態
    paneIndex: null,         // 渲染後的 LW pane index（動態分配）
    isExpanded: false,       // 是否處於放大模式
    savedHeight: null,       // 放大前儲存的高度（像素），用於縮小還原
    lines: {
        VOL1: { color: '#ef5350', lineWidth: 9, opacity: 100, isEnabled: true }
    }
},
RSI: {
    isGlobalEnabled: false,
    paneIndex: null,
    isExpanded: false,
    savedHeight: null,
    lines: {
        RSI1: { period: 6,  color: '#ff9800', lineWidth: 1, opacity: 100, isEnabled: true },
        RSI2: { period: 12, color: '#00bcd4', lineWidth: 1, opacity: 100, isEnabled: true },
        RSI3: { period: 24, color: '#e91e63', lineWidth: 1, opacity: 100, isEnabled: true }
    }
}
```

> **Note**：`expandedSubChart: null | 'VOL' | 'RSI'` 另存一個全域旗標，確保同時只有一個副圖被放大。

### 3.2 Pane 排列規則

副圖 pane 的順序依**圖表管理 Modal 勾選順序**排列（先勾先顯示於上方）。
例如：先勾 VOL 再勾 RSI → pane[0] 主圖、pane[1] VOL、pane[2] RSI。

### 3.3 副圖控制列（Indicator Title Bar）

**定位方式**：LW v5 渲染於單一 canvas，無法由框架插入 HTML。需以平行 HTML overlay 疊加，位置依 pane 邊界動態計算。

```
chart-wrapper（position: relative）
├── #chart（LW canvas，佔滿 chart-wrapper）
└── #subChartControlBars（HTML overlay，position: absolute, inset: 0, pointer-events: none）
    ├── .sub-chart-ctrl-bar[data-pane="vol"]（position: absolute, top: {volPaneTop}px）
    └── .sub-chart-ctrl-bar[data-pane="rsi"]（position: absolute, top: {rsiPaneTop}px）
```

**定位計算**：
1. `volPaneTop = pane[0].height()`（主圖高度）
2. `rsiPaneTop = pane[0].height() + pane[1].height()`
3. 在以下時機重新計算並更新 `top` 值：
   - 副圖新增 / 移除
   - pane resize（監聽 LW v5 提供的 resize 事件，或 ResizeObserver 監聽 chart-wrapper）

**控制列 HTML 結構**：

```html
<div class="sub-chart-ctrl-bar" data-pane="vol"
     style="pointer-events: auto;">
  <span class="sub-ctrl-btn" title="成交量設定">⚙</span>
  <span class="sub-ctrl-btn" title="關閉成交量">✕</span>
  <span class="sub-ctrl-label">VOL</span>
  <span class="sub-ctrl-values" id="sub-val-vol">VOL1: --</span>
  <!-- 僅在 ≥ 2 個副圖時顯示；展開/收合圖示使用四向箭頭 SVG（見下方說明） -->
  <button class="sub-ctrl-btn sub-ctrl-expand" title="展開此副圖">
    <!-- 展開圖示：四箭頭向外（對應 Pasted Image 6/8），風格同全螢幕按鈕 SVG -->
    <svg id="subIconExpand" width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2">
      <polyline points="15 3 21 3 21 9"></polyline>
      <polyline points="9 21 3 21 3 15"></polyline>
      <line x1="21" y1="3" x2="14" y2="10"></line>
      <line x1="3" y1="21" x2="10" y2="14"></line>
    </svg>
    <!-- 收合圖示（對應 Pasted Image 7/9）：放大模式時替換 subIconExpand -->
    <svg id="subIconCollapse" class="is-hidden" width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2">
      <polyline points="4 14 10 14 10 20"></polyline>
      <polyline points="20 10 14 10 14 4"></polyline>
      <line x1="10" y1="14" x2="3" y2="21"></line>
      <line x1="21" y1="3" x2="14" y2="10"></line>
    </svg>
  </button>
</div>
```

> **⚠️ 注意**：副圖展開/收合圖示（四向箭頭）與主圖右上角全螢幕按鈕圖示**風格相同但用途不同**：
> - 副圖展開：將 VOL/RSI 某一副圖擴展至佔滿所有副圖區域，主圖不受影響
> - 主圖全螢幕：整個 `.chart-container`（含主副圖所有內容）覆蓋整個視窗

**互動邏輯**：

| 元素 | 行為 |
|------|------|
| ⚙ | 開啟圖表管理 Modal，並導覽至對應副圖設定頁 |
| ✕ | 關閉副圖（等同 Modal 中取消勾選） |
| 指標名稱 / 數值 | 跟隨 crosshair 更新，crosshair 移走後顯示最後一根數值 |
| ⤢（展開/四箭頭向外） | 展開該副圖至多副圖合計高度（≥ 2 個副圖時才顯示）|
| ⤡（收合/四箭頭向內） | 恢復多副圖排列（放大模式中顯示，替換 ⤢）|

### 3.4 副圖布局示意圖

**多副圖狀態（VOL + RSI 均已開啟）**：

```
┌─────────────────────────────────────────────────────────┐
│ AMJB  Alerian MLP Index ETN  [1min...1D 1W 1M 1Y] [⚙][⛶]│ ← chart-header（既有）
├─────────────────────────────────────────────────────────┤
│ ⊙⊗ MA▾ MA20: -- BOLL▾ U:-- M:-- L:--                   │ ← indicatorTopBar（既有，主圖 overlay）
│                                                         │
│                  主圖 pane[0] : K 線                    │ ╮
│                  ( MA / BOLL lines )                    │ │ 可拖拉調整高度
│                                                         │ ╯
╠═════════════════════════════════════════════════════════╣ ← LW v5 pane 分隔（可拖拉）
│ ⚙ ✕ VOL  VOL1: 0.426 ▲                        [⤢]    │ ← sub-chart 控制列（HTML overlay）
│                                                         │ ╮
│                  副圖 pane[1] : 成交量柱狀圖            │ │ 可拖拉調整高度
│                                                         │ ╯
╠═════════════════════════════════════════════════════════╣ ← LW v5 pane 分隔（可拖拉）
│ ⚙ ✕ RSI  RSI1: 61.87 ▲ RSI2: 58.48 ▲ RSI3: 56.24 [⤢]│ ← sub-chart 控制列（HTML overlay）
│                                                         │ ╮
│                  副圖 pane[2] : RSI 折線圖              │ │ 可拖拉調整高度
│            （80 / 50 / 20 基準線水平虛線）              │ ╯
├─────────────────────────────────────────────────────────┤
│  2023/12    2024/03    2025/03    2026/03                │ ← 時間軸（最後一個 pane 下方，built-in）
└─────────────────────────────────────────────────────────┘
```

**VOL 副圖放大狀態（點擊 VOL 的 ⛶ 後）**：

```
┌─────────────────────────────────────────────────────────┐
│ AMJB  ...                                               │
├─────────────────────────────────────────────────────────┤
│ ⊙⊗ MA▾ ...  BOLL▾ ...                                  │
│                                                         │
│                  主圖 pane[0] : K 線（保持不變）        │
│                                                         │
╠═════════════════════════════════════════════════════════╣
│ ⚙ ✕ VOL  VOL1: 0.426 ▲                        [⤡]    │ ← 收合圖示（⤢ → ⤡，放大模式中替換）
│                                                         │
│                  副圖 pane[1] : VOL（展開）             │
│           （佔據原 VOL pane + RSI pane 的合計高度）     │ ← RSI pane 隱藏
│                                                         │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  2023/12    2024/03    2025/03    2026/03                │
└─────────────────────────────────────────────────────────┘
```

> 點擊 ⤡（收合）→ 恢復 `savedHeight`，重新顯示 RSI pane，回到多副圖狀態。

### 3.5 圖表管理 Modal — 副圖示意圖

以下示意圖對齊 BOLL 排版：右側面板標題僅含 `重置`（無 `修改`）；上方為指標設定區（如有參數）；下方為指標線表格。Modal 底部 `取消` / `確定` 為框架按鈕。

---

#### VOL（成交量）— ☆指標設定 Tab

VOL 無計算週期參數，設定面板僅顯示指標線表格（對齊 BOLL MID/UPPER/LOWER 列的排版）。

```
┌──────────────────────┬────────────────────────────────────────────────┐
│ ▼ 主圖               │  VOL: 成交量                            重置    │
│   ☑ MA               ├────────────────────────────────────────────────┤
│   ☑ BOLL             │  ☆指標設定    指標介紹                           │
│   EMA  (dim)         ├────────────────────────────────────────────────┤
│   SAR  (dim)         │                                                │
│   CDP  (dim)         │  參數名稱   線寬      顏色       不透明度(%)     │
│   IC   (dim)         │  ───────────────────────────────────────────   │
│   KC   (dim)         │  ☑ VOL1  [1]↕   [■■■■]    ─────●─   100       │
│   神奇九轉 (dim)      │                                                │
│   VWAP (dim)         │                                                │
│                      │                                                │
│ ▼ 副圖               │                                                │
│   ☑ VOL  ← 選中      │                                                │
│   ☐ MACD (future)    │                                                │
│   ☐ KDJ  (future)    │                                                │
│   ☑ RSI              │                                                │
│   ☐ ARBR (future)    │                                                │
│   ...                │                                                │
├──────────────────────┴────────────────────────────────────────────────┤
│                                             [取消]         [確定]      │
└───────────────────────────────────────────────────────────────────────┘
```

#### VOL（成交量）— 指標介紹 Tab

```
┌──────────────────────┬────────────────────────────────────────────────┐
│ ▼ 主圖               │  VOL: 成交量                            重置    │
│   ☑ MA               ├────────────────────────────────────────────────┤
│   ☑ BOLL             │  指標設定    ☆指標介紹                           │
│   EMA  (dim)         ├────────────────────────────────────────────────┤
│   SAR  (dim)         │                                                │
│   CDP  (dim)         │  成交量（VOL）以柱狀圖呈現每根 K 線              │
│   IC   (dim)         │  的成交量大小。                                 │
│   KC   (dim)         │                                                │
│   神奇九轉 (dim)      │  K 線上漲（收盤 > 開盤）：                      │
│   VWAP (dim)         │    使用主圖多頭色（預設 #26a69a 綠）。           │
│                      │  K 線下跌（收盤 ≤ 開盤）：                      │
│ ▼ 副圖               │    使用主圖空頭色（預設 #ef5350 紅）。           │
│   ☑ VOL  ← 選中      │                                                │
│   ☐ MACD (future)    │  成交量是研判市場活躍程度及趨勢                  │
│   ☐ KDJ  (future)    │  可信度的重要輔助指標。                         │
│   ☑ RSI              │                                                │
│   ☐ ARBR (future)    │                                                │
│   ...                │                                                │
├──────────────────────┴────────────────────────────────────────────────┤
│                                             [取消]         [確定]      │
└───────────────────────────────────────────────────────────────────────┘
```

---

#### RSI（相對強弱指標）— ☆指標設定 Tab

RSI 有三個獨立週期（6 / 12 / 24），每一週期對應一條指標線，排版與 MA 相同（表格行 = 參數名稱 ＋ 參數值 ＋ 指標線）。

```
┌──────────────────────┬────────────────────────────────────────────────┐
│ ▼ 主圖               │  RSI: 相對強弱指標                       重置   │
│   ☑ MA               ├────────────────────────────────────────────────┤
│   ☑ BOLL             │  ☆指標設定    指標介紹                           │
│   EMA  (dim)         ├────────────────────────────────────────────────┤
│   SAR  (dim)         │                                                │
│   CDP  (dim)         │ 參數名稱    參數值  指標線   線寬  顏色 不透明度(%)│
│   ...                │ ─────────────────────────────────────────────  │
│                      │ 移動平均周期  6  ↕  ☑ RSI1  [1]↕  [██]  ─●─ 100│
│ ▼ 副圖               │ 移動平均周期 12  ↕  ☑ RSI2  [1]↕  [██]  ─●─ 100│
│   ☑ VOL              │ 移動平均周期 24  ↕  ☑ RSI3  [1]↕  [██]  ─●─ 100│
│   ☐ MACD (future)    │                                                │
│   ☐ KDJ  (future)    │                                                │
│   ☑ RSI  ← 選中      │                                                │
│   ☐ ARBR (future)    │                                                │
│   ...                │                                                │
├──────────────────────┴────────────────────────────────────────────────┤
│                                             [取消]         [確定]      │
└───────────────────────────────────────────────────────────────────────┘
```

#### RSI（相對強弱指標）— 指標介紹 Tab

```
┌──────────────────────┬────────────────────────────────────────────────┐
│ ▼ 主圖               │  RSI: 相對強弱指標                       重置   │
│   ☑ MA               ├────────────────────────────────────────────────┤
│   ☑ BOLL             │  指標設定    ☆指標介紹                           │
│   EMA  (dim)         ├────────────────────────────────────────────────┤
│   SAR  (dim)         │                                                │
│   CDP  (dim)         │  RSI（Relative Strength Index，               │
│   ...                │  相對強弱指標）衡量一段時間內漲跌幅             │
│                      │  的相對強弱，數值介於 0 ～ 100。               │
│ ▼ 副圖               │                                                │
│   ☑ VOL              │  RSI > 70：通常視為超買區。                    │
│   ☐ MACD (future)    │  RSI < 30：通常視為超賣區。                    │
│   ☐ KDJ  (future)    │                                                │
│   ☑ RSI  ← 選中      │  同時顯示三條週期線（RSI1 / RSI2 / RSI3），     │
│   ☐ ARBR (future)    │  並搭配 20 / 50 / 80 基準參考線。              │
│   ...                │                                                │
├──────────────────────┴────────────────────────────────────────────────┤
│                                             [取消]         [確定]      │
└───────────────────────────────────────────────────────────────────────┘
```

---

#### 3.5.x 左側面板摺疊／展開示意圖

**現有機制**：`.category-header` 內含 SVG 三角形（`path d="M2 4 L6 8 L10 4 Z"`，呈現為 ▼），目前為裝飾性，尚不支援點擊。

**目標實作**：點擊 `▼ 主圖` / `▼ 副圖` 標題列（含 SVG 箭頭區域）可切換展開 / 摺疊；摺疊後以 CSS `transform: rotate(-90deg)` 旋轉同一 SVG，視覺上呈現 ▶。

**展開狀態（預設）**：

```
┌─────────────────────┐
│ ▼ 主圖              │  ← 點擊可摺疊
│   ☑ MA              │
│   ☑ BOLL            │
│   ☐ EMA   (dim)     │
│   ☐ SAR   (dim)     │
│   ☐ CDP   (dim)     │
│   ☐ IC    (dim)     │
│   ☐ KC    (dim)     │
│   ☐ 神奇九轉 (dim)  │
│   ☐ VWAP  (dim)     │
├─────────────────────┤
│ ▼ 副圖              │  ← 點擊可摺疊
│   ☑ VOL             │
│   ☐ MACD  (future)  │
│   ☐ KDJ   (future)  │
│   ☑ RSI             │
│   ☐ ARBR  (future)  │
└─────────────────────┘
```

**摺疊後（以主圖為例）**：

```
┌─────────────────────┐
│ ► 主圖              │  ← 已摺疊（SVG 旋轉 −90°），點擊展開
├─────────────────────┤
│ ▼ 副圖              │  ← 仍展開
│   ☑ VOL             │
│   ☐ MACD  (future)  │
│   ☐ KDJ   (future)  │
│   ☑ RSI             │
│   ☐ ARBR  (future)  │
└─────────────────────┘
```

> 收起動畫建議以 `max-height: 0` ＋ `overflow: hidden` ＋ CSS `transition` 實作（避免 `display: none` 無法過渡）；摺疊狀態以 `data-collapsed="true"` attribute 記錄於 `.indicator-category` 元素上。

### 3.7 全螢幕範圍擴充（主圖 → 完整圖表區）

#### 現況與需求

| 項目 | 現況 | 修改後 |
|------|------|--------|
| 全螢幕觸發目標 | `.chart-wrapper`（僅 LW canvas 區域） | `.chart-container`（包含 chart-header + chart-wrapper + 所有副圖） |
| 按鈕位置 | chart-header 右側 `#btnFullscreen` | 不變 |
| 全螢幕後 chart-header 是否顯示 | 消失（因 header 在 wrapper 外） | ✅ 顯示（header 含於 container 內） |

#### 全螢幕包含範圍示意圖

```
全螢幕前（正常狀態）：                    全螢幕啟動後（.chart-container 覆蓋視窗）：

┌─────── App Header ─────────────────┐    ┌──────────────────────────────────────────┐
│ Logo │ 股票篩選器 │ 回測 │ 風控 │ + │    │ AMJB  Alcoa Corp  [1min..1D 1W] [型] [指]│ ◀要
├──────┬──────────────────────────────┤    │                    [⚙] [⤡全螢幕退出]     │ ◀含
│      │ 篩選結果列表                  │    ├──────────────────────────────────────────┤ ◀的
│ 側   ├──────────────────────────────┤    │ ⊙⊗ MA▾ MA20:48.63   BOLL▾ U:52.57 ...  │ ◀範
│ 欄   │⬛ 代碼/名稱 [1D..] [型][指][⚙][⤢]│    │                                          │ ◀圍
│      │ K線主圖 pane[0]               │    │  K 線主圖 pane[0]                        │
│      ╠══════════════════════════════╣    ╠══════════════════════════════════════════╣
│      │⚙ ✕ VOL VOL1:--  [⤢]         │    │ ⚙ ✕ VOL  VOL1:--  [⤢]                  │
│      │ VOL 副圖 pane[1]              │    │ VOL 副圖 pane[1]                         │
│      ╠══════════════════════════════╣    ╠══════════════════════════════════════════╣
│      │⚙ ✕ RSI RSI1:-- [⤢]          │    │ ⚙ ✕ RSI  RSI1:--  [⤢]                  │
│      │ RSI 副圖 pane[2]              │    │ RSI 副圖 pane[2]                         │
│      ├──────────────────────────────┤    ├──────────────────────────────────────────┤
│      │ 時間軸                        │    │ 時間軸                                   │
└──────┴──────────────────────────────┘    └──────────────────────────────────────────┘
                                           ← 覆蓋整個視窗（z-index: 9999）→
```

> **左側 sidebar 與篩選結果列表**：全螢幕狀態下完全隱藏，僅顯示 `.chart-container` 內容。

#### 實作要點

1. 現有 `btnFullscreen` 的 `click` handler 改為以 `.chart-container` 作為 `fullscreen` 目標（使用 `requestFullscreen()` 標準 API，或套用現有 `chart-viewport-fullscreen` class 至 `.chart-container`）
2. CSS 需新增 `.chart-container.chart-viewport-fullscreen` 的 `position: fixed; inset: 0; z-index: 9999` 規則（目前只有 `.chart-wrapper.chart-viewport-fullscreen`）
3. 全螢幕後 LW chart 需呼叫 `chart.resize(newWidth, newHeight)` 以填滿新尺寸，副圖 control bar overlay 也需重新定位
4. 退出全螢幕（⤡）：同現有邏輯，改回 `.chart-container`

---

### 3.6 指標計算

#### VOL（成交量）

- **資料來源**：API 已回傳 `volume` 欄位，無需額外計算
- **顏色規則**：跟隨圖表管理的 K 線顏色設定（`ChartSettingsModal._generalConfig.bullColor` / `bearColor`）：`close > open` → `bullColor`（預設 `#26a69a`）；`close <= open` → `bearColor`（預設 `#ef5350`）。渲染時需從 `window.state.chartIndicators` 或 `ChartSettingsModal._generalConfig` 動態讀取，而非寫死顏色常數
- **渲染**：`chart.addHistogramSeries({ pane: volPaneIndex })`
- **Y 軸**：使用獨立 priceScaleId（`pane: volPaneIndex` 自動分配獨立 scale）

#### RSI（相對強弱指標）

- **公式**：`RSI = 100 - 100 / (1 + RS)`，RS = Wilder's Smoothed Avg Gain / Avg Loss
- **預設三條線**：period 6（RSI1）/ period 12（RSI2）/ period 24（RSI3）
- **基準線**：20 / 50 / 80（以 `createPriceLine` 或渲染固定 line series 實現）
- **Y 軸範圍**：固定 0〜100（`autoscaleInfoProvider` 或 `scaleMargins`）
- **渲染**：各線 `chart.addLineSeries({ pane: rsiPaneIndex })`

---

## 四、任務二：開啟副圖時右側面板 scrollbar 延伸

### 4.1 現況佈局

```
.page-content
├── .sidebar（左側面板，overflow-y: auto）
├── #sidebarResizeHandle
└── .content-area（右側面板，overflow: hidden 或 clip）
    ├── #stockList（篩選結果列表）
    ├── #verticalResizeHandle（上下分隔線）
    └── .chart-container
        └── .chart-wrapper（K 線圖）
```

### 4.2 目標佈局（方案 A：主圖固定，副圖向下延伸）

**主圖與副圖是同一個 LW chart 實例的不同 pane，屬於不可分割的整體。**
開啟副圖後，chart 實例的總高度增加，`.content-area` 出現縱向 scrollbar。

**scrollbar 起點對齊 `.page-content` 頂部（即 App Header 正下方，包含篩選結果列表起始處），scrollbar 高度 = 視窗高 – App Header 高。**

```
┌─── App Header（Logo＋分頁標籤＋開啟實頁，固定不捲動） ─────────────────┐
│  ≈≈ Stock AI Filter PRO  │ 股票篩選器 │ 回測 │ 風控 │ + 開啟實頁       │
└──────────────────────────────────────────────────────────────────────────┘
         ↓ .page-content 起點（= 右側 scrollbar 起點）
┌──────────────┬────────────────────────────────────────┐  ↑
│              │  ┌──────────────────────────────────┐  │  │ 視窗可見區域
│  左側        │  │  篩選結果列表（#stockList）       │  │  │（高度 = 視窗高
│  sidebar     │  ├──────────────────────────────────┤  │  │  - App Header 高）
│              │  │  ← 上下分隔線（可拖拉）→         │  │  │
│ （固定高度,  │  ├──────────────────────────────────┤  │  │
│  有自身       │  │  圖表 header（代碼/名稱/時間框架） │  │  │
│  overflow-y  │  │  K 線主圖 pane[0]                │  │  ↓ ← 視窗可見底部邊界
│  不隨右側    │  ╠══════════════════════════════════╣  │    （副圖超出，需向下捲）
│  捲動）      │  │  ⚙ ✕ VOL  VOL1:--  [⤢]         │  │
│              │  │  VOL 副圖  pane[1]               │  │  捲動後可見
│              │  ╠══════════════════════════════════╣  │
│              │  │  ⚙ ✕ RSI  RSI1:--  [⤢]         │  │
│              │  │  RSI 副圖  pane[2]               │  │
│              │  ├──────────────────────────────────┤  │
│              │  │  時間軸                           │  │
│              │  └──────────────────────────────────┘  │
└──────────────┴────────────────────────────────────────┘
                                                    ↕ scrollbar（.content-area 右側；
                                                      起點 = App Header 正下方）
```

### 4.3 實作要點

| 項目 | 現況 | 修改後 |
|------|------|--------|
| `.content-area` overflow | `hidden` / `clip` | `overflow-y: auto` |
| `.chart-wrapper` height | `flex-1`（撐滿 content-area） | 無副圖時維持 `flex-1`；有副圖時設定 `min-height: calc(主圖最小高度 + 各副圖高度)` |
| `#chart` height | 固定跟隨 chart-wrapper | LW v5 auto（各 pane height 由 LW 管理） |

> **左側 sidebar 不受影響**：`.sidebar` 維持現有 `overflow-y: auto`，不跟著捲動。

---

## 五、主要新增 / 修改檔案

| 優先序 | 步驟 | 主要異動檔案 |
|--------|------|-------------|
| 1 | 升級 LW CDN；確認現有功能不中斷 | `base.html` |
| 2 | `chart_controller.js` 遷移至 v5 pane API | `chart_controller.js` |
| 3 | series 建立加入 pane 參數 | `chart_renderer.js` |
| 4 | 圖表管理 Modal 副圖 sidebar 項目啟用（VOL / RSI checkbox 可點） | `chart_settings_modal_template.js` |
| 5 | 副圖勾選/取消邏輯；VOL/RSI 設定面板 UI | `chart_settings_modal.js`、`indicator_settings_tab.js` |
| 6 | 新建 VOL chart 渲染模組（K 線圖用，區別於篩選器 `volume.js`） | 新建 `chart/kline_viewer/sub_charts/chart_vol.js` |
| 7 | 新建 RSI chart 渲染模組 | 新建 `chart/kline_viewer/sub_charts/chart_rsi.js` |
| 8 | 副圖控制列 HTML / CSS / 定位邏輯 / 放大縮小 | 新建 `chart/kline_viewer/sub_chart_control_bar.js` |
| 9 | 右側面板 scrollbar CSS 調整 | `chart-area.css`、`layout.css`（待確認） |

---

## 六、最大風險

| 風險 | 說明 | 失敗情境 |
|------|------|---------|
| LW v5 Breaking Change | v5 對 series / config API 可能有 breaking change，影響 MA/BOLL/crosshair/tooltip | v5 API 不相容，需逐一修復，工量難以預估 |
| 副圖控制列定位 | 需精確計算各 pane 頂部 Y 值；pane 拖拉 resize 後必須重新定位 | LW v5 未提供 pane resize 事件 → overlay 位置偏移 |
| 放大/縮小狀態恢復 | 多副圖情況下展開/收合需記錄各自高度並準確還原 | 高度恢復不準確導致多副圖布局錯亂 |
| Chart 總高度管理 | 副圖增加時 `.chart-wrapper` 需同步成長；若高度計算有誤，LW resize() 可能觸發無限迴圈 | ResizeObserver callback loop |

---

## 七、手動驗證項目（無法自動化）

1. K 線主圖在 LW v5 升級後 MA / BOLL 顯示正常，BOLL 三條線顏色與設定一致
2. Crosshair 移動時 VOL 控制列的數值、RSI 控制列的三個數值同步更新
3. VOL 柱狀圖顏色與 K 線燭台漲跌顏色一致（上漲綠、下跌紅）
4. RSI 三條線（6 / 12 / 24）及 80 / 50 / 20 基準線視覺正確
5. 主副圖間拖拉分隔線可自由調整高度，副圖不消失
6. 放大 VOL → RSI pane 完全消失，VOL 佔據原兩個副圖合計區域；縮小後恢復
7. ⚙ 齒輪點擊後 Modal 開啟並導覽至正確副圖設定頁
8. 圖表管理 Modal 取消勾選 RSI → RSI pane 即時消失，時間軸移至 VOL 下方
9. 開啟 VOL + RSI 後右側面板出現 scrollbar，捲動可見 RSI 副圖；左側 sidebar 不捲動
10. 全螢幕模式下副圖控制列位置正確（全螢幕狀態會影響 chart-wrapper 尺寸）

---

## 八、補充建議：圖表標題列長股名截斷

### 問題描述

部分股票全名極長（例：`AGNCL AGNC Investment Corp. - Depositary Shares Each Representing a 1/1,000th Interest in a Share of 7.75% Series G Fixed-Rate Reset Cumulative Redeemable Preferred Stock`），導致圖表 chart-header 標題列嚴重溢出，與右側時間框架按鈕群重疊，版面混亂（對比股名較短的股票，版面正常）。

### 建議方案

| 方案 | 作法 | 優點 | 缺點 |
|------|------|------|------|
| **A（推薦）** | 名稱元素加 `text-overflow: ellipsis; max-width: clamp(...)`；完整名稱保留在 `title=""` 屬性 | 程式碼改動最少；完整資訊仍可 hover 取得 | `max-width` 需搭配版面動態調整 |
| B | 僅顯示股票代碼（如 `AGNCL`），公司全名僅 hover tooltip 呈現 | 版面最乾淨 | 不熟悉代碼的使用者難以確認股票 |
| C | 顯示代碼 ＋ 公司名稱（截至第一個 ` - ` 為止，省略後段描述） | 兼顧可讀性 | 需前端字串處理；部分名稱無 ` - ` 分隔符 |

### 方案 A 實作細節

```css
/* chart-header 中的股票名稱文字元件 */
.chart-stock-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: clamp(160px, 30vw, 420px);  /* 依視窗寬度動態縮放 */
  flex-shrink: 1;                         /* 名稱縮短，時間框架按鈕群不受壓縮 */
  min-width: 0;                           /* 確保 flex child 能縮小至 0 */
}
```

對應 HTML 元素在 JS 載入股票資料時動態寫入 `title="完整名稱"`，hover 時瀏覽器原生 tooltip 顯示全稱。無需後端異動。
