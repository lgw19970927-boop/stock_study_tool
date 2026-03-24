# 完整實作計畫書

**建立日期**：2026-03-24  
**執行順序**：Phase A（Bug 修正）→ Phase B（Tailwind CSS 遷移）→ Phase C（Feature 架構調整）  
**原則**：各 Phase 完成並經使用者確認後再進入下一 Phase，不得並行執行

---

## Phase A：K 線圖 Bug 修正

### A-1：Bug 2 — 周 K 線破圖（最小、獨立，先行）

**修改檔案**：`App/Feature/Screening/chartController.js`  
**函數**：`_applyTooltipMode(mode)`

**問題**：`mode === 'hidden'` 時只隱藏十字線「線條」，未隱藏座標軸「數值標籤」。  
隱形十字線在稀疏的周 K 間移動時，label 仍強迫時間軸嘗試內插不存在的日期，導致 X 軸版面崩潰。

**修改**：補上 `labelVisible: false`
```js
crosshair: {
  vertLine: { visible: false, labelVisible: false },
  horzLine: { visible: false, labelVisible: false }
}
```

**驗證**：
1. 圖表管理 → 十字線設為「隱藏」
2. 切換至 1W 頻率
3. 確認 K 線間距正常、無擠壓破圖

---

### A-2：Bug 3 — 篩選結果區內容未垂直置中（獨立，可與 A-1 並行）

**修改檔案**：`App/Feature/Screening/screening.css`

**問題根因**：`#stockList`（.stock-list）是 `display: block`，子元素的 `flex: 1` 無效，  
無法填滿父容器高度，導致置中僅在「字高」內置中，視覺上貼頂。  
`#screeningProgressArea` JS 側以 `display: flex` 顯示（已確認 `screening.js L527`）。

**修改**：
```css
/* Bug3 Fix: 讓 #stockList 成為 flex 容器，子元素可 flex: 1 撐高 */
#stockList {
    display: flex;
    flex-direction: column;
}
/* 空狀態與進度條均 flex: 1，配合自身 align-items/justify-content 達成垂直置中 */
#stockList .empty-state,
#screeningProgressArea {
    flex: 1;
}
```

**驗證**：
1. 篩選前拉高結果區塊 → 放大鏡圖示垂直置中
2. 執行篩選中拉高結果區塊 → 進度條垂直置中
3. 篩選結果顯示時捲軸正常運作

---

### A-3：Bug 1 — 型態標示框 X 軸偏移（最複雜，在 A-1/A-2 後）

**修改檔案**：`App/Feature/Screening/function_block/pattern_annotation.js`

**問題根因（三層）**：
1. 開啟左側價格軸後，LW 的 `timeToCoordinate()` 回傳座標不含左軸寬度，SVG 從 x=0 起算造成固定像素偏移，縮放後偏移量代表的 K 線數量改變，因此框會漂移
2. 框的左右邊界僅對齊 K 線中心，未包覆完整 K 線寬度
3. LW 不提供 Y 軸拖曳原生事件，拖曳 Y 軸後 SVG 不重繪，框凍結在舊位置

**修改方向**：

#### A-3a：左側座標軸偏移量
在 `render()` 中計算 `_leftOffset`，所有繪圖方法的 X 座標均加上此值：
```js
this._leftOffset = 0;
try { this._leftOffset = chart.priceScale('left').width() || 0; } catch (_) {}
```

#### A-3b：K 線半寬 Padding
在 `render()` 中計算 `_barHalfWidth`，`_drawRect` 的左邊界往左延伸、右邊界往右延伸：
```js
// 從後往前找相鄰可見的兩根 K 線計算間距
this._barHalfWidth = Math.abs(xb - xa) / 2;
```

#### A-3c：Y 軸拖曳事件補強
新增 `_subscribeYAxisDrag()` 方法，在 `_subscribeRedraw()` 末尾呼叫：
- `mousedown` 啟動 RAF 拉環，強制持續重繪
- `mouseup` 立即 `cancelAnimationFrame` 終止，避免效能浪費
- 每次重新訂閱前先 `removeEventListener` 清除舊監聽器

#### A-3d：時序確認
`chartSettingsModal.js` 的雙層 RAF 已確認正確：  
外層 RAF 等待圖表視圖重建，內層 RAF 再呼叫 `PatternAnnotation._subscribeRedraw()` + `render()`。  
`applyAxisSettings()` 在雙層 RAF 前同步執行，因此 `render()` 時已能讀到正確的左側軸寬度，**無需修改 `chartSettingsModal.js`**。

