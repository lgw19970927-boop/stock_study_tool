# 資料同步機制與 MySQL 架構參考文件

> 最後更新：2026-04-04
> 本文件涵蓋：資料同步三大策略的完整觸發條件、MySQL Volume 架構、資料庫完整 Schema、以及 SQL 備份機制說明。

---

## 一、資料同步架構總覽

系統的資料同步由 `stock-data-sync` container 負責，以 APScheduler 驅動三種獨立策略：**增量更新（Incremental Update）**、**歷史回補（Progressive Backfill）**、**缺口掃描（Gap Scanner）**。三者共用同一個 `SYNC_LOCK` — 任一時刻只有一個任務可以執行，其餘排隊等候。

```
stock-data-sync container 啟動
    │
    ├─ [立即執行] 啟動序列：Incremental → Backfill（啟動限定順序）
    │
    └─ APScheduler 持續背景執行
          ├─ 增量更新  Mon-Fri 18:00 起（4 個時間級別錯開）
          ├─ 歷史回補  每日凌晨 02:00 起（3 個時間級別錯開）
          └─ 缺口掃描  每週日 03:00（全時間級別統一觸發）
```

---

## 二、增量更新（Incremental Update）

**功能**：抓取各 ticker 尚未有的最新資料，從上次最新紀錄的「下一天」補到今天。

### 觸發時機

| 觸發情境 | 說明 |
|----------|------|
| **container 啟動時** | 自動執行一輪，四個時間級別依序執行（1d → 1h → 5m → 1m） |
| **每週一至週五 18:00 起** | 定時排程，四個時間級別依序錯開 10 分鐘執行 |

### 各時間級別排程

| 時間級別 | 定時排程時間（週一~五） | 啟動時是否執行 | 資料保留策略 |
|----------|------------------------|--------------|------------|
| **1d** | 每週一~五 **18:00** | ✅ 是 | 全歷史（max） |
| **1h** | 每週一~五 **18:10** | ✅ 是 | 最近 2 年（2y） |
| **5m** | 每週一~五 **18:20** | ✅ 是 | 最近 60 天（60d） |
| **1m** | 每週一~五 **18:30** | ✅ 是 | 最近 7 天（7d） |

### 機制說明

- 更新前先刷新 `update_tier`（僅 1d 觸發），將股票分為 `active` / `inactive` / `suspected_delisted` 三級。`suspected_delisted` 的 ticker 不更新；`inactive` 的 ticker 每週一才更新一次（`inactive_update_weekday=0`）。
- 若某 ticker 不存在任何該時間級別的紀錄，會以 `period_limit`（如 `max`、`2y`）抓取完整資料。
- **增量更新完成後**，會自動觸發 `backup_market_data()`，將 market_data 備份至 `env/mysql/seed/seed_market_data.sql`。

### 資料保留策略（period_limit）補充說明

「資料保留策略」欄顯示的數字（如 `2y`、`60d`）**並非每次增量更新所抓取的資料量**，而是用於兩種不同情境，意義各異：

| 情境 | 行為 |
|------|------|
| **該 ticker 已有舊資料** | 從上次最新日期 +1 天抓到今天 → 只抓缺口，這才是真正的「增量」 |
| **該 ticker 完全沒有任何紀錄**（新加入的股票） | 用 `period_limit` 抓整段歷史，例如 1h 就會一口氣抓 2 年 |

`period_limit` 的上限值也反映了 yfinance API 的資料可用範圍限制：

| 時間級別 | period_limit | 原因 |
|----------|-------------|------|
| 1d | max（全歷史） | 日線 API 可提供完整歷史 |
| 1h | 2y | yfinance 僅提供最近約 2 年的小時資料 |
| 5m | 60d | yfinance 僅提供最近 60 天的 5 分鐘資料 |
| 1m | 7d | yfinance 僅提供最近 7 天的 1 分鐘資料 |

### YF IP 鎖定（Rate Limit）導致空資料時的行為

**情境**：yfinance 因 IP 被 Yahoo Finance 鎖定（HTTP 429），導致某 ticker 下載回空資料，DB 中該 ticker 的該 timeframe **完全沒有任何紀錄**。

**下次 container 啟動時，增量更新會處理這支股票嗎？**

**答：會，且會以「完整歷史」的方式（`period_limit`）重新抓取，等同於新股票初始化。**

