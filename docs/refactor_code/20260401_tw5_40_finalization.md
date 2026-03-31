# TW5-40 封版紀錄（2026-04-01）

## 1. 目標

完成最終白名單、回退點與 guard test 補強，讓 Wave 0~6 可交接、可驗證、可回退。

## 2. 最終 custom CSS 白名單（含保留理由）

1. `app/static/css/variables.css`
   - Design token source of truth（色彩/字體/間距/動畫節奏）。
2. `app/static/css/animations.css`
   - `@keyframes` 與 loading 動畫本體。
3. `app/static/css/layout.css`
   - scrollbar、`color-mix`、layout handle 等高耦合樣式。
4. `app/static/css/components.css`
   - 全域語意元件（btn/panel/input）維護入口。
5. `app/static/css/tabs.css`
   - tab 狀態與 VSCode-like 細節皮膚。
6. `app/feature/screening/screening.css`
   - checkbox pseudo、結果區 scrollbar、指標摘要狀態樣式。
7. `app/feature/screening/chart/kline_viewer/chart-area.css`
   - chart viewport fullscreen、圖表容器高耦合規則。
8. `app/feature/screening/chart/chart_management/chart-modal.css`
   - modal tab/active/is-hidden 狀態與控件樣式。
9. `app/feature/risk_management/risk_management.css`
   - 風險表格與動態列（`.pm-*`）高耦合排版。

## 3. 回退點（Rollback Points）

1. R0（Wave 0~4 完成）
   - 參考：`docs/refactor_code/20260401_wave0_wave2_execution.md`
   - 參考：`docs/refactor_code/20260401_wave3_wave4_execution.md`
2. R1（Wave 5~6 + Wave 1 補完）
   - 參考：`docs/refactor_code/20260401_wave5_wave6_execution.md`
3. R2（TW5-40 封版）
   - 參考：本文件 `docs/refactor_code/20260401_tw5_40_finalization.md`

建議回退流程：

1. 先回退單一工單涉及檔案（避免整包回退）。
2. 先跑 `npm run build:css`。
3. 再跑 `pytest tests/test_tailwind_migration_guard.py`。
4. 最後做最小手動回歸（Screening summary、Risk table、Chart modal tab）。

## 4. 新增/補強 guard test 契約

本輪補強重點：

1. Screening summary class specificity 契約。
2. RiskManagement 置中/放大排版 class 契約。
3. RiskManagement 欄位分隔視覺契約。
4. 風險參數 Local Storage + 千分位格式契約。

對應檔案：

1. `tests/test_tailwind_migration_guard.py`

## 5. 交付驗證指令

1. `npm run build:css`
2. `C:/Users/lori/anaconda3/envs/marketing_system/python.exe -m pytest tests/test_tailwind_migration_guard.py`

## 6. 封版結論

1. Wave 0~6 及 TW5-40 已可由 guard test 快速驗證。
2. 重要高風險互動（summary class、risk table 動態列）均有契約保護。
3. 後續新增 UI 功能時，維持「Tailwind-first + 白名單 custom」原則即可穩定擴充。
