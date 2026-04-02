# 資料來源與 API 分析報告

> **修訂日期：** 2026-04-02
> **適用範圍：** Stock AI Filter PRO — data_sync 模組、篩選頁面資料支撐
> **本版重點：** 依實際程式碼重新校正抓取順序、請求計數、續跑能力、缺口補填定義與排程策略

---

## 壹、目前程式碼實作現況（以實際程式為準）

### 1.1 資料同步架構總覽

```
env/data_sync/scheduler.py          ← APScheduler 任務排程（data_sync container）
app/feature/data_management/sync/
    config.py                       ← 速率限制、排程設定、timeframe period 設定
    fetch_tickers.py                ← NASDAQ Trader 主清單下載（Listed + OTC）
    sync_market_data.py             ← 核心下載引擎（yfinance → MySQL）
    data_validator.py               ← OHLCV 資料品質驗證
    gap_scanner.py                  ← 連續時間缺口掃描（可選自動補填）
    market_data.py                  ← 市場資料查詢與重採樣 API 工具
env/mysql/init.sql                  ← market_data / user_data schema 與表定義
```

### 1.2 關鍵模組功能補充

#### `fetch_tickers.py`
- 從 NASDAQ Trader 公開 URL 下載美股股票主清單：
  - **Listed（上市股票）**：NASDAQ、NYSE、AMEX，約 **6,000～8,000 支**
  - **OTC（場外交易）**：粉單市場股票，約 **10,000～15,000 支**
- 合併去重後 upsert 至 MySQL `stock_meta` 資料表（含 `symbol`、`name`、`market`、`status`）

#### `sync_market_data.py` — 三種下載策略

| 策略 | 函式 | 觸發時機 | 說明 |
|------|------|----------|------|
| **增量更新** | `incremental_update()` | 週一至週五 18:00 | 每支股票查最後日期，僅下載缺失的最新資料 |
| **歷史回補** | `progressive_backfill()` | 每日 02:00 | 每次往前回補 5 年，上限 20 年 |
| **缺口補填** | `ensure_data()` | 每週日 03:00 | 針對完整度 < 90% 的股票補填指定區間 |

#### `config.py` — 速率限制設定

```python
RATE_LIMIT_CONFIG = {
    'chunk_size': 20,            # 每批次同時下載幾支股票
    'batch_delay_seconds': 5,    # 批次間延遲（秒）
    'max_daily_downloads': 500,  # 每日下載上限（安全閥）
    'retry_attempts': 3,
    'retry_backoff': [5, 15, 60] # 重試等待時間（秒）
}

TIMEFRAME_SETTINGS = {
    '1d': {'period_limit': 'max',  'desc': 'Full History'},
    '1h': {'period_limit': '2y',   'desc': 'Rolling 2 Years'},
    '5m': {'period_limit': '60d',  'desc': 'Rolling 60 Days'},
    '1m': {'period_limit': '7d',   'desc': 'Rolling 7 Days'}
}
```

### 1.3 目前支援的資料維度

| 欄位 | 說明 |
|------|------|
| `market_data_ohlcv.timeframe` | 支援 `1d`、`1h`、`5m`、`1m`（週線/月線需另行確認是否已抓取）|
| 股票範圍 | 美股為主（NASDAQ、NYSE、AMEX + OTC） |
| 歷史深度（日線） | 理論上 `period='max'` 可追到上市日起（部分股票可達 30+ 年），但實際取決於 yfinance 回傳 |
| 歷史深度（時線） | 滾動最近 2 年 |
| 歷史深度（5 分） | 滾動最近 60 天 |
| 歷史深度（1 分） | 滾動最近 7 天 |

### 1.4 各 Timeframe 資料產生方式分析（含作圖與後端分析）

目前專案中不同時間週期的 K 線資料產生方式，可分為「**直接拉取 (Native)**」與「**後端重採樣合成 (Resampled)**」兩類，部分前端按鈕甚至存在資料斷層的隱患：

