# 圖表高度與版面 Bug 修正計畫

**日期**：2026-04-07  
**作者**：Copilot  
**狀態**：待實作（高度行為已確認採 Option 1 等比縮放）  
**關聯檔案**：
- `app/feature/screening/chart/kline_viewer/chart_controller.js`
- `app/feature/screening/chart/kline_viewer/sub_chart_control_bar.js`
- `app/feature/screening/chart/kline_viewer/chart-area.css`
- `app/feature/screening/indicators/indicator_top_bar.js`
- `app/feature/screening/screening.js`

---

## 一、Bug 清單與根本原因

### Bug 1 & 2：整體圖表高度行為不符預期（最高優先）

#### 現象
- **Bug 1**：在圖表管理中開啟任一副圖後，拉動「拖拉整體圖表高度」handle，圖表高度成倍增加，遠超拖拉距離
- **Bug 2**：點擊篩選結果股票列表載入股票時，副圖（成交量）自動把整體圖表拉高，而非在現有高度內分配空間

#### 根本原因

`_syncChartContainerHeight()` 的計算邏輯有設計缺陷：

```
targetHeight = _baseMainPaneHeight + totalSubHeight + 52
```

問題在於 `_baseMainPaneHeight` 的初始化方式：當 `_baseMainPaneHeight` 為 null 時，程式碼讀取 `panes[0].getHeight()` 或 `chartWrapper.clientHeight - 52`。  
此時 `chartWrapper` 尚由 CSS `flex-1` 撐開（整個可見區域，約 450–600px），  
導致 `_baseMainPaneHeight ≈ 500`，再加上每個副圖的 180px：

```
targetHeight = 500(主圖) + 180(VOL) + 52 = 732px  ← 已過高
targetHeight = 500(主圖) + 360(VOL+RSI) + 52 = 912px  ← 失控
```

**本質問題**：副圖高度被「加在主圖之上」，而不是「從總高度中分配出去」。

#### 預期行為
> 總高度容器（chartWrapper）是唯一可由「拖拉整體圖表高度」控制的高度。加入/移除副圖，各格（主圖、副圖）在同一總高度下重新分配，不改變容器高度。

---

### Bug 3：開啟/關閉 RSI 後，主圖左右 Y 軸刻度不一致

#### 現象
- 開啟 RSI 副圖後，主圖（K 線圖）左右 Y 軸刻度範圍不同
- 在圖表管理中關閉 RSI 仍無法恢復
- 切換到單邊座標，左或右軸顯示範圍也不一致
- 僅 RSI 有此問題，VOL 無

#### 根本原因

`_renderRSISubChart()` 結尾呼叫：

```javascript
const ps = this.chart.priceScale('right', paneIndex);
ps.applyOptions({ autoScale: false, scaleMargins: { top: 0.08, bottom: 0.08 } });
```

在部分 LightweightCharts 版本中，`chart.priceScale('right', paneIndex)` 的 `paneIndex` 參數未能有效隔離各 pane 的 scale，導致對 pane 1（RSI）right scale 的設定污染了 pane 0（主圖）的 right scale（`autoScale: false` 持續殘留）。

後續即使移除 RSI series，該 scale option 仍存在，造成主圖左右軸數據範圍不同步（左軸 auto scale 正常，右軸因為 `autoScale: false` lock 住了特定範圍）。

---

### Bug 4：RSI / VOL 顯示控制列未反映顏色與參數設定

#### 現象
- RSI 控制列（圖表左上角 RSI Pane 區域）顯示 RSI1/RSI2/RSI3 顏色為白色（預設），未使用圖表管理中設定的顏色
- RSI 參數變更（例如將 RSI1 period 改為 6）後，標籤仍顯示 `RSI1:` 而非 `RSI6:`
- VOL 控制列顏色也未正確反映設定

#### 根本原因（`sub_chart_control_bar.js → _buildValueHtml()`）

**顏色問題**：RSI 的 inline style 為：
```javascript
style="color: ${line?.color}; opacity: ${line?.opacity/100}"
```
- `line.color` 是原始 hex（如 `#ff9800`），未與 opacity 合併
- `opacity` 屬性整體半透明化 span，包含文字本身
- 正確做法應呼叫 `_withOpacity(line.color, line.opacity)` 產生 rgba，不需額外 opacity CSS

**VOL 無顏色**：VOL 的顯示控制完全沒有 `style` 屬性，文字繼承父容器白色。

**參數標籤問題**：標籤硬編碼為 `RSI1`, `RSI2`, `RSI3`，未讀取 `line.period` 欄位動態顯示。

---

### Bug 5：開關指標個別參數顯示會影響主副圖高度

#### 現象
- 點擊主圖左上角的 MA/BOLL 各線條 token（例如「MA10」文字）切換啟用狀態
- 或點擊 RSI 控制列的 RSI1/RSI2/RSI3 切換啟用
- 副圖（VOL/RSI）的高度或整體圖表高度發生不必要的變化
- **全部關閉 RSI1/RSI2/RSI3 時，RSI 控制列跑到主圖左上角，RSI Pane 區域整個消失（錯誤）**

#### 預期 vs 實際行為（示意圖）

**觸發方式與效果對照**：

| 操作 | 正確效果 | 目前（錯誤）效果 |
|------|----------|------------------|
| 點擊副圖控制列的 ✕ | RSI 副圖整個消失（含 Pane 區域、控制列） | ✅ 目前正確 |
| 圖表管理左側面板取消勾選 RSI | RSI 副圖整個消失（含 Pane 區域、控制列） | ✅ 目前正確 |
| 點擊 RSI1 / RSI2 / RSI3 文字（線條 toggle） | **僅隱藏對應線條，RSI Pane 區域、控制列不消失** | ❌ Pane 消失 |

**正確行為示意圖（RSI1/RSI2/RSI3 全部 toggle 關閉）**：

```
【RSI1、RSI2、RSI3 全部 token 關閉後 -- 正確】

┌──────────────────────────────────────────┐ H=400 (不變)
│ ⊙⊗ MA MA20:-- BOLL U:-- M:-- L:--       │ ← 主圖控制列（無 RSI）
│                                          │
│              主圖 (K線)                  │ 210px（不變）
│                                          │
╠══════════════════════════════════════════╣
│ ⚙ ✕ VOL  VOL1: 0                  [⤢] │ ← VOL 控制列
│              副圖 (VOL)                  │  95px（不變）
╠══════════════════════════════════════════╣
│ ⚙ ✕ RSI  RSI1:-- RSI2:-- RSI3:--  [⤢] │ ← RSI 控制列（仍顯示，-- 表示無值）
│                                          │
│     RSI pane 保留（空白，無線條）         │  95px（不變）
│                                          │
└──────────────────────────────────────────┘
  ✅ 關閉 RSI1/RSI2/RSI3 token ≠ 關閉 RSI 副圖
     線條不見，但 RSI pane 容器保留
```

**錯誤行為示意圖（目前實際）**：

```
【RSI1、RSI2、RSI3 全部 token 關閉後 -- 目前錯誤】

┌──────────────────────────────────────────┐
│ ⊙⊗ MA MA20:-- BOLL U:-- M:-- L:--       │
│ ⚙ ✕ RSI RSI1:-- RSI2:-- RSI3:--  [⤢]  │ ← RSI 控制列跑到主圖！
│                                          │
│              主圖 (K線)                  │ ← 主圖被壓縮
│                                          │
╠══════════════════════════════════════════╣
│ ⚙ ✕ VOL  VOL1: 0                  [⤢] │
│              副圖 (VOL)                  │
│                                          │
│   -- RSI pane 完全消失 --                │ ← ❌ 錯誤！
│                                          │
└──────────────────────────────────────────┘
```

#### 根本原因

`IndicatorTopBar.onLineClick()` 與 `SubChartControlBar.onLineClick()` 都呼叫：

```javascript
window.ChartController.renderIndicatorsFromState();
```

這觸發完整的重新渲染鏈：

```
renderIndicators() 
  → _captureCurrentPaneHeights()
  → clearIndicatorSeries()
      → _clearSubChartSeries()        ← paneIndex 設為 null
  → renderSubCharts()
      → _captureCurrentPaneHeights()  ← paneIndex 已 null，高度未更新
      → _syncChartContainerHeight()   ← 依 savedHeight 重算（可能有誤）
      → _renderRSISubChart()          ← 若所有 RSI 線 isEnabled=false，無 series 建立
      → _updateSubChartPaneHeights()  ← RSI pane 無 series，LW 可能 collapse pane 高度
```

**核心問題**：
1. 個別線條的顯示/隱藏，不需要完整清除並重建所有 series（重算高度）
2. 當 RSI 全線關閉時，`_renderRSISubChart()` 不建立任何 series → LightweightCharts 的 RSI pane 自動縮為 0 → 被下次 `_captureCurrentPaneHeights()` 讀取後儲存為 0 → `_syncChartContainerHeight()` 以 savedHeight=0 計算 → 容器縮小

---

### Bug 6：展開副圖（⤢）與收合副圖（⤡）的圖示顯示錯誤

#### 現象
- 副圖控制列右側的展開圖示與收合圖示，與設計規格不符
- 目前展開圖示（⤢）顯示為「右上↗ + 左下↙」型態
- 應改為**四向對角向外箭頭**（類似 ↗↙ 的展開外向符號，即 Pasted Image 所示）
- 收合圖示（⤡）應改為**四向對角向內箭頭**（類似 ↘↖ 的收合內向符號，即 Pasted Image2 所示）

#### 圖示規格

