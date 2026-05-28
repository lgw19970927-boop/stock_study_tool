# 左側面板 UI/UX 綜合優化計畫書

- **日期**：2026-04-04  
- **範圍**：`app/feature/screening/screening.css`、`indicators/modules/sma/sma.js`、`bollinger/bollinger.js`、`volume/volume.js`、`amount/amount.js`

---

## 一、問題描述

| # | 區塊 | 問題 |
|---|------|------|
| 1 | 指標篩選 - 編輯模式條件列 | 面板縮窄時條件列（MA 20 大於 MA 60 刪除）被迫折成兩行 |
| 2 | 市場範圍 - Checkbox 選項 | 勾選框與文字貼齊左側，右側留有過多空白，視覺重心不穩 |
| 3 | 指標篩選 - 摘要模式 | 左側文字不隨面板縮放彈性調整；文字溢出而非截斷；Icon 區塊可能被擠壓 |

---

## 二、修改方案

### 2.1 編輯模式條件列（`screening.css`）

| 目標 | 目前 | 修改後 |
|------|------|--------|
| `.condition-row` flex-wrap | `@apply flex flex-wrap items-center` | 移除 `flex-wrap`，強制單行 |
| `.condition-row select` 最小寬度 | `flex: 1 1 70px; min-width: 60px; @apply p-1` | `flex: 1 1 50px; min-width: 40px; padding: 2px 4px` |
| `.condition-row input[type="number"]` 彈性 | `flex: 0 0 50px; width: 50px; @apply p-1` | `flex: 0 1 40px; min-width: 28px; padding: 2px 4px`（移除固定 width） |
| mobile 覆寫 | `@media ≤450px` 將 condition-row 改為 items-stretch | 移除此段（以下同一 media query 中的 condition-row 部分） |

### 2.2 市場範圍 Checkbox 水平置中（`screening.css`）

| 目標 | 修改 |
|------|------|
| `.checkbox-item` | 加入 `justify-content: center`（讓 checkbox + 文字群組在選項框內水平置中） |

### 2.3 摘要模式文字彈性修正（`screening.css`）

| 選擇器 | 新增屬性 | 說明 |
|--------|----------|------|
| `.ind-summary-item` | `gap: 8px` | 文字與 Icon 之間加入間距 |
| `.ind-summary-text` | `flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;` | 填滿剩餘空間並單行截斷 |
| `.ind-summary-actions` | `flex-shrink: 0;` | 固定 Icon 容器，不允許壓縮 |

### 2.4 摘要模式 Tooltip（JS 各模組）

在 `sma.js`、`bollinger.js`、`volume.js`、`amount.js` 的 summary HTML 中，為 `.ind-summary-text` 元素加上 `title="${line}"` 屬性，讓使用者可於游標懸停時查看完整條件文字。

---

## 三、風險評估

| 風險 | 說明 | 緩解方式 |
|------|------|----------|
| 條件列內容過多時仍溢出容器 | 縮窄面板至極限時，即使 no-wrap + flex-shrink 也可能讓文字被裁切 | 已允許 select/input 縮小至 40/28px；最壞情況下文字被截但不換行，符合需求 |
| `justify-content: center` 與 wide 模式切換 | wide grid 版本（`sidebar--market-wide`）切換為 3 column 時每格較小，置中依然有效 | 置中行為不受 grid 欄數影響，各 cell 內各自置中 |
| Tailwind @layer components 優先級 | `.ui-checkbox-card` 在 `@layer components` 中宣告；`.checkbox-item` 在非層 CSS 中宣告，後者具更高優先級 | 直接修改 `.checkbox-item`，足以覆蓋 |
| Tooltip 在 HTML entity 中斷 | `title` 屬性內若含 `&quot;` 等特殊字元可能被截斷 | 條件文字為純文字（由 format_helpers 產生），不包含引號，安全 |

---

## 四、失敗情境

- **Tailwind 未重新建置**：CSS 中的 `@apply` 變更需執行 Tailwind 編譯後才會生效；未跑 build 時瀏覽器仍讀舊 CSS。
- **inline style 覆蓋**：若某元素有 inline style 設定 width/flex，將無法被 CSS 覆蓋。

---

## 五、手動驗證項目

| # | 驗證描述 |
|---|----------|
| V1 | 縮窄左側面板至極小寬度，確認條件列（MA 20 大於 MA 60 刪除）維持在同一行，不換行 |
| V2 | 拖曳面板至各種寬度，確認「刪除」按鈕始終固定在行末且文字不換行 |
| V3 | 市場範圍三個選項框（Listed / OTC / IPO），任意寬度下勾選框與文字群組在框內視覺水平置中 |
| V4 | 摘要模式下拉寬/縮窄面板，文字區塊隨之延伸/壓縮，超出時顯示刪節號（…） |
| V5 | 游標懸停於摘要文字時，出現 Tooltip 顯示完整條件文字 |
| V6 | 縮窄面板至極小，鉛筆與叉叉按鈕完整顯示不變形 |
| V7 | 切換多個指標（SMA / Bollinger / Volume / Amount）確認摘要文字顏色、字體、字級全部一致 |
