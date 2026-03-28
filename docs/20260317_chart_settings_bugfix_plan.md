# 圖表管理彈窗 10 項 Bug 修復計畫

**日期：** 2026-03-17  
**影響版本：** v2.2 → v2.3  
**撰寫者：** GitHub Copilot

---

## 一、Bug 清單與根本原因診斷

| # | 分類 | Bug 描述 | 根本原因 |
|---|------|---------|---------|
| 1 | 一般設定 | 開啟彈窗預設顯示「指標管理」而非「常規設定」 | `open()` 固定呼叫 `_switchModalTab('indicators')`，未判斷是否為無目標的一般開啟 |
| 2 | 一般設定 | 懸浮窗開啟後未出現在 K 線圖上 | `_updateCrosshairTooltip` 使用 `===` 嚴格比對 `param.time`，型別不一致時永遠找不到 bar；另 `z-index: 10` 被 indicatorTopBar 遮蓋 |
| 3 | 一般設定 | 顏色設定應依主圖類型條件顯示；收盤價線應強制淺藍色 | `renderGeneralSettings()` 不論 `chartType` 為何，永遠渲染所有欄位，無選擇性 show/hide |
| 4 | 一般設定 | 四式陰陽燭切換空心/實心後圖表未更新 | `_applySeriesVisualOptions()` 沒有 `monochrome_candle` 分支，落入空邏輯 |
| 5 | 一般設定 | 關閉現價線後 K 線圖上的線段依然存在 | 只設了 `lastValueVisible`（移除軸標籤），未同時設定 `priceLineVisible` |
| 6 | 坐標軸 | 選「對數坐標」後 Y 軸未切換為對數模式 | `LW.PriceScaleMode` enum 路徑引用失敗時靜默為 `undefined`，fallback 為 Normal |
| 7 | 坐標軸 | 雙邊坐標只有右側顯示，左側空白 | LW 的 `leftPriceScale.visible: true` 若無 series 綁定到左側 scale，不顯示刻度；需要 mirror series |
| 8 | 型態管理 | 右側面板的顏色/透明度修改後圖表未更新 | `applyPatternConfig` 呼叫不存在的 `window.patternAnnotation.update()`（小寫 p）；繪圖方法硬編碼顏色，未讀取 `_patternConfig` |
| 9 | 型態管理 | 左側欄勾選/右側面板勾選的職責混淆 | 沒有獨立的 `masterVisible` 欄位；左側 checkbox 直接操作 `shapeVisible`/`textVisible` |
| 10 | 型態管理 | 型態標示不隨圖表縮放連動 | 圖表 `init` 或 `_switchChartSeries` 後重新建立 timeScale 實例，但 PatternAnnotation 未重新訂閱；另有 null labelY 未保護 |

### 隱藏問題（同步修復）

- `applyPatternConfig` 呼叫錯誤的全局名稱（`window.patternAnnotation` 小寫 p）
- 切到「收盤價線」再切回普通 K 線時，顏色未還原（需備份機制）
- `_drawPolyline` 中 `labelY` 來自 `priceToCoordinate`，可能為 null，缺少保護

---

## 二、決策記錄

| 議題 | 決策 |
|------|------|
| 雙邊坐標（普通模式） | 左右獨立，依 Radio 判斷 mode；非普通模式：左右鏡像同步 |
| 型態縮放行為 | 錨點跟隨座標系（size 隨 zoom 連動），線寬/字體 Fixed px 不縮放 |
| 收盤價線切換顏色 | 切到 `line` 時備份 bullColor/bearColor，切離時自動還原 |
| `_mirrorSeries` 管理 | 在 ChartController 管理，不進入 `clearIndicatorSeries()` 清除流程 |

---

## 三、修復步驟

### Phase 1 — 快速修復（Bug 1、5）

#### Step 1：Bug 1 — 預設 Tab 修正

**檔案：** `App/Feature/Screening/chartSettingsModal.js`  
**方法：** `open(target)`  
**修改：** 末尾邏輯改為：無 `target` 時呼叫 `_switchModalTab('general')`；有 MA/BOLL target 時才呼叫 `_switchModalTab('indicators')`

```js
// 修改前
this._switchModalTab('indicators');

// 修改後
if (target === 'MA' || target === 'BOLL') {
    this._switchModalTab('indicators');
} else {
    this._switchModalTab('general');
}
```

#### Step 2：Bug 5 — 現價線完整關閉

**檔案：** `App/Feature/Screening/chartController.js`  
**方法：** `applyGeneralSettings(cfg)`

```js
// 修改前
this.candleSeries.applyOptions({ lastValueVisible: !!cfg.showPriceLine });

// 修改後
this.candleSeries.applyOptions({
    lastValueVisible: !!cfg.showPriceLine,
    priceLineVisible: !!cfg.showPriceLine
});
```

---

### Phase 2 — 常規設定 UI 與 Tooltip（Bug 2、3、4）

#### Step 3：Bug 2 — Tooltip 時間比對與層疊修正