| 狀態 | 圖示外觀描述 | SVG 路徑方向 |
|------|--------------|-------------------|
| **展開** (`⤢`) | 四個角各有一個向外箭頭（左上↖、右上↗、右下↘、左下↙，向外指） | 四條線段，各自從中心向四角延伸，頭端有箭頭 |
| **收合** (`⤡`) | 四個角各有一個向內箭頭（↗↙ 向中心指） | 四條線段，各自從四角指向中心 |

#### 根本原因

目前 `sub_chart_control_bar.js` 的 `render()` 中，展開/收合圖示使用的 SVG path 為：

```javascript
// 展開圖示（現有，方向不符）
<svg ...><path d="M15 3H21V9M9 21H3V15M21 15V21H15M3 9V3H9"/></svg>

// 期望：四角向外展開圖示
// 收合圖示（現有，方向不符）  
<svg ...><path d="M4 14H10V20M20 10H14V4M10 4V10H4M14 20V14H20"/></svg>

// 期望：四角向內收合圖示
```

#### 修正方式
- 展開圖示改用四個指向外部對角方向的箭頭 SVG（同 Pasted Image）
- 收合圖示改用四個指向內部中心方向的箭頭 SVG（同 Pasted Image2）
- 圖示尺寸維持 14×14px，stroke 顏色繼承 `currentColor`

---

## 二、示意圖：高度行為

以下以方塊圖說明預期正確行為（容器高度 H = 固定）：

### 情境 A：無副圖 vs 加入 1 個副圖

```
【狀態 A1：無副圖】             【狀態 A2：開啟 VOL 副圖】
┌────────────────────┐ H=400    ┌────────────────────┐ H=400 (不變!)
│                    │          │                    │
│     主圖 (K線)     │ 400px    │     主圖 (K線)     │ ~270px (縮小)
│      flex-1        │          │                    │
│                    │          ├────────────────────┤
│                    │          │     副圖 (VOL)      │ ~130px
└────────────────────┘          └────────────────────┘
                                  容器 H = 主圖 + VOL + 分隔線
                                  ✅ 總高度沒有增加！
```

### 情境 B：加入 2 個副圖

```
【狀態 B1：VOL 副圖】            【狀態 B2：新增 RSI 副圖】
┌────────────────────┐ H=400    ┌────────────────────┐ H=400 (不變!)
│                    │          │     主圖 (K線)      │ ~210px
│     主圖 (K線)     │ 270px    ├────────────────────┤
│                    │          │     副圖 (VOL)      │ ~95px
├────────────────────┤          ├────────────────────┤
│     副圖 (VOL)     │ 130px    │     副圖 (RSI)      │ ~95px
└────────────────────┘          └────────────────────┘
                                  ✅ 總高度沒有增加！
```

### 情境 C：拖拉整體圖表高度

```
【拖拉前：H=400, VOL+RSI】        【拖拉後：H=520，VOL+RSI，往下拉 120px】

┌────────────────────┐ H=400    ┌────────────────────┐ H=520
│     主圖 (K線)      │ 210px    │     主圖 (K線)      │ ~273px (+63px)
├────────────────────┤          ├────────────────────┤
│     副圖 (VOL)      │  95px    │     副圖 (VOL)      │ ~124px (+29px)
├────────────────────┤          ├────────────────────┤
│     副圖 (RSI)      │  95px    │     副圖 (RSI)      │ ~123px (+28px)
└────────────────────┘          └────────────────────┘
  ✅ Option 1（等比縮放）各格等比例放大，拖多少就大多少
```

### 情境 D：展開副圖（⤢）/ 收合副圖（⤡）

展開副圖時，**主圖高度不變**，展開的副圖佔用所有副圖的合計高度，其餘副圖 Pane 隱藏（高度保存）。  
整體容器總高度 **H 不變**。

```
【D1：展開前，VOL+RSI, H=400】     【D2：點擊 VOL [⤢] 展開後，H=400（不變!）】

┌────────────────────┐ H=400    ┌────────────────────┐ H=400 (不變!)
│     主圖 (K線)      │ 210px    │     主圖 (K線)      │ 210px (不變!)
├────────────────────┤          ├────────────────────┤
│ ⚙ ✕ VOL [⤢]      │          │ ⚙ ✕ VOL [⤡]      │ ← 圖示換為收合
│     副圖 (VOL)      │  95px    │     副圖 (VOL)      │ 190px
├────────────────────┤          │   （展開狀態）       │ = 95(VOL)+95(RSI)
│ ⚙ ✕ RSI [⤢]      │          │   其他副圖全部不顯示 │
│     副圖 (RSI)      │  95px    │                    │
└────────────────────┘          └────────────────────┘
  副圖高度保存：                   ✅ 主圖不變，VOL 展開佔全部副圖空間
  VOL.savedHeight = 95px             RSI Pane 隱藏（savedHeight 保留 95px）
  RSI.savedHeight = 95px
```

```
【D3：點擊 VOL [⤡] 收合後，恢復 D1 狀態，H=400（不變!）】

┌────────────────────┐ H=400 (不變!)
│     主圖 (K線)      │ 210px（恢復）
├────────────────────┤
│ ⚙ ✕ VOL [⤢]      │ ← 圖示恢復為展開
│     副圖 (VOL)      │  95px（從 savedHeight 恢復）
├────────────────────┤
│ ⚙ ✕ RSI [⤢]      │
│     副圖 (RSI)      │  95px（從 savedHeight 恢復）
└────────────────────┘
  ✅ 收合後完整恢復展開前的各格高度
```

**拖拉整體高度 → 再展開副圖 → 收合副圖** 的連貫場景：

```
【整體先拖大到 H=520, VOL+RSI】  →  【展開 VOL（H=520 不變）】

┌────────────────────┐ H=520    ┌────────────────────┐ H=520 (不變!)
│     主圖 (K線)      │ 273px    │     主圖 (K線)      │ 273px (不變!)
├────────────────────┤          ├────────────────────┤
│     副圖 (VOL)      │ 124px    │     副圖 (VOL) [⤡] │ 247px
├────────────────────┤          │   （展開狀態）       │ = 124+123
│     副圖 (RSI)      │ 123px    │                    │
└────────────────────┘          └────────────────────┘
  savedHeight:                     ✅ 展開後仍佔拖拉後的全部副圖空間
  VOL=124px, RSI=123px
```

**全螢幕顯示時**的高度行為與上述相同：進入全螢幕後依比例顯示（等比縮放，Option 1 規則）。
當前全螢幕為全網頁範圍，維持現有邏輯不更動，僅確保進入/退出全螢幕時圖表 `chart.resize()` 正確更新。

---

## 三、高度調整行為設計抉擇

> **✅ 已確認採用 Option 1（等比縮放）**

### Option 1：等比例縮放（確認採用）

**說明**：拖拉整體圖表高度時，主圖和每個副圖按當前佔比等比放大/縮小。

| 拖拉前 | 各格佔比 | 拖拉後 |
|--------|----------|--------|
| 主圖 210px (52.5%) | 52.5% | 主圖 273px |
| VOL 95px (23.75%) | 23.75% | VOL 124px |
| RSI 95px (23.75%) | 23.75% | RSI 123px |

**優點**：TradingView 標準行為，視覺上直觀，副圖不會不成比例縮小  
**缺點**：K 線視覺大小隨整體高度改變  
**實作**：`setChartHeightByDrag()` 依各 pane 比例計算新高度

**展開副圖時的特殊規則**（不套用等比縮放）：
- 展開副圖期間，主圖高度鎖定不變
- 展開的副圖高度 = 所有副圖 savedHeight 加總
- 收合後各副圖依 savedHeight 恢復，主圖高度不變
- 展開狀態中拖拉整體高度：等比計算時把「展開副圖」視為單一格（不分散到已隱藏的各副圖）

**全螢幕行為**：維持現有全網頁範圍，進入/退出全螢幕時以 Option 1 等比縮放調整各 pane 高度（呼叫 `chart.resize()` + 重算比例）。

---

## 四、修正方案

### Task 1：圖表總高度管理重構（解決 Bug 1 & 2）

**核心設計**：引入 `_totalContainerHeight` 作為唯一的「總高度」控制點。

**新狀態變數**：
```javascript
_totalContainerHeight: null,   // 使用者設定的總高度（含主圖+副圖+分隔線）
_defaultTotalHeight: null,     // 初始化時計算的預設總高度（不超出 viewport）
```

**初始化流程**：
1. `initChart()` 時，讀取 `chartWrapper.getBoundingClientRect().height`（CSS flex-1 決定的自然高度）作為 `_defaultTotalHeight`
2. 如果 `_totalContainerHeight` 未設定，使用 `_defaultTotalHeight`
3. **`_syncChartContainerHeight()` 重構**：
   - 設定 `chartWrapper.style.height = _totalContainerHeight`
   - 計算各格高度：`_baseMainPaneHeight = (_totalContainerHeight - sep) * ratio`
   - sep = 分隔線高度（每個 pane 間距 ~22px，N panes = (N-1)*22）
   - 各副圖高度來自 `savedHeight`，新副圖使用預設比例（30%/副圖數量）

4. **`_addSubChart()` 時（加入副圖）**：
   - 從主圖空間中「劃出」副圖高度，而非增加總高度
   - 使用者已調整過 `savedHeight` 的副圖使用其 `savedHeight`
   - 新加入的副圖從剩餘空間按比例分配

5. **`setChartHeightByDrag()` 重構**：
   - `_totalContainerHeight = nextHeight`
   - 依 Option 1：計算各格占總高的比例，等比縮放
   - **展開模式中**：只縮放主圖與展開中的副圖，不動已隱藏副圖的 savedHeight

