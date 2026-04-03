# Stock Study Tool — 完整實作計畫書
**日期**: 2026-04-03  
**版本**: v1.1  
**目標系統**: 美股篩選工具 (US Stock Screening)

---

## 目錄

1. [後端機制與資料同步](#一後端機制與資料同步)
   - [項目 1：Data_sync Observer 重新設計](#項目-1data_sync-observer-重新設計)
   - [項目 2：Docker 啟動時不自動抓取資料](#項目-2docker-啟動時不自動抓取資料)
   - [項目 3：備份機制確認](#項目-3備份機制確認)
2. [UI/UX 介面與排版調整](#二uiux-介面與排版調整)
   - [項目 4：替換 Icon（心跳 → 亮綠漏斗）](#項目-4替換-icon心跳--亮綠漏斗)
   - [項目 5：RWD 排版（市場範圍 + 篩選頻率）](#項目-5rwd-排版市場範圍--篩選頻率)
   - [項目 6：Hover 提示（刪除按鈕）](#項目-6hover-提示刪除按鈕)
   - [項目 7：篩選結果列表表頭優化](#項目-7篩選結果列表表頭優化)
   - [項目 15：策略選取 Toggle 修正](#項目-15策略選取-toggle-修正我的策略)
3. [篩選邏輯與摘要顯示](#三篩選邏輯與摘要顯示)
   - [項目 8：型態篩選時間點 Bug 修正](#項目-8型態篩選時間點-bug-修正)
   - [項目 9：指標摘要條件分開獨立顯示](#項目-9指標摘要條件分開獨立顯示)
4. [MA 指標細節實作](#四ma-指標細節實作)
   - [項目 10：MA 參數單選互斥 + 連續週期實作](#項目-10ma-參數單選互斥--連續週期實作)
   - [項目 11：「價格」選項隱藏多餘數值框](#項目-11價格選項隱藏多餘數值框)
   - [項目 12：MA 自訂條件輸入框破版修正](#項目-12ma-自訂條件輸入框破版修正)
5. [BOLL 指標細節實作](#五boll-指標細節實作)
   - [項目 13：BOLL 單選互斥 + 連續週期 + 2x2 RWD](#項目-13boll-單選互斥--連續週期--2x2-rwd)
   - [項目 14：BOLL 文字修正 + 底層取值邏輯確認](#項目-14boll-文字修正--底層取值邏輯確認)
6. [指標定義規格（美股）](#六指標定義規格美股)
    - [MA 指標編輯模式示意圖](#ma-指標編輯模式hover-tooltip-規範)
    - [BOLL 指標編輯模式示意圖](#boll-指標編輯模式hover-tooltip-規範)
   - [MA 多頭排列 / 空頭排列（定義用到的均線）](#ma-多頭排列--空頭排列定義用到的均線)
   - [BOLL 四個預設條件的參數定義](#boll-四個預設條件的參數定義)
7. [配置範例說明](#七配置範例說明)
8. [風險摘要](#八風險摘要)
9. [驗證步驟](#九驗證步驟)
10. [模組化架構設計原則](#十模組化架構設計原則高內聚--低耦合)
11. [通用 UI 字串生成規範](#十一通用-ui-字串生成規範全指標適用)

---

## 一、後端機制與資料同步

### 項目 1：Data_sync Observer 重新設計

#### 現狀問題

`tools/data_sync_observer.py` 目前以 terminal 純文字 dashboard 呈現 active_job、progress bar、counters、coverage_latest，但缺乏立體視角：
- 無法同時看到「每個 timeframe 目前是在增量還是回補」
- 無法看到「目前推進到哪個 ticker」
- 無法看到「本次任務涵蓋的歷史日期起訖」

#### 目標示意圖（新版 Dashboard）

```
╔══════════════════════════════════════════════════════════════════════╗
║  Data Sync Observer — Live Dashboard  [2026-04-03 14:30:00 TST]     ║
║  source_mode: job_state   db: mysql:3306/market_data                 ║
╠══════════════════════════════════════════════════════════════════════╣
║  ACTIVE JOB                                                          ║
║  ▶ startup_incremental_1d  [INCREMENTAL]  timeframe=1d               ║
║    ticker:  AAPL  (245 / 1820)                                       ║
║    range:   2025-04-03 ~ 2026-04-03  (365-day window)                ║
║    progress: [################-----------]  57.4%  (245/427)         ║
╠══════════════════════════════════════════════════════════════════════╣
║  TIMEFRAME STATUS TABLE                                              ║
║  TF  │ Type        │ Status       │ Progress    │ Coverage Latest    ║
║  ────┼─────────────┼──────────────┼─────────────┼──────────────────  ║
║  1d  │ INCREMENTAL │ ⚡ RUNNING   │ 245/1820    │ 2026-04-02         ║
║  1h  │ INCREMENTAL │ ⏳ PENDING   │   -  / -    │ 2026-04-01         ║
║  5m  │ INCREMENTAL │ ⏳ PENDING   │   -  / -    │ 2025-12-31         ║
║  1m  │ INCREMENTAL │ ⏳ PENDING   │   -  / -    │ 2025-11-20         ║
║  1d  │ BACKFILL    │ ✅ DONE      │ 1820/1820   │ 2020-01-02         ║
║  1h  │ BACKFILL    │ ✅ DONE      │ 1820/1820   │ 2022-06-01         ║
║  5m  │ BACKFILL    │ ⏳ PENDING   │   -  / -    │ -                  ║
╠══════════════════════════════════════════════════════════════════════╣
║  SUMMARY  completed=12  unfinished=0  pending=3                      ║
║  last_completed_at: 2026-04-02 18:15:22                              ║
║  Ctrl+C to stop                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
```

#### 三大觀測維度

| 維度 | 資料來源 | 說明 |
|------|---------|------|
| **timeframe** | `job_state.interval_type` | 1d / 1h / 5m / 1m |
| **ticker** | `job_state.last_ticker` | 目前處理中的股票代碼 + 進度 |
| **time range** | `job_state.target_start` / `target_end` | 本次任務涵蓋的日期起訖 |

#### 實作步驟

1. **`_collect_snapshot()`**：新增回傳欄位
   - `timeframe_status`: `dict[str, dict]` — per-timeframe × job_type 狀態（INCREMENTAL / BACKFILL）
   - `active_ticker`: 從 `active_job["last_ticker"]` 讀取
   - `active_time_range`: 從 `active_job["target_start"]` / `target_end` 讀取
   - **新增補充查詢（缺口補強）**：以下三點在設計階段確認須補充：

     **a. Progress 分母（total_tickers）**  
     `job_state` 只存 `last_chunk_idx`，不存 `total_tickers`。需加一次查詢：  
     ```python
     total_tickers = _fetchone_scalar(
         conn,
         "SELECT COUNT(*) FROM tickers WHERE is_active = 1 AND is_suspected_delisted = 0"
     )
     ```

     **b. INCREMENTAL 多 job_name 聚合**  
     `incremental_update()` 依每支股票的最後日期分組，每組建立獨立 job：`incremental_1d_2025-04-02`、`incremental_1d_2025-03-15`、`incremental_1d_full`…。STATUS TABLE 顯示「1d INCREMENTAL 整體狀態」時，需用 `LIKE` 聚合：  
     ```sql
     SELECT MAX(updated_at), MAX(status)
     FROM job_state
     WHERE job_name LIKE 'incremental_1d_%'
       AND DATE(updated_at) = CURDATE()
     ```
     若任一子 job 為 `running` → 整列 running；全部 `completed` → done。

     **c. BACKFILL 行的「Coverage Latest」= Oldest Reached**  
     INCREMENTAL 與 BACKFILL 共用同一張 `market_data_ohlcv`，`MAX(datetime)` 只有一個值。BACKFILL 行應顯示**已回補到最早哪一天**，查詢來源改為 `backfill_history.start_date`：  
     ```sql
     SELECT MIN(start_date) FROM backfill_history
     WHERE interval_type = '1d' AND status = 'completed'
     ```
     欄位標題改為「Oldest Reached」而非「Coverage Latest」。

2. **`_snapshot_to_lines()`**：新增「TIMEFRAME STATUS TABLE」區塊渲染
3. 保留現有 `--watch` / `--no-ansi` / fallback log 模式向後相容

#### 關聯檔案
- `tools/data_sync_observer.py`

---

### 項目 2：Docker 啟動時不自動抓取資料

#### 根本原因

1. **Docker Desktop GUI「Play」按鈕 = `docker start`**，不走 `docker-compose up`，因此：
   - `docker-compose.yml` 的 `depends_on: mysql: condition: service_healthy` **完全失效**
   - container 啟動時 MySQL 可能尚未就緒
2. `scheduler.py` 的 `_init_runtime_dependencies()` 呼叫 `init_db()` 時拋出連線錯誤後，整個 process 直接退出
3. `docker-compose.yml` 的 `data_sync` service **未設定 `restart` 政策**，不會自動重試

#### 修正方案

**A. `env/data_sync/scheduler.py` — 加入重試迴圈**

```python
def _init_runtime_dependencies(max_retries: int = 30, retry_interval: int = 5) -> None:
    """帶指數退避的 DB 初始化，最多重試 max_retries 次"""
    for attempt in range(1, max_retries + 1):
        try:
            config = get_config()
            init_db(config)
            _ensure_runtime_tables()
            _recover_stale_job_state()
            logger.info('[scheduler] DB pool initialized OK')
            return
        except Exception as e:
            if attempt >= max_retries:
                logger.error(f'[scheduler] DB init failed after {max_retries} retries: {e}')
                raise
            wait = min(retry_interval * attempt, 60)
            logger.warning(f'[scheduler] DB init attempt {attempt}/{max_retries} failed: {e}. Retry in {wait}s...')
            time.sleep(wait)
```

**B. `docker-compose.yml` — data_sync 加入 restart 政策**

```yaml
data_sync:
  ...
  restart: on-failure
  deploy:
    restart_policy:
      condition: on-failure
      max_attempts: 5
      delay: 10s
```

**C. 可選加強：`env/data_sync/entrypoint.sh`**

```bash
#!/bin/bash
# 等待 MySQL 就緒後再啟動 scheduler
until mysqladmin ping -h "$MYSQL_HOST" -u "$MYSQL_USER" -p"$(cat $MYSQL_PASSWORD_FILE)" --silent; do
    echo "Waiting for MySQL..."
    sleep 3
done
exec python3 /workspace/env/data_sync/scheduler.py
```

#### 最大風險

- 重試迴圈若 MySQL 永久不可用 → 設 `max_retries=30` + 等待上限 60s，最終 raise 讓 container 以非零 code 退出，觸發 Docker `restart: on-failure`

#### 關聯檔案
- `env/data_sync/scheduler.py`
- `docker-compose.yml`

---

### 項目 3：備份機制確認

#### 現狀（已實作）

| 備份任務 | 觸發時間 | 備份目標 | 輸出位置 |
|---------|---------|---------|---------|
| `backup_user_data` | 每日 23:55 | `user_data` schema | `env/mysql/seed/seed_user_data.sql` |
| `backup_market_data` | 每日 23:59 | `market_data` schema | `env/mysql/seed/seed_market_data.sql` |

備份方式：透過 `docker exec stock-mysql mysqldump` 匯出，不需在 host 安裝 MySQL Client。

#### 確認事項

1. 確認 `backup_market_data()` 函式已完整實作（`backup_mysql.py` 末尾尚須驗證）
2. 確認 `env/mysql/seed/` 目錄已在 docker-compose volume 或 `.gitignore` 中正確處理

#### 此項目以確認 + 補缺為主，若 `backup_market_data` 函式缺失則補實作

#### 關聯檔案
- `app/feature/data_management/backup/backup_mysql.py`

---

## 二、UI/UX 介面與排版調整

### 項目 4：替換 Icon（心跳 → 亮綠漏斗）

#### 位置

`app/feature/screening/screening_fragment.html` — `<h3 class="tabs-title">` 內的 SVG

#### 修改內容

舊（Feather Icons `activity` 心跳波形）：

```html
<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
```

新（Feather Icons `filter` 漏斗，亮綠色）：

```html
<svg width="20" height="20" viewBox="0 0 24 24" fill="none"
     stroke="#00d4aa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
</svg>
```

#### 關聯檔案
- `app/feature/screening/screening_fragment.html`

---

### 項目 5：RWD 排版（市場範圍 + 篩選頻率）

#### 市場範圍（只允許兩種極端：全垂直 or 全水平）

**問題**：現有 `.checkbox-group { flex flex-wrap }` 在中間寬度時呈現「2個水平 + 1個換行」的過渡狀態，不符合要求。

**修正策略**：使用 **CSS Container Query**（`@container`），因寬度變化來源是 sidebar panel 本身而非視窗：

```css
/* screening.css */
/* 步驟 1：預設全垂直排列（不允許換行） */
.checkbox-group {
    @apply flex flex-col;
    gap: var(--spacing-sm);
}

/* 步驟 2：sidebar panel 寬度 >= 240px 時切為水平（不允許換行） */
@container sidebar-left (min-width: 240px) {
    .checkbox-group {
        @apply flex-row;
        flex-wrap: nowrap;
    }
}
```

需在 `screening_fragment.html` / `screening.html` 的左側 sidebar 父容器加上：

```html
<div class="left-panel" style="container-type: inline-size; container-name: sidebar-left;">
```

若瀏覽器不支援 CSS Container Query，備援方案改用 JS `ResizeObserver` 動態切換 class。

#### 篩選頻率（space-evenly）

```css
/* screening.css */
.frequency-group {
    @apply flex;
    justify-content: space-evenly;
}
```

#### 關聯檔案
- `app/feature/screening/screening.css`
- `app/feature/screening/screening_fragment.html`
- `app/feature/screening/screening.html`

---

### 項目 6：Hover 提示（刪除按鈕）

#### 修改位置

`sma.js` 與 `bollinger.js` 的 `confirmConfig()` 函式中，`btn-remove` 按鈕加入 `title="刪除"`：

```html
<!-- 修改前 -->
<button type="button" class="btn-icon btn-remove" onclick="...">

<!-- 修改後 -->
<button type="button" class="btn-icon btn-remove" title="刪除" onclick="...">
```

#### 關聯檔案
- `app/feature/screening/indicators/modules/sma/sma.js`
- `app/feature/screening/indicators/modules/bollinger/bollinger.js`

---

### 項目 7：篩選結果列表表頭優化

#### 字體大小

現狀：`text-[0.625rem]`（10px）→ 修改為 `text-xs`（12px）

#### 垂直對齊

非排序欄位（`公司名稱`、`篩選標籤`）目前只是 `<div>` 文字，無高度對齊設定，視覺上偏上；帶有 `⇅` icon 的欄位因有 flex 容器而有效居中。修正：為所有 `.list-header` 的子項目統一設定：

```css
/* 表頭所有欄位統一加 */
.list-header > div {
    @apply flex items-center;
}
```

#### 關聯檔案
- `app/feature/screening/components/results_table/templates/ui.html`
- `app/feature/screening/screening.css`

---

### 項目 15：策略選取 Toggle 修正（我的策略）

#### 問題描述

在「我的策略」區塊中，點擊已儲存的策略可正常**選取**（高亮顯示），但**再次點擊同一策略無法取消選取**（無法 toggle off）。

#### 根本原因

點擊事件只處理「選取」邏輯，未處理「再次點擊同一項 → 取消選取」的 toggle 分支。具體表現：每次點擊均執行選取（加 `.is-selected`），不判斷目前是否已是 active 狀態。

#### 修正方案

在「我的策略」的點擊事件處理中，加入 toggle 判斷：

```javascript
strategyItem.addEventListener('click', function() {
    const isAlreadySelected = this.classList.contains('is-selected');
    // 先清除所有選取狀態
    document.querySelectorAll('.strategy-item').forEach(el => {
        el.classList.remove('is-selected');
    });
    // 若原本未選取 → 選取；已選取 → 保持清除（toggle off）
    if (!isAlreadySelected) {
        this.classList.add('is-selected');
        loadStrategy(this.dataset.strategyId); // 觸發策略載入
    } else {
        clearAllFilters(); // Toggle off：清除篩選條件
    }
});
```

#### 關聯檔案
- 「我的策略」相關 JS（`app/feature/screening/components/saved_strategies/` 目錄下）

---

## 三、篩選邏輯與摘要顯示

### 項目 8：型態篩選時間點 Bug 修正

#### 影響範圍

只影響「**今天**」與「**自訂特定時點**」兩種模式（前端只傳 `end_date`，`start_date` 為空）。  
**「自訂分析時間範圍」模式（同時傳入 `start_date` + `end_date`）運作正常，本次不動。**

#### 根本原因分析

**Bug 1 — `resolve_analysis_dates` 缺少 end_date only 分支：**

```python
# pattern/service.py 現狀（有 bug）
def resolve_analysis_dates(time_range, start_date, end_date):
    if start_date and end_date:          # ✅ 自訂範圍模式 → 正確
        return start_date, end_date
    # ❌ 缺少「僅有 end_date」分支
    # 直接落到 time_range 邏輯 → 返回 (today-30days, today)
    # 導致特定時點的 end_date 被完全忽略
    today = date.today()
    delta = delta_map.get(time_range or "1M", timedelta(days=30))
    return (today - delta).isoformat(), today.isoformat()
```

**Bug 2 — YOLO / 盤整模型做全區間滑動視窗掃描，回傳所有偵測到的型態：**

即使正確取得了歷史區間的資料，`recognize_patterns` 仍會回傳該區間內所有符合的型態（可能有多個不同 `end_date` 的結果），未精確比對使用者指定的目標日。

#### 修正方案

**修正一 — `resolve_analysis_dates` 動態推算起始日（不寫死 365 天）**

函式簽名新增 `max_bars` 參數（來自 `pattern_max`），推算公式：`回推天數 = int(max_bars * 1.5) + 30`

```python
def resolve_analysis_dates(
    time_range:  Optional[str],
    start_date:  Optional[str],
    end_date:    Optional[str],
    max_bars:    int = 120,          # 新增，由 pattern_max 傳入
) -> Tuple[str, str]:
    if start_date and end_date:
        return start_date, end_date

    # ✅ 新增：只有 end_date（今天 or 特定時點模式）
    if end_date and not start_date:
        days_back = int(max_bars * 1.5) + 30
        end = date.fromisoformat(end_date)
        return (end - timedelta(days=days_back)).isoformat(), end_date

    # 快捷時間範圍（time_range 模式，前端目前不使用但保留相容）
    today = date.today()
    delta_map = { ... }
    delta = delta_map.get(time_range or "1M", timedelta(days=30))
    return (today - delta).isoformat(), today.isoformat()
```

**修正二 — End Date Anchoring（精準錨定終點）**

在 `pattern/routes.py` 的 `event_stream()` 中，呼叫完 `recognize_patterns` 後加入強制過濾：

```python
# 判斷是否為單一日模式（只有 end_date，沒有 start_date）
is_single_date_mode = (not start_date) and bool(end_date)

# recognize_patterns 回傳後
if found and is_single_date_mode:
    # 只保留 pattern["end_date"] == 使用者指定目標日 的結果
    found = [p for p in found if p.get("end_date") == end_date]
```

**呼叫鏈修改位置**

```
pattern/routes.py
  └── resolve_analysis_dates(time_range, start_date, end_date, pattern_max)  ← 新增 max_bars
  └── recognize_patterns(prices_raw, ...)  → 過濾 end_date == target
```

#### 最大風險

- `end_date_anchoring` 若 YOLO box 偵測的 `end_date` 與使用者指定日期有 ±1 天誤差（因交易日計算），可能導致漏報。建議先以精確日期等值比對上線，後續視需求改為 `±1 trading day` 容忍。

#### 關聯檔案
- `app/feature/screening/pattern/service.py`（`resolve_analysis_dates`）
- `app/feature/screening/pattern/routes.py`（呼叫處 + 過濾邏輯）

---

### 項目 9：指標摘要條件分開獨立顯示

#### 現狀

`displayConditions.join(' + ')` → 例："MA20 > MA50 + MA50 > MA150"

#### 修改內容

**sma.js 與 bollinger.js** 的 `confirmConfig()` 中，`conditionStr` 改為 HTML 換行：

```javascript
// 舊
const conditionStr = displayConditions.join(' + ');

// 新
const conditionStr = displayConditions.join('<br>');
```

同時，`summaryHTML` 中的 `summary-text` 需能渲染 HTML（改為 `.innerHTML` 賦值或使用 `white-space: pre-line` 搭配 `\n`）：

```html
<div class="ind-summary-text">
    MA-${period}:<br>${conditionStr}
</div>
```

#### 關聯檔案
- `app/feature/screening/indicators/modules/sma/sma.js`
- `app/feature/screening/indicators/modules/bollinger/bollinger.js`

---

## 四、MA 指標細節實作

### 項目 10：MA 參數單選互斥 + 連續週期實作

#### 編輯模式 UI 示意圖

```
┌─ MA 指標設定 ────────────────────────────────────────────────┐
│                                                              │
│  週期                                                        │
│  ┌──────┐  ┌──────┐  ┌─────┐  ┌────────┐                   │
│  │ 日K ▶│  │  周K │  │ 月K │  │ 60分K  │                   │
│  └──────┘  └──────┘  └─────┘  └────────┘                   │
│                                                              │
│  範圍                                                        │
│  ┌──────┐  ┌──────────────┐                                 │
│  │當前值│  │ 連續週期 ▶   │  ← 選擇後顯示下方輸入框         │
│  └──────┘  └──────────────┘                                 │
│            連續 [  5  ] 次  ← 僅「連續週期」active 時顯示   │
│                                                              │
│  條件                                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐          │
│  │  多頭排列 │  │  空頭排列 │  │    自訂 ▶         │          │
│  └──────────┘  └──────────┘  └──────────────────┘          │
│  （三選一互斥，每次只能點選一個）                              │
│                                                              │
│  條件列表（自訂模式下顯示）                                    │
│  ┌───────────┬─────┬───────┬────────────┬──────────────┐   │
│  │    MA     │ 20  │  大於  │    MA      │    50   │刪除│   │
│  └───────────┴─────┴───────┴────────────┴──────────────┘   │
│  ┌───────────┬─────┬───────┬────────────┬──────────────┐   │
│  │    MA     │ 50  │  大於  │    MA      │   150   │刪除│   │
│  └───────────┴─────┴───────┴────────────┴──────────────┘   │
│                                                              │
│  ＋ 添加條件                                                 │
│                                                              │
│  ─────────────────────────────────────────────────────       │
│                                   [取消]  [確定]            │
└──────────────────────────────────────────────────────────────┘
```

#### 前端修改（sma.js）

**a. 三選一互斥邏輯 + Hover Tooltip（多頭 / 空頭）**  
條件區的三個 pill 按鈕（多頭排列 / 空頭排列 / 自訂）加入互斥點擊：點選任一 → 其他兩個 `.active` 移除。

**當選擇「多頭排列」或「空頭排列」時（非自訂模式）**：
- 條件列（condition rows）與「+ 添加條件」按鈕**全數隐藏**
- 使用 `title` 屬性為按鈕加上 Hover Tooltip，揭示底層均線邏輯：

```javascript
bullBtn.title =
    'MA5 > MA10 > MA20 > MA50 > MA200\n' +
    'MA5（約1週）、MA10（約2週）、MA20（約1個月）短期趨勢\n' +
    'MA50（約2.5個月）中期趨勢、MA200（約1個交易年）長期趨勢';
bearBtn.title =
    'MA5 < MA10 < MA20 < MA50 < MA200\n（與多頭排列反向）';
```

**切換至「自訂」模式時**，條件列與「+ 添加條件」按鈕恢復顯示。

**b. 連續週期輸入框**  
「範圍」列：
- 選「當前值」→ 隱藏「連續 N 次」輸入框
- 選「連續週期」→ 顯示 `<input type="number" min="1" max="100" value="3">` ＋「次」標籤

**c. `confirmConfig()` 讀取 `range_n`**

```javascript
const rangeMode = card.querySelector('.config-row:nth-child(2) .config-pill-btn.active')?.textContent.trim();
const consecutiveN = rangeMode === '連續週期'
    ? parseInt(card.querySelector('.consecutive-n-input')?.value || '1')
    : 1;

const config = {
    ...
    range: rangeMode,
    range_n: Math.min(consecutiveN, 100),  // 上限 100
};
```

#### 後端修改（service.py）

在 `screen_single_stock()` 的指標評估迴圈中，新增連續 N 棒評估邏輯：

```python
range_n = indicator.get("range_n", 1)
is_consecutive = indicator.get("range", "當前值") == "連續週期" and range_n > 1

if is_consecutive:
    # 取最後 N 根 K 棒切片（防止 N 超過 eval_df 長度）
    actual_n = min(range_n, len(eval_df))
    target_slice = eval_df.iloc[-actual_n:]
    # 每根 K 棒都必須滿足所有條件
    for _, row_data in target_slice.iterrows():
        row_df = pd.DataFrame([row_data])
        for cond in conditions:
            if not evaluate_condition(row_df, cond).iloc[0]:
                indicator_met = False
                break
        if not indicator_met:
            break
else:
    # 原有邏輯：只評估最後一根 K 棒
    for cond in conditions:
        result_series = evaluate_condition(eval_df, cond)
        if not result_series.iloc[-1]:
            indicator_met = False
            break
```

#### N 最大值限制

前端 `max="100"`，後端 `min(range_n, 100)` 雙重保護。

#### 關聯檔案
- `app/feature/screening/indicators/modules/sma/sma.js`
- `app/feature/screening/service.py`（`screen_single_stock` 指標評估段落）

---

### 項目 11：「價格」選項隱藏多餘數值框

#### 問題

SMA 條件列的左側 select 選「價格（Price）」時，後方的 MA 週期 `<input type="number">` 仍顯示，屬多餘。

#### 修改

在 `sma.js` 的 `getConditionRowHTML()` 以及 `addConditionRow()` 中，加入 left-select 的 `change` 監聽：

```javascript
leftSelect.addEventListener('change', function() {
    const periodInput = this.closest('.condition-row').querySelector('input[type="number"]:first-of-type');
    if (this.value === 'Price') {
        periodInput.classList.add('is-hidden');
    } else {
        periodInput.classList.remove('is-hidden');
    }
});
// 初始化時也執行一次
if (leftSelect.value === 'Price') periodInput.classList.add('is-hidden');
```

#### 關聯檔案
- `app/feature/screening/indicators/modules/sma/sma.js`

---

### 項目 12：MA 自訂條件輸入框破版修正

#### 問題根本

`.condition-row` 使用硬編碼 `grid-template-columns: 80px 60px 80px 80px 60px 40px`（總計 ~420px + gap），面板寬度不足時會超出容器。

#### 修改

```css
/* screening.css — 取代原有 grid 定義 */
.condition-row {
    @apply flex flex-wrap items-center;
    gap: 4px;
}

.condition-row select {
    flex: 1 1 70px;
    min-width: 60px;
    @apply p-1 bg-bg-primary border border-border-color text-text-primary rounded;
    font-size: 11px;
}

.condition-row input[type="number"] {
    flex: 0 0 50px;
    width: 50px;
    @apply p-1 bg-bg-primary border border-border-color text-text-primary rounded;
    font-size: 11px;
}

.condition-row .btn-delete-row,
.condition-row .ind-delete-row {
    flex: 0 0 auto;
}
```

#### 關聯檔案
- `app/feature/screening/screening.css`（`.condition-row` 規則）

---

## 五、BOLL 指標細節實作

### 項目 13：BOLL 單選互斥 + 連續週期 + 2x2 RWD

#### 編輯模式 UI 示意圖

**窄模式（panel 寬度 < ~320px）— 2×2 + 自訂獨立一排：**

```
┌─ BOLL 指標設定 ───────────────────────────────┐
│                                               │
│  週期                                         │
│  ┌────┐  ┌────┐  ┌────┐  ┌────────┐          │
│  │日K▶│  │ 周K│  │ 月K│  │ 60分K  │          │
│  └────┘  └────┘  └────┘  └────────┘          │
│                                               │
│  範圍                                         │
│  ┌──────┐  ┌──────────────┐                  │
│  │當前值│  │ 連續週期 ▶   │                  │
│  └──────┘  └──────────────┘                  │
│            連續 [  3  ] 次                    │
│                                               │
│  條件（五選一互斥）                             │
│  ┌──────────┐  ┌──────────┐                  │
│  │ 升穿上軌 │  │ 升穿中軌 │  ←── 2x2 排列    │
│  ├──────────┤  ├──────────┤                  │
│  │ 跌穿中軌 │  │ 跌穿下軌 │                  │
│  └──────────┘  └──────────┘                  │
│  ┌──────────────────────────────────────┐    │
│  │              自訂 ▶                  │    │
│  └──────────────────────────────────────┘    │
│                                               │
└───────────────────────────────────────────────┘
```

**寬模式（panel 寬度足夠）— 全部一排：**

```
┌─ BOLL 指標設定 ───────────────────────────────────────────────────────┐
│  條件                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────┐   │
│  │ 升穿上軌 │  │ 升穿中軌 │  │ 跌穿中軌 │  │ 跌穿下軌 │  │自訂▶│   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └─────┘   │
└───────────────────────────────────────────────────────────────────────┘
```

#### CSS 佈局策略（bollinger.js / screening.css）

4 個預設條件按鈕放在 `.ind-pill-group-wrap`（`flex-wrap`），每個按鈕使用：

```css
.ind-pill-min {
    flex: 1 1 calc(50% - 8px);  /* 窄時 2x2，夠寬時自然展開 */
    min-width: 80px;
}
```

「自訂」按鈕獨立放在第二個 `.ind-pill-group`（不參與 wrap）。

#### 前端修改（bollinger.js）

1. **五選一互斥**：4 個預設 + 自訂共 5 個按鈕，點任一 → 其他 4 個 `.active` 移除
2. **連續週期輸入框**：同 MA，選「連續週期」→ 顯示 `input[max="100"]`
3. **`confirmConfig()`** 讀取 `range_n`，存入 config JSON

#### 後端修改

同項目 10（`screen_single_stock` 指標評估迴圈），BOLL 類型共用相同連續 N 棒邏輯。

#### 關聯檔案
- `app/feature/screening/indicators/modules/bollinger/bollinger.js`
- `app/feature/screening/screening.css`（`.ind-pill-min` 按鈕 RWD）
- `app/feature/screening/service.py`

---

### 項目 14：BOLL 文字修正 + 底層取值邏輯確認

#### UI 文字修正

1. **移除「添加條件」灰字標題**：刪除 `bollinger.js` 中 conditions-list 容器內的 `<div class="ind-conditions-list-title">添加條件</div>` 純文字標題。
   **嚴格保留**：下方綠色「+ 添加條件」可點擊按鈕必須保留，其行為如下：
   - 選擇四個预設條件時：**隐藏**（與條件列同步隐藏）
   - 切換至「自訂」模式時：**顯示**（允許使用者新增自訂條件行）

2. **下拉選單「最新價」→「價格」**：`getConditionRowHTML()` 中：
   ```html
   <!-- 舊 -->
   <option value="price">最新價</option>
   <!-- 新 -->
   <option value="price">價格</option>
   ```

3. **`presetDisplayMap` 同步更新**：
   ```javascript
   // 舊
   '升穿上軌': `BOLL 最新價 > UPPER${pVal}_${stdVal}`,
   // 新
   '升穿上軌': `BOLL 價格 > UPPER${pVal}_${stdVal}`,
   // 其餘三個同理
   ```

#### 底層取值邏輯確認（重要）

**結論：後端邏輯正確，無需修改。**

驗證過程：
1. `evaluate_condition(df, cond)` 中 `left: 'close'` / `right: 'close'` → 查 `df["close"]` 欄位（DataFrame 資料），**不是 API 即時價格**
2. `screen_single_stock()` 步驟 6 先按 `start_date ≤ datetime ≤ end_date` 裁切 `eval_df`，取 `eval_df.iloc[-1]`（**該時間視窗最後一根K棒的歷史收盤價**）

只要項目 8 修復「自訂特定時點」的日期視窗錯誤後，「價格」欄位自然綁定的就是正確的歷史收盤價，無額外後端修改。

#### 關聯檔案
- `app/feature/screening/indicators/modules/bollinger/bollinger.js`

---

## 六、指標定義規格（美股）

> 本系統為**美股（US Stock）**篩選系統，以下定義基於美股常用分析慣例。

### MA 指標編輯模式——Hover Tooltip 規範

> **設計準則**：當使用者選擇預設條件（多頭排列 / 空頭排列）時，下方條件列與「+添加條件」按鈕**全數隱藏**，改以按鈕的 **Hover Tooltip** 顯示其背後運算的底層邏輯與參數定義。

```
┌─ MA 指標設定 ─────────────────────────────────────────────────────┐
│                                                                   │
│  條件（三選一，互斥）                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │  ■ 多頭排列   │  │    空頭排列   │  │         自訂 ▶          │  │
│  └──────────────┘  └──────────────┘  └────────────────────────┘  │
│       ↑                                                           │
│  選擇多頭/空頭排列時：條件列全數隱藏，Hover 按鈕顯示 Tooltip       │
│  選自訂時：條件列與「+添加條件」按鈕恢復顯示                       │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

**Hover Tooltip 內容**：

| 按鈕 | Tooltip 文字 |
|------|------------|
| 多頭排列 | `MA5 > MA10 > MA20 > MA50 > MA200` — MA5（約1週）、MA10（約2週）、MA20（約1個月）短期；MA50（約2.5個月）中期；MA200（約1個交易年）長期 |
| 空頭排列 | `MA5 < MA10 < MA20 < MA50 < MA200`（與多頭排列反向） |

**摘要卡片（依【規則 1：摘要模式】生成單行字串）**

```
格式：{Indicator}-{範圍前綴}{Period_Text}: {Condition}

MA-日K: 多頭排列             ← N=1（當前值）
MA-連續5次日K: 多頭排列      ← N=5（連續週期）
MA-連續3次周K: 空頭排列      ← N=3, 周K
```

> 摘要卡片**不再條列底層公式**（如 MA5>MA10 等）；底層邏輯統一由 Hover Tooltip 承載。

---

### BOLL 指標編輯模式——Hover Tooltip 規範

> **設計準則**：當使用者選擇四個預設條件之一時，下方條件列與「+添加條件」綠色按鈕**全數隱藏**，改以 **Hover Tooltip** 顯示底層 BOLL 參數。切換至「自訂」時，條件列與綠色按鈕恢復顯示。

```
┌─ BOLL 指標設定 ────────────────────────────────────────────────────┐
│                                                                    │
│  參數設定                                                          │
│  計算週期  [  20  ]   (+/-)                                        │
│  標準差    [   2  ]   (+/-)                                        │
│                                                                    │
│  條件（五選一，互斥）                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ ┌─────┐  │
│  │■ 升穿上軌│  │  升穿中軌 │  │  跌穿中軌 │  │  跌穿下軌 │ │自訂▶│  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ └─────┘  │
│       ↑                                                            │
│  選擇四個預設時：條件列與綠色按鈕全數隱藏，Hover 顯示 Tooltip       │
│  選自訂時：條件列與「+添加條件」綠色按鈕恢復顯示                    │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**Hover Tooltip 內容（四個預設按鈕共用）**：

```
預設 BOLL period=20、std_dev=2
此為美股布林帶國際標準用法（John Bollinger 原始定義）
```

**四個預設的底層運算對應**（僅作開發文件參考，不在 UI 中顯示）：

```
  升穿上軌  →  close  >  BB_UPPER  (period, std)
  升穿中軌  →  close  >  BB_MIDDLE (period, std)
  跌穿中軌  →  close  <  BB_MIDDLE (period, std)
  跌穿下軌  →  close  <  BB_LOWER  (period, std)
```

> 以上均為「收盤價 vs 帶值」比較（簡化版，非嚴格交叉）；若後續需實作嚴格交叉，可在此基礎擴充。

**摘要卡片（依【規則 1：摘要模式】生成單行字串）**

```
格式：{Indicator}-{範圍前綴}{Period_Text}: {Condition}

BOLL-日K: 升穿上軌                       ← N=1（當前值）
BOLL-連續2次日K: 升穿上軌                ← N=2（連續週期）
BOLL-連續3次60分K: UPPER200_2>MIDDLER200_2  ← 自訂條件
```

> 摘要卡片**不再條列底層公式**；底層邏輯統一由 Hover Tooltip 承載。

---

### MA 多頭排列 / 空頭排列（定義用到的均線）

| 條件 | 定義 | 使用均線 |
|------|------|---------|
| **多頭排列** | 均線由短至長依序遞減（短線在上、長線在下） | MA5 > MA10 > MA20 > MA50 > MA200 |
| **空頭排列** | 均線由短至長依序遞增（短線在下、長線在上） | MA5 < MA10 < MA20 < MA50 < MA200 |

說明：
- MA5（約 1 週）、MA10（約 2 週）、MA20（約 1 個月）代表短期趨勢
- MA50（約 2.5 個月）代表中期趨勢
- MA200（約 1 個交易年）代表長期趨勢
- 此 5 條均線為美股分析最常見組合，後端預設在多頭 / 空頭排列時計算並評估這 5 條

後端生成的 `backendConditions`（多頭排列）：

```json
[
    { "left": "MA5",  "operator": ">", "right": "MA10"  },
    { "left": "MA10", "operator": ">", "right": "MA20"  },
    { "left": "MA20", "operator": ">", "right": "MA50"  },
    { "left": "MA50", "operator": ">", "right": "MA200" }
]
```

空頭排列將 `>` 全換為 `<`。

---

### BOLL 四個預設條件的參數定義

| 條件名稱 | 後端 condition | 使用的 BOLL 參數 |
|---------|---------------|----------------|
| **升穿上軌** | `{ left: "close", operator: ">", right: "BB_UPPER" }` | 使用者設定的 `計算週期`（預設 20）+ `標準差`（預設 2） |
| **升穿中軌** | `{ left: "close", operator: ">", right: "BB_MIDDLE" }` | 同上 |
| **跌穿中軌** | `{ left: "close", operator: "<", right: "BB_MIDDLE" }` | 同上 |
| **跌穿下軌** | `{ left: "close", operator: "<", right: "BB_LOWER" }` | 同上 |

說明：
- 四個預設條件的 BOLL 參數由**拖拉條（參數設定區）決定**，預設 period=20、std_dev=2（此為美股布林帶國際標準用法，John Bollinger 原始定義）
- 目前系統的「升穿」/ 「跌穿」是以單根 K 棒收盤價 vs 布林帶做比較（簡化版，非嚴格交叉），若後續需實作嚴格交叉（前根收盤 ≤ 軌道 且本根收盤 > 軌道），可在此基礎上擴充
- `BB_UPPER` / `BB_MIDDLE` / `BB_LOWER` 欄位由 `indicators/modules/bollinger/bollinger.py` 的 `calculate_bollinger_bands()` 寫入 DataFrame

---

## 七、配置範例說明

### MA 範例：「日K、連續週期（連續 5 次）、多頭排列」

**完整參數：**

```
類型:     MA (SMA)
週期:     日K (timeframe = 1d)
範圍:     連續週期
連續次數: 5
條件:     多頭排列
```

**這是什麼意思？**

從目標時間點（如 end_date = 2026-03-01）往前取最近 **5 根**日K棒，逐根驗證：
- 每一根都必須同時滿足：MA5 > MA10 > MA20 > MA50 > MA200

亦即：在 2026-02-25、2026-02-26、2026-02-27、2026-02-28、2026-03-01 這 5 個交易日，每天計算的 5 條均線都保持完整多頭排列。

**業務含義：**  
不只要求「目標日當天是多頭排列」，還要求這個狀態已持續了 5 個交易日，篩出更穩定、趨勢更強的標的，排除瞬間反彈的假訊號。

---

### BOLL 範例：「日K、連續週期（連續 3 次）、升穿上軌（period=20, std=2）」

**完整參數：**

```
類型:     BOLL (Bollinger Bands)
週期:     日K (timeframe = 1d)
計算週期: 20
標準差:   2
範圍:     連續週期
連續次數: 3
條件:     升穿上軌
```

**這是什麼意思？**

從目標時間點往前取最近 **3 根**日K棒，逐根驗證：
- 每一根的收盤價 (close) 都必須 > BB_UPPER（20日均線 ± 2倍標準差的上軌）

亦即：在最近 3 個交易日，每天的收盤價都突破了布林上軌。

**業務含義：**  
單根突破可能是假突破（spike），連續 3 日都在上軌之上，說明股票處於強勢突破狀態，波動性擴張且向上。適合短線動能策略。

---

## 八、風險摘要

| 項目 | 最大風險 | 失敗情境 | 替代方案 |
|------|---------|---------|---------|
| 2 | 重試仍耗盡仍無法連 MySQL | 網路設定或 MySQL 資料損毀 | 加 entrypoint.sh + mysqladmin ping loop |
| 5 | CSS `@container` 舊瀏覽器支援問題 | Chrome < 105、Safari < 16 不支援 Container Query | 改用 JS `ResizeObserver` 動態切換 class |
| 8 | End Date Anchoring 漏報 | YOLO box 偵測 end_date 有 ±1 天誤差 | 後續改為 ±1 trading day 容忍 |
| 8 | max_bars 估算不足 | pattern_max=60，回推天數 = 120 天，不足以包含指定歷史時間點 | 加大 buffer 係數，或前端允許使用者調整 |
| 10/13 | 連續 N 棒效能問題 | N=100 且有 2000 支股票時速度慢 | N 前後端均設上限 100；可加 exec_timeout |
| 1 | job_state 缺 target_start/end | 某些版本的 DB 可能無這兩欄 | fallback 顯示 "N/A"，不影響主流程 |

---

## 九、驗證步驟

### 自動化可驗

| 項目 | 驗證方式 |
|------|---------|
| 2 | `docker compose up -d`（不 --build），觀察 data_sync log，確認 `[startup_incremental_1d] started` 出現 |
| 3 | 等 23:55 或手動呼叫 `backup_user_data()`，確認 `env/mysql/seed/seed_user_data.sql` 有新日期 |
| 8 Bug1 | pytest 驗證 `resolve_analysis_dates(None, None, "2026-01-15", max_bars=60)` 回傳 start ≈ 2025-10-09 |
| 8 Bug2 | 執行 API，確認結果中所有 `pattern["end_date"] == "2026-01-15"` |
| 11 | 選「價格」→ 期數 input display:none；選「MA」→ 顯示 |

### 需手動驗證

| 項目 | 驗證步驟 |
|------|---------|
| 4 | 開啟篩選頁，確認標籤旁圖示為亮綠漏斗 |
| 5 | 拖拉左側 panel，確認市場範圍只在「全垂直 ↔ 全水平」兩個極端切換，無過渡狀態 |
| 6 | hover 刪除 (×) 按鈕，確認 tooltip 顯示「刪除」 |
| 7 | 確認表頭字體加大且公司名稱與現價在同一水平線 |
| 9 | MA 設定 2 個自訂條件後按確定，summary 應顯示兩行獨立條件，無「+」相連 |
| 10 | MA 三個條件按鈕點選任一，確認其餘兩個 active 狀態消失；設連續 5 次後執行篩選，結果數量應 ≤ 不設連續時的數量 |
| 12 | MA 自訂模式加入 3 個條件列，確認所有元素均在彈窗邊界內正常顯示 |
| 13 | BOLL 5 個按鈕點選任一互斥；窄面板驗證 2×2 排列；寬面板驗證 1×4 排列 |
| 14 | 條件列下拉選單選項名稱確認為「價格」（非「最新價」）；確認「添加條件」灰字標籤不見 |

---

## 十、模組化架構設計原則（高內聚 / 低耦合）

### 設計哲學

> **程式碼結構即商業邏輯結構（Code Structure = Business Logic）**
> 每一個功能模組對應一個業務概念；同一業務概念的前後端邏輯應集中在同一模組資料夾下，而非依圖層（templates / static / routes）水平切割。

### 模組化規範

| 原則 | 說明 |
|------|------|
| **高內聚** | 同一指標（如 MA）的 API、前端 JS、CSS、模板、服務層均放在 `indicators/modules/ma/` 下 |
| **低耦合** | 模組間只透過明確介面（API endpoint / shared helper）溝通，禁止跨模組直接存取內部函數 |
| **單一責任** | 每個檔案只做一件事：`bollinger.js` 只管 BOLL 指標 UI；`bollinger.py` 只管 BOLL 計算 |
| **共用邏輯集中** | 跨指標共用的 helper（如字串格式化）放在 `indicators/shared/` |

### 目錄結構建議

```
app/feature/screening/
└── indicators/
    ├── shared/                  ← 跨指標共用
    │   ├── format_helpers.js    ← buildSummaryText / buildTag / buildInsufficientTag
    │   └── format_helpers.py    ← 後端字串格式化對應
    ├── modules/
    │   ├── ma/
    │   │   ├── sma.js
    │   │   ├── sma.py (calculate)
    │   │   └── service.py
    │   └── bollinger/
    │       ├── bollinger.js
    │       ├── bollinger.py
    │       └── service.py
    └── registry.py              ← 指標註冊表（名稱 → 模組映射）
```

### 新功能開發流程

1. 在 `indicators/modules/{name}/` 建立對應資料夾
2. 定義前後端介面：前端 `{name}.js` exports `confirmConfig()`；後端 `{name}.py` exports `calculate_{name}()`
3. 在 `registry.py` 註冊新指標
4. 共用邏輯（字串生成、錯誤標籤）一律放 `shared/`，不在模組內重複實作

---

## 十一、通用 UI 字串生成規範（全指標適用）

### 變數定義

| 變數 | 說明 | 範例 |
|------|------|------|
| `{Indicator}` | 指標名稱 | MA, BOLL |
| `{Period_Text}` | 週期顯示文字 | 日K, 周K, 月K, 60分K |
| `{Period_Abbr}` | 週期縮寫 | D, W, M, H |
| `{N}` | 連續次數 | 1=當前值, 2,3... |
| `{Condition}` | 具體條件描述 | 多頭排列, 升穿上軌 |
| `{Missing_Line}` | 缺少資料的線名 | MA50, BOLL(200,2) |

### 週期縮寫對應表

| 週期 | 縮寫 |
|------|------|
| 日K | D |
| 周K | W |
| 月K | M |
| 60分K | H |

---

### 規則 1：摘要模式（Summary Mode）

**公式**：`{Indicator}-{範圍前綴}{Period_Text}: {Condition}`

| N 值 | 前綴 | 範例 |
|------|------|------|
| N = 1 | 無前綴 | `MA-日K: 多頭排列` |
| N > 1 | 連續{N}次 | `MA-連續5次日K: 多頭排列` |

```
MA-日K: 多頭排列             ← N=1
MA-連續5次日K: 多頭排列      ← N=5
BOLL-日K: 升穿上軌            ← N=1
BOLL-連續2次日K: 升穿上軌    ← N=2
BOLL-連續3次60分K: UPPER200_2>MIDDLER200_2  ← 自訂
```

---

### 規則 2：篩選標籤（Tag）

**公式**：`{N}{Period_Abbr}: {Indicator} {Condition}`

> 若 `{Condition}` 已含指標名稱（如「價格>MA200」），可省略 `{Indicator}`。

| 範例 | 說明 |
|------|------|
| `1D: MA 多頭排列` | N=1，日K，MA 指標 |
| `2D: BOLL 升穿上軌` | N=2，日K，BOLL 指標 |
| `1D: 價格>MA200` | condition 已含指標，省略 Indicator |
| `3W: MA 空頭排列` | N=3，周K |

---

### 規則 3：資料不足標籤（Insufficient Data Tag）

**公式**：`{Missing_Line} ({Period_Abbr})資料不足`

> **注意**：絕對不顯示 `{N}`；多條缺失線拆為獨立標籤。

| 範例 | 說明 |
|------|------|
| `MA50 (D)資料不足` | 日K，MA50 線資料不足 |
| `BOLL(20,2) (W)資料不足` | 周K，BOLL 線資料不足 |
| `MA200 (H)資料不足` | 60分K，MA200 線資料不足 |

---

### JS 通用 Helper 實作建議

> **建議建立** `indicators/shared/format_helpers.js`

```javascript
const PERIOD_ABBR = {
  '日K': 'D',
  '周K': 'W',
  '月K': 'M',
  '60分K': 'H'
};

/**
 * 規則 1：摘要模式字串
 * @param {string} indicator  - 指標名稱（MA / BOLL）
 * @param {string} periodText - 週期文字（日K / 周K...）
 * @param {string} condition  - 條件描述（多頭排列 / 升穿上軌...）
 * @param {number} n          - 連續次數（預設 1）
 */
function buildSummaryText(indicator, periodText, condition, n = 1) {
  const prefix = n > 1 ? `連續${n}次` : '';
  return `${indicator}-${prefix}${periodText}: ${condition}`;
}

/**
 * 規則 2：篩選標籤
 * @param {string} indicator  - 指標名稱
 * @param {string} periodAbbr - 週期縮寫（D / W / M / H）
 * @param {string} condition  - 條件描述
 * @param {number} n          - 連續次數（預設 1）
 */
function buildTag(indicator, periodAbbr, condition, n = 1) {
  const condHasIndicator = condition.includes(indicator) || condition.startsWith('價格');
  const indicatorPrefix = condHasIndicator ? '' : indicator + ' ';
  return `${n}${periodAbbr}: ${indicatorPrefix}${condition}`;
}

/**
 * 規則 3：資料不足標籤（不含 N）
 * @param {string} missingLine - 缺失線名（MA50 / BOLL(20,2)...）
 * @param {string} periodAbbr  - 週期縮寫
 */
function buildInsufficientTag(missingLine, periodAbbr) {
  return `${missingLine} (${periodAbbr})資料不足`;
}
```

### 後端對應實作建議

> **建議建立** `indicators/shared/format_helpers.py`

```python
PERIOD_ABBR = {
    '日K': 'D',
    '周K': 'W',
    '月K': 'M',
    '60分K': 'H',
}

def build_summary_text(indicator: str, period_text: str, condition: str, n: int = 1) -> str:
    prefix = f'連續{n}次' if n > 1 else ''
    return f'{indicator}-{prefix}{period_text}: {condition}'

def build_tag(indicator: str, period_abbr: str, condition: str, n: int = 1) -> str:
    cond_has_indicator = indicator in condition or condition.startswith('價格')
    indicator_prefix = '' if cond_has_indicator else f'{indicator} '
    return f'{n}{period_abbr}: {indicator_prefix}{condition}'

def build_insufficient_tag(missing_line: str, period_abbr: str) -> str:
    return f'{missing_line} ({period_abbr})資料不足'
```

### 實作位置對照

| 規則 | 前端 | 後端 |
|------|------|------|
| 規則 1（摘要） | `sma.js::confirmConfig()` / `bollinger.js::confirmConfig()` | `service.py::_build_summary()` |
| 規則 2（標籤） | 篩選結果渲染邏輯 | `service.py::_build_tag()` |
| 規則 3（不足） | JS inline or tag render | `service.py::_build_insufficient_tag()` |
