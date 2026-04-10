# 圖表高度 Bug 修復實作計畫 (Bug 1~4)

**建立日期**：2026-04-10  
**工程師**：GitHub Copilot  
**對應規格**：`docs/bug_fix/20260409_chart_height_bug_fix_spec.md`  
**修改檔案**：`app/feature/screening/chart/kline_viewer/chart_controller.js`

---

## 一、根本原因摘要（修正版）

| Bug | Spec 描述 | 程式碼實際確認的根本原因 |
|-----|-----------|--------------------------|
| Bug 1 | `nextHeight` 未受限傳入 `panes[0].setHeight` | 目前 `nextHeight` 已受限（`Math.max(minTotal, targetHeight)`），但在 `_updateSubChartPaneHeights` 的 main-only 分支，沒有顯式重設 pane[0] 的 weight hint。pane[0] 保留舊的 weight（如 300），LW 以比例分配時主圖只佔容器的 71%，剩下的空間成黑底。 |
| Bug 2 | `_captureCurrentPaneHeights` 的 scaleFactor 計算錯誤，分母包含萎縮中的 VOL | 確認：LW 在第二個 pane 掛載後自動均分，使第一個 pane 縮小到均分值。若此時 ResizeObserver 觸發 `_captureCurrentPaneHeights`，讀到的是中間值，scaleFactor 偏大，savedHeight 被放大。現有 Bug2Fix 的 `rawPanesSum > 5` 過濾只能處理「殘留 ghost pane」場景，對 LW 均分壓縮場景依然無效。 |
| Bug 3 | `_captureCurrentPaneHeights` 在 expanded 模式分母偏小，scaleFactor 虛增 | 確認：`toggleSubChartExpand` → `_captureCurrentPaneHeights` → `_baseMainPaneHeight` 可能被虛增的 scaleFactor 放大，後續展開分支用錯誤的 `_baseMainPaneHeight` 設定主圖，展開副圖大小因此不可預測。 |
| Bug 4 | capture 在生命週期交錯時讀到畸形高度 | 確認更具體：`loadStock` fetch 後執行第一次 `capture + clear`（L295-296）；之後 `renderIndicators` 再次執行第二次 `capture + clear`（L491-494）。第二次 capture 在第一次 clear 已執行後讀取，pane 已被 LW 重組，值不可靠。兩次 capture 中第一次才是正確且安全的。 |

---

## 二、修復策略

### Bug 1 修復：強制重設 pane[0] weight hint

**修改位置**：`_updateSubChartPaneHeights` 的 `subCount === 0` 分支

**修改前（原代碼）：**
```javascript
if (subCount === 0 || visibleOrder.length === 0) {
    this._collapseExtraPanesForMainOnly();
    this._baseMainPaneHeight = Math.max(this._minMainPaneHeight, totalHeight);
    this._attachPaneSeparatorTooltips([]);
    return;
}
```

**修改後：**
```javascript
if (subCount === 0 || visibleOrder.length === 0) {
    this._collapseExtraPanesForMainOnly();
    this._baseMainPaneHeight = Math.max(this._minMainPaneHeight, totalHeight);
    // Bug1 Fix (完整版): 顯式重設 pane[0] 的 weight hint 為 totalHeight，
    // 避免舊 weight（如舊副圖狀態下的 300）使 LW 只分配容器的一部分給主圖。
    // 在 main-only 情境下，pane[0] 是唯一的 pane，setHeight 值不影響 overhead 計算。
    const mainPaneForReset = panes[0];
    if (mainPaneForReset && typeof mainPaneForReset.setHeight === 'function') {
        mainPaneForReset.setHeight(totalHeight);
    }
    this._attachPaneSeparatorTooltips([]);
    return;
}
```

**同步修改**：`setChartHeightByDrag` 的 `else` 分支也補上同樣的 setHeight 呼叫，確保在 main-only 拖拉時立即生效，不需等到下一次 ResizeObserver。

---

### Bug 2 修復：移除 ResizeObserver 觸發的 capture 汙染路徑

**問題核心**：LW 在新增第二個 pane 時自動均分，此時 ResizeObserver 可能觸發 `_captureCurrentPaneHeights`，讀到均分中的瞬時高度，寫入錯誤的 savedHeight。

