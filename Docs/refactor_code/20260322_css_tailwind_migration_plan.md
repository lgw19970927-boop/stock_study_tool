# CSS Tailwind 遷移重構計畫(Finished)

**建立日期**：2026-03-22  
**對象**：App/Static/css/styles.css、App/Feature/ 下所有 CSS 檔案  
**策略**：漸進式混合架構（Tailwind + 保留必要 Custom CSS）

---

## 一、現況分析

### 1.1 現有 CSS 檔案清單

| 檔案路徑 | 行數 | 是否超過 1000 行 |
|---|---|:---:|
| `App/Static/css/styles.css` | 1815 | ✅ 需拆分 |
| `App/Feature/Screening/chart-settings-modal.css` | 1140 | ✅ 需拆分 |
| `App/Feature/Screening/screening.css` | 390 | — |
| `App/Feature/RiskManagement/risk_management.css` | 346 | — |
| **總計** | **3691** | |

### 1.2 現有 Tailwind 使用情形

`base.html` 已引入 Tailwind CDN，header 區塊已使用 Tailwind utility classes（`flex items-center gap-2 px-4` 等）。  
但所有 HTML 模板的 **content 區域**仍使用自訂 CSS class，尚未導入 Tailwind utilities。

```html
<!-- base.html 目前引入方式（CDN，無法自訂 config） -->
<script src="https://cdn.tailwindcss.com"></script>
```

### 1.3 自訂 CSS 特性分析

**無法直接用 Tailwind utilities 替代（必須保留 Custom CSS）**：
- CSS Custom Properties（`--bg-primary`、`--accent-primary` 等 40+ 設計 token）
- webkit scrollbar 偽元素（`::-webkit-scrollbar`、`::scrollbar-thumb` 等）
- CSS Keyframe 動畫（`@keyframes spin`、`fadeIn`、`slideUp`）
- 複雜動態 grid（`grid-template-columns: minmax(110px,1.5fr) 72px...`）
- 自訂 checkbox / radio 偽元素（`::before`、`::after`）
- `color-mix()`、`backdrop-filter`、`-webkit-background-clip: text`
- Canvas 色板選擇器定位邏輯（`chart-modal-color-picker`）
- K 線圖浮動 Tooltip（`chart-tooltip`）、ITB 指標控制列（`.itb-row`）

**適合遷移至 Tailwind utilities 的項目**：
- 大量重複的 `display: flex; align-items: center; gap: X` 排版
- 常見 padding / margin / font-size / border-radius
- 簡單的 hover / focus pseudo-class 狀態
- 常見 width / height / overflow 設定
- 顯示/隱藏（`hidden`、`block`、`flex`）

---

## 二、可行性評估

### 2.1 遷移策略選擇

| 策略 | 說明 | 評估 |
|---|---|:---:|
| 全量替換（純 Tailwind） | 捨棄全部 custom CSS，HTML 大規模改寫 | ❌ 風險過高、工時龐大 |
| 漸進式混合架構 | Tailwind utilities + 保留必要 custom CSS | ✅ **推薦** |
| 維持現狀 + 僅拆分 | 只做 Phase 1 拆分，不遷移 Tailwind | ⚠️ 可作為最小可行方案 |

**推薦採用「漸進式混合架構」**：
- 建立正式 Tailwind CLI 建構環境（取代 CDN）
- 將現有 CSS 變數對應至 `tailwind.config.js` theme extension
- HTML 模板以 Tailwind utilities 替代重複的 layout patterns
- 無法 Tailwind 化的特殊樣式（scrollbar、animation、canvas）保留為 custom CSS

### 2.2 風險評估

| 風險項目 | 程度 | 說明 |
|---|---|:---:|
| HTML 模板大規模修改 | 🔴 高 | 每個元素需添加 Tailwind classes，工時大 |
| CSS 變數相容性 | 🟡 中 | 需建立 tailwind.config.js 對應 |
| 功能視覺迴歸 | 🟡 中 | 需完整測試各頁面 UI |
| JS 依賴 CSS class 名稱 | 🟡 中 | 部分 JS 使用 querySelector 依賴 class 名稱 |
| CDN → CLI 建構流程 | 🟢 低 | 需加入 Node.js + PostCSS 環境 |

