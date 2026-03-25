# K 線圖設定功能 — Bug Fixes 規格書
> 建立日期：2026-03-17　　最後更新：2026-03-17（加入討論紀錄與決策說明）

---

## 附件說明
附有多張截圖作為 UI 排版與預期行為的視覺參考。

---

## 🛠️ Bug Fixes

---

### Bug 1：形態辨識 (Feature C) 的三角收斂繪製錯誤

**影響檔案：** `function_block/pattern_annotation.js`

**目前狀況：**
三角收斂的 K 線圖框選／畫線邏輯有誤，僅畫出單條折線穿越所有極值點，無法呈現收斂三角形的視覺效果。【原圖 p0，修改後應為 p1】

**預期行為：**
三角收斂的上下邊界線須正確貼合 K 線的高低點轉折，畫出如參考圖所示的收斂三角形（上方下降趨勢線 + 下方上升趨勢線）。

**實作邏輯（已確認）：**
- 為 `triangle` 型態單獨實作 `_drawTriangle(svg, pattern, slice, timeScale, candleSeries)`
- 算法：
  - 找出所有**局部峰值**（local peaks）→ 連接第一個與最後一個峰值 → 畫上方下降線
  - 找出所有**局部谷值**（local valleys）→ 連接第一個與最後一個谷值 → 畫下方上升線
  - 使用兩個獨立的 SVG `<line>` 元素，顏色 `#e8d5a3`，`stroke-width: 1.5`
- 在 `_drawPolyline` 中偵測 `pattern.name === 'triangle'` 時，轉呼叫 `_drawTriangle`

**Fallback 策略（已確認）：**
- 峰值 ≥ 2 且谷值 ≥ 2 → 正常畫兩條趨勢線
- 峰值 < 2 但谷值 ≥ 2 → 只畫下方支撐線（單線）
- 谷值 < 2 但峰值 ≥ 2 → 只畫上方阻力線（單線）
- 兩者皆 < 2 → fallback 降級為矩形框（`_drawRect`）

---

### Bug 2：顯示指標按鈕功能與連動優化

**影響檔案：** `screening_fragment.html`、`screening.html`、`screening.js`、`chartController.js`

**目前狀況：**
現有的指標圖樣按鈕為純 icon 按鈕，功能與狀態回饋不清晰。

**預期行為：**
- 將按鈕改造為類似「型態標註開關」的 Toggle 狀態按鈕
- 按鈕文字顯示「顯示/關閉指標」
- 使用現有 `.toggle-switch.toggle-switch-small` 樣式以維持 UI 一致性

**已確認的行為決策：**
1. **切換股票時**：完全保留使用者當下的指標開關狀態（不自動重設）
2. **toggle 與 modal 的同步**：`ChartSettingsModal.apply()` 執行後，若有任何 `isGlobalEnabled=true` 的指標，自動更新 toggle 的視覺狀態
3. **機制**：`toggleIndicatorsVisibility()` 切換 `isIndicatorsVisible` flag，呼叫 `renderIndicatorsFromState()`；OFF 時清空畫布指標但不修改 modal 勾選狀態

---

### Bug 3：型態標註文字與 K 線重疊

**影響檔案：** `function_block/pattern_annotation.js`

**目前狀況：**
W底、頭肩底等標註文字與 K 線圖重疊，影響閱讀。【如圖 p3】

**預期行為：**
根據型態類別調整文字的 Y 軸偏移：

| 型態 | 標籤位置 | 偏移方向 |
|------|---------|----------|
| `head_shoulders_top` | 最高 K 線的 high 以上 | 上移 14px |
| `w_bottom` | 最低 K 線的 low 以下 | 下移 14px |
| `head_shoulders_bottom` | 最低 K 線的 low 以下 | 下移 14px |
| `triangle` | 上方趨勢線起始點上方 | 上移 10px |
| 其他（如盤整區） | 維持現有邏輯 | `firstY - 6` |

---

### Bug 4：調色盤視窗 (Color Dialog) 風格跑版

**影響檔案：** `templates/ColorPickerTemplate.js`、`chartSettingsModal.js`、`chart-settings-modal.css`

