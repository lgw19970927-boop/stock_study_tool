# 20260321 股票篩選頁面與圖表優化 & Bug 修復計畫書

**日期**：2026-03-21  
**負責人**：開發工程師  
**涉及模組**：`App/Feature/Screening/`（前端全部）、`App/Feature/Screening/indicators/service.py`（後端小改）

---

## 一、任務總覽

| # | 類別 | 任務說明 | 影響檔案 |
|---|------|----------|----------|
| 1 | UI 重設計 | 分析時間範圍改為 3 個 Radio Button 選項 | screening_fragment.html, screening.html, time_range_block.js, screening.css, indicators/service.py |
| 2(1) | 功能強化 | 篩選結果列表欄位排序（股票代碼/現價/漲跌幅/成交量） | screening_fragment.html, screening.html, screening.js, screening.css |
| 2(2) | UI 調整 | 「停止篩選」按鈕移至進度條右側 | screening_fragment.html, screening.html |
| 2(3) | UI 修正 | 篩選前/中隱藏 Scrollbar，進度條與空白狀態置中 | screening.css, screening.js |
| 3 | Bug 修復 | 圖表管理設定後型態標示縮放失效 | chartSettingsModal.js |
| 4 | Bug 修復 + 新功能 | 十字線設定後切週期異常 + 雙擊開啟懸浮窗 | chartController.js |
| 5 | 資料新增 | 新增「測試指標+型態功能」預設策略 | screening.js |

---

## 二、任務詳細說明

### 任務 1：分析時間範圍 UI 重設計

#### 需求說明

將原本 7 個時間快捷按鈕（1D/1W/1M/3M/6M/1Y/自訂）整個移除，改以 **3 個垂直排列的 Radio Buttons** 取代：

| 選項 | 說明 | 展開 UI |
|------|------|---------|
| 今天 | 以今天作為篩選截止日 | 無 |
| 自訂特定時點 | 選定某一特定日期作為截止日 | 展開單一 Date Picker（在選項正下方） |
| 自訂分析時間範圍（測試用） | 手動指定分析起迄日；待型態功能測試完畢後刪除 | 展開起始日 + 結束日 Date Picker（預設 2025/01/01 ~ 2025/12/31） |

#### 排版示意

```
╔══════════════════════════════════╗
║  ✦ 分析時間範圍                  ║
║  時間設定                        ║
║                                  ║
║  ● 今天                          ║
║                                  ║
║  ○ 自訂特定時點                  ║
║    ┌──────────────────────┐       ║
║    │ 日期選擇器            │       ║
║    └──────────────────────┘       ║
║                                  ║
║  ○ 自訂分析時間範圍 [測試用]      ║
║    開始日期 [2025/01/01]          ║
║    結束日期 [2025/12/31]          ║
╚══════════════════════════════════╝
```

#### API 狀態對應

| 選項 | `time_range` | `analysis_start_date` | `analysis_end_date` |
|------|-------------|----------------------|-------------------|
| 今天 | `null` | `''` | 今日 YYYY-MM-DD |
| 自訂特定時點 | `null` | `''` | 所選日期 |
| 自訂分析時間範圍 | `null` | 所選開始 | 所選結束 |

> **後端補丁**：`resolve_analysis_dates` 新增「只有 end_date 沒有 start_date」的情境處理，自動往前推算 365 天作為 start_date，確保後端仍有足夠資料計算指標。

---

### 任務 2(1)：篩選結果欄位排序

#### 需求說明

- **可排序欄位**：股票代碼、現價、漲跌幅、成交量（4 欄）
- **三態切換**：初始 ⇅ → 第一次點擊 ↓（降冪）→ 第二次 ↑（升冪）→ 第三次 ⇅（取消排序，回原序）
- **欄位更名**：「成交額」→「成交量」（DB 確認無 turnover/amount 欄位，只有 `volume`）
- **純 client-side 排序**，不重新呼叫 API