6. **全螢幕 resize**：進入/退出全螢幕時，取得新容器尺寸後呼叫 `chart.resize()` 並以 Option 1 等比重算各 pane 高度；不改變現有全網頁全螢幕範圍。

**最低高度保護**：
```javascript
const MIN_MAIN_PANE   = 200;   // 主圖最少 200px
const MIN_SUB_PANE    = 60;    // 副圖最少 60px
const MIN_TOTAL       = 300;   // 容器最少 300px
```

---

### Task 2：RSI 移除後重置主圖 price scale（解決 Bug 3）

**修正位置**：`sub_chart_control_bar.js → onCloseClick('RSI')` 與 `_clearSubChartSeries()`

**修正方式**：移除 RSI series 後，對 pane 0 的 right/left scale 重新套用設定：

```javascript
// 在 _clearSubChartSeries() 末尾，若 RSI 被清除，重置 pane 0 scale
if (wasRSI) {
    try {
        const ps0 = this.chart.priceScale('right');  // pane 0, no index = global default
        if (ps0) ps0.applyOptions({ autoScale: true, scaleMargins: { top: 0.1, bottom: 0.2 } });
    } catch (e) {}
    // 重新套用使用者的軸設定確保雙邊正確
    if (window.ChartSettingsModal?._axisConfig) {
        this.applyAxisSettings(window.ChartSettingsModal._axisConfig);
    }
}
```

另外在 `_renderRSISubChart()` 中，RSI pane 的 priceScale 設定要明確指定 pane index，驗證是否 API 支援真正 pane 隔離，必要時改用 `autoscaleInfoProvider` 替代 `autoScale: false`：

```javascript
// 現有（可能有 cross-pane 污染）：
const ps = this.chart.priceScale('right', paneIndex);
ps.applyOptions({ autoScale: false, ... });

// 改為：只用 autoscaleInfoProvider 控制 RSI 範圍，避免觸碰 priceScale() API
// 已在 series options 中使用 autoscaleInfoProvider，刪除或改寫 priceScale 呼叫
```

---

### Task 3：RSI / VOL 顯示控制顏色與參數標籤修正（解決 Bug 4）

**修正位置**：`sub_chart_control_bar.js → _buildValueHtml()`

**RSI 顏色修正**：
```javascript
// 現有（有誤）：
style="color: ${line?.color}; opacity: ${line?.opacity/100}"

// 修正（呼叫 _withOpacity 合併alpha）：
const displayColor = window.ChartController?._withOpacity(line?.color, line?.opacity) || line?.color || '#ffffff';
style="color: ${displayColor}"
```

**RSI 標籤修正**（顯示 period-based label）：
```javascript
// 現有：
${key}: ${value}   // 硬編碼 RSI1/RSI2/RSI3

// 修正：
const period = line?.period;
const label = period != null ? `RSI${period}` : key;
${label}: ${value}
```

**VOL 顏色修正**：
```javascript
// 現有（無顏色）：
`<span class="sub-line-token ..." onclick="...">VOL1: ${value}</span>`

// 修正：
const volColor = state.VOL?.lines?.VOL1?.color || '#26a69a';
`<span class="sub-line-token ..." style="color:${volColor}" onclick="...">VOL1: ${value}</span>`
```

---

### Task 4：線條顯示/隱藏不觸發高度重算（解決 Bug 5）

**修正 A：輕量級 toggle（主要修正）**

`IndicatorTopBar.onLineClick()` 與 `SubChartControlBar.onLineClick()` 改為直接操作 series visibility，而不是全量重渲：

```javascript
// 輕量級 toggle：對 series 直接設定 visible
onLineClick(indicator, lineKey) {
    const state = window.state?.chartIndicators;
    // ... 切換 isEnabled ...

    // ⚡ 只更新受影響的 series 可見性，不觸發全量重渲
    if (indicator === 'RSI') {
        const line = state.RSI?.lines?.[lineKey];
        if (line?.series) {
            line.series.applyOptions({ visible: line.isEnabled });
        }
    } else if (indicator === 'VOL') {
        const line = state.VOL?.lines?.VOL1;
        if (line?.series) {
            line.series.applyOptions({ visible: line.isEnabled });
        }
    }

    // 更新 TopBar/ControlBar 顯示文字（不帶高度重算）
    this._refreshValueTexts();           // SubChartControlBar
    // 或 window.IndicatorTopBar.render();   // IndicatorTopBar

    // 儲存設定
    if (window.ChartSettingsModal) window.ChartSettingsModal.saveToLocalStorage();
    // ❌ 移除 window.ChartController.renderIndicatorsFromState();
}
```

**修正 B：RSI 全線關閉時不 collapse pane**

在 `_renderRSISubChart()` 加入「若所有 RSI 線 isEnabled=false，仍渲染一條 invisible series 保持 pane 存在」的保護：

```javascript
_renderRSISubChart(chartData, paneIndex) {
    // ... 渲染各 RSI 線 ...
    
    // 若所有線都 disabled，渲染一條透明占位 series，防止 pane 消失
    if (!refSeries) {
        refSeries = window.ChartRenderer.renderLine(this.chart, [], {
            color: 'transparent',
            lineWidth: 1,
            paneIndex,
            priceScaleId: 'right',
            lastValueVisible: false,
            priceLineVisible: false,
        });
        // 標記為占位，不存入 lineCfg.series
        this._rsiPlaceholderSeries = refSeries;
    }
}
```

---

### Task 5：Pane 分隔線加入 Tooltip（界面體驗）

LightweightCharts 的 pane 分隔線是 DOM 元素，渲染完成後用 JS 查詢並設定 `title` 屬性。

**修正位置**：`_updateSubChartPaneHeights()` 末尾加入：

```javascript
_attachPaneSeparatorTooltips(visibleOrder) {
    // LW pane separator 的 class 依版本不同，常見為含 'separator' 的選擇器
    const chartEl = document.getElementById('chart');
    if (!chartEl) return;

    // 延遲一 frame 確保 DOM 更新完成
    requestAnimationFrame(() => {
        const separators = chartEl.querySelectorAll('[class*="separator"], [class*="pane-separator"]');
        separators.forEach((sep, idx) => {
            const above = idx === 0 ? '主圖' : visibleOrder[idx - 1] || '副圖';
            const below = visibleOrder[idx] || '副圖';
            sep.title = `拖拉調整「${above}」與「${below}」的高度比例`;
            sep.style.cursor = 'row-resize';
        });
    });
},
```

---

### Task 6：UI 文字修正

**修正位置**：`app/feature/screening/chart/kline_viewer/templates/chart_area_ui.html`

```html
<!-- 現有 -->
選擇股票以顯示K線圖

<!-- 修正 -->
選擇股票以顯示圖表
```

---

### Task 7：展開/收合副圖圖示修正（解決 Bug 6）

**修正位置**：`sub_chart_control_bar.js → render()` 中的 SVG 圖示

**修正原則**：
- 展開圖示：四個角向外延伸的箭頭（↖↗↘↙ 各指向外方）
- 收合圖示：四個角向中心內縮的箭頭（↗↙↖↘ 各指向內方）
- 尺寸：14×14px，`stroke="currentColor"`, `stroke-width="2"`, `fill="none"`

**修正後 SVG（展開圖示）**：
```html
<!-- 四角向外展開（符合 Pasted Image 效果）-->
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <!-- 左上角向外 -->
  <polyline points="9,3 3,3 3,9"/>
  <line x1="3" y1="3" x2="10" y2="10"/>
  <!-- 右上角向外 -->
  <polyline points="15,3 21,3 21,9"/>
  <line x1="21" y1="3" x2="14" y2="10"/>
  <!-- 左下角向外 -->
  <polyline points="9,21 3,21 3,15"/>
  <line x1="3" y1="21" x2="10" y2="14"/>
  <!-- 右下角向外 -->
  <polyline points="15,21 21,21 21,15"/>
  <line x1="21" y1="21" x2="14" y2="14"/>
</svg>
```

**修正後 SVG（收合圖示）**：
```html
<!-- 四角向內收合（符合 Pasted Image2 效果）-->
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <!-- 左上角向內 -->
  <polyline points="3,10 3,3 10,3"/>
  <line x1="10" y1="3" x2="3" y2="10"/>
  <!-- 右上角向內 -->
  <polyline points="21,10 21,3 14,3"/>
  <line x1="14" y1="3" x2="21" y2="10"/>
  <!-- 左下角向內 -->
  <polyline points="3,14 3,21 10,21"/>
  <line x1="10" y1="21" x2="3" y2="14"/>
  <!-- 右下角向內 -->
  <polyline points="21,14 21,21 14,21"/>
  <line x1="14" y1="21" x2="21" y2="14"/>
</svg>
```

> ⚠️ **確認要點**：實作時需實際對照 Pasted Image（展開）和 Pasted Image2（收合）的圖示外觀，確認 SVG path 方向正確。若上述 path 與圖示不符，需依圖示調整。

---

## 五、風險分析