根據 `incremental_update()` 的邏輯（原始碼 L1182–1190）：

```python
last_date = get_last_data_date(ticker, interval)  # 查 DB 最新日期
if not last_date:   # 回傳 None → 表示 DB 完全沒有此 ticker 的資料
    key = 'full'    # → 歸入「全量抓取」群組
```

- DB 中若無此 ticker 的任何紀錄，`get_last_data_date()` 回傳 `None`
- `None` → key = `'full'` → 與「新加入股票」完全相同的處理路徑
- 最終用 `period_limit` 一次抓完整歷史：1d 用 `max`、1h 用 `2y`、5m 用 `60d`、1m 用 `7d`

| 空資料原因 | 下次啟動行為 |
|-----------|-------------|
| YF IP 鎖定（此次抓空，未寫入 DB） | ✅ 下次啟動視為「新 ticker」，以 `period_limit` 重抓完整歷史 |
| YF 有回傳資料但寫入量極少（部分成功） | ✅ 下次啟動視為「有部分舊資料」，從最新日期 +1 天開始增量更新 |
| 股票本身停牌 / 下市（`suspected_delisted`） | ❌ `get_tickers_for_update()` 直接跳過，不會嘗試更新 |

> **補充說明**：IP 被鎖時，`download_chunk()` 內的 `single_ticker_fallback()` 若也失敗，會記錄一筆 `download_failures` 並繼續處理下一 ticker，不會中止整個批次。因此同一批次內其他 ticker 的資料仍可正常寫入。

---

## 三、歷史回補（Progressive Backfill）

**功能**：以「逐步往過去推進」的方式，補齊更早期的歷史資料。每次執行往前補 5 年，直到抵達 `DYNAMIC_START_LOOKBACK_DAYS` 限制為止。

### 觸發時機

| 觸發情境 | 說明 |
|----------|------|
| **container 啟動時** | 執行 1d、1h 兩個時間級別（不含 5m、1m） |
| **每日凌晨 02:00 起** | 定時排程，三個時間級別依序錯開 20 分鐘 |

### 各時間級別排程

| 時間級別 | 定時排程時間（每日） | 啟動時是否執行 | 回補上限（最遠可回到） |
|----------|--------------------|--------------|----------------------|
| **1d** | 每日 **02:00** | ✅ 是 | 20 年前（DYNAMIC_START_LOOKBACK） |
| **1h** | 每日 **02:20** | ✅ 是 | 2 年前 |
| **5m** | 每日 **02:40** | ❌ 否（啟動不執行） | 60 天前 |
| **1m** | ❌ **無排程** | ❌ 否 | — |

> **為何 1m 沒有 Backfill？**
> 1 分鐘資料量是 5 分鐘的 5 倍，全量回補耗時極長且 yfinance 僅提供近 7 天的 1m 資料；超出此範圍的 1m 資料已無法透過 API 取得，因此 1m 只做增量更新，不做 Backfill。
>
> **為何 Dashboard 只顯示 1d 與 1h 的 Backfill 列？**
> Dashboard 讀取的是 `job_state` 資料表。5m backfill 的排程確實存在（每日 02:40），但只有成功執行過一次後才會在 `job_state` 留下紀錄並顯示。若 02:40 的任務尚未被觸發，Dashboard 就不會顯示該列。

- **回補完成後**，同樣會自動觸發 `backup_market_data()`。

### Backfill 的實際收益分析

一個常見疑問：既然 Incremental 對空 ticker 已用 `period='max'`（1d）或 `period='2y'`（1h）抓取 yfinance 所能提供的最大範圍，Backfill 還有什麼額外的意義？

**結論：Backfill 在大多數情境下收益有限，其價值集中在以下三個邊緣場景。**

#### 場景一：Ticker 已有部分歷史資料，但缺更早期的資料（最主要）

例如 ticker 的資料庫裡有 2020 年以後的資料（可能來自系統遷移、或某次 `period='max'` 只抓到一半），此時：

- **Incremental** 看到 `last_date = 2020-xx-xx` → **只往後抓**，不會往前補 2015~2019
- **Backfill 才會往前推**，把 2015~2019 的缺口填上

這是 Backfill 唯一能做到而 Incremental 做不到的事。

#### 場景二：Inactive 股票每日都能被觸及