**修改策略** — 雙管齊下：

**(A) 在 _updateSubChartPaneHeights 的 normal mode 中，強制以 savedHeight 為準，不讓 LW 的 auto-distribution 影響結果**

這需要確保 `_updateSubChartPaneHeights` 在 renderSubCharts 呼叫完畢後，再次強制執行一次完整的 setHeight，覆蓋 LW 的任何中間狀態。目前已在做，但順序可能有問題（LW pane 創建後立刻 setHeight，有時 LW 尚未完成 pane 初始化）。

解決方案：在 `renderSubCharts` 中，於所有 series 渲染完成後，使用 `requestAnimationFrame` 延一幀再執行 `_updateSubChartPaneHeights`，確保 LW 已完成 pane 初始化。

**(B) `_captureCurrentPaneHeights` 加入「渲染鎖定」保護**

新增一個 `_isRenderingSubCharts` 標記：
- 在 `renderSubCharts` 開始時設為 `true`
- 在結束後設回 `false`
- `_captureCurrentPaneHeights` 若偵測到此標記，**跳過 savedHeight 和 _baseMainPaneHeight 的更新**（但仍更新 `_totalContainerHeight`）

---

### Bug 3 修復：在 toggleSubChartExpand 中先鎖定 _baseMainPaneHeight

**修改位置**：`toggleSubChartExpand`

**修改前（原代碼）：**
```javascript
toggleSubChartExpand(indicator) {
    const order = this._getEnabledSubChartOrder();
    if (!order.includes(indicator) || order.length < 2) return;

    this._captureCurrentPaneHeights();

    window.state.expandedSubChart = (window.state.expandedSubChart === indicator) ? null : indicator;
    this.renderSubCharts(this.currentChartData || []);
    // ...
},
```

**問題**：在呼叫 `_captureCurrentPaneHeights()` 之後、在 `expandedSubChart` 被設定之前，此時 `expanded = null`（舊態）。但如果 `_captureCurrentPaneHeights` 內部的 scaleFactor 計算有誤（如 rawPanesSum 偏小），`_baseMainPaneHeight` 就被放大。

**修改後**：
```javascript
toggleSubChartExpand(indicator) {
    const order = this._getEnabledSubChartOrder();
    if (!order.includes(indicator) || order.length < 2) return;

    // Bug3 Fix (完整版): 先在「非 expanded 模式」下捕捉正確高度，
    // 然後鎖定 _baseMainPaneHeight 快照，再切換 expanded 狀態。
    this._captureCurrentPaneHeights();
    const lockedMainHeight = this._baseMainPaneHeight;  // 快照保存

    window.state.expandedSubChart = (window.state.expandedSubChart === indicator) ? null : indicator;
    
    // 確保 _baseMainPaneHeight 在 renderSubCharts 前是正確的快照值
    if (window.state.expandedSubChart !== null) {
        this._baseMainPaneHeight = lockedMainHeight;  // 防止 renderSubCharts 前的任何中間操作污染
    }
    
    this.renderSubCharts(this.currentChartData || []);
    // ...
},
```

同時在 `_updateSubChartPaneHeights` 的 expanded 分支中，確認 `_baseMainPaneHeight` 不被覆蓋：
- 目前 expanded 分支末尾有 `this._baseMainPaneHeight = mainHeight;`，這是正確的，維持即可。
- 確認 normal mode 後的 `this._baseMainPaneHeight = mainHeight;` 不在 expanded 分支執行（目前代碼結構已用 `return` 隔開，正確）。

---

### Bug 4 修復：防止 renderIndicators 的第二次 capture 污染

**修改策略**：新增 `_skipCaptureOnNextRender` 旗標

**修改位置 A**：`loadStock` 於第一次 capture + clear 後設置旗標：
```javascript
// 0. 在載入新數據前，先清除舊的指標系列，避免時間軸衝突導致 Value is null 錯誤
this._captureCurrentPaneHeights();
this.clearIndicatorSeries();
this._skipCaptureOnNextRender = true;  // ← 新增：告知 renderIndicators 跳過重複 capture
```