**檔案 A：** `App/Feature/Screening/chartController.js` → `_updateCrosshairTooltip`  
- 統一 time normalize：`String(b.time) === String(param.time)` 取代 `===`

**檔案 B：** `App/Feature/Screening/chart-settings-modal.css`  
- `.chart-tooltip { z-index: 20; }` （從 10 提升）

#### Step 4：Bug 3 — 顏色列條件顯示 + 收盤價線強制淺藍

**檔案：** `App/Feature/Screening/chartSettingsModal.js`

**修改邏輯：**
- `renderGeneralSettings()` 各 row 加上 id，依 `chartType` 初始化 `display` 狀態：
  - `bullStyleRow`：只在 `candlestick` 或 `monochrome_candle` 顯示
  - `bullColorRow` / `bearColorRow`：非 `line` 才顯示
- 新增 `_onGeneralChartTypeChange(type)` 方法：動態 show/hide，切到 `line` 時備份顏色並設定 `#5b9bd5`；切離時還原
- `updateGeneralField('chartType', value)` 呼叫 `_onGeneralChartTypeChange()`

```js
_onGeneralChartTypeChange(type) {
    const bullStyleRow = document.getElementById('generalBullStyleRow');
    const bullColorRow = document.getElementById('generalBullColorRow');
    const bearColorRow = document.getElementById('generalBearColorRow');
    const isCandle     = type === 'candlestick' || type === 'monochrome_candle';
    const isLine       = type === 'line';

    if (bullStyleRow) bullStyleRow.style.display = isCandle ? '' : 'none';
    if (bullColorRow) bullColorRow.style.display = isLine   ? 'none' : '';
    if (bearColorRow) bearColorRow.style.display = isLine   ? 'none' : '';

    if (isLine) {
        // 備份並強制淺藍色
        if (!this._colorBackup) {
            this._colorBackup = {
                bullColor: this._generalConfig.bullColor,
                bearColor: this._generalConfig.bearColor
            };
        }
        this._generalConfig.bullColor = '#5b9bd5';
        this._generalConfig.bearColor = '#5b9bd5';
    } else if (this._colorBackup) {
        // 還原備份
        this._generalConfig.bullColor = this._colorBackup.bullColor;
        this._generalConfig.bearColor = this._colorBackup.bearColor;
        this._colorBackup = null;
    }
}
```

#### Step 5：Bug 4 — 四式陰陽燭 applyVisualOptions

**檔案：** `App/Feature/Screening/chartController.js` → `_applySeriesVisualOptions()`

```js
} else if (type === 'monochrome_candle') {
    const bullStyle = cfg.bullStyle || 'hollow';
    this.candleSeries.applyOptions({
        upColor:       bullStyle === 'solid' ? '#000000' : '#ffffff',
        borderUpColor: '#000000',
        wickUpColor:   '#000000'
    });
}
```

---

### Phase 3 — 坐標軸設定（Bug 6、7）

#### Step 6：Bug 6 — PriceScaleMode Fallback 數值

**檔案：** `App/Feature/Screening/chartController.js` → `applyAxisSettings()`

```js
const modeMap = {
    normal:      LW.PriceScaleMode?.Normal       ?? 0,
    logarithmic: LW.PriceScaleMode?.Logarithmic  ?? 1,
    percentage:  LW.PriceScaleMode?.Percentage   ?? 2,
    indexed:     LW.PriceScaleMode?.IndexedTo100 ?? 3
};
console.log('[Axis] priceScaleMode resolved:', primaryMode, '(from:', cfg.priceScaleMode, ')');
```

#### Step 7：Bug 7 — 雙邊坐標 Mirror Series

**檔案：** `App/Feature/Screening/chartController.js`

**新增屬性：** `_mirrorSeries: null`

**重構 `applyAxisSettings()` 中的雙邊邏輯：**
- 普通坐標 + 雙邊：
  - `candleSeries.applyOptions({ priceScaleId: 'right' })`
  - 建立/更新 `_mirrorSeries`（`addLineSeries({ priceScaleId: 'left', visible: false })`），setData 相同的 close 資料
  - 左右 mode 分別依 `leftScaleType`/`rightScaleType` 映射
- 非普通坐標 + 雙邊：左右鏡像同步，兩側 mode 相同
- 左只 / 右只：銷毀 `_mirrorSeries`（若存在），移動 `candleSeries` 到對應 scale id

---

### Phase 4 — 型態管理（Bug 8、9、10）

#### Step 8a：Bug 8 — applyPatternConfig 修正

**檔案：** `App/Feature/Screening/chartController.js` → `applyPatternConfig()`

```js
// 修改前
window.patternAnnotation.update(...)  // 小寫 p，方法不存在

// 修改後
window.state.patternConfig = cfg;
if (window.PatternAnnotation) {       // 大寫 P
    window.PatternAnnotation.render();
}
```

#### Step 8b：Bug 8 — 繪圖方法讀取 patternConfig

