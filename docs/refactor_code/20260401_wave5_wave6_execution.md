# Wave 5~6 + Wave 1 收尾實作紀錄（2026-04-01）

## 1. Wave 5（TW5-12）RiskManagement 收斂

本次改動檔案：

1. `app/feature/risk_management/risk_management.css`
2. `app/feature/risk_management/risk_management_fragment.html`
3. `app/feature/risk_management/components/params/templates/ui.html`
4. `app/feature/risk_management/components/overview/templates/ui.html`
5. `app/feature/risk_management/components/portfolio/templates/ui.html`
6. `app/feature/risk_management/components/portfolio/portfolio_block.js`

實作內容：

1. 移除廣域 selector `#risk-page input[type="text|number"]`，改為 `.rm-param-input` 作用域，避免表格 input 受汙染。
2. `risk_management.css` 的 `!important` 全數移除，改由作用域與語意 class 維持優先級。
3. `params/overview/portfolio` template 的 purely-presentational inline style 改為 class-based。
4. `portfolio_block.js` 將靜態行內樣式（display/width/font-size）收斂為 `.pm-*` 類別，僅保留 truly dynamic 色值 inline style。
5. `risk_management_fragment.html` 根容器改為 `page-content page-content--fill active`，移除 inline layout style。

## 2. Wave 1（TW5-20）Global 收斂補完

本次改動檔案：

1. `app/static/css/layout.css`
2. `app/static/css/components.css`
3. `app/static/css/tabs.css`
4. `app/static/css/animations.css`

實作內容：

1. `layout.css` 合併 sidebar/vertical resize handle 的重複基礎規則。
2. `components.css` 抽取 `.btn` 與 `.btn-icon` 重複互動基底（cursor/transition）。
3. `tabs.css` 的 tab label 字體改為 token：`var(--font-family)`。
4. `animations.css` 對 loading overlay/spinner 進行 utility 化收斂（`@apply`）。

## 3. Wave 6（TW5-30）input.css import 收尾

本次改動檔案：

1. `app/static/css/input.css`

實作內容：

1. 明確化 Wave 6 import 收斂註解與分組說明。
2. 依「僅在來源檔無有效規則時移除 import」原則，保留 9 個來源 import（皆仍有有效規則）。

## 4. Custom CSS 白名單（保留理由）

1. `variables.css`：design token source of truth。
2. `animations.css`：`@keyframes` 與 spinner 動畫。
3. `layout.css`：`backdrop-filter`、`color-mix`、scrollbar 客製。
4. `components.css` / `tabs.css`：全域語意元件與狀態樣式。
5. `screening.css`：checkbox pseudo、scrollbar、狀態耦合區。
6. `chart-area.css`：全螢幕與圖表高耦合規則。
7. `chart-modal.css`：tab/active/is-hidden 狀態與控件皮膚。
8. `risk_management.css`：動態列/批次輸入與表格高耦合規則。

## 5. 自動驗證結果

1. `npm run build:css`：通過。
2. `C:/Users/lori/anaconda3/envs/marketing_system/python.exe -m pytest tests/test_tailwind_migration_guard.py`：通過（18 passed）。