---

## 三、執行計畫

### Phase 0：環境準備

**目標**：建立正式 Tailwind CLI 建構環境，取代目前 CDN 引入

**步驟**：
1. 在專案根目錄建立 `package.json`（`npm init -y`）
2. 安裝依賴：`npm install -D tailwindcss postcss autoprefixer`
3. 建立 `tailwind.config.js`，將現有 CSS 變數對應至自訂主題：

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App/**/*.html", "./App/**/*.js"],
  theme: {
    extend: {
      colors: {
        'bg-primary':   '#0d1117',
        'bg-secondary': '#161b22',
        'bg-tertiary':  '#21262d',
        'bg-elevated':  '#1c2128',
        'bg-hover':     '#30363d',
        'accent-primary':   '#00d4aa',
        'accent-secondary': '#7c3aed',
        'text-primary':   '#f0f6fc',
        'text-secondary': '#8b949e',
        'text-muted':     '#6e7681',
        'border-color':   '#30363d',
        'color-success':  '#3fb950',
        'color-danger':   '#f85149',
        'color-warning':  '#d29922',
        'color-info':     '#58a6ff',
      },
      borderRadius: {
        'sm': '6px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['SF Mono', 'Fira Code', 'monospace'],
      },
      transitionDuration: {
        'fast': '150ms',
        'base': '250ms',
        'slow': '350ms',
      },
    },
  },
  plugins: [],
}
```

4. 建立 `postcss.config.js`
5. 建立 `App/Static/css/input.css` 作為 Tailwind 入口：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
/* 保留必要的 Custom CSS（從拆分後的 variables.css、animations.css 引入） */
@import "./variables.css";
@import "./animations.css";
```

6. 加入 npm build script：`"build:css": "postcss App/Static/css/input.css -o App/Static/css/tailwind.output.css"`
7. 更新 Docker 建構流程（`Env/fastapi/Dockerfile`），加入 CSS 建構步驟
8. 更新 `base.html`：移除 CDN `<script src="https://cdn.tailwindcss.com">`，改為 `<link rel="stylesheet" href="/static/css/tailwind.output.css">`

---

### Phase 1：大檔案拆分（建議優先執行）

> 此 Phase 可獨立先行完成，不依賴 Tailwind 建構環境，風險最低，立即消除 > 1000 行問題。

#### 1.1 `styles.css`（1815 行）→ 拆分為 8 個檔案

目標目錄：`App/Static/css/`

| 拆分後檔案名稱 | 內容範圍 | 預估行數 |
|---|---|:---:|
| `variables.css` | CSS 變數（Design Tokens）、Reset、Base typography | ~80 行 |
| `layout.css` | Navbar、Sidebar、Main Content、Resize Handles（水平/垂直）、Page Content | ~200 行 |
| `components.css` | Buttons（all variants）、Panels、Filter Sections、Inputs（select/number/date）、Badges、Checkbox Group、Pattern Grid | ~350 行 |
| `stock-list.css` | Stats Bar、Stock List Container、Stock Item、List Header、Scrollbar 美化 | ~250 行 |
| `chart.css` | Chart Container、Chart Header、Chart Controls（timeframe）、Chart Wrapper、Chart Legend、Chart Placeholder | ~180 行 |
| `backtest.css` | Backtest Results、Results Grid、Metrics Grid、Trade List、Comparison Results、Table 樣式 | ~300 行 |
| `tabs.css` | Tabs Wrapper/Header、Tab Buttons、Strategy Cards、Toggle Switch（大/小）、HTMX 分頁（VSCode 風格）| ~300 行 |
| `animations.css` | Loading Overlay、Spinner、`@keyframes spin`、`@keyframes fadeIn`、Responsive Media Queries | ~100 行 |

`base.html` 原本的 `<link rel="stylesheet" href="/static/css/styles.css?v=1.1">` 改為：

