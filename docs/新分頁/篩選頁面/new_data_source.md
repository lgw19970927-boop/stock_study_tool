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

#### fetch_tickers.py
- 來源：NASDAQ Trader 的 listed 與 otc 檔案。
- 行為：合併、去重後 upsert 到 stock_meta（symbol 為主鍵）。
- 輸出欄位：symbol、name、market、status、last_updated 等。

#### sync_market_data.py
- 提供三種主流程：
  - incremental_update(interval)
  - progressive_backfill(interval)
  - ensure_data(tickers, interval, start, end)
- 核心下載點：download_chunk 內部呼叫 yf.download。
- 寫入策略：INSERT ... ON DUPLICATE KEY UPDATE 到 market_data_ohlcv。
- 失敗紀錄：download_failures。
- 回補紀錄：backfill_history（僅記錄完成批次，非每個 chunk checkpoint）。

#### data_validator.py（本次補充）
- 函式：validate_market_data(df)。
- 驗證項目：
  - DataFrame 不可為空。
  - 必要欄位 Open/High/Low/Close 必須存在。
  - 價格不可 <= 0。
  - High 必須 >= Low。
  - High 必須為 O/C 的上界，Low 必須為 O/C 的下界。
- 用途：download_chunk 存檔前做資料品質閘門。

#### gap_scanner.py（本次補充）
- 函式：scan_gaps(tickers=None, interval='1d', auto_fill=False)。
- 機制：逐檔查詢時間序列，若相鄰兩筆 datetime 差距 > 7 天，記錄到 data_gaps。
- 可選 auto_fill：針對缺口區段呼叫 sync_market_data 補資料。
- 注意：此模組是「連續時間缺口」掃描，與 ensure_data 的「完整度比例」是不同邏輯。

#### market_data.py（本次補充）
- 作用：提供篩選頁使用的市場資料 API。
- 主要能力：
  - /api/stocks：查股票清單。
  - /api/market-data/kline-count：回傳區間 K 棒數量。
  - /api/market-data/{symbol}：回傳 K 線資料。
  - 週/月/年線以日線重採樣（1w/1M/1y）。

### 1.3 目前「真的有排程執行」的任務

目前 scheduler.py 實際掛載如下（重點）：
- 週一至週五 18:00：incremental_update(interval='1d')
- 每日 02:00：progressive_backfill(interval='1d')
- 週日 03:00：ensure_data(['all'], '1d', '2024-01-01', None)

關鍵結論：
- 雖然 config.py 列出 timeframes 為 1d/1h/5m/1m，但目前排程實際只跑 1d。
- 1m、5m、1h 目前沒有排程任務自動維護，需額外流程或手動觸發才會跑。

### 1.4 Timeframe 支援狀態（同步與查詢）

| Timeframe | DB 可存放 | 目前排程自動更新 | 主要來源 |
|-----------|----------|------------------|----------|
| 1m | 可 | 否 | yfinance 原生（需額外排程/手動） |
| 5m | 可 | 否 | yfinance 原生（需額外排程/手動） |
| 1h | 可 | 否 | yfinance 原生（需額外排程/手動） |
| 1d | 可 | 是 | yfinance 原生（目前 scheduler 實際啟用） |
| 1W/1M/1Y | 非原生存表 | 查詢時計算 | 從 1d 重採樣 |
| 3m/15m/30m | 查詢層有映射 | 無同步、無重採樣策略 | 大多回傳無資料 |

---

## 貳、抓取規則與順序（三維度：ticker / timeframe / 時間範圍）

### 2.1 增量更新（incremental_update）實際順序

在單次執行中，順序是：
1. 先固定一個 timeframe（由函式參數 interval 決定，scheduler 目前給 1d）。
2. 讀取所有 Active ticker。
3. 每檔查最後日期，依「最後日期」分組。
4. 對每個 group 分別下載：
   - 沒有歷史資料的 ticker：用 period（如 1d= max）抓。
   - 有資料的 ticker：從 last_date+1 到 now。
5. 每個 group 內再依 chunk_size（20）分批下載。

因此不是「先把某檔所有 timeframe 抓完再換下一檔」，而是「單一 timeframe 下，依 ticker 群組批次處理」。

### 2.2 歷史回補（progressive_backfill）實際順序

在單次執行中，順序是：
1. 先固定一個 timeframe（scheduler 目前也是 1d）。
2. 計算本次目標歷史區間（預設往前 5 年）。
3. 對全部 Active ticker 下載同一段時間區間。
4. 完成後寫入 backfill_history，下一次再往更早區間推進。

因此回補策略是「先固定時間區間，再對所有 ticker 推進」，而非單檔股票一路補滿 20~30 年後再換下一檔。

### 2.3 程式中「一次請求」的定義（回答 yfinance 計數問題）