| | Incremental | Backfill |
|--|-------------|---------|
| `inactive` 股票 | **只有週一**才更新 | **每天都更新** |

`inactive` 股票（低成交量、長期少交易）在 Incremental 中每週只被照顧一次，Backfill 讓這些股票的歷史資料能更頻繁地被填補。

#### 場景三：完全空白 Ticker 的可靠性補足

若某 ticker 的 `period='max'` 在 Incremental 階段因 timeout 或 rate limit 失敗，該 ticker 仍然是空的；Backfill 在凌晨提供第二次機會，以更小的時間分段（5 年/次）補上。不過此場景下 Gap Scanner 也能提供類似保護。

#### 收益矩陣

| 時間級別 | 完全空白 Ticker | 部分歷史缺失 | Inactive 股票補足 |
|----------|----------------|------------|-----------------|
| **1d** | ❌ 等效於 `period='max'` | ✅ 唯一能往前補的機制 | ✅ 每日觸及 |
| **1h** | ❌ 等效於 `period='2y'`（API 上限相同） | ✅ 同上 | ✅ 每日觸及 |
| **5m** | ❌ 等效於 `period='60d'` | ✅ 同上 | ✅ 每日觸及 |
| **1m** | — （無排程） | — | — |

---

## 四、缺口掃描（Gap Scanner）

**功能**：掃描所有 ticker 的資料完整度，針對缺口進行智能補填。分兩段處理：
- 完整度 **< 70%** → 整段全面重抓（Coarse Fill）
- 完整度 **70%~90%** → 僅對缺失日期段進行精修（Fine Fill）
- 完整度 **≥ 90%** → 略過

### 觸發時機

| 觸發情境 | 說明 |
|----------|------|
| **每週日 03:00** | 固定排程，全四個時間級別統一觸發 |
| **container 啟動時** | ❌ 不執行 |

### 各時間級別排程

| 時間級別 | 排程時間 | 掃描時間視窗（`DYNAMIC_START_LOOKBACK_DAYS`） |
|----------|----------|----------------------------------------------|
| **1d** | 每週日 **03:00** | 最近 20 年 |
| **1h** | 每週日 **03:00** | 最近 2 年 |
| **5m** | 每週日 **03:00** | 最近 60 天 |
| **1m** | 每週日 **03:00** | 最近 7 天 |

> **為何 Dashboard 不顯示缺口掃描的執行狀態？**
> `ensure_data()` 在底層確實呼叫 `sync_market_data()`，因此也會對 `job_state` 寫入記錄（`job_name` 為 `gap_coarse_{interval}` 或 `gap_fine_{interval}_{symbol}`）。但 Dashboard 的查詢條件只篩選 `job_name` 以 `incremental_` 或 `backfill_` 開頭的記錄，因此 Gap Scanner 的執行結果**雖有寫入 `job_state`，卻不會出現在 Dashboard 的 TIMEFRAME STATUS TABLE 中**。若需讓 Dashboard 顯示缺口掃描狀態，只需調整 Dashboard 的查詢條件即可。

---

## 五、MySQL 架構與 Volume 說明

### Container、Volume、資料的對應關係

```
Host 主機（Windows）
  └── Docker Volume: mysql_data
        └── 掛載至 container 內 /var/lib/mysql
              └── stock-mysql container（MySQL 8.0）
                    ├── Database: market_data
                    └── Database: user_data
```

- **Container 即等同讀寫 Docker Volume 內的 MySQL**：container 只是應用層，資料實際儲存在 `mysql_data` volume。
- 執行 `docker-compose down`（不加 `-v`）：**volume 保留，資料不消失**。
- 執行 `docker-compose down -v`：**volume 被刪除，所有資料清空**，需靠 seed 檔還原。

### `start_server.bat` 的資料行為

`start_server.bat` 執行流程為：`docker-compose down` → `docker-compose up --build -d`。

| 狀態 | 行為 |
|------|------|
| Volume `mysql_data` **已有資料** | `init.sql` / `seed_*.sql` **不執行**，舊資料完整保留 |
| Volume `mysql_data` **為空**（首次或曾 `down -v`） | 先執行 `01_init.sql` 建立 Schema → `02_seed_market_data.sql` 還原備份 → `03_seed_user_data.sql` 還原用戶資料 |

---

## 六、MySQL 完整 Schema