```html
<link rel="stylesheet" href="/static/css/variables.css">
<link rel="stylesheet" href="/static/css/layout.css">
<link rel="stylesheet" href="/static/css/components.css">
<link rel="stylesheet" href="/static/css/stock-list.css">
<link rel="stylesheet" href="/static/css/chart.css">
<link rel="stylesheet" href="/static/css/backtest.css">
<link rel="stylesheet" href="/static/css/tabs.css">
<link rel="stylesheet" href="/static/css/animations.css">
```

> 或在 Phase 0 完成後，統一以 Tailwind `input.css` 的 `@import` 引入。

#### 1.2 `chart-settings-modal.css`（1140 行）→ 拆分為 6 個檔案

目標目錄：`App/Feature/Screening/`

| 拆分後檔案名稱 | 內容範圍 | 預估行數 |
|---|---|:---:|
| `chart-modal-core.css` | Modal Overlay、Container、Header（拖移把手）、Tabs、Body、Footer | ~180 行 |
| `chart-modal-sidebar.css` | 左側指標列表、Category Header、Indicator Items（含 checkbox 樣式）| ~130 行 |
| `chart-modal-indicators.css` | MA 設定列表（header + line-item）、BOLL 設定（params + lines）、ITB 指標控制列 | ~350 行 |
| `chart-modal-patterns.css` | 型態管理 Table（header + row）、Pattern Checkbox、Pattern Opacity Cell | ~150 行 |
| `chart-modal-color-picker.css` | 色板彈窗（overlay + container）、Color Grid、Color Cell、Custom Color Panel（canvas）| ~220 行 |
| `chart-modal-general.css` | General 設定面板、坐標軸 Radio 群組、Axis Mode、Intro Panel（指標介紹）、Chart Tooltip | ~200 行 |

`screening.html` 與 `base.html` 中的 `<link rel="stylesheet" href="/feature/Screening/chart-settings-modal.css?v=2.3">` 改為引入上述 6 個分割檔案（或合併於 `input.css @import`）。

#### 1.3 不需拆分的檔案

| 檔案 | 行數 | 說明 |
|---|---|---|
| `screening.css` | 390 | 無需拆分，後續 Phase 3 進行 Tailwind 遷移 |
| `risk_management.css` | 346 | 無需拆分，後續 Phase 3 進行 Tailwind 遷移 |

---

### Phase 2：全域 CSS 遷移（拆分後 → Tailwind）

**目標**：將 `styles.css` 拆分後的各檔案中，能以 Tailwind utilities 替代的 custom CSS 逐步遷移

**遷移規則**：
- 若同一 utility 組合在 3 處以上重複使用 → 改用 `@apply` 封裝成 component class
- 保留 CSS 變數定義（`variables.css` 完整保留，JS 可能透過 `getComputedStyle` 讀取）
- Scrollbar、keyframe、偽元素 → 保留 custom CSS
- 顏色值優先使用 CSS 變數語法（`var(--accent-primary)`），對應 Tailwind config 中的 `var()` reference

**遷移優先序**（由低風險至高風險）：

1. `layout.css` — flex 佈局大量可 Tailwind 化
2. `components.css` — button variants 以 `@apply` 定義
3. `stock-list.css` — grid + flex 可 Tailwind 化；scrollbar 保留 custom
4. `chart.css` — flex 佈局為主，可大量 Tailwind 化
5. `backtest.css` — table 樣式混合處理
6. `tabs.css` — interactive states 可用 Tailwind
7. `variables.css`、`animations.css` — **完整保留 custom CSS**

---

### Phase 3：Feature CSS 遷移

**遷移順序**（由小至大、由低風險至高風險）：

1. **`risk_management.css`**（346 行）：最小，可驗證 Tailwind 設定正確性
2. **`screening.css`**（390 行）：中等複雜度
3. **`chart-modal-core.css`、`chart-modal-sidebar.css`**（拆分後檔案，較簡單的部分）
4. **`chart-modal-indicators.css`、`chart-modal-color-picker.css`**（最複雜，建議此部分保留 custom CSS）