#### 排版示意（富途牛牛風格）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 股票代碼 ⇅  公司名稱         現價 ⇅    漲跌幅 ⇅   成交量 ⇅   篩選標籤  │
│                                                                             │
│  點擊欄位標題 → ↓ 降冪 → ↑ 升冪 → ⇅ 取消                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 技術實作

- HTML：sortable 欄位加 `data-sort` 屬性與 `.sort-icon` span
- JS：`ScreeningPage._sortState`、`_initSortHeaders()`、`_sortStocks()`、`_updateSortIcons()`
- CSS：`.sortable`（cursor:pointer）、`.sorted`、`.sort-icon` 樣式

---

### 任務 2(2)：停止篩選按鈕移至右側

#### 需求說明

修改進度條區塊的版面：左側為進度資訊 (`flex:1`)，右側為「停止篩選」按鈕 (`flex-shrink:0`)，並排顯示。

#### 排版示意

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ⏳ 正在篩選指標...    找到符合：208 支              [■ 停止篩選]          │
│  ████████████████░░░░░░░░░░░░                                              │
│  已分析 877 / 12,964 支                                        7%          │
└────────────────────────────────────────────────────────────────────────────┘
```

---

### 任務 2(3)：篩選前/中隱藏 Scrollbar 並置中

#### 需求說明

- **篩選前**（顯示放大鏡空白狀態）&**篩選中**（進度條跑動）：
  - `#stockList` 完全隱藏垂直捲軸（`overflow-y: hidden`）
  - 內部提示圖文 / 進度條須在區塊內**水平 + 垂直置中**
- **篩選後**（有結果或無結果）：恢復現有的 `overflow-y: auto`（scrollbar 正常顯示）

#### 技術實作

- 使用 CSS class 切換：`state-idle`（篩選前）、`state-progressing`（篩選中）、state 清除（篩選後）
- JS：`_showProgress()` 加 class；`_renderResults()` 清除 class；`init()` 初始加 `state-idle`

---

### 任務 3：型態標示縮放失效 Bug 修復

#### 根本原因

`chartSettingsModal.apply()` 中，`applyAxisSettings` 呼叫 `chart.applyOptions({ rightPriceScale: { mode } })` 可能觸發 LightweightCharts 內部多輪 layout 重算。目前僅使用單層 `requestAnimationFrame` 來重訂閱縮放事件，若 RAF 在第二輪 layout 更新前執行，新訂閱隨即又被 LW 內部清除，導致 zoom handler 失效，型態標示無法跟著縮放移動。

#### 修復方案

`chartSettingsModal.js apply()` 中的型態標示重訂閱改用**雙層巢狀 RAF**：

```js
// 修復前（單層 RAF）：
requestAnimationFrame(() => {
    window.PatternAnnotation._subscribeRedraw();
    window.PatternAnnotation.render();
});

// 修復後（雙層 RAF）：
requestAnimationFrame(() => {
    requestAnimationFrame(() => {
        if (window.PatternAnnotation) {
            window.PatternAnnotation._subscribeRedraw();
            window.PatternAnnotation.render();
        }
    });
});
```

---

### 任務 4：十字線設定後切換週期異常 + 雙擊開啟懸浮窗

#### Bug 4a：根本原因

`_applyTooltipMode('hidden')` 使用 `LW.CrosshairMode.Hidden ?? 3` 作為 fallback。但 LightweightCharts v4 並無 `CrosshairMode.Hidden`（只有 `Normal=0`, `Magnet=1`），導致 `chart.applyOptions({ crosshair: { mode: 3 } })` 傳入無效 enum，LW 內部進入異常渲染狀態。此後切換 timeframe 觸發 `setData` 時，座標軸初始化行為異常，造成「週K 圖變奇怪」的問題。

#### 修復方案

改用 `vertLine.visible / horzLine.visible` 控制十字線顯隱，取代 `mode` enum：