在本專案程式裡，一次請求對應為一次 yf.download 呼叫，其內容為：
- 一組 tickers（最多 20 檔，受 chunk_size 控制）
- 一個 interval（只能單一，例如 1d 或 1h，不可同時多個）
- 一個時間範圍（period 或 start/end）

延伸說明：
- 不能在同一次 yf.download 同時抓 1m、5m、1h、1d；需要分開呼叫。
- 「2000 次/小時」是社群實測等級，不是 Yahoo 官方公開 SLA。
- yfinance 內部可能對多 ticker 再拆多個 HTTP 往返，所以「外部看到一次函式呼叫」不一定等於「Yahoo 端一次網路請求」。

### 2.4 max_daily_downloads = 500 的實際含義

此參數在 sync_market_data 內是「單次 sync 呼叫最多處理幾檔 ticker」：
- 不是 500 次 API call。
- 不是全系統全日共用全域計數器。
- 也不是 500 * 20 檔。

實際效果：
- 若某次 sync 傳入 12,000 檔，會先被截到 500 檔。
- 500 檔在 chunk_size=20 下，約變成 25 次 yf.download 呼叫。
- incremental_update 若拆成多個 group，理論上每個 group 都會各自套一次 500 上限（不是全日共享桶）。

---

## 參、中斷恢復能力（container 關閉後能否續跑）

### 3.1 目前有哪些「進度紀錄」

- backfill_history：記錄已完成的回補區段（completed）。
- download_failures：記錄下載/驗證失敗。
- data_gaps：記錄 gap_scanner 掃到的連續缺口。

### 3.2 中斷後續跑現況

#### 增量更新
- 沒有「逐 chunk checkpoint」表。
- 但每次會從 DB 的最後日期重算要補的範圍，具備一定程度的可恢復性。

#### 歷史回補
- 只在整段回補完成後才寫 backfill_history。
- 中途關閉時，不會記錄「做到第幾個 chunk/第幾檔 ticker」。

### 3.3 重要限制

- 現況不是完整工作流引擎，屬「可重跑、但非精準斷點續傳」。
- 若要真正續跑，需要額外 job_state（保存 interval、target_window、chunk_index、ticker_cursor）。

---

## 肆、缺口補填定義、觸發條件與成因

### 4.1 目前有兩套「缺口」邏輯

#### A. ensure_data（完整度缺口）
- 定義：check_data_completeness < 0.9 才列入補填。
- 90%~100% 不會補。

#### B. gap_scanner（連續時間缺口）
- 定義：相鄰資料點時間差 > 7 天，視為缺口。
- 可選 auto_fill 逐缺口回補。

### 4.2 缺口為何會產生

常見來源：
- API 限速/429 或暫時封鎖。
- 個別 ticker 回傳異常，進入 download_failures。
- 非交易日、停牌、流動性極低標的造成預期筆數偏差。
- 排程未涵蓋該 timeframe（目前即為此情況）。
- 服務中斷或容器未在排程時段在線。

### 4.3 目前排程與缺口補填的落差（高風險）

目前 scheduler 週日任務直接呼叫：
- ensure_data(['all'], '1d', '2024-01-01', None)

此寫法有兩個風險：
- ['all'] 並非實際 ticker 清單，可能無法代表全市場掃描。
- end=None 可能導致完整度計算邊界行為不明確。

這部分建議在實作前先確認設計意圖（見第捌章待確認問題）。

---

## 伍、全市場更新可行性評估（現行設定）

### 5.1 現況是否足夠每日更新 12,000+ 檔

以目前「scheduler 只跑 1d + 每次 sync 上限 500 ticker」來看：
- 若多數 ticker 同一個 last_date，單次增量很容易只更新到前 500 檔。
- 1m/5m/1h 沒有排程，現況無法完成你目標中的四個 timeframe 每日自動維護。

### 5.2 一周內完成全市場十年歷史（1d）

若沿用保守限流（chunk_size 20、delay 5s、max_daily_downloads 500），實務上很難在 7 天內完成全市場 10 年日線。

最大瓶頸：
- 非官方來源限速不穩定（429/封鎖風險）。
- 目前排程與上限策略本身偏保守。

---

## 陸、替代與補充資料來源（含本次上網查詢）

> 註：價格與限制可能隨時調整，以下依 2026-04-02 查詢結果整理，實際以官網當下方案為準。

### 6.1 除 API選擇.md 外，新增可評估方案