| 風險 | 等級 | 觸發條件 | 應對方式 |
|------|------|----------|----------|
| LightweightCharts `priceScale(id, paneIndex)` API 在當前版本不支援 pane 隔離 | 高 | Bug 3 用 priceScale API 修正後仍不隔離 | 改用 `autoscaleInfoProvider` 完全替代 priceScale options |
| `_totalContainerHeight` 初始化讀到 0（chart 未掛載到 DOM） | 中 | `initChart()` 在 DOM ready 前被呼叫 | 加入 fallback 值（如 450px）或 defer 讀取 |
| 輕量級 toggle 後 CrosshairMove 事件的 `seriesData` 包含 hidden series 資料 | 低 | LW 是否在 `seriesData` 中返回 visible=false 的 series 資料 | 讀取到值時直接更新；hidden series 不需顯示值時用 `--` |
| pane height 設為 0 占位 series 後 LW pane 仍自動 collapse | 中 | 某些 LW 版本不支援 invisible placeholder series | 改為 lineWidth:0 + autoscaleInfoProvider 先撐住高度 |
| Task 1 高度重構破壞展開（expand）副圖功能 | 高 | `expandedSubChart` 模式與新 `_totalContainerHeight` 計算衝突 | 展開模式時主圖高度鎖定，只調整展開副圖的高度，不套用等比公式 |
| Task 7 SVG path 方向與圖示不符 | 低 | 實際圖示效果與設計不一致 | 實作後以視覺驗證對照原始圖示圖片，逐點調校 path |

---

## 六、實作順序建議

| 優先 | Task | 預估影響 |
|------|------|----------|
| P0 | Task 1：高度管理重構（Bug 1 & 2） | 最核心，影響最大，其他 bug 修完後可能還需微調 |
| P0 | Task 4：線條 toggle 輕量化（Bug 5） | 與 Task 1 獨立，可並行 |
| P1 | Task 2：RSI pane scale 重置（Bug 3） | 依賴 Task 1 完成後驗證 |
| P1 | Task 3：顯示控制顏色/標籤（Bug 4） | 純 UI，低風險，可優先完成 |
| P1 | Task 7：展開/收合圖示修正（Bug 6） | 純 UI，SVG 替換，低風險 |
| P2 | Task 5：Pane 分隔線 Tooltip | 界面細節，最低風險 |
| P2 | Task 6：UI 文字修正 | 最簡單 |

---

## 七、手動驗證項目（無法自動化）

1. **高度不增加驗證**：開啟 VOL 副圖，確認右側無 scrollbar 且圖表高度未改變
2. **高度拖拉比例**：開啟 VOL+RSI，拖拉底部 handle 移動 50px，確認三格皆等比擴大（Option 1）
3. **Pane 分隔線拖拉**：拖拉主圖/VOL 間的分隔線，確認有 Tooltip 提示且 resize 正常
4. **RSI 移除後軸一致性**：雙邊座標下開啟 RSI 再關閉，確認主圖左右軸刻度一致
5. **RSI 全線關閉外觀**：關閉 RSI1+RSI2+RSI3（線條 token），確認 RSI pane 保留（空白），控制列不移到主圖，整體高度不變
6. **顏色反映**：在圖表管理將 RSI1 改為橘色，確認 RSI 控制列顯示橘色
7. **Period 標籤**：將 RSI1 period 改為 6，確認控制列顯示 `RSI6:` 而非 `RSI1:`
8. **切換股票高度穩定**：開啟 VOL，點擊多支股票切換，確認每次切換後圖表高度不改變
9. **全頁 F5 重新整理**：重新整理後圖表高度設定應從 localStorage 還原（或回到預設）
10. **展開副圖圖示**：開啟 VOL+RSI 後，確認控制列右側展開圖示為四角向外箭頭（符合 Pasted Image）
11. **收合副圖圖示**：點擊展開後，確認控制列右側收合圖示為四角向內箭頭（符合 Pasted Image2）
12. **展開高度行為**：展開 VOL，確認主圖高度不變，VOL 佔據所有副圖合計高度，RSI 不顯示，整體容器高度不變
13. **收合高度行為**：收合 VOL，確認主圖、VOL、RSI 恢復展開前各自的高度，整體容器高度不變
14. **展開後拖拉整體高度**：展開 VOL 後拖拉底部 handle，確認整體高度改變但主圖不動，只有展開的 VOL 等比縮放
15. **全螢幕比例**：進入全螢幕後，確認主圖與副圖各自等比縮放，整體顯示正常

---

## 八、補充說明

### 為何不直接用 CSS `flex` 做高度分配

LightweightCharts 使用 canvas 渲染，pane 高度需要透過 `pane.setHeight()` API 控制，CSS flex 只控制外層容器，無法直接影響 LW 內部 pane 佈局。

### 關於 `_defaultSubPaneHeight: 180`

目前副圖預設 180px，但在容器高度 400px 的情況下，1 個副圖就佔 45%（主圖只有 55%）。建議改為按比例計算：
- 1 個副圖：副圖佔 `(totalHeight - sep) * 0.28`，主圖佔 0.72
- 2 個副圖：每個副圖佔 `(totalHeight - sep) * 0.18`，主圖佔 0.64

### 關於 `chart-container { overflow: visible }` CSS

目前 CSS 設定 `overflow: visible`，意味著圖表可以「溢出」父容器而不顯示 scrollbar（內容溢出到下方）。需要確認溢出後是否觸發頁面 scroll（視父容器的 `overflow` 設定而定）。

---

---

## 九、第二輪實作發現的新 Bug（2026-04-07 回測）

### Bug N1：「收合此副圖」圖示方向錯誤

#### 現象
收合圖示（`⤡`）視覺與展開圖示（`⤢`）過於相似，均為「箭頭指向角落」外向型態；兩者差異僅在於箭頭在不同對角，難以辨別。

#### 根本原因
收合圖示 SVG：
- 展開：corner polyline at (21,3) + (3,21)，箭頭 tip 在角落（外向） ✓
- 收合：corner polyline at (3,3) + (21,21)，箭頭 tip 在角落（外向） ❌應為「tip 指向中央」的內向型態

#### 修正方式
改用 **Feather `minimize-2`** 圖示風格：arrowhead（L 形折角）在 **內側中央方向**，shaft（線條）向外延伸至角落。
```svg
<!-- 收合圖示（Feather minimize-2 風格）-->
<polyline points="4 14 10 14 10 20"></polyline>
<polyline points="20 10 14 10 14 4"></polyline>
<line x1="10" y1="14" x2="3" y2="21"></line>
<line x1="21" y1="3" x2="14" y2="10"></line>
```
視覺：箭頭從左下↗ / 右上↙ 兩個方向指向中央，清楚表示「收縮」。

---

### Bug N2：篩選前（無股票時）有副圖設定，圖表佔位區域縮小

#### 現象
- 未選擇股票前（顯示「選擇股票以顯示圖表」佔位元素），若 localStorage 已設定 VOL/RSI 開啟，整體圖表佔位高度比未開副圖時更小（約縮小 100-150px）

#### 根本原因
當 `chart-container--with-subcharts` 類別被設定（因某路徑在無資料時觸發 `_syncChartContainerHeight`），CSS `flex: 0 0 auto` 使 chart-container 失去 flex-1 撐開行為，chartWrapper 退回 `min-h-[300px]` 自然高度。

#### 修正方式
防禦性保護：
1. `_syncChartContainerHeight`：若 `currentChartData` 為空，強制移除 `chart-container--with-subcharts` 類別並提早返回
2. `_setChartWrapperHeight`：若 `currentChartData` 為空，跳過 inline height 設定

---

### Bug N3（新發現）：雙邊座標模式下十字線左右 Y 軸顯示值不一致

#### 現象
開啟「雙邊座標」時，移動十字線，左右 Y 軸顯示的價格值不同（例如左軸顯示 24.50，右軸顯示 24.37）。此問題**不論是否開啟副圖均發生**。

#### 根本原因
`_ensureMirrorSeries` 建立左軸的 mirror 線段 series，使用 `value = close`。LightweightCharts 對左軸（line series）的自動縮放範圍為 `[min(close), max(close)]`，對右軸（candlestick series）則為 `[min(low), max(high)]`（含 wick range）。兩個自動縮放範圍不同，導致相同 Y 畫素位置對應不同價格。

#### 修正方式
在 `_ensureMirrorSeries` 建立/更新後，用 `autoscaleInfoProvider` 讓 mirror series 回報相同 OHLC 範圍（`minValue = min(low)`, `maxValue = max(high)`），強制左軸與右軸使用相同的數據範圍，確保十字線 Y 位置對應相同價格。

```javascript
const minValue = data.reduce((m, b) => Math.min(m, b.low), Infinity);
const maxValue = data.reduce((m, b) => Math.max(m, b.high), -Infinity);
this._mirrorSeries.applyOptions({
    autoscaleInfoProvider: () => ({
        priceRange: { minValue, maxValue },
    }),
});
```

---

### Bug N4：新增副圖時高度壓縮邏輯不符計畫書情境 B

#### 現象
VOL 已開啟的情況下，新增 RSI 副圖，預期主圖 + VOL 同時縮小（等比調整），實際只有 VOL 縮小，主圖高度不變。

#### 根本原因
`_updateSubChartPaneHeights` 的主圖高度計算：
```javascript
let mainHeight = max(minMain, min(_baseMainPaneHeight, maxMain));
```
當副圖數從 1 增加到 2 時，`_baseMainPaneHeight` 仍為 1 個副圖時計算的值（例如 270px），而 `maxMain = availableHeight - 2*minSub` 通常 > 270，所以主圖保持 270，不縮小。

#### 修正方式
追蹤 `_lastSubCount`。當 `subCount > _lastSubCount`（副圖數增加），清除 `_baseMainPaneHeight`，讓其依 `_getDefaultMainPaneRatio(subCount)` 重算：
- 1 sub → 2 subs：main 從 ~72% → ~64%
- 2 subs → 3 subs：main 從 ~64% → ~58%

---

### Bug N5：拖拉整體高度時，ResizeObserver 覆蓋 pane 設定，導致 sub-charts 高度不变

#### 現象
拖拉底部 handle 調整整體圖表高度時，副圖高度不等比縮放，extra space 全部被主圖吸收。