```js
if (mode === 'hidden') {
    this.chart.applyOptions({
        crosshair: {
            vertLine: { visible: false },
            horzLine: { visible: false }
        }
    });
} else {
    this.chart.applyOptions({
        crosshair: {
            mode: LW?.CrosshairMode?.Normal ?? 0,
            vertLine: { visible: true },
            horzLine: { visible: true }
        }
    });
}
```

#### Bug 4b：雙擊開啟懸浮窗

在 `chartController.js init()` 中為圖表容器加入 `dblclick` 監聽器：
- 觸發後呼叫 `_applyTooltipMode('floating')`
- 同步更新 `ChartSettingsModal._generalConfig.tooltipMode = 'floating'`
- 呼叫 `ChartSettingsModal.saveToLocalStorage()` 持久化
- 若彈窗已開啟，同步 `#generalTooltipMode` dropdown 顯示值

---

### 任務 5：新增「測試指標+型態功能」預設策略

在 `screening.js` 的 `window.state.savedStrategies` 陣列中新增第三筆：

| 欄位 | 值 |
|------|-----|
| 名稱 | 測試指標+型態功能 |
| 市場 | 上市 / 上櫃 / 興櫃 |
| 頻率 | 每日 |
| 指標 | MA-日K: MA20 > MA50 |
| 型態 | 盤整區、W底、三角收斂 |
| 敏感度 | 40% |
| 週期 | 8 ~ 150 根（1D） |

---

## 三、決策記錄

| 決策點 | 結論 | 理由 |
|--------|------|------|
| 「今天」/「特定時點」只送 end_date | ✅ 後端自動往前推 365 天 | 指標週期由後端依需求決定，不寫死 start_date |
| 成交額 → 成交量 | ✅ 直接改欄位名稱顯示 volume 數值 | DB 只有 `volume`，無 `turnover`/`amount` |
| 雙擊方式 | ✅ 標準 `dblclick` 事件 | 符合桌面端操作習慣 |
| 排序實作 | ✅ 純 client-side，不重打 API | 資料已在前端，無需再呼叫後端 |
| 型態標示縮放修復 | ✅ 雙層 RAF | 確保 LW 完成所有 layout 後才重訂閱 |
| 十字線隱藏修復 | ✅ vertLine/horzLine visible | 避免使用不存在的 CrosshairMode.Hidden enum |

---

## 四、驗證步驟

1. **Task 1**：開啟篩選頁面 → 確認 3 個 radio button 垂直排列 → 點選「自訂特定時點」→ 日期選擇器展開在選項正下方 → 切換「自訂分析時間範圍」→ 預設日期 2025/1/1 ~ 2025/12/31 → 執行篩選確認 API 收到正確日期
2. **Task 2(1)**：執行篩選後 → 點擊「現價」標題 → ↓ 降冪 → 再點 → ↑ 升冪 → 再點 → ⇅ 取消
3. **Task 2(2)**：篩選執行中 → 「停止篩選」按鈕顯示在進度條右側
4. **Task 2(3)**：篩選前/中 → 右側 stock-list 區無 scrollbar，內容置中；篩選後 → scrollbar 正常出現
5. **Task 3**：開啟圖表管理 → 只改顏色（不換圖表類型）→ 確定 → 拖拉/縮放圖表 → 型態標示跟著移動
6. **Task 4a**：十字線設定改為「關閉」→ 確定 → 從日K切成週K → 圖表正常渲染
7. **Task 4b**：雙擊圖表 → 懸浮窗開啟；若此時打開圖表管理常規設定，十字線下拉應顯示「懸浮窗」
8. **Task 5**：切換到「我的策略」Tab → 找到「測試指標+型態功能」→ 確認描述含 MA20>MA50 + 盤整區/W底/三角收斂

---

## 五、補充說明（使用者補充 2026-03-21）

- 任務 2(1) 新增「漲跌幅」欄位也需要排序功能（共 4 個可排序欄位）
- 任務 5 型態改為：盤整區、W底、三角收斂三個型態（patterns: ['consolidation', 'w_bottom', 'triangle']）