### Database: `market_data`

#### 資料表 `stock_meta`（股票元數據）

| 欄位名稱 | 型別 | 說明 |
|----------|------|------|
| `symbol` | VARCHAR(20) PK | 股票代碼 |
| `name` | VARCHAR(255) | 股票名稱 |
| `market` | VARCHAR(20) | 市場別：`Listed`（上市）、`OTC`（上櫃）、`IPO` |
| `sector` | VARCHAR(100) | 產業大類 |
| `industry` | VARCHAR(100) | 產業細類 |
| `listing_date` | DATE | 上市日期 |
| `last_updated` | DATETIME | 最後更新時間 |
| `dollar_vol_20d_avg` | DECIMAL(20,2) | 近 20 日平均成交金額（USD） |
| `last_trade_date` | DATE | 最後有成交量的日期 |
| `update_tier` | VARCHAR(20) | 更新分級：`active` / `inactive` / `suspected_delisted` |
| `last_tier_updated` | DATETIME | Tier 最後更新時間 |
| `status` | VARCHAR(20) | 狀態：`Active` / `Delisted` / `Suspended` |

**索引**：`market`、`status`、`update_tier`、`last_trade_date`

---

#### 資料表 `market_data_ohlcv`（K 線主表，約 700MB）

| 欄位名稱 | 型別 | 說明 |
|----------|------|------|
| `symbol` | VARCHAR(20) PK | 股票代碼 |
| `timeframe` | VARCHAR(10) PK | 時間級別：`1d`、`1h`、`5m`、`1m`、`1w`、`1M` |
| `datetime` | DATETIME PK | K 線時間（YYYY-MM-DD HH:MM:SS） |
| `open` | DECIMAL(15,4) | 開盤價 |
| `high` | DECIMAL(15,4) | 最高價 |
| `low` | DECIMAL(15,4) | 最低價 |
| `close` | DECIMAL(15,4) | 收盤價 |
| `volume` | BIGINT | 成交量 |

**索引**：`(symbol, timeframe, datetime)`、`symbol`、`datetime`

---

#### 資料表 `download_failures`（下載失敗紀錄）

| 欄位名稱 | 型別 | 說明 |
|----------|------|------|
| `id` | INT PK AUTO_INCREMENT | 主鍵 |
| `symbol` | VARCHAR(20) | 股票代碼 |
| `interval_type` | VARCHAR(10) | 時間級別 |
| `attempted_at` | DATETIME | 嘗試下載時間 |
| `error_message` | TEXT | 錯誤訊息 |

---

#### 資料表 `backfill_history`（歷史回補執行紀錄）

| 欄位名稱 | 型別 | 說明 |
|----------|------|------|
| `id` | INT PK AUTO_INCREMENT | 主鍵 |
| `interval_type` | VARCHAR(10) | 時間級別 |
| `start_date` | DATE | 本次回補起始日 |
| `end_date` | DATE | 本次回補結束日 |
| `completed_at` | DATETIME | 完成時間 |
| `total_tickers` | INT | 總 ticker 數 |
| `downloaded_count` | INT | 實際下載 ticker 數 |
| `status` | VARCHAR(20) | `completed` / `failed` / `partial` |

---

#### 資料表 `data_gaps`（Gap Scanner 缺口紀錄）

| 欄位名稱 | 型別 | 說明 |
|----------|------|------|
| `id` | INT PK AUTO_INCREMENT | 主鍵 |
| `symbol` | VARCHAR(20) | 股票代碼 |
| `interval_type` | VARCHAR(10) | 時間級別 |
| `gap_start` | DATE | 缺口起始日 |
| `gap_end` | DATE | 缺口結束日 |
| `detected_at` | DATETIME | 偵測到缺口的時間 |
| `filled_at` | DATETIME | 缺口填補完成時間 |
| `status` | VARCHAR(20) | `detected` / `filled` / `ignored` |

---

#### 資料表 `job_state`（任務斷點續跑）