#### 根本原因
1. `setChartHeightByDrag` → `_setChartWrapperHeight` → `chart.resize(w, h)`
2. `chart.resize()` 之後，LightweightCharts 內部在下一個 `requestAnimationFrame` 重新分配 pane 高度（把 delta 全分給主圖）
3. 我們 `pane.setHeight()` 呼叫在 LW 內部 rAF 之前運行 → 被覆蓋

#### 修正方式
在 `ResizeObserver` 回呼中，呼叫 `chart.resize()` 後，**立即重新套用**儲存的 pane 高度：
```javascript
// ResizeObserver 中 chart.resize() 後加入：
if (this._totalContainerHeight !== null) {
    const enabled = this._getEnabledSubChartOrder();
    if (enabled.length > 0) {
        const expanded = window.state?.expandedSubChart;
        const visible = (expanded && enabled.includes(expanded)) ? [expanded] : enabled;
        this._updateSubChartPaneHeights(enabled.length, visible, enabled);
    }
}
```

---

### Bug 8（全螢幕版面）：點擊全螢幕後主副圖全部擠在頂部

#### 現象
點擊全螢幕按鈕後，圖表容器確實放大至全螢幕（`100vh`），但主圖、VOL 副圖、RSI 副圖全部擠在容器頂部，其餘空間空白。比例消失，不符合「等比分配全螢幕高度」的預期行為。

#### 根本原因
1. `syncSubChartLayout()` 在全螢幕後被呼叫
2. 其內部呼叫 `_syncChartContainerHeight` → `_setChartWrapperHeight(targetHeight)`
3. `_setChartWrapperHeight` 設定 `chartWrapper.style.height = '420px'`（舊的 `_totalContainerHeight` 值）
4. 這個 inline `style.height` **覆蓋了** CSS 的 `.chart-container.chart-viewport-fullscreen .chart-wrapper { flex: 1 1 auto; }`
5. chartWrapper 只有 420px 而非填滿整個全螢幕容器
6. `chart.resize(width, 420)` 把整個圖表壓縮到頂部 420px

#### 預期行為
```
【全螢幕進入後】

┌────────────────────────────────────────┐ height: 100vh (例如 900px)
│  chartSymbol / chartName / controls   │ ~52px (chart-header)
├────────────────────────────────────────┤
│     主圖 (K線)                         │ ~(900-52) * 64% ≈ 545px
├────────────────────────────────────────┤
│     副圖 (VOL)                         │ ~(900-52) * 18% ≈ 153px
├────────────────────────────────────────┤
│     副圖 (RSI)                         │ ~(900-52) * 18% ≈ 150px
└────────────────────────────────────────┘
  ✅ 等比縮放填滿全螢幕，主副圖比例與進入前相同
```

#### 修正方式
分兩處修改：

**A. `_setChartWrapperHeight`（chart_controller.js）**：
進入全螢幕模式時，跳過 inline `style.height` 設定，讓 CSS `flex` 控制高度；只作 `chart.resize(width, actualHeight)` 更新 LW 內部尺寸。

```javascript
_setChartWrapperHeight(targetHeight) {
    const chartContainer = document.getElementById('chartContainer');
    const isFullscreen = chartContainer?.classList.contains('chart-viewport-fullscreen');
    if (isFullscreen) {
        // 全螢幕模式：不設 inline height，讓 CSS flex:1 決定高度
        return;
    }
    // ... 原本邏輯（設 inline height）
}
```

**B. `resizeChart`（screening.js `initFullscreen` 內部）**：
進入全螢幕時，先清除 chartWrapper 的 inline `height`/`min-height`，等 CSS 重排後讀取實際高度，再計算 pane 高度。

```javascript
const resizeChart = () => {
    if (!window.ChartController?.chart) return;
    setTimeout(() => {
        const el = document.getElementById('chartWrapper');
        const isFull = container.classList.contains('chart-viewport-fullscreen');
        if (isFull && el) {
            el.style.removeProperty('height');
            el.style.removeProperty('min-height');
        }
        if (el) {
            const h = el.clientHeight || el.offsetHeight;
            window.ChartController.chart.resize(el.clientWidth, h);
            if (isFull && h > 0) {
                window.ChartController._totalContainerHeight = h;
                window.ChartController._manualChartHeight = null; // 全螢幕下解除手動鎖定
            }
        }
        if (window.SubChartControlBar) window.SubChartControlBar.updateLayout();
        if (window.ChartController?.syncSubChartLayout) {
            window.ChartController.syncSubChartLayout();
        }
    }, 80);
};
```

退出全螢幕時，`_setChartWrapperHeight` 重新設回 `_totalContainerHeight`（恢復退出前的手動高度）。

---

*第二輪更新：2026-04-07 第二輪測試修正版*

---

## 十、第三輪：確定性高度行為規格與 Bug 修正（2026-04-08）

### 核心行為規格（權威定義，取代先前 Option 1 等比縮放假設）

使用者於 2026-04-08 確認以下 **五條核心規則** 為圖表高度管理的唯一權威規格：

> 1. **整體圖表容器一定處於填滿狀態**：無副圖時主圖填滿容器；有副圖時主圖＋副圖合計填滿容器。
> 2. **整體圖表容器放大縮小後**，主副圖會依放大縮小前的佔比進行縮放（等比縮放）。
> 3. **新增副圖的空間源自主圖的壓縮**（固定高度副圖），不從其他副圖借空間。新增的每個副圖高度一致（`_defaultSubPaneHeight = 120px`）。移除副圖時，歸還空間給主圖。
> 4. **拖拉主圖與副圖的分隔線、副圖與副圖的分隔線**會改變各 pane 的佔比，此佔比在後續容器放大縮小時被保留。
> 5. **頁面重新整理時**，整體容器高度為整體容器最小高度（`_minTotalChartHeight = 300px`）。
> 6. **整體圖表容器放的大小僅能透過「拖拉調整圖表整體高度」來調整**，內部主圖、副圖不能任意撐開整體圖表容器的高度。

---

### 常數速查表

| 常數名稱                  | 值      | 說明                                                     |
|---------------------------|---------|----------------------------------------------------------|
| `_paneHeightOverhead`     | 52 px   | 每個副圖有一條工具列（⚙ ✕ 指標名稱），高度固定佔用 52px |
| `_defaultSubPaneHeight`   | 120 px  | 新增副圖時的預設高度（含 overhead）                       |
| `_minMainPaneHeight`      | 60 px   | 主圖 pane 最小高度（與副圖相同）                           |
| `_minSubPaneHeight`       | 60 px   | 副圖 pane 最小高度（含 overhead）                         |
| `_minTotalChartHeight`    | 300 px  | 整體容器最小高度                                          |

> **可用高度（availableHeight）** = totalContainerHeight − Σ(副圖 savedHeight)
> 主圖高度 = availableHeight（填滿剩餘空間）

---

### 情境示意圖

> **圖例說明**
> ```
> ┌────────────────────────────┐   ← container 頂端
> │  標頭 / 工具列             │   52px overhead（每個副圖各有一條）
> ├────────────────────────────┤
> │  圖表繪圖區                │   pane 高度
> ╠════════ ↕ 可拖拉分隔線 ════╣   LightweightCharts pane separator
> │  副圖繪圖區                │
> └────────────────────────────┘   ← container 底端
> ≡≡≡≡≡≡≡≡≡ 底部拖拉 handle ≡≡≡   改變 totalContainerHeight
> ```

---

#### 情境 A　初始狀態（無副圖，僅主圖）

```
 totalContainerHeight = 420px
 ┌──────────────────────────────────────────┐ ─┐
 │  K 線圖表                                │  │ mainPaneHeight = 420px
 │  （無 overhead，主圖無工具列）            │  │  = totalContainerHeight
 │                                          │  │
 │                                          │  │
 │                                          │  │
 │                                          │  │
 └──────────────────────────────────────────┘ ─┘
 ≡≡≡≡≡≡≡≡≡≡≡≡≡≡ 底部拖拉 handle ≡≡≡≡≡≡≡≡≡≡≡
```

---

#### 情境 B　新增副圖（空間從主圖壓縮）

**B-1：新增第一個副圖（VOL）**

```
 【新增前】                              【新增後】
 total = 420px                           total = 420px（容器不變）

 ┌──────────────────────────┐ ─┐         ┌──────────────────────────┐ ─┐
 │  主圖 K線                │  │         │  主圖 K線                │  │
 │                          │  │         │                          │  │
 │   mainPaneHeight=420px   │  │         │   mainPaneHeight=300px   │  │
 │                          │  │         │     (420 − 120 = 300)    │  │
 │                          │  │  →      │                          │  │
 │                          │  │         │                          │ ─┘
 │                          │  │         ╠══════ ↕ 分隔線 ══════════╣
 │                          │  │         │ ⚙ ✕  VOL                 │ ─┐ 52px overhead
 └──────────────────────────┘ ─┘         ├──────────────────────────┤  │
 ≡≡≡≡≡≡≡≡≡≡ 底部 handle ≡≡≡≡≡           │  VOL 柱狀圖              │  │ savedHeight=120px
                                          │                          │ ─┘ (120-52=68px 繪圖)
                                          └──────────────────────────┘
                                          ≡≡≡≡≡≡≡≡ 底部 handle ≡≡≡≡
```

**B-2：再新增第二個副圖（RSI），空間繼續壓主圖**

