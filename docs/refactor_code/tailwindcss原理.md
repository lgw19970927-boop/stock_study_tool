# Tailwind CSS 技術架構與重構全攻略

這份指南總結了本專案的 **Tailwind CSS 編譯機制、渲染邏輯**，以及如何將舊有樣式遷移至現代 Tailwind 體系的標準流程。

---

## 1. 編譯核心：PostCSS 與「規則引擎」 (CLI Compilation)
這是發生在 **開發者電腦 (Local)** 的預處理階段。

### 翻譯官與原始碼的關係
*   **PostCSS (翻譯引擎)：** 是一個處理 CSS 的平台。它本身不認識 Tailwind，但透過載入 **Tailwind 插件**，它就具備了「翻譯類名」的能力。
*   **Tailwind 插件 (翻譯字典)：** 內建在 `node_modules` 中。它不是一張死板的對照表，而是一套 **「生成邏輯」**。
    *   **原廠公式：** 例如看到 `p-4`，它會執行 `4 * 0.25rem` 的運算，即時產出 `.p-4 { padding: 1rem; }`。
    *   **自定義字典 (`tailwind.config.js`)：** 當編譯開始時，PostCSS 會優先讀取您的設定，並將自定義顏色或間距加入它的翻譯引擎中。

### JIT (Just-In-Time) 按需生產
*   **掃描：** PostCSS 會掃描所有 HTML 檔案中的 `class` 字串。
*   **動態生成：** 只有在 HTML 裡出現過的類名，PostCSS 才會去執行字典裡的「生成公式」並寫入 `tailwind.output.css`。這能保證最終檔案不會包含您沒用到的一萬種預設樣式。

---

## 2. 網頁渲染：CLI 與 CDN 的本質差異 (Rendering)
這是發生在 **使用者瀏覽器 (Client)** 的呈現階段。

### 🟢 Tailwind CLI (本專案的做法) —— 「靜態查表」
*   **性質：** 瀏覽器載入的是一份 **純靜態、已翻譯完成** 的 CSS 對照表。
*   **流程：**
    1.  瀏覽器下載 `tailwind.output.css`。
    2.  解析 HTML 時，看到 `class="p-4 flex"`。
    3.  **直接查詢：** 利用瀏覽器內建的 **原生 C++ 樣式引擎 (硬體加速)** 直接在 CSS 對照表裡查找。
*   **優勢：** 速度最快、效能最高，瀏覽器完全不需要執行任何 Tailwind 的邏輯。

### 🔴 Tailwind Play CDN —— 「現場口譯」
*   **性質：** 瀏覽器載入的是一整套 **「翻譯引擎軟體 (JavaScript Engine)」**。
*   **流程：**
    1.  下載龐大的 `tailwindcss.js` (內含完整翻譯演算法)。
    2.  **執行 JS：** 使用者的 CPU 開始運算，現場遍歷 DOM 標籤。
    3.  **即時生成：** 在瀏覽器記憶體中現場產出 CSS 樣式標籤並塞入網頁。
*   **劣勢：** 消耗使用者資源，且可能導致載入時出現短暫的樣式閃爍 (FOUC)。

---

## 3. 專案中的 `input.css`：技術債管理核心
在您的專案中，`input.css` 是連繫新舊世界的 **「整合調度員」**。

*   **舊 CSS 收容所：** 透過 `@import` 管理還沒重構完的功能樣式（如 `screening.css`）。
*   **Tailwind 注入點：** 最後使用 `@tailwind` 指令，告訴 PostCSS 在此處合併生成的工具類。
*   **重構目標：** 當所有功能都搬位到 HTML 的 Tailwind Utility Class 時，`input.css` 就會被清空到只剩三行 `@tailwind` 指令，代表重構完成。

---

## 4. 專業重構工作流 (Refactoring Workflow)

1.  **選定目標**：從 `input.css` 的 `@import` 清單中挑一個檔案（如 `tabs.css`）。
2.  **搜尋定位**：在專案中找出所有引用了這份 CSS 內 Class 的 HTML 片段。
3.  **手動替換**：在 HTML 標籤上，將舊 Class 換成一個或多個 Tailwind 工具類（如 `bg-secondary p-4 rounded`）。
4.  **視覺驗證**：確認瀏覽器「原生查表」後的畫面與原本一致。
5.  **清理收尾**：刪除舊 CSS 內容，並從 `input.css` 移除該檔案連結。

---

> [!TIP]
> **核心總結：** 專業開發永遠優先選擇 **CLI 模式**。它將繁重的「翻譯工作」留在開發階段，讓使用者的瀏覽器只需處理最輕鬆、最具效能的「純靜態 CSS 渲染」。