| 來源 | 成本 | 適用場景 | 主要優點 | 主要限制 |
|------|------|----------|----------|----------|
| Twelve Data | 免費層 + 付費（月費） | 小中量增量更新 | 支援多 timeframe、支援 batch request | 免費額度偏小，18k 全市場壓力大 |
| EODHD | 免費 20 calls/日；付費約 $19.99~$99.99/月 | API 型日常增量 + 歷史補充 | 官網列有 intraday 深度、日呼叫量高 | 成本與資料一致性需額外驗證 |
| Alpaca Market Data | Free / $99（月） | 美股增量更新（非 OTC 全覆蓋） | Free 200 calls/min；Plus 可到 10,000 calls/min | OTC 需特殊訂閱條件，非一般免費覆蓋 |
| FirstRate Data（資料包+API） | 依 bundle 計費 | 一次性歷史打底（1m/5m/1h） | 提供大量歷史、含 delisted，支援每日更新包 | 主要偏資料包下載流程，非純即時 API |
| Kibot（資料包+訂閱更新） | 一次性/訂閱並行 | 一次性打底 + 後續更新 | 提供全市場/OTC 套餐與 API/FTP 更新 | 即時性非主打，需自行匯入與維護流程 |

### 6.2 不建議作為「低成本全市場主力」的候選

| 來源 | 原因 |
|------|------|
| Finnhub | OHLCV candle 為 Premium；All-in-One 成本高（官網顯示高價） |
| Databento | 優秀但偏交易所/授權導向，適合特定市場高品質資料，不一定符合 OTC 全市場低成本目標 |

### 6.3 實務建議（成本與成功率平衡）

1. 日線 1d：yfinance 為主，輔以 MarketData/EODHD 做 fallback。
2. 分線 1m/5m/1h：以一次性資料包打底（Kibot 或 FirstRate），之後再走日常增量。
3. 若堅持全 API：需接受較高月費或較低全市場覆蓋率。

---

## 柒、排程改造建議（符合「容器常關閉」現實）

你提出的優先級方向是可行的，建議採下列版本：

### 7.1 建議優先級

1. 增量更新（最高）
2. 歷史回補
3. 缺口補填

### 7.2 觸發機制建議

#### 啟動觸發（每次 container 啟動）
- 啟動後先跑一次「增量更新」。
- 增量完成後，若有資源再跑「歷史回補」一個窗口。
- 若無可回補窗口，再跑「缺口補填」。

#### 定時觸發（容器有長時間在線時）
- 保留每日固定時段任務作保險。
- 若啟動時已跑過，定時任務應能辨識避免重工。

### 7.3 需要補強的控制點

- 任務互斥鎖（避免啟動任務與 cron 同時跑）。
- 任務狀態表（job_state）記錄進度，實現真正續跑。
- 分層更新策略：活躍 ticker 日更、冷門 OTC 週更，否則全市場日更成本過高。

---

## 捌、最大風險、失敗情境與替代方案

### 8.1 最大風險

- 風險 1：排程目前只跑 1d，與「四個 timeframe 全自動」目標不一致。
- 風險 2：max_daily_downloads 被誤解，造成產能估算過度樂觀。
- 風險 3：yfinance 封鎖機制非固定 SLA，衝高並發可能突然失效。
- 風險 4：缺口補填任務參數可能有邏輯落差（['all'] / end=None）。

### 8.2 何種情況會失敗

- 容器不在線且沒有啟動補跑，排程長期 miss。
- API 被限流且沒有 fallback provider。
- 無 checkpoint，長任務中斷後反覆重跑同區段。
- 全市場 + OTC 全日更但仍採單一免費來源，吞吐不足。

### 8.3 更好的替代方案（由低改動到高穩定）

1. 低改動：保留 yfinance，先補「啟動即增量 + 優先級任務 + job_state」。
2. 中改動：日線與分線拆 provider（1d 便宜來源，分線用資料包打底）。
3. 高穩定：付費主源 + 免費 fallback 的雙來源架構。

---

## 玖、待確認疑問（隱藏邏輯/功能）

以下是目前程式閱讀後，需你確認的關鍵點：

1. scheduler 目前只排 1d 是刻意設計，還是尚未完成到 1m/5m/1h？
2. 週日任務呼叫 ensure_data(['all'], ..., end=None) 是否只是暫時占位？
3. 你希望「90%~100%」也做精修，還是維持現行 <90% 才補？
4. 啟動即跑時，是否接受「先增量跑很久，回補延後到下一次啟動」？
5. 目標全市場是否必含 OTC 全量日更；若是，是否接受活躍度分級更新？

---

## 拾、相關程式碼檔案位置

| 功能 | 檔案路徑 |
|------|----------|
| 排程管理 | env/data_sync/scheduler.py |
| 速率限制設定 | app/feature/data_management/sync/config.py |
| 核心下載引擎 | app/feature/data_management/sync/sync_market_data.py |
| 股票清單抓取 | app/feature/data_management/sync/fetch_tickers.py |
| 資料驗證 | app/feature/data_management/sync/data_validator.py |
| 缺口掃描 | app/feature/data_management/sync/gap_scanner.py |
| 市場資料查詢 | app/feature/data_management/sync/market_data.py |
| DB Schema | env/mysql/init.sql |
| 容器編排 | docker-compose.yml |