| Timeframe | 產生方式 | 來源流向與依賴說明 | 狀態 / 問題點 |
|-----------|----------|-------------------|---------------|
| **1 min** | **原生 API 抓取** | 由排程直接從 yfinance 下載 (`1m`) 寫入資料庫。<br/>作圖與篩選皆直接查詢 DB 中的 `1m` 原生資料。 | ✅ 正常支援（滾動 7 天）|
| **3 min** | ❌ **未支援/未同步** | 前端有 `3m` 按鈕，會向後端請求該區間。但後端排程不下載 `3m`，也無重採樣合成邏輯，DB 查詢將直接回傳空陣列 `[]`。 | ⚠ 點擊會顯示無資料 |
| **5 min** | **原生 API 抓取** | 由排程直接從 yfinance 下載 (`5m`) 寫入資料庫。<br/>作圖與篩選皆直接查詢 DB 中的 `5m` 原生資料。 | ✅ 正常支援（滾動 60 天）|
| **15 min**| ❌ **未支援/未同步** | 前端有 `15m` 按鈕，無對應同步排程，也未於 `RESAMPLE_RULES` 中定義由 `1m` 或 `5m` 合成的邏輯。查詢直接回傳空陣列 `[]`。 | ⚠ 點擊會顯示無資料 |
| **30 min**| ❌ **未支援/未同步** | 前端有 `30m` 按鈕，無對應同步排程，也未於 `RESAMPLE_RULES` 中定義由 `1m` 或 `5m` 合成的邏輯。查詢直接回傳空陣列 `[]`。 | ⚠ 點擊會顯示無資料 |
| **1H** (60m)| **原生 API 抓取** | 由排程直接從 yfinance 下載 (`1h`) 寫入資料庫。<br/>作圖與篩選皆直接查詢 DB 中的 `1h` 原生資料。 | ✅ 正常支援（滾動 2 年）|
| **4H** | **後端合成 (Resample)** | 依賴原生 **1H** (1h) 資料。後端透過 Pandas (`4h` 規則) 將 `1h` 計算成 `4H` 的 OHLCV，再回傳給前端作圖或篩選。 | ✅ 正常支援 |
| **1D** | **原生 API 抓取** | 由排程直接從 yfinance 下載 (`1d`) 寫入資料庫。<br/>作圖與篩選皆直接查詢 DB 中的 `1d` 原生資料。 | ✅ 正常支援（最長歷史）|
| **1M** (月線)| **後端合成 (Resample)** | 依賴原生 **1D** (1d) 資料。後端透過 `ME` / `MS` (Month Start/End) 規則，將日線打包成月線，包含作圖與指標計算。 | ✅ 正常支援 |
| **1Y** (年線)| **後端合成 (Resample)** | 依賴原生 **1D** (1d) 資料。後端透過 `YS` (Year Start) 規則，將日線打包成年線供作圖與指標使用。 | ✅ 正常支援 |

> **總結：**
> - **真實有存進 DB 的：** `1m`, `5m`, `1h`, `1d`（為真正抓取的原始快照）。
> - **靠後端程式動態合成：** `4h`（來自 `1h`）、`1M` 與 `1Y` 以及 `1W` 週線（來自 `1d`）。
> - **目前的隱患：** `3min`, `15min`, `30min` 按鈕在 UI 上存在，但後端既無資料排程庫存也無重採樣邏輯，形成功能斷層（圖表將顯示空白）。

---

## 貳、目前實際資料量（估算）

> **⚠ 免責聲明：** 以下為基於程式碼邏輯與 yfinance 限制的**理論估算**，實際數量需直接查詢資料庫確認。

### 2.1 股票數量

| 類型 | 估算數量 |
|------|----------|
| 美股 Listed（主板） | ~6,000～8,000 支 |
| 美股 OTC | ~10,000～15,000 支 |
| **合計（含 OTC）** | **~16,000～23,000 支** |
| Active（排除下市） | 估計 ~12,000～18,000 支 |

*實際已同步到資料庫的數量受 `max_daily_downloads = 500` 限制。*

### 2.2 資料筆數估算（日線，假設已同步 5,000 支股票）

| 回測深度 | 每支股票資料點 | 5,000 支合計 |
|----------|---------------|--------------|
| 1 年（約 252 個交易日） | 252 筆 | 126 萬筆 |
| 5 年 | 1,260 筆 | 630 萬筆 |
| 10 年 | 2,520 筆 | 1,260 萬筆 |
| 20 年 | 5,040 筆 | 2,520 萬筆 |