---

### Phase 4：測試與清理

- **視覺回歸測試**：Screening、Backtesting、RiskManagement 各頁面
- **互動狀態測試**：hover、active、focus、disabled、動態 class toggle（JS 操作）
- **Dark Theme 確認**：所有顏色使用 CSS 變數，確保 Tailwind 建構後不遺失
- **移除冗餘**：刪除已被 Tailwind utilities 替代的 custom CSS
- **生產建構驗證**：確認 PurgeCSS / content purge 不誤刪使用到的 class

---

## 四、各階段完成標準

| Phase | 完成條件 |
|---|---|
| **Phase 0** | Tailwind CLI 建構成功，CDN 已移除，output CSS 正常引用，頁面外觀不變 |
| **Phase 1** | 所有 CSS 檔案 ≤ 1000 行，頁面視覺與功能與重構前完全相同 |
| **Phase 2** | styles.css 系列 ≥ 60% 的純 layout/spacing 改用 Tailwind，剩餘 custom CSS 有明確保留理由 |
| **Phase 3** | 所有 Feature CSS 遷移完成，無功能或樣式迴歸 |
| **Phase 4** | 無重複定義的樣式，所有 CSS 檔案有清楚分工，測試全過 |

---

## 五、重要注意事項

1. **CSS 變數不可移除**：JS 可能透過 `getComputedStyle(el).getPropertyValue('--accent-primary')` 讀取 CSS 變數。若直接移除变量定義，會造成 JS 邏輯錯誤。`variables.css` 必須完整保留。

2. **Tailwind CDN 限制**：CDN 版本不支援自訂 `tailwind.config.js`、JIT 模式或 PurgeCSS。Phase 0（CLI 建構）必須先完成，才能有效配置設計 token。

3. **Scrollbar 無法 Tailwind 化**：需保留 `webkit-scrollbar` custom CSS；可使用 `tailwind-scrollbar` plugin 作為補充。

4. **色板選擇器（Color Picker）元件**：依賴 Canvas API 和精確定位，`chart-modal-color-picker.css` 建議保留 custom CSS 不遷移。

5. **K 線圖相關樣式**：`chart-tooltip`、`itb-row` 等元件涉及絕對定位與 JS 動態更新座標，建議保留 custom CSS。

6. **最小可行方案**：若目前開發資源有限，**僅完成 Phase 1（拆分）即可立即消除 > 1000 行問題**，Tailwind 遷移（Phase 2-3）可按開發優先序安排。

---

## 六、檔案結構變更摘要

### 重構前
```
App/Static/css/
  styles.css                          (1815 行)

App/Feature/Screening/
  screening.css                       (390 行)
  chart-settings-modal.css            (1140 行)

App/Feature/RiskManagement/
  risk_management.css                 (346 行)
```

### Phase 1 拆分後（最小可行方案）
```
App/Static/css/
  variables.css      (~80 行)
  layout.css         (~200 行)
  components.css     (~350 行)
  stock-list.css     (~250 行)
  chart.css          (~180 行)
  backtest.css       (~300 行)
  tabs.css           (~300 行)
  animations.css     (~100 行)

App/Feature/Screening/
  screening.css                       (390 行，不變)
  chart-modal-core.css               (~180 行)
  chart-modal-sidebar.css            (~130 行)
  chart-modal-indicators.css         (~350 行)
  chart-modal-patterns.css           (~150 行)
  chart-modal-color-picker.css       (~220 行)
  chart-modal-general.css            (~200 行)

App/Feature/RiskManagement/
  risk_management.css                 (346 行，不變)
```

### Phase 2-3 Tailwind 遷移後（目標狀態）
```
(專案根目錄)
  package.json
  tailwind.config.js
  postcss.config.js

App/Static/css/
  input.css              (Tailwind 入口，含 @import)
  tailwind.output.css    (建構產物，不納入版控)
  variables.css          (完整保留，CSS 變數)
  animations.css         (完整保留，@keyframes)
  (其他檔案依遷移進度，行數大幅縮減)
```