**目前狀況：**
點擊「定義自訂色彩(D) >>」後，會呼叫系統原生 color picker，樣式脫離深色主題控制。

**預期行為：**
展開後需維持與彈窗完全一致的深色 UI 風格（已決策：**採用自製色彩選擇器，不使用原生 dialog**）。

**實作邏輯（已確認）：**
- 移除 `<input type="color">` 原生選色器
- 新增 `<div id="customColorPanel">` 可展開面板（預設隱藏），點擊「定義自訂色彩(D) >>」切換顯示
- 面板內容：
  - `<canvas id="colorSpectrumCanvas">` — 色彩飽和度/明度漸層
  - `<canvas id="hueSliderCanvas">` — 色相條
  - RGB 數值輸入欄（R/G/B）+ 顏色預覽色塊
  - `<button id="btnAddCustomColor">新增自訂色彩(A)</button>`
- 所有樣式使用 `var(--bg-elevated)` 等 CSS 變數確保深色主題一致
- **Canvas 初始化時機（Lazy Init）**：`colorPickerModal` 為 `display:none` 時 canvas 尺寸為 0，首次呼叫 `openColorPicker()` 時才執行 `initCustomColorPanel()`，用 `_colorPanelInited` flag 防止重複初始化

---

### Bug 5：視窗無法自由移動

**影響檔案：** `chart-settings-modal.css`、`chartSettingsModal.js`

**目前狀況：**
「圖表管理」和「色彩設定」視窗為置中 overlay modal，無法拖曳移動。

**預期行為：**
兩個視窗均可自由拖曳。

**實作邏輯（已確認）：**
- CSS：
  - overlay 背景保留半透明視覺效果，但加上 `pointer-events: none` 讓點擊穿透
  - 容器改為 `position: absolute`，初始位置由 JS 設定在畫面中央
- JS：新增 `_makeDraggable(container, handleEl)` 通用方法
  - `mousedown` on handle → 紀錄偏移量
  - `mousemove` on document → 更新 `container.style.left/top`
  - `mouseup` on document → 停止拖曳
- 套用對象：圖表管理（拖曳把手為 `.chart-modal-header`）、色彩設定（拖曳把手為 `.color-picker-header`）
- **已決策：移除「點擊背景關閉」功能**，避免拖曳時誤觸關閉

---

### Bug 6：指標清單的點擊觸發邏輯錯誤

**影響檔案：** `templates/ChartSettingsModalTemplate.js`、`chartSettingsModal.js`

**目前狀況：**
指標清單中，點擊整行 `<label>` 會觸發 checkbox 切換，勾選與頁面切換事件互相干擾。

**預期行為：**
- 精確點擊 **checkbox 本身** → 切換勾選狀態（啟用/停用指標）
- 點擊 **行內其他區域**（名稱文字、空白處）→ 僅切換右側設定頁，**不改變勾選狀態**

**已確認的行為決策：**
- 點擊**未勾選**指標行的非 checkbox 區域 → 導航到設定頁**但維持未勾選**（預覽模式）

**實作邏輯：**
- 將 `<label class="indicator-item">` 改為 `<div class="indicator-item">`（切斷 label 對 checkbox 的原生傳播）
- 在 `.chart-modal-sidebar` 上用事件委派（event delegation）：
  - 若 `e.target` 是 `input[type="checkbox"]` → 呼叫 `e.stopPropagation()`，處理 `isGlobalEnabled` 切換與重渲染
  - 否則 → 設定 `_renderTarget`，呼叫 `renderSettings()` 顯示對應設定頁

---

## 決策紀錄

| 議題 | 決策 |
|------|------|
| Bug 4 自訂色彩展開方式 | 自製 Canvas 內嵌色彩選擇器，不使用系統 dialog |
| Bug 5 拖曳後點擊外部行為 | 移除點擊背景關閉功能 |
| Bug 6 未勾選指標的點擊 | 導航但維持未勾選（預覽模式） |
| Bug 2 切換股票後 toggle 狀態 | 保留使用者當下狀態，不自動重設 |
| Bug 1 三角收斂 fallback | 單邊不足畫單線，兩邊皆不足降級矩形框 |