| 欄位名稱 | 型別 | 說明 |
|----------|------|------|
| `id` | INT PK AUTO_INCREMENT | 主鍵 |
| `job_name` | VARCHAR(50) | 任務名稱（如 `incremental_1d_full`） |
| `interval_type` | VARCHAR(10) | 時間級別 |
| `status` | VARCHAR(20) | `running` / `completed` / `interrupted` |
| `last_ticker` | VARCHAR(20) | 最後處理的 ticker（用於斷點續跑） |
| `last_chunk_idx` | INT | 最後處理的 chunk 索引 |
| `target_start` | DATE | 本次同步的起始日期目標 |
| `target_end` | DATE | 本次同步的結束日期目標 |
| `started_at` | DATETIME | 任務開始時間 |
| `updated_at` | DATETIME | 最後更新時間 |

**唯一索引**：`(job_name, interval_type)` — Dashboard 讀取的正是此表。

##### `job_state` 實際記錄了哪些策略？

`job_state` 的寫入點在 `sync_market_data()` 函式內，**所有呼叫此函式的策略都會寫入**。由下表可知，三種策略實際上都有紀錄，差異在於 `job_name` 的前綴：

| 策略 | `job_name` 格式（範例） | Dashboard 是否顯示 |
|------|------------------------|-------------------|
| 增量更新（Incremental） | `incremental_1d_full`、`incremental_1d_2025-01-10` | ✅ 顯示 |
| 歷史回補（Backfill） | `backfill_1d`、`backfill_1h` | ✅ 顯示 |
| 缺口掃描 Coarse Fill | `gap_coarse_1d`、`gap_coarse_1h` | ❌ 不顯示（Dashboard 僅篩選 `incremental_` / `backfill_` 前綴） |
| 缺口掃描 Fine Fill | `gap_fine_1d_AAPL`（每個 ticker 一筆） | ❌ 不顯示 |

**`job_state` 的核心用途是斷點續跑（checkpoint）**，並非完整的執行日誌：

- 每個 `(job_name, interval_type)` 組合在資料表中只保留 **一筆**（`ON DUPLICATE KEY UPDATE`），永遠反映最新執行狀態
- 當 container 異常中止（status = `interrupted` 或 `running`），下次啟動時會讀取此表從上次的 `last_chunk_idx + 1` 繼續，避免重新跑完整批次
- 若 container 正常完成（status = `completed`），下次啟動時不套用舊 checkpoint，直接從頭執行
- **不是「增量更新有跑過的歷史紀錄」**，而是「目前這個 job 的最新一次執行狀態」

##### Chunk 分批機制與 job_state 的關係

`sync_market_data()` 將所有 ticker 按字母排序後，以 `chunk_size`（預設 20）為單位切成多個 chunk，逐批處理：

```
全部 ticker（排序後）= [AAPL, AMOM, ..., VICR, VIDI, ..., TSLA, ...]
                        ← chunk 0 →  ← chunk 1 →   ...  ← chunk N →
                             ↓
         download_chunk() 執行（批次下載 + fallback）
                             ↓
        _upsert_job_state(last_chunk_idx=0, status='running')
                             ↓
         download_chunk() 執行（下一批）
                             ...
```

**重要**：job_state 記錄的是「chunk 索引」，不記錄個別 ticker 是否成功。即使某 chunk 內所有 ticker 都因 Rate Limit 失敗（0/20 寫入 DB），`_upsert_job_state` 仍會被呼叫並推進 `last_chunk_idx`。

**下次 resume 的判斷邏輯（原始碼）：**

```python
resume_state = _get_running_job_state(...)  # 查 status IN ('running', 'interrupted')
start_chunk_idx = int(resume_state['last_chunk_idx']) + 1  # 從下一個 chunk 開始

# 如果 start_chunk_idx 已超過 total 數量 → 直接視為已完成跳過整個 job
if start_chunk_idx * chunk_size >= total:
    _upsert_job_state(..., 'completed')
    return  # ← 整組 tickers 全部略過！
```

這意味著，如果 Rate Limit 發生在 chunk 585，而 container 又在後續 chunk 被 kill，下次 resume 就會從 586 開始，chunk 585 及其所有失敗 ticker 永遠不會被重試。

##### advance_checkpoint 修復（2026-04-05 起生效）

為修正上述問題，`download_chunk()` 現在回傳 `bool` 表示是否有 Rate Limit 錯誤，`sync_market_data()` 使用 `advance_checkpoint` 旗標管控 checkpoint 推進：

