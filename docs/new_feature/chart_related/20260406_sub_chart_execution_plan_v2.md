# K 線副圖功能實作執行計畫（v2）

**日期**：2026-04-06  
**基準文件**：`docs/new_feature/20260406_sub_chart_plan.md`  
**範圍**：
1. 任務一：副圖 VOL/RSI（含控制列、展開收合、pane 高度管理）
2. 任務二：開啟副圖後右側面板 scrollbar 延伸
3. 補充需求：全螢幕圖示替換、VOL/RSI 指標介紹內容替換

---

## 一、實作策略與分批目標

### Phase A：相容性升級
- 將 Lightweight Charts CDN 升級至 v5。
- 在 `chart_renderer.js` 建立 series 建立相容層，兼容 v5 `addSeries(definition, options, paneIndex)`。
- 目標：主圖 MA/BOLL 與現有 tooltip/crosshair 行為不退化。

### Phase B：狀態層與 Modal
- 擴充 `window.state.chartIndicators`：新增 `VOL`、`RSI`、`subChartOrder`。
- 新增全域旗標 `window.state.expandedSubChart`。
- 修改圖表管理 Modal：
  - 左側副圖項目啟用 `VOL`、`RSI`。
  - 新增副圖設定頁（VOL/RSI）與對應事件。
  - 新增主圖/副圖分類摺疊功能（`data-collapsed` + max-height transition）。
- 指標介紹內容改為 `docs/new_feature/volandrsi.md` 文案。

### Phase C：副圖渲染模組
- 新增 `chart_vol.js`：成交量 histogram 資料與顏色生成。
- 新增 `chart_rsi.js`：RSI(6/12/24) 計算、資料生成。
- 新增 `sub_chart_control_bar.js`：
  - overlay 控制列渲染與定位
  - 齒輪/關閉/展開收合交互
  - crosshair 數值即時更新

### Phase D：ChartController pane 管理
- 在 `chart_controller.js` 新增：
  - 副圖渲染流程（依 `subChartOrder`）
  - pane index 指派與重建
  - 展開/收合單副圖模式
  - 副圖開關時 chart-wrapper 高度同步
- 保持主圖功能：MA/BOLL、pattern annotation、tooltip、axis 設定。

### Phase E：版面與全螢幕
- 全螢幕目標改為 `.chart-container`。
- 全螢幕/退出圖示替換為指定樣式（Pasted Image / Pasted Image2）。
- `.content-area` 改為 `overflow-y: auto`，使副圖向下延伸時可捲動。
- 長股名截斷：標題字串 ellipsis + title 顯示完整名稱。

### Phase F：驗證與收斂
- 重建 CSS：`npm run build:css`。
- 執行可行自動測試（至少既有前端守門測試與相關 pytest）。
- 回報自動測試結果與剩餘手動驗證清單。

---

## 二、最大風險、失敗情境、替代方案

### 最大風險
- **LW v5 升級風險**：若現有 `addLineSeries/addCandlestickSeries` 與 crosshair 行為在 v5 版本上不完全相容，可能導致 MA/BOLL 或 tooltip 異常。

### 可能失敗情境
1. pane 重建時未正確清除舊 series，造成 overlay 數值讀取錯誤或重複 series。
2. 副圖展開/收合時，pane index 重排導致控制列定位偏移。
3. chart-wrapper 高度同步與 ResizeObserver 互相觸發，造成 resize 抖動。
4. 全螢幕切換目標改為 `.chart-container` 後，圖表重算尺寸時機不對，導致 canvas 空白或比例錯誤。

### 替代方案
- **替代方案 A（低風險）**：若 v5 pane API 對現有功能影響過大，改回 v4 多 chart 實例方案（主圖 + VOL chart + RSI chart），以時間軸同步機制替代 native pane。
- **替代方案 B（漸進式）**：先只交付 VOL 副圖與右側 scrollbar，RSI 與展開功能第二階段交付，降低一次性變更範圍。

---

## 三、目前識別的需求疑點（先按預設假設實作）

1. `volandrsi.md` 文案中描述 VOL 顏色為「漲紅跌綠」，但基準計畫中規範為「跟隨主圖 bull/bear 顏色（預設漲綠跌紅）」。
   - **暫定假設**：僅替換「指標介紹文字」，實際渲染顏色仍跟隨主圖設定（避免與現有色彩系統衝突）。
2. 全螢幕圖示參考圖為位圖（Pasted Image / Pasted Image2），無向量路徑規格。
   - **暫定假設**：以等價語意 SVG 重新繪製，保持外觀與方向一致。
3. pane 拖拉後的控制列定位更新事件，LW v5 無直接「pane resized」回呼。
   - **暫定假設**：以 chart 更新週期（crosshair move + resize + re-render）觸發重新定位。

---

## 四、交付準則

- 不破壞現有 MA/BOLL、十字線、tooltip、型態標註、坐標軸設定。
- VOL/RSI 可在 Modal 中開關、保存至 localStorage、重整後還原。
- 開啟副圖時右側可縱向捲動，左側 sidebar 行為維持不變。
- 全螢幕覆蓋完整 `.chart-container`（含 header + 主副圖）。