**修改位置 B**：`renderIndicators` 判斷旗標：
```javascript
renderIndicators(chartData) {
    // ...
    // 在清除前保存目前 pane 高度，切換股票時可維持使用者調整過的副圖高度
    // Bug4 Fix (完整版): 若 loadStock 已執行 capture，跳過此次以防讀到 LW 重組後的中間值
    if (!this._skipCaptureOnNextRender) {
        this._captureCurrentPaneHeights();
        this.clearIndicatorSeries();
    } else {
        this._skipCaptureOnNextRender = false;
        // loadStock 已 clear 過，renderIndicators 不需再 clear
        // 但如果 isIndicatorsVisible=false 特殊路徑仍需執行 clear
        // → 此分支只要確保 indicator series 是乾淨的即可（loadStock 已 clear）
    }
    // ...
}
```

**初始化**：在 `chart_controller.js` 的屬性列表加入：
```javascript
_skipCaptureOnNextRender: false,
```

---

## 三、規格變更補充（沿用 20260409 規格）

| 項目 | 值 |
|------|----|
| `_minTotalChartHeight` | 420px（已是此值） |
| 新增副圖初始高度 | `120 * (containerHeight / 420)`（已實作 `_scaledSubPaneHeight`） |

---

## 四、風險評估

| 風險 | 說明 | 因應方式 |
|------|------|----------|
| Bug1 Fix 的 `panes[0].setHeight(totalHeight)` | 若 LW v5 對 single-pane 的 setHeight 有 overhead 計算，可能造成右側 priceScale 位置偏移 | 實測確認。若出現 priceScale 偏移，改傳 `totalHeight - 1`（留 1px margin） |
| Bug4 `_skipCaptureOnNextRender` 旗標 | 若 `loadStock` 執行到一半拋出例外，旗標被設定但 `renderIndicators` 未執行，下次 `renderIndicatorsFromState` 會因旗標仍為 `true` 而跳過 capture | 在 `loadStock` 的 catch 區塊重置旗標：`this._skipCaptureOnNextRender = false;` |
| Bug2 `requestAnimationFrame` 延遲 setHeight | 如果在下一幀前使用者已觸發其他操作（如 ResizeObserver），可能有短暫的視覺閃爍（先顯示 LW 均分再跳回正確高度） | 改用 `requestAnimationFrame` 二層（double rAF）確保 LW 已完成 paint |
| Bug3 `lockedMainHeight` 快照 | 若 `_captureCurrentPaneHeights` 本身有 Bug（Bug2 情況），鎖定的快照值也可能有誤 | Bug2 修復後，此風險消失。建議 Bug2 先行修復 |

---

## 五、實作優先順序

```
Bug 4 → Bug 1 → Bug 2 → Bug 3
```

- Bug 4 最容易隔離（只需在 loadStock 加旗標），且影響最廣（每次切換股票都觸發）
- Bug 1 改動最小（單行 setHeight），但要驗證 overhead 不產生副作用
- Bug 2 需要渲染鎖定機制，改動較多
- Bug 3 依賴 Bug 1/2 的基礎高度正確性

---

## 六、手動驗證項目（無法自動化驗證）

1. **Bug1 驗證**：
   - 在無副圖狀態下，往下拉大容器後往上縮，確認推到底限（420px）時 K 線圖完整填滿容器，底部無黑底留白
   - 再往上推（不應有任何反應），確認 K 線圖高度鎖在 420px 不動

2. **Bug2 驗證**：
   - 依序開啟 VOL，再開 RSI，確認 VOL 未被壓縮（應分別各約 120px）
   - 在拉大容器（約 840px）後重複上述，確認初始高度比例符合 `120*(840/420)=240px`
   - 開啟 VOL+RSI 後關閉 VOL，確認 RSI 維持原高度不暴漲，主圖獲得 VOL 空間

3. **Bug3 驗證**：
   - 開啟 VOL+RSI，點擊 RSI 展開按鈕，確認：主圖高度不變，RSI 精確填滿 VOL 的空間
   - 再次點擊收合，確認回到展開前的比例

4. **Bug4 驗證**：
   - 開啟 VOL（或 VOL+RSI），從清單連續點擊 AA → AAA → AAAA → AA → AAAA，確認副圖位置與高度比例不崩壞
   - 驗證切換後主圖不被壓縮，也不出現底部黑底留白
   - 在拉大容器後切換股票，確認比例仍然正確