```python
advance_checkpoint = True  # 初始可推進

chunk_had_rate_limit = download_chunk(...)  # 回傳 True 表示有 Rate Limit

if chunk_had_rate_limit:
    advance_checkpoint = False  # 凍結，後續 chunk 不再推進 checkpoint

if advance_checkpoint:  # 只有完全成功的 chunk 才更新 job_state
    _upsert_job_state(..., last_chunk_idx=chunk_idx)
```

| 情境 | checkpoint 行為 |
|------|----------------|
| Chunk 全部成功 | ✅ 推進 last_chunk_idx |
| Chunk 有任何 Rate Limit 失敗 | ❌ 凍結，後續 chunk 即使成功也不推進 |
| 下次 resume | 從最後一個「乾淨」chunk 的下一個開始，Rate Limit 批次全部重試 |
| 重複下載已成功的 chunk | 安全（MySQL ON DUPLICATE KEY UPDATE 冪等） |

---

### Database: `user_data`

#### 資料表 `strategies`（使用者篩選策略）

| 欄位名稱 | 型別 | 說明 |
|----------|------|------|
| `id` | INT PK AUTO_INCREMENT | 主鍵 |
| `name` | VARCHAR(255) | 策略名稱 |
| `description` | TEXT | 策略說明 |
| `is_active` | TINYINT(1) | 是否啟用（預設 1） |
| `created_at` | DATETIME | 建立時間 |
| `updated_at` | DATETIME | 最後修改時間 |
| `configuration` | LONGTEXT | JSON：指標設定、時間框架、篩選規則 |

**索引**：`name`

---

#### 資料表 `screening_results`（篩選結果快取）

| 欄位名稱 | 型別 | 說明 |
|----------|------|------|
| `id` | INT PK AUTO_INCREMENT | 主鍵 |
| `strategy_id` | INT FK | 關聯策略 ID（CASCADE DELETE） |
| `symbol` | VARCHAR(20) | 股票代碼 |
| `result_date` | DATE | 執行篩選的日期 |
| `price` | DECIMAL(15,4) | 當日價格 |
| `change_pct` | DECIMAL(8,4) | 漲跌幅（%） |
| `volume` | BIGINT | 成交量 |
| `signals` | LONGTEXT | JSON：觸發的條件詳情 |
| `created_at` | DATETIME | 建立時間 |

**索引**：`strategy_id`、`result_date`

---

## 七、SQL 備份機制與建議

### 現有備份檔案

| 備份檔案 | 備份目標 | 檔案大小（參考） |
|----------|----------|----------------|
| `env/mysql/seed/seed_market_data.sql` | `market_data` 整個 schema | ~335 MB |
| `env/mysql/seed/seed_user_data.sql` | `user_data` 整個 schema | ~3.8 KB |

備份方式為在 `data_sync` container 內呼叫 `docker exec stock-mysql mysqldump`，將結果寫回本地 `env/mysql/seed/` 目錄。

### 備份觸發時機（現況）

| 備份對象 | 排程觸發 | 自動觸發情境 |
|----------|----------|------------|
| **seed_user_data.sql** | 每日 **23:55** | 無其他觸發 |
| **seed_market_data.sql** | 每日 **23:59** | ① 每次 Incremental Update 完成後 ② 每次 Backfill 完成後 |

特別說明：`seed_market_data.sql` 的備份觸發頻率其實相當高——只要 Incremental 或 Backfill 任一策略執行完畢就會觸發一次，加上每日排程的 23:59，**實際一天可能備份 2~10 次以上**。

### 針對「只使用 start_server.bat」的使用模式評估

你的主要使用流程為：開啟 `start_server.bat` → 使用系統 → 手動關閉(docker-compose down)。

在這個模式下，備份機制的實際效果如下：

| 情境 | 結論 |
|------|------|
| **市場資料備份** | Container 啟動後 Incremental/Backfill 結束即會自動備份一次，**當日的市場資料會被保存**。不需要等到 23:59。 |
| **用戶策略備份** | 每日 23:59 才備份。**若在 23:55 前關機，本次新建的策略不會被備份**，下次 volume 若為空時將無法還原最新狀態。 |
| **備份頻率** | `seed_market_data.sql` 每次 incremental/backfill 後都會觸發全量 dump（~335MB），30 分鐘 timeout。若一天跑多輪，I/O 負擔不輕。 |

### 建議

**是否建議改變現有備份時機？**

針對你的使用模式，建議兩件事：