```
 【+VOL 後】                             【+RSI 後】
 total = 420px                           total = 420px

 ┌──────────────────────────┐ ─┐         ┌──────────────────────────┐ ─┐
 │  主圖 K線                │  │         │  主圖 K線                │  │
 │   mainPaneHeight=300px   │  │         │   mainPaneHeight=180px   │  │
 │                          │  │  →      │    (420-120-120=180)     │  │
 │                          │ ─┘         │                          │ ─┘
 ╠══════ ↕ 分隔線 ══════════╣            ╠══════ ↕ 分隔線 ══════════╣
 │ ⚙ ✕  VOL    savedH=120  │            │ ⚙ ✕  VOL    savedH=120  │ 52px
 ├──────────────────────────┤            ├──────────────────────────┤
 │  VOL 繪圖                │            │  VOL 繪圖                │
 └──────────────────────────┘            ╠══════ ↕ 分隔線 ══════════╣
 ≡≡≡≡ 底部 handle ≡≡≡≡≡≡               │ ⚙ ✕  RSI    savedH=120  │ 52px
                                          ├──────────────────────────┤
                                          │  RSI 折線                │
                                          └──────────────────────────┘
                                          ≡≡≡≡ 底部 handle ≡≡≡≡≡≡
```

**B-3：邊界情況——主圖壓縮後低於 `_minMainPaneHeight`（60px）**

> 當新增副圖後主圖高度將嚴格低於 60px，**不自動擴展容器**，改為強制關閉最先開啟的副圖
> （等同點擊 ✕ 或圖表管理取消勾選），釋出其 savedHeight 給主圖後，再嘗試新增。

```
 【觸發條件】
 total=300px（最小容器），已有 VOL(120) + RSI(120)，main = 60px（恰好最小值）
 嘗試新增第三個副圖 MACD（120px）：
   new_main = 60 − 120 = −60px < 60px  → ⚠ 觸發強制關閉

 Step 1：強制關閉「最先開啟」的副圖 = VOL（savedH=120）
         main = 60 + 120 = 180px（VOL 釋出空間）

 Step 2：再次嘗試新增 MACD：
         new_main = 180 − 120 = 60px ≥ 60px  → ✅ 可以新增

 ┌──────────────────────────┐ ─┐      容器維持 300px（不擴展！）
 │  主圖   mainH = 60px     │ ─┘      VOL 已被強制關閉
 ╠══════ ↕ 分隔線 ══════════╣         等同使用者點擊 VOL 的 ✕，
 │ ⚙ ✕  RSI    savedH=120  │         或在圖表管理取消勾選 VOL
 ├──────────────────────────┤
 │  RSI 繪圖                │
 ╠══════ ↕ 分隔線 ══════════╣
 │ ⚙ ✕  MACD   savedH=120  │ ← 成功新增
 ├──────────────────────────┤
 │  MACD 繪圖               │
 └──────────────────────────┘
 ≡≡≡≡ 底部 handle（容器未擴展）≡≡≡≡
```

> **注意**：
> - 若強制關閉一個副圖後主圖仍 < 60px，繼續關閉下一個最先開啟的副圖（cascade）
> - UI 同步：強制關閉結果與手動關閉完全等效，圖表管理中的對應項目同步取消勾選

---

#### 情境 C　移除副圖（空間歸還給主圖）

**移除 RSI（最後一個副圖）**

```
 【移除前】                              【移除後】
 total = 420px                           total = 420px

 ┌──────────────────────┐ ─┐             ┌──────────────────────┐ ─┐
 │  主圖   mainH=180px  │ ─┘             │  主圖   mainH=300px  │  │
 ╠══════ ↕ 分隔線 ══════╣   →            │  (180 + 120 = 300)   │  │
 │ ⚙ ✕  VOL  sH=120   │               │                      │ ─┘
 ├──────────────────────┤               ╠══════ ↕ 分隔線 ══════╣
 │  VOL 繪圖            │               │ ⚙ ✕  VOL  sH=120   │
 ╠══════ ↕ 分隔線 ══════╣               ├──────────────────────┤
 │ ⚙ ✕  RSI  sH=120   │               │  VOL 繪圖            │
 ├──────────────────────┤               └──────────────────────┘
 │  RSI 繪圖            │               ≡≡≡≡ 底部 handle ≡≡≡≡
 └──────────────────────┘
 ≡≡≡≡ 底部 handle ≡≡≡≡
                                         RSI 的 120px 完整回到主圖 ↑
```

---

#### 情境 D　拖拉底部 handle（容器整體縮放，等比縮放各 pane）

**公式**

```
 ratio_main  = mainPaneHeight_old / totalContainerHeight_old
 ratio_sub[i] = subPaneHeight_old[i] / totalContainerHeight_old

 mainPaneHeight_new   = totalContainerHeight_new × ratio_main
 subPaneHeight_new[i] = totalContainerHeight_new × ratio_sub[i]
```

**D-1：僅主圖（total 420 → 600px）**

```
 ┌──────────────────────┐ ─┐             ┌──────────────────────┐ ─┐
 │  主圖   420px        │  │  拖拉 +180  │  主圖   600px        │  │
 │                      │  │ ──────────→ │  (420/420×600=600)   │  │
 │                      │  │             │                      │  │
 └──────────────────────┘ ─┘             └──────────────────────┘ ─┘
 ≡≡ handle ≡≡                            ≡≡ handle ≡≡
```

**D-2：主圖＋VOL＋RSI（total 420 → 600px，等比縮放）**

```
 【縮放前】  420px total                 【縮放後】  600px total
 ratio_main = 180/420 ≈ 42.9%           main_new = 600 × 0.429 ≈ 257px
 ratio_VOL  = 120/420 ≈ 28.6%           VOL_new  = 600 × 0.286 ≈ 171px
 ratio_RSI  = 120/420 ≈ 28.6%           RSI_new  = 600 × 0.286 ≈ 171px

 ┌──────────────────────┐ ─┐             ┌──────────────────────┐ ─┐
 │  主圖   180px        │  │             │  主圖   257px        │  │
 │                      │ ─┘             │                      │  │
 ╠══════ ↕ 分隔線 ══════╣               │                      │ ─┘
 │ ⚙ ✕  VOL  120px    │   →            ╠══════ ↕ 分隔線 ══════╣
 ├──────────────────────┤               │ ⚙ ✕  VOL  171px    │
 │  VOL 繪圖            │               ├──────────────────────┤
 ╠══════ ↕ 分隔線 ══════╣               │  VOL 繪圖            │
 │ ⚙ ✕  RSI  120px    │               ╠══════ ↕ 分隔線 ══════╣
 ├──────────────────────┤               │ ⚙ ✕  RSI  171px    │
 │  RSI 繪圖            │               ├──────────────────────┤
 └──────────────────────┘               │  RSI 繪圖            │
 ≡≡ handle ≡≡                           └──────────────────────┘
                                         ≡≡ handle ≡≡
```

---

#### 情境 E　拖拉主圖↔副圖分隔線（改變 savedHeight，保留佔比）

**E-1：只有 VOL 一個副圖，往上拖分隔線 30px**

```
 【拖拉前】  total = 420px               【拖拉後】  total = 420px（不變）

 ┌──────────────────────┐ ─┐             ┌──────────────────────┐ ─┐
 │  主圖   300px        │  │             │  主圖   270px        │  │
 │                      │ ─┘             │  (300 − 30 = 270)    │ ─┘
 ╠══════ ↕ ─分隔線─ ════╣  ← 往上拖30px ╠══════ ↕ ─分隔線─ ════╣
 │ ⚙ ✕  VOL            │               │ ⚙ ✕  VOL            │
 ├──────────────────────┤               ├──────────────────────┤
 │  VOL  savedH=120px  │               │  VOL  savedH=150px  │
 └──────────────────────┘               │  (120 + 30 = 150)    │
 ≡≡ handle ≡≡                           └──────────────────────┘
                                         ≡≡ handle ≡≡

 savedHeight[VOL] 更新為 150px，後續 D/B/C 以此為基準
```

**E-2：有 VOL + RSI，往上拖主圖↔VOL 分隔線 30px（RSI 不受影響）**

```
 【拖拉前】  total=420  main=180  VOL=120  RSI=120
 【拖拉後】  total=420  main=150  VOL=150  RSI=120（RSI savedH 不變）

 ┌──────────────────────┐ ─┐             ┌──────────────────────┐ ─┐
 │  主圖   180px        │ ─┘             │  主圖   150px        │ ─┘
 ╠══════ ↕ ─分隔線─ ════╣  ← 往上拖30  ╠══════ ↕ ─分隔線 ════╣
 │ ⚙ ✕  VOL  sH=120   │               │ ⚙ ✕  VOL  sH=150   │
 ├──────────────────────┤               ├──────────────────────┤
 │  VOL 繪圖            │               │  VOL 繪圖            │
 ╠══════ ↕  RSI分隔線 ══╣               ╠══════ ↕  RSI分隔線 ══╣ ← 位置下移
 │ ⚙ ✕  RSI  sH=120   │               │ ⚙ ✕  RSI  sH=120   │ （savedH 不變）
 ├──────────────────────┤               ├──────────────────────┤
 │  RSI 繪圖            │               │  RSI 繪圖            │
 └──────────────────────┘               └──────────────────────┘
```

**E+B：分隔線拖后新增副圖（新副圖固定 120px，主圖再壓縮）**

```
 【E-1 結果】                            【再加 RSI】
 total=420  main=270  VOL sH=150         total=420  main=150  VOL sH=150  RSI sH=120

 ┌──────────────────────┐ ─┐             ┌──────────────────────┐ ─┐
 │  主圖   270px        │ ─┘             │  主圖   150px        │ ─┘
 ╠═════ VOL 分隔線 ══════╣   →            │  (270 − 120 = 150)   │
 │ ⚙ ✕  VOL  sH=150   │               ╠═════ VOL 分隔線 ══════╣
 ├──────────────────────┤               │ ⚙ ✕  VOL  sH=150   │
 │  VOL 繪圖            │               ├──────────────────────┤
 └──────────────────────┘               │  VOL 繪圖            │
 ≡≡ handle ≡≡                           ╠═════ RSI 分隔線 ══════╣
                                         │ ⚙ ✕  RSI  sH=120   │ ← 固定新增高度
                                         ├──────────────────────┤
                                         │  RSI 繪圖            │
                                         └──────────────────────┘
                                         ≡≡ handle ≡≡
```