**驗證**：
1. 開啟左側價格軸 → 型態框位置不偏移
2. 縮放 K 線 → 框死鎖在同一時間範圍
3. 上下拖曳 Y 軸 → 框即時跟隨重繪
4. 框左右邊緣包住完整 K 線（含影線），不僅對齊中心

---

## Phase B：Tailwind CSS 遷移

**執行前提**：Phase A 全部完成並確認

### B-0：環境準備
1. 專案根目錄 `npm init -y`
2. `npm install -D tailwindcss postcss autoprefixer`
3. 建立 `tailwind.config.js`（含全部 CSS 變數對應至 theme extension）
4. 建立 `postcss.config.js`
5. 建立 `App/Static/css/input.css`（Tailwind 入口 + @import variables/animations）
6. `package.json` 加入 `"build:css"` script
7. **Docker**：採多階段建構（Node.js build stage → Python stage COPY），更新 `Env/fastapi/Dockerfile`
8. `tailwind.output.css` 不納入版控（加入 `.gitignore`）
9. 更新 `base.html`：移除 CDN `<script>`, 改 `<link>` 引入 output CSS

### B-1：大檔案拆分（Phase B 中優先）
- `styles.css`（1815 行）→ 8 個檔案至 `App/Static/css/`
- `chart-settings-modal.css`（1140 行）→ 6 個檔案至 `App/Feature/Screening/`
- 詳細拆分清單見 `Spec/refactor_code/20260322_css_tailwind_migration_plan.md`

### B-2～B-4：Tailwind 遷移
依低風險到高風險順序，詳見遷移計畫書。

---

## Phase C：Feature 架構調整

**執行前提**：Phase A + Phase B 全部完成並確認

### C-1：data_sync → DataManagement 改名
1. `App/Feature/data_sync/` → `App/Feature/DataManagement/`
2. 建立 `sync/` 子目錄，移入市場資料同步腳本（`market_data.py` 等）
3. 建立 `backup/` 子目錄，移入資料庫備份腳本（`backup_mysql.py` 等）
4. `db.py` 留在 `DataManagement/` 根目錄
5. **全面掃描 import 路徑**（高風險）：
   - `from App.Feature.data_sync.db import ...` → `from App.Feature.DataManagement.db import ...`
   - `from App.Feature.data_sync.data_sync.backup_mysql import ...` → `from App.Feature.DataManagement.backup.backup_mysql import ...`
   - `Env/data_sync/scheduler.py` 中的所有引用
   - 所有 `app.py` / `routes.py` 的 import

### C-2：Screening 內部重構
1. 建立 `App/Feature/Screening/chart/` 目錄
2. 移入：`chartController.js`、`chartSettingsModal.js`、`chart-settings-modal.css`
3. 移動 `strategyManager.js` → `App/Feature/Screening/function_block/strategyManager.js`
4. **全面掃描 HTML 中 JS/CSS 引用路徑**：
   - `screening.html` 與 `screening_fragment.html` 改為 `/feature/Screening/chart/chartController.js` 等新路徑
   - FastAPI StaticFiles 預設遞迴掛載子目錄，無需額外設定
5. `screening.js` 若有對 `chartController.js` 的動態引用一同更新

---

## 驗證矩陣

| Phase | 修改對象 | 驗證方式 | 通過條件 |
|-------|---------|---------|---------|
| A-1 (Bug2) | `chartController.js` | 瀏覽器手動 | 1W 圖表不破圖 |
| A-2 (Bug3) | `screening.css` | 瀏覽器手動 | 空狀態+進度條垂直置中 |
| A-3 (Bug1) | `pattern_annotation.js` | 瀏覽器手動 | 縮放不偏移、Y 軸拖曳即時跟隨、框完整包覆 K 線 |
| B-0 | Dockerfile + package.json + base.html | `npm run build:css` + Docker build | CSS 成功產出、頁面外觀不變 |
| B-1 | 8+6 個 CSS 拆分檔案 | 瀏覽器三頁面視覺比對 | 視覺與重構前完全相同 |
| B-2~4 | 各 CSS 檔案 + HTML | 瀏覽器三頁面互動測試 | 互動狀態、dark theme 正確 |
| C-1 | Python 模組改名 | Docker 啟動 + Python import | 無 ImportError |
| C-2 | Screening JS/CSS 搬移 | 瀏覽器全功能 | 圖表、設定、型態標示正常 |