### 2.3 何時開始抓取

- **首次啟動時**：呼叫 `incremental_update()` 對所有 Active 股票以 `period='max'` 下載全部歷史（日線）
- **後續每日**：18:00 增量更新當日新增資料
- **每日凌晨 02:00**：`progressive_backfill` 往前回補（預設每次 5 年，最多 20 年）

---

## 參、能否在一周內抓完全市場十年歷史？

### 3.1 計算分析

**目標：** 全市場（~18,000 支 Active 股票）× 10 年日線歷史

**現有設定限制：**

```
max_daily_downloads = 500 支/天
18,000 支 ÷ 500 支/天 = 36 天才能完成
```

**結論：以現有設定，無法在一周內完成，最少需要 36 天。**

### 3.2 為什麼不能更快？

#### 原因 1：Yahoo Finance（yfinance）未公開速率限制，但有實際封鎖機制
- Yahoo Finance 沒有官方 API（yfinance 是反向工程）
- 快速大量請求會觸發 HTTP 429（Too Many Requests）或封鎖 IP
- 社群經驗：連續請求超過 ~2,000 次/小時容易被 IP 封鎖
- `batch_delay_seconds = 5` 是防止封鎖的保守設定

#### 原因 2：`max_daily_downloads = 500` 是主動安全閥
- 這是程式碼中**故意設定的上限**，避免意外觸發大規模下載
- 即使技術上可以更快，也需要評估 IP 封鎖風險

#### 原因 3：如果移除安全閥，速度計算如下

```
18,000 支 ÷ 20 支/批次 = 900 個批次
900 批次 × 5 秒延遲 = 4,500 秒 ≈ 1.25 小時（純計算，不含網路延遲+重試）

實際估算加上：
  - 下載時間（每批次 1-5 秒）
  - 重試（部分股票會失敗）
  - 資料寫入 MySQL
≈ 4～8 小時 可完成 18,000 支 × 1 次請求
```

**但每次只是下載「最新快照」，10 年歷史每支股票資料量更大，實際可能需要 8～20 小時。**

#### 原因 4：yfinance 的 multi-ticker 下載限制
- yfinance `yf.download(tickers_list, period='max')` 支援多股批次
- 但返回的 MultiIndex DataFrame 解析有時失敗
- 部分股票（尤其 OTC）歷史資料缺失或不規則

### 3.3 如果真的要一周內完成

**方案 A：放寬現有設定（有風險）**
```python
RATE_LIMIT_CONFIG = {
    'chunk_size': 50,            # 增大每批次
    'batch_delay_seconds': 2,    # 縮短延遲
    'max_daily_downloads': 5000, # 大幅提升上限
}
```
- 風險：IP 被 Yahoo Finance 封鎖（至少封 24 小時）
- 建議：先用小樣本測試（100 支股票）觀察封鎖臨界點

**方案 B：使用付費 API（見第四章推薦清單）**
- 有 SLA 保障的 API 通常允許每分鐘幾百到幾千次請求
- 完全可以在數小時內完成全市場歷史下載

**方案 C：使用公開資料集（最快）**
- Kaggle、Quandl、S&P Capital IQ 等有預打包的美股歷史資料集
- 直接下載 CSV 壓縮包後匯入 MySQL，可在幾小時內完成

---

## 肆、推薦的替代/補充 API（免費優先）

### 4.1 免費方案

| API | 覆蓋率 | 歷史深度 | 速率限制 | 備注 |
|-----|--------|----------|----------|------|
| **yfinance（現有）** | 全球 | max（可達 30+ 年） | 非官方，約 2,000 req/hr 實測 | 免費但不穩定 |
| **Alpha Vantage（免費）** | 全球 | 20 年 | 5 次/分鐘，500 次/天 | 免費版太慢；premium 速度快 |
| **Tiingo（免費）** | 美股 | 30+ 年 | 500 次/天，50 次/小時 | 資料品質高於 yfinance |
| **Alpaca（免費）** | 美股 | 5+ 年（免費） / 10+ 年（付費） | 200 次/分鐘 | 需開戶；免費可用 |
| **EODHD（免費試用）** | 70+ 交易所 | 30+ 年 | 20 次/日（免費）| 免費版實用性低 |
| **Stooq** | 美/歐 | 20+ 年 | 無官方限制（非 API） | 需爬蟲，無 Python SDK |