**E+D：分隔線拖后再拖容器（等比縮放）**

```
 【E-1 結果】  total=420  main=270  VOL sH=150
 ratio_main = 270/420 ≈ 64.3%
 ratio_VOL  = 150/420 ≈ 35.7%

 拖容器到 total=600px：
 main_new = 600 × 0.643 ≈ 386px
 VOL_new  = 600 × 0.357 ≈ 214px

 ┌──────────────────────┐ ─┐             ┌──────────────────────┐ ─┐
 │  主圖   270px        │ ─┘             │  主圖   386px        │  │
 ╠═════ VOL 分隔線 ══════╣  拖 +180px    │                      │ ─┘
 │ ⚙ ✕  VOL  sH=150   │ ──────────→   ╠═════ VOL 分隔線 ══════╣
 ├──────────────────────┤               │ ⚙ ✕  VOL  sH=214   │ ← savedH 更新
 │  VOL 繪圖            │               ├──────────────────────┤
 └──────────────────────┘               │  VOL 繪圖            │
 ≡≡ handle ≡≡                           └──────────────────────┘
                                         ≡≡ handle ≡≡
```

**E + 展開/收合副圖**

```
 展開 VOL（expanded = true）：
   VOL 佔所有副圖總高度，其他副圖隱藏，主圖高度固定不變

 【一般狀態】                            【VOL 展開狀態】
 total=420  main=180  VOL=120  RSI=120   total=420  main=180  VOL=240（120+120）

 ┌──────────────────────┐               ┌──────────────────────┐
 │  主圖   180px        │               │  主圖   180px        │ ← 不變
 ╠═════ VOL 分隔線 ══════╣               ╠═════ VOL 分隔線 ══════╣
 │ ⚙ ✕  VOL  120px    │   →            │ ⚙ ✕  VOL  240px    │ ← 吸收 RSI 空間
 ├──────────────────────┤               ├──────────────────────┤
 │  VOL 繪圖            │               │  VOL 繪圖（放大）     │
 ╠═════ RSI 分隔線 ══════╣               │                      │
 │ ⚙ ✕  RSI  120px    │               │                      │
 ├──────────────────────┤               └──────────────────────┘
 │  RSI 繪圖            │               （RSI 隱藏）
 └──────────────────────┘
```

---

#### 情境 F　拖拉副圖↔副圖分隔線

**F-1：拖拉 VOL↔RSI 分隔線，往下 30px**

```
 【拖拉前】  total=420  main=180  VOL=120  RSI=120
 【拖拉後】  total=420  main=180  VOL=150  RSI=90
              主圖高度不變！只有兩個副圖互換空間

 ┌──────────────────────┐ ─┐             ┌──────────────────────┐ ─┐
 │  主圖   180px        │  │             │  主圖   180px        │  │ ← 不受影響
 │                      │ ─┘             │                      │ ─┘
 ╠═════ VOL 分隔線 ══════╣               ╠═════ VOL 分隔線 ══════╣
 │ ⚙ ✕  VOL  sH=120   │               │ ⚙ ✕  VOL  sH=150   │ ← +30px
 ├──────────────────────┤               ├──────────────────────┤
 │  VOL 繪圖            │               │  VOL 繪圖            │
 ╠═════ RSI 分隔線 ══════╣  ← 往下拖30  ╠═════ RSI 分隔線 ══════╣
 │ ⚙ ✕  RSI  sH=120   │               │ ⚙ ✕  RSI  sH=90    │ ← −30px
 ├──────────────────────┤               ├──────────────────────┤
 │  RSI 繪圖            │               │  RSI 繪圖（較矮）     │
 └──────────────────────┘               └──────────────────────┘
```

**F+B：副圖分隔線拖後再新增副圖**

> 與 B-3 相同規則：main **嚴格低於** 60px 才觸發強制關閉，**不自動擴展容器**。

**F+B 情況一：主圖恰好觸底，無需強制關閉（total=420 原始 F-1 狀態）**

```
 【F-1 結果】  total=420  main=180  VOL=150  RSI=90
 新增 MACD（120px）：new_main = 180 − 120 = 60px = 恰好最小值 ✅
 main = 60px ≥ 60px，無需強制關閉，直接新增。

 ┌──────────────────────┐ ─┐      容器維持 420px
 │  主圖   60px         │ ─┘
 ╠═════ VOL 分隔線 ══════╣
 │ ⚙ ✕  VOL  sH=150   │
 ├──────────────────────┤
 ╠═════ RSI 分隔線 ══════╣
 │ ⚙ ✕  RSI  sH=90    │
 ├──────────────────────┤
 ╠═════ MACD 分隔線 ═════╣
 │ ⚙ ✕  MACD sH=120   │ ← 新增固定高度，主圖剛好 60px
 ├──────────────────────┤
 └──────────────────────┘
 ≡≡ handle（容器未擴展）≡≡
```

**F+B 情況二：副圖大幅拖拉後，主圖超出最小值限制→觸發強制關閉**

```
 【前提】在 F-1 後使用者繼續拖拉：VOL=200、RSI=60（最小值）
 total=420  main=420−200−60=160  VOL=200  RSI=60

 新增 MACD（120px）：new_main = 160 − 120 = 40px < 60px → ⚠ 強制關閉

 Step 1：強制關閉「最先開啟」的副圖 = VOL（savedH=200）
         main = 160 + 200 = 360px
 Step 2：再次嘗試新增 MACD：
         new_main = 360 − 120 = 240px ≥ 60px  → ✅ 可以新增

 【關閉前】                              【關閉 VOL + 新增 MACD 後】
 total=420  main=160  VOL=200  RSI=60    total=420  main=240  RSI=60  MACD=120

 ┌──────────────────────┐ ─┐             ┌──────────────────────┐ ─┐
 │  主圖   160px        │ ─┘             │  主圖   240px        │  │
 ╠═════ VOL 分隔線 ══════╣               │                      │ ─┘
 │ ⚙ ✕  VOL  sH=200   │  → 強制關閉    ╠═════ RSI 分隔線 ══════╣
 ├──────────────────────┤     新增 MACD  │ ⚙ ✕  RSI  sH=60    │ ← 保留
 │  VOL 繪圖            │               ├──────────────────────┤
 ╠═════ RSI 分隔線 ══════╣               │  RSI 繪圖            │
 │ ⚙ ✕  RSI  sH=60    │               ╠═════ MACD 分隔線 ═════╣
 ├──────────────────────┤               │ ⚙ ✕  MACD sH=120   │ ← 新增
 └──────────────────────┘               ├──────────────────────┤
 ≡≡ handle ≡≡                           └──────────────────────┘
                                         ≡≡ handle（容器未擴展）≡≡
```

**F+D：副圖分隔線拖後再拖容器（等比縮放）**

```
 【F-1 結果】  total=420  main=180  VOL=150  RSI=90
 ratio_main = 180/420 ≈ 42.9%
 ratio_VOL  = 150/420 ≈ 35.7%
 ratio_RSI  =  90/420 ≈ 21.4%

 拖容器到 total=600px：
 main_new ≈ 257px  VOL_new ≈ 214px  RSI_new ≈ 129px（各自 savedH 更新）
```

---

#### 情境 G　全螢幕進入 / 退出（Bug R3-2）

```
 【全螢幕前】                            【全螢幕中】
 total = 420px（_preFullscreenHeight 記錄此值）

 ┌──────────────────────┐ ─┐             ┌──────────────────────────────┐ ─┐
 │  主圖   300px        │  │             │  主圖（填滿整個螢幕高度）      │  │
 │                      │ ─┘  ─────→    │                              │  │
 ╠═════ VOL 分隔線 ══════╣   全螢幕進入   │  screen height ≈ 900px       │  │
 │ ⚙ ✕  VOL  sH=120   │               │                              │ ─┘
 ├──────────────────────┤               ╠═════ VOL 分隔線 ══════════════╣
 │  VOL 繪圖            │               │ ⚙ ✕  VOL（按比例放大）       │
 └──────────────────────┘               └──────────────────────────────┘
 ≡≡ handle ≡≡

 ___________________________________________________________________

 【全螢幕退出（❌ Bug：沒有還原）】      【全螢幕退出（✅ 正確還原）】
 total 變為 _minTotalChartHeight=300px    total 還原為 420px
 或瀏覽器預設值（高度不一）              （使用 _preFullscreenHeight 還原）

 ┌──────────────────────┐ ─┐             ┌──────────────────────┐ ─┐
 │  主圖   180px        │  │             │  主圖   300px        │  │
 │  （被壓縮！）         │ ─┘             │  （正確還原）         │ ─┘
 ╠═════ VOL ════════════╣               ╠═════ VOL 分隔線 ══════╣
 │  VOL   120px         │               │ ⚙ ✕  VOL  sH=120   │
 └──────────────────────┘               └──────────────────────┘
```

---

#### 情境 H　切換股票時保留高度（Bug R3-7）

