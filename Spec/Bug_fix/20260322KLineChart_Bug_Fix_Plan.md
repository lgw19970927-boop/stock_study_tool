# K 線圖表 Bug 修復計畫書

（本報告已透過實際操作瀏覽器環境，包含在「我的策略」標籤下執行篩選並等待結果、點擊觀察等流程，進行了精確的視覺重現與底層邏輯驗證）

## Bug 1: 型態標示框未固定在正確的時間範圍（縮放時產生 X 軸偏移）(Fixed)

### 瀏覽器測試重現與根本原因分析
透過實際在瀏覽器中操作與比對，確認以下狀況：
1. **型態標示框未能固定在相同時間範圍（設定引發偏移的主因）**：這正是您提到「變更圖表管理設定後按下確定」所引發的關鍵問題。圖表預設情況下（只有右側價格軸）SVG 與畫布是完美對齊的。但當套用設定（例如開啟或調整左側價格軸），LightweightCharts 計算出的座標**不會包含新增加的左側軸寬度**。由於我們的 SVG 仍是從最左端 (x=0) 算起，這就產生了一段「固定的像素偏移（等於左側價格軸寬度）」。因為是固定的像素差異，縮放 K 線時，該偏移代表的「K線數量」就會變來變去，導致視覺上方框無法鎖定在原本的同一段時間上。
2. **型態標示框僅對齊「K 線中心」**：即使計算正確，原先程式碼左右邊界也僅對齊 K 線的「中心 X 座標」，沒有完美包裹住整根 K 線的寬度。
3. **Y 軸上下偏移與凍結問題**：這是因為 LightweightCharts 的 API **不提供「單純價格軸（Y軸）被拖曳」時的事件監聽**。當您上下拖曳價格軸時，根本沒有事件去通知 SVG 重繪，導致框線錯位。此外，按下圖表設定「確定」時引發的非同步雙重視圖重建，若時序不對極易使 SVG 徹底失效不再更新。

### 修復方案
*   **套用左側座標軸偏移量 (Left Scale Offset)**：在 `pattern_annotation.js` 的所有繪圖邏輯中，動態取得左側價格軸的寬度 `chart.priceScale('left').width()`，並將此偏移量 **加到所有的 X 座標上**，確保當圖表設定改變時，SVG 也能跟著墊出對應的寬度，讓方框永遠死死鎖定在同一段時間範圍上。
*   **動態計算 K 線寬度墊片 (Padding)**：利用相鄰兩根 K 線的座標差計算出當下的 K 線寬度 (`barSpacing`)，將左右方框再往外墊出「半根寬度」，確保能完整包覆 K 線的最外邊緣。
*   **針對 Y 軸拖曳補強事件與解決空窗期**：既然原生 API 不支援，我們將對整個圖表容器加上 `mousedown` 搭配 `mousemove` (`requestAnimationFrame`) 監聽器，只要滑鼠拖曳（不論是在底圖或 Y 軸），就強制觸發 SVG 重繪，達到不論如何縮放都有確實包覆最高最低點的連動效果；並在 `chartSettingsModal.js` 確保設定套用的時序不被阻斷。

---

## Bug 2: 變更任意圖表設定後切換至「周/月 K 線」導致 K 線稀疏異常（Fixed）

### 瀏覽器測試重現（精確觸發步驟）

觸發條件（以下兩種情境均會重現）：
1. **1D → 1W/1M**：在日 K 視圖下，開啟「圖表管理」並**變更任意設定**（如顏色、圖表類型等）後按確定，再切換至「1W」或「1M」頻率，K 線立刻呈現稀疏分佈（每週/每月只有少數 K 棒有畫面，大量空白格出現）。
2. **1W → 1M**：在周 K 視圖下，同樣開啟圖表管理變更設定確定後，切換至月 K，也會觸發相同的稀疏現象。

反向操作（切回原頻率）則**不受影響**，圖表恢復正常。

### 根本原因分析

**LightweightCharts v3 → v4 API 破壞性變更導致孤兒 Series 殘留**

1.  **廢棄的移除 API**：舊版（v3）移除 Series 的方式為 `chart.removeSeries(series)`；但在 v4 中 API 已改為直接呼叫 `series.remove()`，且 `chart.removeSeries()` 在部分版本下會**靜默失敗（無例外、無警告）**，Series 並未真正從圖表移除。

2.  **孤兒 Series 殘留時間戳**：當「圖表管理」按下確定時，`applyGeneralSettings()` 會呼叫 `_switchChartSeries()` 重建主圖 Series（candleSeries）、`_removeMirrorSeries()` 移除雙座標軸的 mirrorSeries。因為上述 API 靜默失敗，**舊的 Series 依然留在圖表內、帶著舊頻率的完整時間戳**（例如切換前是日 K，就殘留 ~252 筆日時間戳）。