### 4.2 付費方案（推薦）

| API | 覆蓋率 | 歷史深度 | 價格（月） | 速率限制 | 推薦指數 |
|-----|--------|----------|------------|----------|----------|
| **Polygon.io** | 美股 | 20+ 年（含 OTC） | $29/月起 | Unlimited（付費） | ⭐⭐⭐⭐⭐ |
| **Alpha Vantage（Premium）** | 全球 | 25+ 年 | $50/月起 | 75 次/分鐘 | ⭐⭐⭐⭐ |
| **Tiingo（Premium）** | 美股 | 30+ 年 | $10/月起 | Unlimited | ⭐⭐⭐⭐⭐ |
| **IEX Cloud（付費）** | 美股 | 15 年 | $9/月起 | 按請求計費 | ⭐⭐⭐ |
| **Nasdaq Data Link（Quandl）** | 美股+更多 | 20+ 年 | 依資料集 | 依方案 | ⭐⭐⭐⭐ |
| **FinancialModelingPrep** | 全球 | 30+ 年 | $19/月起 | 300 次/分鐘 | ⭐⭐⭐⭐ |

### 4.3 預打包資料集（一次性下載全市場歷史）

如果目標是「一次性」取得全市場十年歷史日線資料，這些方式最快：

| 來源 | 格式 | 費用 | 備注 |
|------|------|------|------|
| **Kaggle - US Stock Market Dataset** | CSV | 免費 | 多個公開資料集，涵蓋 S&P 500 或全市場 |
| **Yahoo Finance Bulk Download（via yfinance）** | CSV | 免費 | 用腳本批次下載後轉入 MySQL |
| **Stooq Bulk Data** | CSV.ZIP | 免費 | 支援美股全市場 OHLCV 日線歷史，直接下載壓縮包 |
| **Polygon.io Flat Files** | CSV/Parquet | $79/月（含） | 可直接下載 S3 儲存的原始資料，最快 |

#### 推薦：Stooq Bulk Data（免費最快方案）

```
https://stooq.com/db/h/
- 提供美股、歐股等歷史日線 CSV 壓縮包
- 可直接下載 "US Stocks Daily" ~100MB ZIP
- 覆蓋幾千支主要美股，歷史可達 10-20 年
- 需要編寫匯入腳本（CSV → MySQL）
```

---

## 伍、整合建議

### 5.1 短期（MVP 現實可行）

1. **維持 yfinance 現有架構**作為主力資料來源
2. **調整 `max_daily_downloads` 為 2,000**（謹慎測試後）
3. **增加 Tiingo 或 Alpha Vantage 作為備援/補充**（當 yfinance 失敗時自動 fallback）
4. 在 scheduler 中增加 `日線全量回補` job，專門以高並發下載全市場日線歷史

### 5.2 中期（P2）

1. **引入 Polygon.io 或 Tiingo Premium**（約 $10-29/月），獲得更穩定的 API 保障
2. 重構 data_sync 為**多 Provider** 架構，不同 timeframe 用不同 API
   - 日線：Tiingo（品質佳，價格低）→ yfinance fallback
   - 分時：Polygon.io（支援 intraday 歷史）

### 5.3 Schema 補充建議

目前 `stock_meta` 建議新增欄位：
```sql
ALTER TABLE stock_meta 
  ADD COLUMN delisted_date DATE DEFAULT NULL,
  ADD COLUMN last_sync_date DATE DEFAULT NULL,
  ADD COLUMN data_provider VARCHAR(50) DEFAULT 'yfinance';
```

---

## 陸、相關程式碼檔案位置

| 功能 | 檔案路徑 |
|------|----------|
| 排程管理 | `env/data_sync/scheduler.py` |
| 速率限制設定 | `app/feature/data_management/sync/config.py` |
| 核心下載引擎 | `app/feature/data_management/sync/sync_market_data.py` |
| 股票清單抓取 | `app/feature/data_management/sync/fetch_tickers.py` |
| 資料驗證 | `app/feature/data_management/sync/data_validator.py` |
| 缺口掃描 | `app/feature/data_management/sync/gap_scanner.py` |