1. **`user_data` 改為「資料變動後即備份」**：每次新增、修改、刪除策略時觸發 `backup_user_data()`，而非固定時間。因為 user_data 很小（~4KB），備份幾乎瞬間完成，風險極低。可在策略的 CRUD API endpoint 於成功 commit 後加一行呼叫。

2. **`market_data` 維持現有機制即可**：market_data 體積龐大（~335MB），每次變動就備份的代價過高。現有的「任務完成後備份」策略已足夠合理——只要一天內有執行 Incremental 或 Backfill，備份就會自動更新。若你在非交易時段關機，不影響資料完整性（資料仍在 volume 中）。

---

## 八、常見問題：Rate Limit 導致的 job_state 污染與手動修復

### 問題描述

Yahoo Finance IP 限速（HTTP 429 / YFRateLimitError）期間，若整批 chunk 全數失敗（0/20 寫入 DB），**2026-04-05 之前的舊版本**仍會將該 chunk 標記為已完成並推進 checkpoint。若發現異常後手動 kill container，下次啟動時 resume 會從失敗 chunk 的下一個開始，跳過所有 Rate Limit 批次。

> **2026-04-05 起已透過 `advance_checkpoint` 機制修正此問題**（詳見 Schema 章節說明）。新版本一旦偵測到 Rate Limit，後續 checkpoint 不再推進，確保下次 resume 能夠重試失敗批次。

### 診斷：確認 job_state 是否有問題

```sql
-- 查看所有 job_state（重點看 status='running' 且 last_chunk_idx 很大的）
SELECT job_name, interval_type, status, last_ticker, last_chunk_idx, updated_at
FROM market_data.job_state
ORDER BY updated_at DESC;

-- 查看 Rate Limit 失敗紀錄數量
SELECT interval_type, COUNT(*) AS cnt, MAX(attempted_at) AS last_failure
FROM market_data.download_failures
WHERE error_message LIKE '%rate limit%' OR error_message LIKE '%Too Many Requests%'
GROUP BY interval_type;
```

執行方式（在 Host PowerShell，不需進入 container）：
```powershell
docker exec stock-mysql mysql -u root -prootpassword123 market_data -e "SELECT job_name, status, last_ticker, last_chunk_idx FROM job_state"
```

### 修復：將 checkpoint 重設為從頭開始

**情境 A：只重設特定 job（推薦，精準）**

```sql
-- 將 incremental_1d_full 的 checkpoint 重設到 chunk 0（從頭重跑）
UPDATE market_data.job_state
SET last_chunk_idx = -1,
    last_ticker = NULL,
    status = 'interrupted',
    updated_at = NOW()
WHERE job_name = 'incremental_1d_full'
  AND status IN ('running', 'interrupted');
```

**情境 B：重設所有仍在執行中的 job（container 意外 kill 後使用）**

```sql
UPDATE market_data.job_state
SET last_chunk_idx = -1,
    last_ticker = NULL,
    status = 'interrupted',
    updated_at = NOW()
WHERE status = 'running';
```

執行方式（在 Host PowerShell）：
```powershell
# 重設 incremental_1d_full（最常用）
docker exec stock-mysql mysql -u root -prootpassword123 market_data -e "UPDATE job_state SET last_chunk_idx=-1, last_ticker=NULL, status='interrupted', updated_at=NOW() WHERE job_name='incremental_1d_full' AND status IN ('running','interrupted')"

# 重設全部 running 狀態的 job
docker exec stock-mysql mysql -u root -prootpassword123 market_data -e "UPDATE job_state SET last_chunk_idx=-1, last_ticker=NULL, status='interrupted', updated_at=NOW() WHERE status='running'"
```

### 修復前後對比

| | 修復前 | 修復後 |
|---|---|---|
| last_chunk_idx | 585（VICR之後，包含失敗批次） | -1（強制從頭） |
| 下次啟動起點 | chunk 586（跳過所有失敗批次）❌ | chunk 0（全部重試）✅ |
| 重複下載已成功 chunk | ON DUPLICATE KEY UPDATE，安全無害 ✅ | 同左 |

> **注意**：重設後下次啟動的增量更新時間會較長（需從全部 ticker 重新驗證），屬正常現象。

---

*由 Antigravity 根據原始碼自動分析生成。如有程式碼修改，請同步更新本文件。*