3.  **LW 時間軸合併導致稀疏**：切換至周 K 後，LightweightCharts 看到同一圖表內同時存在「舊的 252 筆日時間戳（孤兒）」與「新的 52 筆周時間戳」，會將兩者**合併排進同一條時間軸**。由於日時間戳遠多於周時間戳，每根周 K 只能被分配到約 1/5 的時間槽（252 ÷ 52 ≈ 5），在視覺上呈現周 K 每隔 5 格才有一根、其餘為空的「稀疏」效果。月 K 情況更嚴重（252 ÷ 12 ≈ 21 倍稀疏）。

**次要修補（已同步套用）**：
*   將十字線模式從 `CrosshairMode.Normal` 改為 `CrosshairMode.Magnet`（防止十字線停在無資料的空白格）。
*   在 `_applyTooltipMode('hidden')` 補上 `labelVisible: false`（防止隱形十字線的座標軸標籤干擾版面計算）。

### 修復方案

**主修：改用 v4 相容的 `ChartRenderer.removeSeries()` 包裝函式**

`App/Static/js/utils/chartRenderer.js` 中的 `ChartRenderer.removeSeries(chart, series)` 封裝了對 v4/v3 的相容邏輯（優先使用 `series.remove()`，回退至 `chart.removeSeries()`）。

1.  **`_switchChartSeries()`**：
    ```javascript
    // 修前（v3 API，v4 靜默失敗）
    try { this.chart.removeSeries(this.candleSeries); } catch (e) { ... }

    // 修後（v4 相容）
    window.ChartRenderer.removeSeries(this.chart, this.candleSeries);
    ```

2.  **`_removeMirrorSeries()`**：
    ```javascript
    // 修前（v3 API，v4 靜默失敗）
    try { this.chart.removeSeries(this._mirrorSeries); } catch (e) { ... }

    // 修後（v4 相容）
    window.ChartRenderer.removeSeries(this.chart, this._mirrorSeries);
    ```

3.  **`loadStock()` — 頻率切換後同步 mirrorSeries 資料**：
    即使 `_removeMirrorSeries()` 已修復，若使用者在雙座標軸模式下切換頻率（非重建 Series，而是 `setData` 更新），mirrorSeries 也需同步更新至新頻率資料，否則同樣產生孤兒時間戳：
    ```javascript
    this.renderIndicators(chartData);

    // Bug2 Fix: 切換頻率後同步更新 mirrorSeries 資料
    if (this._mirrorSeries && chartData && chartData.length > 0) {
        try {
            this._mirrorSeries.setData(chartData.map(b => ({ time: b.time, value: b.close })));
        } catch (e) {}
    }
    ```

### 涵蓋範圍確認

| 情境 | 根本原因 | 此修復是否涵蓋 |
|---|---|---|
| 1D → 1W（設定變更後） | _switchChartSeries 孤兒 series | ✅ Change 1 |
| 1D → 1M（設定變更後） | 同上 | ✅ Change 1 |
| 1W → 1M（設定變更後） | 同上 | ✅ Change 1 |
| 雙座標軸模式任意切頻率 | mirrorSeries 舊時間戳殘留 | ✅ Change 2 + 3 |

---

## Bug 3: 右上角篩選結果區塊的內容未垂直置中(Fixed)

### 瀏覽器測試重現與根本原因分析
*   **空狀態觀察**：尚未執行篩選時，利用 `<div id="verticalResizeHandle">` 下拉放大上方結果區塊的高度，會發現畫面中央的「放大鏡圖示與提示字」依然貼著區塊最上方。
*   **執行等候狀態觀察**：在「我的策略」按下藍色「執行篩選」後（約需等待數秒至數十秒），顯示出來的進度條區塊 `#screeningProgressArea` 同樣偏向最上方，沒有置中。
*   **根本原因**：這是單純的 CSS Flexbox 佈局陷阱。外層容器 `.stock-list-container` 使用了 Flex 並讓 `.stock-list` 以 `flex: 1` 填滿了高度；但 `.stock-list` 自己預設卻是 `display: block`，所以其子元素（空狀態與進度條區塊）的高度僅是其**內容文字高度**。即使子元素自身有 `align-items: center`，也只不過是在字體那一點點高度內置中罷了，無法向下延展填滿容器。

### 修復方案
*   **升級為 Flex 容器並分配剩餘空間**：在 `screening.css` 中將 `.stock-list` 更改為 `display: flex; flex-direction: column;`。
*   然後讓 `#screeningProgressArea` 與 `.empty-state` 套用 `flex: 1;`（或透過加入 `margin: auto 0;` 自動推擠），使它們在畫面中自動膨脹並利用外部的空間達成真正的視覺垂直置中。