```
 【切換前：AAPL，有 VOL+RSI，各自已拖拉過分隔線】

 _paneHeights = { main: 220, VOL: 150, RSI: 50 }  （savedH 記錄）

 ┌──────────────────────┐ ─┐
 │  AAPL 主圖  220px    │ ─┘
 ╠═════ VOL 分隔線 ══════╣
 │ ⚙ ✕  VOL  sH=150   │
 ├──────────────────────┤
 ╠═════ RSI 分隔線 ══════╣
 │ ⚙ ✕  RSI  sH=50    │
 ├──────────────────────┤
 └──────────────────────┘

 【切換後：TSMC，相同的 VOL+RSI 組合】

 ❌ 舊行為：重設為預設高度（VOL=120, RSI=120）
 ✅ 新行為：savedH 保留，切換後高度完全相同

 ┌──────────────────────┐ ─┐
 │  TSMC 主圖  220px    │ ─┘  ← 保留
 ╠═════ VOL 分隔線 ══════╣
 │ ⚙ ✕  VOL  sH=150   │       ← savedH 保留
 ├──────────────────────┤
 ╠═════ RSI 分隔線 ══════╣
 │ ⚙ ✕  RSI  sH=50    │       ← savedH 保留
 ├──────────────────────┤
 └──────────────────────┘
```

---

#### 情境 J　固定容器下，副圖拉到最大

> 在容器高度固定的情況下，透過連續拖拉分隔線，將目標副圖高度最大化（其他 pane 各自壓至最小 60px）。

**前提**：total=420px，main=180，VOL=120，RSI=120（初始狀態）

```
 最大化公式：VOL_max = total − _minMainPaneHeight − _minSubPaneHeight(RSI)
                     = 420 − 60 − 60 = 300px
```

**Step 1：往上拖主圖↔VOL 分隔線，主圖壓至最小值（60px）**

```
 【初始】  total=420  main=180  VOL=120  RSI=120

 ┌──────────────────────┐ ─┐                ┌──────────────────────┐ ─┐
 │  主圖   180px        │  │  往上拖 120px   │  主圖   60px         │ ─┘ ← 觸底（最小值）
 │                      │ ─┘ ──────────→   ╠══════ 分隔線（已到頂）╣
 ╠══════ ↕ 主↔VOL 分隔線╣                  │ ⚙ ✕  VOL  sH=240   │ ← +120px
 │ ⚙ ✕  VOL  sH=120   │                  ├──────────────────────┤
 ├──────────────────────┤                  │  VOL 繪圖（放大）     │
 │  VOL 繪圖            │                  │                      │
 ╠══════ ↕ VOL↔RSI 分隔╣                  ╠══════ ↕ VOL↔RSI ═════╣
 │ ⚙ ✕  RSI  sH=120   │                  │ ⚙ ✕  RSI  sH=120   │ ← 未變
 └──────────────────────┘                  └──────────────────────┘

 主圖已觸底，分隔線停止響應（不能再往上拖）
```

**Step 2：往下拖 VOL↔RSI 分隔線，RSI 壓至最小值（60px）**

```
 【Step 1 後】  total=420  main=60  VOL=240  RSI=120

 ┌──────────────────────┐ ─┐                ┌──────────────────────┐ ─┐
 │  主圖   60px         │ ─┘  往下拖 60px   │  主圖   60px         │ ─┘ ← 不受影響
 ╠══════ 主↔VOL 分隔線 ══╣ ──────────→      ╠══════ 主↔VOL 分隔線 ══╣
 │ ⚙ ✕  VOL  240px    │                  │ ⚙ ✕  VOL  300px    │ ← +60px（最大化！）
 ├──────────────────────┤                  ├──────────────────────┤
 │  VOL 繪圖            │                  │  VOL 繪圖（最大化）   │
 │                      │                  │                      │
 ╠══════ ↕ VOL↔RSI ═════╣                  │                      │
 │ ⚙ ✕  RSI  sH=120   │                  ╠══════ VOL↔RSI（已到底）╣
 ├──────────────────────┤                  │ ⚙ ✕  RSI  60px     │ ← 觸底（最小值）
 └──────────────────────┘                  └──────────────────────┘

 RSI 已觸底，分隔線停止響應（不能再往下拖）
```

**最終狀態（VOL 最大化）**

```
 ┌──────────────────────────────────────────┐ total=420px（固定）
 │  主圖   60px（最小值，分隔線停止響應）     │
 ╠══════════════════════════════════════════╣
 │ ⚙ ✕  VOL   savedH = 300px              │ ← 副圖最大化
 │                                          │
 │           VOL 繪圖（放大）               │
 │                                          │
 ╠══════════════════════════════════════════╣
 │ ⚙ ✕  RSI   savedH = 60px               │ ← 最小值（52px 工具列 + 8px 繪圖）
 └──────────────────────────────────────────┘
 ≡≡≡≡≡≡≡≡≡≡≡≡≡≡ 底部 handle ≡≡≡≡≡≡≡≡≡≡≡≡

 VOL_max = total − min(main) − min(RSI) = 420 − 60 − 60 = 300px ✓
```

> **注意**：`_minSubPaneHeight = 60px` 含 52px overhead（⚙ ✕ 工具列）+ 8px 繪圖區。
> 副圖觸底後繪圖區幾乎不可見，但工具列仍正常顯示，使用者可從圖表管理或 ✕ 關閉。

---
### 第三輪 Bug 清單

#### Bug R3-1：拖拉整體高度只應改變容器，不應改變主圖

**現象**：拖拉底部 handle 目前以等比縮放改變所有 pane 高度。按照核心規則，底部 handle 只改變 `totalContainerHeight`，主圖應始終填充剩餘空間。

**修正**：`setChartHeightByDrag()` 需重寫：
- 有副圖時：更新 `_totalContainerHeight` 和 `_manualChartHeight`，副圖高度不變（保持 `savedHeight`），主圖 =  available - sum(subHeights)。
- 但也需套用等比效果（情境 D），因此實際上副圖高度也要等比縮放。
- **關鍵修正**：使用拖拉前各 pane 的佔比，等比分配到新 available 空間。

#### Bug R3-2：退出全螢幕應恢復進入前的容器大小與佔比

**現象**：退出全螢幕後，容器高度使用全螢幕中的 `_totalContainerHeight`，不會回到進入前的值。

**修正**：
1. 進入全螢幕前，儲存 `_preFullscreenHeight = _totalContainerHeight`。
2. 退出全螢幕時，恢復 `_totalContainerHeight = _preFullscreenHeight`。
3. 佔比（`_baseMainPaneHeight` 和各副圖 `savedHeight`）在全螢幕中可能被用戶拖拉改變，故不需要額外恢復。

#### Bug R3-3：雙邊座標十字線左右 Y 軸值仍然不一致

**現象**：AEI 左軸顯示 478.71，右軸顯示 3.82（明顯錯誤，差異太大）。

**根本原因**：`_ensureMirrorSeries` 使用 `data` 變數（= `this.currentChartData`），其 minValue/maxValue 計算基於 **全部歷史數據**，而圖表當前可見範圍可能只是一小段。autoscaleInfoProvider 使用固定全歷史範圍，LW 在縮放/平移時無法正確調整左軸刻度。

**修正**：改為讓 `autoscaleInfoProvider` 回傳 `null`，讓 LW 自行根據可見範圍計算左軸刻度：
```javascript
autoscaleInfoProvider: (original) => original(),
```
但仍需確保左軸 series 的數據足夠覆蓋主圖的 OHLC 範圍。改用 `value = (bar.high + bar.low) / 2` 不夠精確。

**最佳解法**：不使用 `autoscaleInfoProvider`，改為使用 `chart.priceScale('left').applyOptions({ mode: sameAsRight })` 確保左右軸使用相同的縮放模式，並讓 mirror series 使用足夠涵蓋 OHLC 範圍的數據。具體作法：為每根 bar 產生兩筆數據點（high 和 low），或使用類型為 candlestick 的隱形 mirror series。

#### Bug R3-4：新增副圖壓縮 VOL 而非主圖；展開副圖壓縮主圖

**修正**：
1. **新增副圖**（`_updateSubChartPaneHeights` + `_syncChartContainerHeight`）：刪除 `_lastSubCount` 清除 `_baseMainPaneHeight` 邏輯。改為：新副圖高度 = `_defaultSubPaneHeight`，主圖 = available - sum(allSubHeights)。若主圖 < `_minMainPaneHeight`，自動擴大容器。
2. **展開副圖**：展開的副圖佔據所有副圖空間的合計（`sum(allSubHeights)`），不壓縮主圖。

#### Bug R3-5：全螢幕按鈕 Tooltip 文字修正

- 放大圖示 `title="全螢幕顯示"`
- 縮小圖示需動態切換：進入全螢幕後 button `title="退出全螢幕"`
- 退出全螢幕後 button `title="全螢幕顯示"`

#### Bug R3-6：移除副圖右側色塊標簽（VOL、RSI1、RSI2、RSI3）

在 `_renderVOLSubChart` 和 `_renderRSISubChart` 中，對每個 series 加上 `lastValueVisible: false`。

#### Bug R3-7：切換股票應保留容器大小與 pane 佔比

在 `loadStock` 中，不重置 `_totalContainerHeight`、`_manualChartHeight`、`_baseMainPaneHeight`，以及各副圖的 `savedHeight`。

---

### 實作順序

| 優先 | Bug | 說明 |
|------|-----|------|
| P0 | R3-1 + R3-4 | 高度行為核心重構（合併處理） |
| P0 | R3-2 | 全螢幕儲存/恢復 |
| P1 | R3-3 | 雙軸同步 |
| P1 | R3-7 | 股票切換保持狀態 |
| P2 | R3-5 | Tooltip 文字 |
| P2 | R3-6 | 色塊標籤移除 |

---

*最後更新：2026-04-08 第三輪確定性規格修正版*
