# Tailwind 與 Custom CSS 問答整理（2026-03-31）

## Q1. 目前 Tailwind 是否有共用元素（重複使用的相同元素）？

有，而且目前已經有一批可重用的共用元素。

### 已存在的全域共用元素（component-like）

定義位置主要在：

1. `app/static/css/components.css`
2. `app/static/css/input.css`（`@layer components` / `@layer utilities`）
3. `app/static/css/tabs.css`

共用元素範例（含實際使用次數）：

1. 按鈕系統
   - `.btn`：23 次
   - `.btn-primary`：6 次
   - `.btn-secondary`：6 次
   - `.btn-ghost`：12 次
   - `.btn-sm`：17 次
   - `.btn-icon`：12 次
2. 面板系統
   - `.panel`：6 次
   - `.panel-header`：6 次
   - `.panel-title`：6 次
3. 表單系統
   - `.select-input`：12 次
   - `.number-input`：9 次
4. 篩選區塊
   - `.filter-section`：9 次
   - `.filter-label`：11 次
5. 狀態工具類
   - `.is-hidden`：13 次
   - `.is-flex`：2 次
   - `.is-block`：0 次（目前未使用）
6. 新增中的 UI 共用類
   - `.ui-checkbox-card`：3 次
   - `.ui-focus-accent`：0 次（已定義，尚未套用）

除了全域共用類之外，也有 feature 內的重複類（例如 `.config-pill-btn`、`.timeframe-btn`、`.param-group`），但這些多數仍屬「模組內共用」，尚未完全收斂成全域 component。

---

## Q2. 是否有建立類似 component（例如 button component）？

有，且已經有「可集中修改」的雛形。

### 目前現況

1. `button component` 已存在
   - 核心基底：`.btn`
   - 變體：`.btn-primary`、`.btn-secondary`、`.btn-ghost`、`.btn-sm`、`.btn-icon`
   - 這代表未來改按鈕外觀時，已可優先改共用 class，而不是每個模板逐一修改。
2. `panel component` 與 `input component` 也已存在
   - `.panel*`、`.select-input`、`.number-input`
3. 仍有改善空間
   - 某些區塊仍以長 utility 字串或 feature-specific class 為主，尚未抽成全域可重用 component。

### 結論

你的專案不是「完全沒有 component」，而是「已經有一部分 component 化，尚未完全系統化」。

---

## Q3. 這個專案 Tailwind、Custom CSS 比例各占多少？

以下是本次量化方式與結果（以目前主專案 `app/` 為範圍，排除生成檔 `tailwind.output.css`）：

### 量化口徑 A：CSS 規則面（看樣式定義來源）

1. 目標 9 檔（你目前標示要收斂的檔案）
   - declaration lines：1060
   - `@apply` lines：159
   - Tailwind 化比例（以 `@apply` 計）：15.0%
   - Custom CSS 比例：85.0%
2. 全 `app` source CSS（13 檔）
   - declaration lines：1205
   - `@apply` lines：194
   - Tailwind 化比例：16.1%
   - Custom CSS 比例：83.9%

說明：這個口徑代表「樣式規則本體」仍以 custom CSS 為主。

### 量化口徑 B：模板 class 使用面（看畫面上 class 使用型態）

1. 掃描 `app/**/*.html|js|py` 的 class token
2. 結果：
   - utility token：1261（68.87%）
   - custom class token：570（31.13%）

說明：這個口徑代表「模板實際使用」已偏 Tailwind utility-first。

### 綜合判讀

1. 模板端已是 Tailwind 主導（約 69% utility）。
2. CSS 規則端仍是 custom 主導（約 84% custom）。
3. 目前屬於「混合架構」，不是純 Tailwind，也不是純傳統 CSS。

---

## Q4. 真的有必要完全 Tailwind 化嗎？

結論：不一定有必要「100% 完全 Tailwind 化」，比較建議 Tailwind-first + 白名單保留 custom CSS。

### 為什麼不一定要 100%

1. 你專案有大量高風險樣式
   - scrollbar 偽元素
   - pseudo-element 客製勾選樣式
   - 圖表互動與狀態 class 耦合
   - 部分 `!important` 用於覆蓋競爭優先級
2. 強行 100% 轉換，常見代價
   - 可讀性下降（模板 class 過長）
   - 回歸風險上升（尤其 Chart Modal / K 線 / RiskManagement 動態列）
   - 維護效率不一定更好

### 何時值得追求更高 Tailwind 純度

1. 團隊要建立完整 design system。
2. 有足夠自動化視覺回歸測試。
3. 願意投入一段時間清理 JS 產生 class 與樣式耦合。

### 對本專案的建議目標

1. 追求「可維護性最大化」，不是「Custom CSS 歸零」。
2. 原則：
   - 可 utility 化就轉
   - 重複規則抽 `@layer components`
   - 高風險規則白名單保留

---

## Q5. 這個專案 Tailwind CLI 與 PostCSS 的用處是什麼？

### 實際用處

1. Tailwind（作為 PostCSS plugin）
   - 根據 `tailwind.config.js` 的 `content` 掃描模板與腳本中使用的 class
   - 展開 `@tailwind base/components/utilities`
   - 處理 `@apply` 指令
2. PostCSS
   - 做整體建置管線 orchestration
   - 先解開 `@import`，再跑 Tailwind，再跑 Autoprefixer
3. Autoprefixer
   - 自動補瀏覽器前綴，提升相容性

### 目前設定（重點）

1. `package.json`
   - `build:css`: `postcss app/static/css/input.css -o app/static/css/tailwind.output.css`
   - `watch:css`: 同上加 `--watch`
   - `build:css:prod`: 同上加 `--env production`
2. `postcss.config.js` plugin 順序
   - `postcss-import`
   - `tailwindcss`
   - `autoprefixer`
3. `tailwind.config.js`
   - `content`: `./app/**/*.html`, `./app/**/*.js`, `./app/**/*.py`
   - 定義主題 tokens（colors/radius/font/transition）
4. `app/template/base.html`
   - 前端實際載入：`/static/css/tailwind.output.css`

---

## Q6. 目前產生 CSS 的流程是什麼？

可用下列流程理解：

1. 開發者編輯 `app/static/css/input.css` 與各 feature CSS、模板 class
2. 執行 `npm run build:css`（或 watch）
3. PostCSS pipeline 開始
   - `postcss-import`：先展開 input.css 內所有 `@import`
   - `tailwindcss`：展開 `@tailwind` 指令、依 content 掃描生成 utility、處理 `@apply`
   - `autoprefixer`：補前綴
4. 輸出單一檔案：`app/static/css/tailwind.output.css`
5. `base.html` 載入此輸出檔供整站使用

### Docker 啟動時的實際流程

1. `start_server.bat` 會先在臨時 Node 容器執行 `npm install && npm run build:css`
2. CSS 建置成功後再 `docker-compose up --build -d`

這代表：容器啟動前就會先確保 CSS 產物更新。

---

## 補充建議（可選）

1. 短期：擴大既有 component（btn/panel/input）覆蓋面，優先減少 feature 內重複 class。
2. 中期：把 `.config-pill-btn`、`.timeframe-btn`、`.param-group` 這類高頻 feature class 評估抽成全域 `@layer components`。
3. 長期：建立「可保留 custom CSS 白名單」與 guard test，避免為了 100% Tailwind 化而增加回歸風險。