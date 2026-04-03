# 2026-04-03 實作執行計畫（v1）

> 依據 `docs/20260403_implementation_plan.md` 制定。  
> 本文件目的：先解決「隱藏邏輯衝突」，再分波次實作，確保與既有系統風格一致。

---

## 0. 實作前衝突檢查（需先決策）

### C1. 「我的策略」Toggle 行為與目前架構衝突

- 計畫書假設：點卡片 = `loadStrategy()`；再點同一張 = `clearAllFilters()`
- 現況程式：
  - 點卡片只做 `select(id)`（高亮）
  - 按「修改」才 `load(id)`
  - 按「執行篩選」使用 `currentStrategyId` 直接跑
- 風險：若直接照計畫書改成點卡片即 load，會改變既有 UX 流程（可能讓使用者誤觸後覆蓋目前設計中的條件）

**建議決策（預設）**：
- 保持現有 UX：點卡片只做選取/取消選取（toggle）
- 不自動 `load`，不自動 `clearAllFilters`
- 「修改」按鈕維持負責載入策略

---

### C2. MA/BOLL 預設條件切換為 Hover Tooltip 時，自訂條件是否保留

- 需求：選預設時隱藏條件列與 `+添加條件`，改用 Tooltip
- 未明確：切回「自訂」時，之前已輸入的多條條件是否要完整還原

**建議決策（預設）**：
- 保留自訂條件，不清空資料
- 只切換顯示狀態（hide/show）

---

### C3. 連續週期 `range_n` 在資料不足時的語意

- 計畫書草案曾提 `actual_n = min(range_n, len(eval_df))`
- 風險：使用者設定連續 5 次，實際只驗 3 次，語意被弱化

**建議決策（預設）**：
- 嚴格模式：`len(eval_df) < range_n` 直接視為不足資料（加入不足標籤）
- 不做自動縮短 N

---

### C4. 統一字串規則（規則 1/2/3）套用範圍

- 現況：`matched_indicators` 與 `insufficient_indicators` 在後端組字串，前端再包 tag
- 未明確：是否「只改 MA/BOLL 新增資料」或「全量統一（含既有指標/舊策略）」

**建議決策（預設）**：
- 先套用 MA/BOLL + 新產生結果
- 舊策略 `descLines` 不做 migration（避免一次性資料重寫風險）

---

### C5. Item 5 容器查詢（Container Query）落點

- 計畫書示例用 `.left-panel`，但實際頁面容器為 `.sidebar`
- 風險：若照示例 class 直接改，將不生效

**建議決策（預設）**：
- 以現有 `.sidebar` 當容器，補上 `container-type`/`container-name`
- 若瀏覽器不支援 container query，加入 `ResizeObserver` 備援 class

---

## 1. 分波次實作順序

## Wave A（低風險、可立即落地）

1. 項目 4：篩選器 Icon 改為亮綠漏斗
2. 項目 6：SMA/BOLL summary 刪除按鈕加 `title="刪除"`
3. 項目 7：結果表頭字級調整 + 垂直置中
4. 項目 14（文字面）：
   - BOLL `最新價` → `價格`
   - 移除灰字「添加條件」標題（保留綠色 `+ 添加條件` 按鈕）
5. 項目 9：summary 條件改為換行顯示（不再 `+` 串接）

驗證：前端視覺 + 單元級 JS 邏輯檢查

---

## Wave B（互動邏輯）

1. 項目 15：策略卡片支援 toggle off（依 C1 決策）
2. 項目 10 前端：
   - MA 三選一互斥（多頭/空頭/自訂）
   - 範圍 `連續週期` 的 N 輸入框
   - 預設按鈕 Hover Tooltip + 隱藏條件列
3. 項目 11：SMA 左側選「價格」隱藏 period input
4. 項目 13 前端：
   - BOLL 五選一互斥
   - 連續週期 N 輸入框
   - 2x2 RWD（窄面板）
   - 預設按鈕 Hover Tooltip + 隱藏條件列與綠色按鈕

驗證：互動流程測試 + 斷點寬度視覺測試

---

## Wave C（後端邏輯）

1. 項目 10/13 後端：`screen_single_stock()` 支援連續 N 根判斷
2. 項目 8：
   - `pattern/service.py::resolve_analysis_dates()` 增加 end_date-only 分支
   - `pattern/routes.py` 加入 single-date anchoring
3. 項目 11：字串規則 helper（規則 1/2/3）先實作於 Python 端，前端對齊

驗證：pytest + API 回歸測試

---

## Wave D（資料同步與維運）

1. 項目 1：`data_sync_observer.py` 新增 timeframe/ticker/range 狀態表
2. 項目 2：`scheduler.py` DB 初始化重試 + compose restart policy
3. 項目 3：備份機制完整性確認（`backup_market_data` + seed 路徑）

驗證：docker 啟停、observer watch、備份檔產生

---

## 2. 測試策略（遵守執行環境規範）

## 自動化測試

- Python 測試在 conda `marketing_system` 執行
- 或改以 `start_server.bat` 啟動 docker 後，做 API/整合驗證
- 優先執行：
  - `tests/test_integration.py`
  - `tests/test_tailwind_migration_guard.py`
  - 與篩選邏輯相關測試（若已有）

## 手動驗證（視覺/互動）

1. Icon 是否替換為亮綠漏斗
2. 市場範圍是否只出現全垂直或全水平（無 2+1 過渡）
3. 結果表頭字級與垂直對齊
4. MA/BOLL 預設條件切換：條件列與 `+添加條件` 顯示/隱藏是否正確
5. Tooltip 文案是否完整、可讀
6. 策略卡片是否可再次點擊取消選取（依決策）
7. summary/tag/不足標籤字串是否符合規則 1/2/3

---

## 3. 最大風險、失敗情境、替代方案

## 最大風險 R1：互動事件重疊

- 來源：`indicator_manager.js` 已有通用 pill click 處理，模組內再加邏輯可能衝突
- 失敗情境：active 狀態閃爍、互斥失效、按鈕出現多選
- 替代方案：將互斥規則集中到 `indicator_manager.js`，透過 `data-exclusive-group` 宣告式控制

## 風險 R2：字串規則全量改動造成舊資料顯示不一致

- 來源：舊策略 `descLines` 與舊資料結構不含 period abbr/N
- 失敗情境：舊策略顯示混合新舊格式
- 替代方案：僅新資料套新規則；若要全量一致，另做 migration 腳本與版本戳

## 風險 R3：單日錨定過嚴造成型態漏報

- 來源：YOLO/規則法 end_date 可能有交易日偏移
- 失敗情境：使用者指定日期有型態但回傳空
- 替代方案：允許 ±1 個交易日容忍（可配置）

## 風險 R4：Container Query 在舊瀏覽器不生效

- 失敗情境：市場範圍排版回到舊行為
- 替代方案：ResizeObserver 備援 class 切換

---

## 4. 實作完成定義（DoD）

- 每個 Wave 完成後：
  - 通過該 Wave 對應自動測試
  - 列出必要手動驗證結果
  - 不引入新的 lint / 語法錯誤
  - 不破壞既有 UI 主題與互動節奏