**檔案：** `App/Feature/Screening/function_block/pattern_annotation.js`

- 所有繪圖方法（`_drawRect`、`_drawPolyline`、`_drawTriangle`）從 `window.ChartSettingsModal?._patternConfig?.[pattern.name]` 讀取 `color`、`labelColor`、`opacity`、`lineWidth`
- 若讀取失敗則使用目前的硬編碼值作為 fallback

#### Step 9：Bug 9 — masterVisible 型態開關重構

**檔案：** `App/Feature/Screening/chartSettingsModal.js`

**`defaultPatternConfig` 新增欄位：**
```js
head_shoulders_top: { masterVisible: true, shapeVisible: true, textVisible: true, ... }
```

**`renderPatternSidebar()` 重構：**
- 左側 checkbox 的 `onchange` 只修改 `masterVisible`，**不改動** `shapeVisible`/`textVisible`
- click 事件同時呼叫 `_selectPattern(key)` 切換右側面板
- `_togglePatternAll()` 改為切換 `masterVisible`

**`renderPatternSettings()` 右側面板：**
- checkbox 只控制 `shapeVisible`/`textVisible`

**`pattern_annotation.js` → `render()` 雙層判斷：**
```js
const patCfg = window.ChartSettingsModal?._patternConfig?.[pattern.name];
if (patCfg && patCfg.masterVisible === false) return; // 總開關關閉 → 跳過
// 再依 shapeVisible / textVisible 決定是否繪圖/文字
```

#### Step 10：Bug 10 — 縮放訂閱時機 + Null 保護

**檔案 A：** `App/Feature/Screening/function_block/pattern_annotation.js`
- `_subscribeRedraw()` 同時訂閱 `subscribeVisibleLogicalRangeChange` 與 `subscribeVisibleTimeRangeChange`（雙保險）
- `_drawLabel` 加入 null 保護：`if (labelY == null) return`
- `_drawPolyline` 中 `labelY` 在 `firstY == null` 時提前 return

**檔案 B：** `App/Feature/Screening/chartController.js` → `init()` 末尾
```js
// 確保圖表建立後重新綁定 PatternAnnotation 訂閱
if (window.PatternAnnotation) window.PatternAnnotation._subscribeRedraw();
```

---

### Phase 5 — 版本號（v2.2 → v2.3）

**檔案：** `App/Feature/Screening/screening_fragment.html`

| 資源 | 舊版本 | 新版本 |
|------|--------|--------|
| `chartSettingsModal.js` | `?v=2.2` | `?v=2.3` |
| `chartController.js` | `?v=2.2` | `?v=2.3` |
| `pattern_annotation.js` | `?v=2.0` | `?v=2.3` |

---

## 四、影響檔案總覽

| 檔案 | 影響的 Bug | 主要變更 |
|------|-----------|---------|
| `chartSettingsModal.js` | 1、3、9 | `open()`、`renderGeneralSettings()`、`_onGeneralChartTypeChange()`、`renderPatternSidebar()`、`defaultPatternConfig` |
| `chartController.js` | 2、4、5、6、7、8a、10 | `applyGeneralSettings()`、`applyAxisSettings()`、`_applySeriesVisualOptions()`、`applyPatternConfig()`、`_mirrorSeries`、`init()` |
| `pattern_annotation.js` | 8b、9e、10 | `render()`、`_drawRect()`、`_drawPolyline()`、`_drawTriangle()`、`_drawLabel()`、`_subscribeRedraw()` |
| `chart-settings-modal.css` | 2 | `.chart-tooltip { z-index: 20 }` |
| `screening_fragment.html` | — | 版本號更新 |

---

## 五、驗證清單

- [ ] Bug 1 — 點「圖表管理」→ 彈窗預設顯示「常規設定」Tab
- [ ] Bug 2 — 移過 K 線圖 → 懸浮窗左上角出現；切「跟隨懸浮窗」→ 跟隨游標；切「關閉」→ 消失
- [ ] Bug 3 — 切「收盤價線」→ 顏色列消失、線條變淺藍；切回「普通K線」→ 顏色列恢復
- [ ] Bug 4 — 四式陰陽燭 + 切換空心/實心 → 圖表立即更新
- [ ] Bug 5 — 關閉現價線 → 圖表上虛線完全消失
- [ ] Bug 6 — 選「對數坐標」→ console 顯示 `mode=1`，Y 軸切換為對數顯示
- [ ] Bug 7 — 選「雙邊坐標」→ 左右兩側均有刻度；切回「右坐標」→ 左側消失
- [ ] Bug 8 — 型態管理右側面板改顏色/透明度 → 套用後 SVG 顏色正確更新
- [ ] Bug 9 — 左側取消勾選 → SVG 消失；右側 shapeVisible/textVisible 不變；重新勾選 → 依右側狀態渲染
- [ ] Bug 10 — Zoom in/out 時型態錨點隨 K 線移動，線寬與字體保持固定

---

*計畫書結束*
