# Wave 3~4 實作紀錄（2026-04-01）

## 1. Wave 3（TW5-13）K 線區收斂

本次改動檔案：

1. `app/feature/screening/chart/kline_viewer/chart-area.css`
2. `app/feature/screening/screening.js`
3. `tests/test_tailwind_migration_guard.py`

實作內容：

1. 全螢幕樣式改為 class-based 優先級策略，移除 `!important`。
2. 新增 `body.is-chart-viewport-fullscreen`，切換全螢幕時鎖定頁面滾動。
3. `initFullscreen` 收斂為單一 `setFullscreenState`，同步控制：
   - `chart-viewport-fullscreen`
   - `is-chart-viewport-fullscreen`
   - icon 顯示
   - chart resize
4. 補上 guard test，鎖定 fullscreen class contract。

## 2. Wave 4（TW5-11）Chart Modal 收斂

本次改動檔案：

1. `app/feature/screening/chart/chart_management/chart-modal.css`
2. `app/feature/screening/chart/chart_management/chart_settings_modal_template.js`
3. `app/feature/screening/chart/chart_management/chart_settings_modal.js`
4. `app/feature/screening/indicators/indicator_settings_tab.js`
5. `app/feature/screening/pattern/pattern_settings_tab.js`
6. `tests/test_tailwind_migration_guard.py`

實作內容：

1. Modal 模板 class 去重：
   - 把 overlay/container/header/tabs/sidebar/content/footer 轉為語意 class。
   - `chart-tab-btn`、`chart-sidebar-item` 等結構由 CSS 管理，不再依賴長 utility 字串。
2. 保護狀態 class：
   - 維持 `chart-tab-btn.active`、`is-hidden` 由 JS 切換。
3. 去除 purely-presentational inline style：
   - BOLL line label 的 `display/flex/gap` inline style 改 class。
   - pattern range 的 `flex:1` inline style 改 class。
4. 保留 truly dynamic inline style（色票背景值）以維持互動功能。
5. 色票自訂槽位的 `border-style` 改 class (`is-custom-filled`) 管理。
6. 補上 guard test：
   - 模板語意 class 合約
   - tab/hidden 狀態 class 合約
   - presentational inline style 移除合約

## 3. 自動驗證結果

1. `npm run build:css`：已通過。
2. `C:/Users/lori/anaconda3/envs/marketing_system/python.exe -m pytest tests/test_tailwind_migration_guard.py`：已通過（12 passed）。

## 4. 本輪手動回歸建議（僅列 AI 難以完全自動驗證項目）

1. K 線全螢幕：
   - 切換全螢幕後背景頁不可滾動，Esc 可正確退出。
   - 進出全螢幕後 chart 尺寸與 icon 切換一致。
2. Chart Modal：
   - 四個主 Tab 切換時 `.active` 樣式與內容區顯示一致。
   - 進入 Pattern Tab 時，sidebar/placeholder/選取高亮正常。
   - MA/BOLL/Pattern 色票點擊與色板選色後，按鈕顏色即時更新。
   - 型態設定兩個 range（邊框粗細/不透明度）拖拉時數值同步更新。
