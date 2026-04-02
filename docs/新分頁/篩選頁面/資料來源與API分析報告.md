# 資料來源與 API 分析報告

> 修訂日期：2026-04-02  
> 適用範圍：Stock AI Filter PRO（data_sync、篩選與圖表資料層）  
> 本版重點：補回舊版缺漏章節（含 1.4、資料估算、抓取時間估算），並全面校正為與現行程式一致

---

## 壹、目前程式碼實作現況（以程式為唯一準據）

### 1.1 同步架構總覽

```
env/data_sync/scheduler.py
  └─ APScheduler：目前實際排程只啟用 1d 任務

app/feature/data_management/sync/
  ├─ config.py            速率限制、週期設定
  ├─ fetch_tickers.py     下載 Listed + OTC 股票主清單
  ├─ sync_market_data.py  核心下載器（yf.download）
  ├─ data_validator.py    OHLCV 驗證閘門
  ├─ gap_scanner.py       連續時間缺口掃描
  ├─ market_data.py       圖表與查詢 API（含部份重採樣）
  └─ fetch_basis_data.py  手動型全週期基礎補齊腳本（非排程）

env/mysql/init.sql
  └─ stock_meta / market_data_ohlcv / download_failures / backfill_history / data_gaps
```

### 1.2 目前實際啟用排程（scheduler.py）

| 任務 | 時間 | 目前 interval | 說明 |
|---|---|---|---|
| incremental_update | 週一至週五 18:00 | 1d | 補當日增量 |
| progressive_backfill | 每日 02:00 | 1d | 逐步往前回補 |
| ensure_data | 週日 03:00 | 1d | 補完整度不足區間 |

重要校正：
- config.py 雖列出 1d/1h/5m/1m，但 scheduler 現在實際只排 1d。
- 因此 1m/5m/1h 不會自動日更，除非手動或另外新增排程。

### 1.3 關鍵模組具體功能（補強版）

#### fetch_tickers.py
- 來源：NASDAQ Trader 的 listed + otc 檔。
- 輸出：upsert 進 stock_meta（symbol、name、market、status、last_updated）。
- 範圍：包含 OTC（符合你「OTC 也要」的方向）。

#### sync_market_data.py
- sync_market_data(tickers, interval, period/start-end)
  - 每批 20 檔、批次間 5 秒、單次呼叫 ticker 上限 500（max_daily_downloads）。
  - 核心下載為 yf.download；資料寫入 market_data_ohlcv。
- incremental_update(interval)
  - 依每檔最後日期分組，僅補缺失區間。
- progressive_backfill(interval)
  - 每次往前回補 years_per_run（預設 5 年），上限 max_history_years（預設 20 年）。
- ensure_data(tickers, interval, start, end)
  - 以完整度閾值 < 0.9 為補填門檻。

#### data_validator.py
- 驗證邏輯：
  - 欄位完整（Open/High/Low/Close）
  - 價格 > 0
  - High >= Low
  - High 必須為 O/C 上界、Low 必須為 O/C 下界
- 驗證失敗寫入 download_failures。

#### gap_scanner.py
- 掃描規則：相鄰 datetime 差距 > 7 天視為缺口。
- 缺口寫入 data_gaps。
- 可選 auto_fill，針對缺口回補。

#### market_data.py
- /api/market-data/{symbol}
  - 提供圖表 K 線資料。
  - 只內建 1w/1M/1y 重採樣；其餘 interval 直接查 DB 同名 timeframe。
- /api/market-data/kline-count
  - 透過 screening.indicators.service 的 interval_to_db_format / resample 流程計算 K 棒數。

---

## 貳、1.4 各 Timeframe 資料產生方式分析（含作圖與後端分析）

以下同時區分三件事：
- 圖表 API 是否能回資料（/api/market-data/{symbol}）
- 篩選/型態分析是否有映射（interval_to_db_format）
- 同步排程是否會自動生資料

| Timeframe | 圖表層（market_data.py） | 分析層（screening/pattern） | 資料來源型態 | 目前自動排程 |
|---|---|---|---|---|
| 1m | 直接查 DB timeframe=1m | 映射到 1m | 原生下載 | 否（需新增） |
| 3m | 直接查 DB timeframe=3m | 映射到 3m | 原生下載（但現行同步流程未覆蓋） | 否 |
| 5m | 直接查 DB timeframe=5m | 映射到 5m | 原生下載 | 否（需新增） |
| 15m | 直接查 DB timeframe=15m | 映射到 15m | 原生下載（fetch_basis_data 可手動補） | 否 |
| 30m | 直接查 DB timeframe=30m | 映射到 30m | 原生下載（fetch_basis_data 可手動補） | 否 |
| 1h | 直接查 DB timeframe=1h | 映射到 1h | 原生下載 | 否（需新增） |
| 4h | 目前圖表 API 不會重採樣 4h（會直接查 4h） | 會把 1h 重採樣成 4H | 分析層為重採樣；圖表層現況不一致 | 否 |
| 1d | 直接查 DB timeframe=1d | 映射到 1d | 原生下載 | 是（已啟用） |
| 1w | 由 1d 重採樣（W-MON） | 映射 1W -> 1d 並重採樣 | 重採樣 | 依賴 1d |
| 1M | 由 1d 重採樣（MS/ME） | 映射 1M -> 1d 並重採樣 | 重採樣 | 依賴 1d |
| 1y | 由 1d 重採樣（YS） | （分析層不常用） | 重採樣 | 依賴 1d |

關鍵風險（本次校正）：
1. UI 有 3m/15m/30m/4h 按鈕，但排程未自動生這些原生資料。
2. 4h 在「分析層」有重採樣，在「圖表 API」目前沒有重採樣分支，兩邊口徑不一致。
3. check_data_completeness 目前只為 1h/5m/1m 設 multiplier；15m/30m/3m 會使用預設 1，完整度判斷偏差。

---

## 參、抓取順序、請求計數與續跑能力

### 3.1 增量更新順序（incremental_update）
1. 固定 interval（scheduler 目前給 1d）。
2. 查所有 Active ticker 的最後日期。
3. 依最後日期分群。
4. 每群進入 sync_market_data，內部再切 20 檔一批下載。

### 3.2 歷史回補順序（progressive_backfill）
1. 固定 interval。
2. 計算本輪目標區間（預設每次 5 年窗）。
3. 對全部 Active ticker 跑該區間。
4. 完成後寫回 backfill_history。

### 3.3 一次請求在本專案中的定義
- 本專案層級：一次 yf.download 呼叫。
- 內容包含：單一 interval + 一批 ticker + 一段 period/start-end。
- 注意：這不等於 Yahoo 端一定只打一個 HTTP（內部可能拆分）。

### 3.4 中斷續跑現況
- 目前有 backfill_history、download_failures、data_gaps。
- 但沒有 chunk 級 checkpoint（ticker 游標、批次索引）。
- 結論：可重跑，但不是精準斷點續傳。

---

## 肆、資料量估算（補回舊章節並校正）

> 說明：以下是工程估算，不是 DB 實測值；實際請以 SQL 統計為準。

### 4.1 標的數估算

| 類型 | 估算範圍 |
|---|---|
| Listed | 約 6,000～8,000 |
| OTC | 約 10,000～15,000 |
| 合計（含 OTC） | 約 16,000～23,000 |
| Active（常見運作量） | 約 12,000～18,000 |

### 4.2 資料筆數估算（以 Active 12,000 檔為例）

假設交易日約 252 天/年。

| 週期 | 單檔估算筆數 | 12,000 檔估算 |
|---|---|---|
| 1d（10 年） | 約 2,520 | 約 3,024 萬 |
| 1h（2 年） | 252 x 2 x 7 = 3,528 | 約 4,233 萬 |
| 5m（60 交易日） | 60 x 78 = 4,680 | 約 5,616 萬 |
| 1m（7 交易日） | 7 x 390 = 2,730 | 約 3,276 萬 |

結論：若 1m/5m/1h/1d 全開且含 OTC，全量維護量級會快速進入上億列級別。

---

## 伍、抓取時間估算（補回舊章節並校正）

### 5.1 依現行設定的理論下限

目前預設：
- chunk_size = 20
- batch_delay_seconds = 5
- max_daily_downloads = 500

若單次跑滿 500 檔：
- 批次數 = 500 / 20 = 25 批
- 純延遲時間 = 24 x 5 = 120 秒
- 再加上每批 API 回應、解析、入庫，通常會是數分鐘到數十分鐘。

### 5.2 全市場 12,000 檔在現況排程下

因 max_daily_downloads=500（單次呼叫上限），若不改參數：
- 12,000 / 500 = 24 次執行批次才跑完一輪 ticker。
- 所以每日一次任務下，不可能完整覆蓋全市場。

### 5.3 一周內完成全市場 10 年日線可行性

在現行保守限流 + 單來源 yfinance 下，不建議把一周完成當作可保證 SLA。主因：
1. yfinance 並非官方 SLA，封鎖/限流波動大。
2. OTC 回傳品質不齊、重試與失敗回補成本高。
3. 全市場 + 長歷史時，API 與 MySQL 寫入都會成瓶頸。

---

## 陸、缺口補填語意與已發現問題

### 6.1 現行缺口定義（兩套）
1. ensure_data：完整度 < 0.9 才補。
2. gap_scanner：相鄰時間差 > 7 天記錄缺口。

### 6.2 你已決策的方向
- 你已確認：90%～100% 也要補（不只 <90%）。

### 6.3 目前程式可疑點（需修）
- scheduler 目前呼叫 ensure_data(['all'], '1d', '2024-01-01', None)。
- ['all'] 並不是實際 ticker 清單，易造成邏輯偏差。

建議修正方向：
1. 先取 get_tickers_from_db() 真實清單再送 ensure_data。
2. 補齊 3m/15m/30m 的完整度 multiplier 或改為動態 expected-bars 計算。
3. 將 90%～100% 拆為精修補點模式，不與 <90% 粗補混在一起。

---

## 柒、新版供應商比較（目前 yfinance 的替代 API，各家費用）

> 註：以下為 2026-04-02 查詢時點的官網公開資訊，價格與方案可能隨時調整。

### 7.1 可查核的公開方案（費用 + 限額）

| 供應商 | 免費層（公開） | 付費方案（公開） | 限額/速率（公開） | 對本專案可用性 |
|---|---|---|---|---|
| Twelve Data | Basic：8 API credits（800/日） | Grow $79/月、Pro $229/月、Ultra $999/月（年繳另有折扣） | Grow 標示無 daily limit，付費層 API/WS credits 提升 | 可用；全市場 + 多 timeframe 成本偏高 |
| EODHD | 20 calls/日 | EOD $19.99/月、EOD+Intraday $29.99/月、Fundamentals $59.99/月、All-in-One $99.99/月 | 付費層頁面顯示可到 100,000/日、1,000/min（依方案） | 可用；成本低於多數即時供應商 |
| MarketData.app | Free：100 credits/日 | Starter $30/月（或年繳約 $12/月）、Trader $75/月（或年繳約 $30/月） | 10,000/日（Starter）、100,000/日（Trader） | 可用；低價但 API 即時層級需看方案/身份 |
| Alpha Vantage | 25 requests/日 | $49.99/月（75/min）到 $249.99/月（1,200/min） | Premium 標示無 daily limits | 可用；成本中等，分級清楚 |
| Tiingo | Starter $0/月 | Power $30/月 | Starter 50/h、1,000/day；Power 10,000/h、100,000/day | 可用；入門成本低，適合備援或中量 |
| Alpaca Market Data | Free $0/月 | Algo Trader Plus $99/月 | Free 約 200 calls/min；Plus 標示 Unlimited API calls | 可用；美股強，但 OTC 覆蓋需另驗證 |
| Massive（Polygon 新品牌） | Stocks Basic $0/月 | Starter $29/月、Developer $79/月、Advanced $199/月 | Basic 5 calls/min；付費標示 Unlimited API Calls | 可用；若要 real-time 需 Advanced（$199） |
| Financial Modeling Prep | Basic Free（250/day） | Starter $19/月、Premium $49/月、Ultimate $99/月 | 300/min、750/min、3,000/min（依層級） | 可用；價位與速率平衡佳 |
| Finnhub | Free $0/月 | All-in-One $3,500/月（年約） | Free 60/min；付費 Market data 900/min | 可用但昂貴，不符低成本主路線 |

### 7.2 成本區間觀察（以月費看）

1. 低成本（<= $30/月）：EODHD（$19.99 起）、FMP（$19 起）、Tiingo Power（$30）、Massive Starter（$29）、MarketData Starter（年繳約 $12）。
2. 中成本（$30~$100/月）：Alpha Vantage 中階、Alpaca Plus（$99）、FMP Ultimate（$99）、EODHD All-in-One（$99.99）。
3. 高成本（> $100/月）：Massive Advanced（$199，主打 real-time）、Twelve Data Pro/Ultra、Finnhub All-in-One。

### 7.3 與你需求（1m/5m/1h/1d + OTC）的對應結論

1. 若目標是「先跑起來且壓成本」：yfinance 主源 + EODHD 或 FMP 備援。
2. 若目標是「較穩定的分K SLA」：需提高到中成本方案（例如 Alpaca Plus、Massive Advanced 或同級）。
3. OTC 你已要求納入，但多數供應商 pricing 頁面未直接保證 OTC 細節，需在導入前以樣本名單做覆蓋率驗證（特別是冷門 OTC）。

### 7.4 本次查核的公開頁面（供後續複核）

1. Twelve Data：https://twelvedata.com/pricing
2. EODHD：https://eodhd.com/pricing
3. MarketData.app：https://www.marketdata.app/pricing
4. Alpha Vantage：https://www.alphavantage.co/premium/
5. Tiingo：https://www.tiingo.com/pricing
6. Alpaca：https://alpaca.markets/data
7. Massive（Polygon）：https://massive.com/pricing
8. Financial Modeling Prep：https://site.financialmodelingprep.com/developer/docs/pricing
9. Finnhub：https://finnhub.io/pricing

---

## 捌、排程改造建議（依你最新決策）

### 8.0 你回覆的 5 個決策題（含你的回答 + 採用作法）

| 決策題 | 你的回答 | 本報告採用作法 |
|---|---|---|
| 1) 是否升級成 1m/5m/1h/1d 全排程？ | 要升級到 1m/5m/1h/1d 全排程 | 採用。新增多 interval 排程為主路線，任務優先級固定為「增量 > 回補 > 缺口」。 |
| 2) ensure_data(['all'], ..., None) 是否可改？ | 不清楚，若有問題可改程式 | 採用。改為先取 get_tickers_from_db() 實際清單；明確 end 時間窗，不再用 ['all'] 假參數。 |
| 3)缺口補填要維持小於 90% 才補， 90%~100% 是否也要補？ | 要補 | 採用。補填策略拆為兩層：<90% 粗補、90~100% 精修補點。 |
| 4) 啟動即跑若耗時很長，是否接受先增量、回補延後？「很久」如何定義？ | 尚未定義 | 採用暫定工程門檻：單任務 > 30 分鐘視為長任務，觸發降級或切片；此值列為待你最終拍板。 |
| 5) 全市場是否必含 OTC 全量日更；若是，是否接受活躍度分級更新？ | OTC 也要 | 採用。排程與清單來源維持 OTC 納入，但更新頻率採活躍度分層（活躍日更、冷門週更）控成本。 |

### 8.1 建議執行優先級
1. 增量更新（1m/5m/1h/1d）
2. 歷史回補
3. 缺口精修

### 8.2 建議技術落地（下一步）
1. scheduler 改為多 interval 任務（至少 1m/5m/1h/1d）。
2. ensure_data 改用真實 ticker 清單，移除 ['all'] 假參數。
3. 建立 job_state（cursor/checkpoint）支援續跑。
4. 定義很久門檻，例如單任務 > 30 分鐘視為長任務，觸發降級策略。
5. OTC 量大，建議活躍度分層更新（活躍日更、冷門週更）。

---

## 玖、QA（前面 8 題完整回答）

### Q1：抓取的順序為何？有三個維度（ticker、時間級別、抓取時間範圍），到底先跑誰？

**簡短回答：** 一個 job 只處理一個 timeframe，然後把該 timeframe 下所有 ticker 分批跑完。不是一檔股票把 1m/5m/1h/1d 全抓完再換下一檔。

**具體流程（以增量更新為例）：**

```
scheduler 觸發 incremental_update(interval='1d')
  │
  ├─ 步驟 1：從 DB 取全部 Active ticker（例如 12,000 檔）
  ├─ 步驟 2：每檔查 DB 中最後日期 → 按最後日期分組
  │   例如：Group A = 500 檔（最後日期 2026-04-01）
  │         Group B = 300 檔（最後日期 2026-03-28）
  │         Group C = 200 檔（完全沒資料 → 用 period='max'）
  │
  ├─ 步驟 3：每個 Group 送進 sync_market_data()
  │   └─ 內部再切成每 20 檔一批（chunk_size=20）
  │       → yf.download(['AAPL','MSFT',...共 20 檔], interval='1d', start='2026-04-02')
  │       → 等 5 秒 → 下一批 20 檔  → ... 直到該 Group 跑完
  │
  └─ 步驟 4：所有 Group 跑完 → 這次 1d 增量更新結束
```

**對你的問題的直接回答：**
- 三個維度的順序是：**先固定 timeframe → 再跑所有 ticker → 每群各自指定時間範圍**。
- 如果未來改成四個 timeframe 全排程（1d/1h/5m/1m），就是四條獨立的 job，各自按上述流程跑，互不干擾。

### Q2：yfinance 的「一次請求」到底包含什麼？能不能一次同時抓 1m+5m+1h+1d？

**簡短回答：** 不能。一次 `yf.download()` 只能指定**一個** interval。

**本專案中「一次請求」的定義：**
```
一次 yf.download() 呼叫 = 一次請求
內容 = 一組 ticker（最多 20 檔）× 一個 interval × 一段時間範圍
```

**範例：**
```python
# 這是「一次請求」：20 檔 × 日線 × 最近一天
yf.download(['AAPL','MSFT',...共 20 檔], interval='1d', start='2026-04-02')

# 想抓 1h？必須另一次呼叫：
yf.download(['AAPL','MSFT',...共 20 檔], interval='1h', start='2026-04-02')
```

**關於「2,000 次封鎖」：**
- 這不是 Yahoo 官方公告的數字，是社群實測經驗值（約 2,000 次/小時觸發 429 錯誤或 IP 封鎖）。
- 注意：yfinance 內部可能把你的一次 `yf.download(20 檔)` 拆成多個 HTTP 請求。所以你的程式看起來呼叫 25 次（500 檔 ÷ 20 檔/批），但 Yahoo 後端看到的請求數可能更多。
- 目前設定 `chunk_size=20`、`batch_delay=5s`，每批間隔 5 秒，這個速度大約是 720 次/小時，離 2,000 有一定餘裕。

### Q3：container 意外關閉時，進度會不會被記錄？下次啟動能不能續跑？

**簡短回答：** 目前「能重跑，但會浪費時間」。不是精準續跑。

**目前有記錄的東西：**

| 資料表 | 記錄什麼 | 能幫助續跑嗎？ |
|--------|---------|-------------|
| `backfill_history` | 某段歷史區間（如 2020~2025 的 1d）已回補完成 | ✅ 下次不會重跑已完成的區段 |
| `download_failures` | 某檔 ticker 在某次下載中失敗 | ⚠ 只記錄失敗，不主動重試 |
| `data_gaps` | gap_scanner 掃到的缺口 | ⚠ 只記錄，不自動補 |

**沒有記錄的東西（關鍵缺失）：**
- 跑到第幾批 ticker 了？（例如 12,000 檔中跑到第 6,000 檔時斷了）
- 當前 chunk 索引是多少？
- 上次成功到哪個時間點？

**舉例說明：**
```
增量更新跑到一半斷了：
  ✅ 已成功寫入 DB 的 ticker 不會再下載（因為 last_date 已更新）
  ❌ 還沒處理到的 ticker 不知道是誰，下次要重新從頭算分組

歷史回補跑到一半斷了：
  ❌ 只有整段區間完成才寫 backfill_history
  ❌ 部分完成的 ticker 沒有記錄 → 下次重跑整段區間，已下載的會被 ON DUPLICATE KEY UPDATE 覆蓋（不壞但浪費時間）
```

**建議修正：** 新增 `job_state` 表，記錄每次任務的 ticker 游標和 chunk 索引，實現真正的斷點續跑。

### Q4：「缺口」是什麼意思？為什麼會有缺口？90%~100% 也會補嗎？

**簡短回答：** 系統裡有兩套不同的「缺口」定義，而且它們是獨立運作的。

**定義 1：ensure_data 的「完整度缺口」**
- 算法：計算某檔某 timeframe 在指定日期範圍內，DB 裡實際有幾筆 ÷ 理論上應該有幾筆。
- 閾值：完整度 < 90% 才補。**90%~100% 目前不會補。**
- 例：AAPL 的 1d 資料在 2024-01-01～2026-04-02 應該有約 567 筆交易日資料，DB 只有 400 筆 → 完整度 70.5% < 90% → 列入補填。

**定義 2：gap_scanner 的「連續時間缺口」**
- 算法：逐筆掃描時間序列，若前後兩筆資料的時間差 > 7 天，就記錄為一個缺口。
- 例：AAPL 在 2025-03-01 有資料、下一筆跳到 2025-03-15 → 差 14 天 > 7 天 → 記錄為缺口。

**為什麼會產生缺口？常見原因：**
1. API 被限速/封鎖 → 某批 ticker 下載失敗
2. container 在排程時間不在線 → job 沒有執行
3. yfinance 對某些 OTC 股票回傳不完整資料
4. 股票停牌或極低流動性 → 該日確實沒有交易（這是正常的，不算真缺口）

**你的決策：** 90%~100% 也要補。修正方向是拆成兩層：
- **< 90%：粗補** — 重新整段下載覆蓋
- **90%~100%：精修** — 只針對缺失的特定日期補點

### Q5：`max_daily_downloads = 500` 到底是什麼意思？500 夠嗎？

**簡短回答：** 它是「一次 sync_market_data() 呼叫最多處理幾支 ticker」，不是每天只能呼叫 500 次 API。

**具體行為（在 sync_market_data.py 中）：**
```python
if total > max_daily:
    tickers = tickers[:max_daily]  # 超過 500 → 直接截斷，多的不處理
```

**它不是什麼：**
- ❌ 不是 Yahoo 官方的每日 API 限額
- ❌ 不是全系統所有任務共享的計數器
- ❌ 不是 500 × 20 = 10,000 檔

**它是什麼：**
- ✅ 每次呼叫 `sync_market_data(tickers=[12000 檔])` 時，只取前 500 檔處理
- ✅ 這 500 檔會被切成 500 ÷ 20 = 25 批，每批呼叫一次 `yf.download`

**500 夠不夠？**
- 全市場 12,000+ 檔：一次只處理 500 檔 → 需要 24 次才能覆蓋全市場
- 如果 `incremental_update` 每天只跑一次 → 每天只更新 500 檔 → **24 天才能跑完全市場一輪**
- 結論：**500 對全市場日更完全不夠**，需要提升到至少 3000 以上

**增量更新和歷史回補是否共用這個額度？**
- 不共用。它們是獨立的函式呼叫，各自有各自的 500 上限。
- 但如果同時跑多個任務（如 1d 增量 + 1h 增量），Yahoo 端看到的是同一個 IP 的流量加總，仍有封鎖風險。

### Q6：分K（1m/5m/1h）無法抓全歷史，還有什麼便宜可用的 API？

**簡短回答：** 有。見第柒章完整比較表。以下是針對你需求（分K + 全市場 + OTC + 低成本）的精選：

**低價可用（≤ $30/月）：**

| API | 月費 | 分K歷史深度 | 適合用途 |
|-----|------|------------|---------|
| EODHD（EOD+Intraday） | $29.99 | 依方案，含 intraday | 日常增量 + 短期歷史 |
| FMP（Starter） | $19 | 有 1m/5m/1h（深度依方案） | 低成本入門 |
| Tiingo（Power） | $30 | 需確認分K深度 | 備援 + 中量 |
| Massive/Polygon（Starter） | $29 | 免費層有限制 | 付費後 Unlimited calls |

**重要認知：**
- yfinance 的分K歷史限制（1m=7 天、5m=60 天、1h=2 年）是 Yahoo 後端的限制，不是程式的問題。
- 要更長的分K歷史（例如 1h 超過 2 年），必須換付費 API 或買一次性資料包。
- **「便宜 + 全市場 + 分K + OTC + 穩定」同時達成很難。** 建議：yfinance 當主力（免費），EODHD 或 FMP 當備援（$20~$30/月）。

### Q7：排程時間在凌晨但 container 那時候關著，能不能改成啟動就跑？優先級怎麼排？

**簡短回答：** 可以。APScheduler 關機期間的 job 不會補跑（直接跳過）。改為「啟動即跑 + 優先級排隊 + 保留 cron 當保險」。

**建議機制：**

```
container 啟動
  │
  ├─ 第 1 步：立即跑增量更新（1d → 1h → 5m → 1m）
  │   這是最高優先級，確保「今天的最新資料」先到位
  │
  ├─ 第 2 步：增量跑完後，檢查是否需要歷史回補
  │   查 backfill_history，若有未完成的區段 → 回補一個窗口
  │
  ├─ 第 3 步：回補跑完（或不需回補），再跑缺口補填
  │   掃描完整度不足的 ticker → 逐一補
  │
  └─ 第 4 步：掛上 cron 排程作為保險
      如果 container 持續在線，cron 任務會按固定時間再跑一次
      需加互斥鎖，避免 startup 和 cron 同時執行
```

**需要注意的問題：**
- 如果你每天只開 container 2 小時，四個 timeframe 的增量更新可能要 2～4 小時 → 回補和缺口填補可能排不到。
- 解法：可以區分「必跑」（增量 1d）和「有空就跑」（增量 1m/5m/1h、回補、缺口）。
- 沒有 `job_state` 的話，每次 startup 都從頭計算分組，不是完全浪費時間（因為已有資料的 ticker 增量很快），但效率不如有 checkpoint。

### Q8：data_validator.py、gap_scanner.py、market_data.py 具體做什麼？

**已在本報告 1.3 節補充。** 以下是摘要：

#### `data_validator.py` — 入庫前的品質閘門

```
download_chunk 下載完一批 ticker 後
  │
  └─ 對每檔呼叫 validate_market_data(df)
      │
      ├─ 檢查 1：DataFrame 是否為空
      ├─ 檢查 2：Open/High/Low/Close 欄位是否都存在
      ├─ 檢查 3：所有價格 > 0（不可為負或零）
      ├─ 檢查 4：High ≥ Low
      ├─ 檢查 5：High = max(Open, Close)（高點是上界）
      └─ 檢查 6：Low = min(Open, Close)（低點是下界）
          │
          ├─ 全部通過 → 寫入 market_data_ohlcv
          └─ 任一失敗 → 寫入 download_failures，跳過此檔
```

#### `gap_scanner.py` — 入庫後的時間序列巡檢

```
scan_gaps(tickers, interval='1d', auto_fill=False)
  │
  ├─ 逐檔查詢該 timeframe 的所有 datetime（按時間排序）
  ├─ 比較前後兩筆的時間差
  │   如果差距 > 7 天 → 記錄到 data_gaps 表
  │
  └─ 如果 auto_fill=True → 針對缺口區段呼叫 sync_market_data 補資料
```

注意：7 天門檻對日線合理（一週無交易可能是長假），但對分K太寬鬆。1h 資料連續 7 天無資料顯然有問題，卻不會被偵測到。

#### `market_data.py` — 圖表 K 線查詢 API

| 端點 | 功能 | 備註 |
|------|------|------|
| `GET /api/stocks` | 回傳股票清單 | 可按 market/status 過濾 |
| `GET /api/market-data/{symbol}` | 回傳 K 線 OHLCV | 週/月/年線從日線動態重採樣；其他 interval 直接查 DB |
| `GET /api/market-data/kline-count` | 回傳區間內 K 棒數量 | 委託 screening/indicators/service.py 計算 |

目前缺少 3m（從 1m）、15m（從 5m）、30m（從 5m）、4h（從 1h）的重採樣邏輯，前端按這些按鈕會看到空白圖表。

---

## 拾、相關程式碼檔案位置

| 功能 | 檔案路徑 |
|---|---|
| 排程管理 | env/data_sync/scheduler.py |
| 同步設定 | app/feature/data_management/sync/config.py |
| 核心下載引擎 | app/feature/data_management/sync/sync_market_data.py |
| 主清單抓取 | app/feature/data_management/sync/fetch_tickers.py |
| 手動全週期補齊腳本 | app/feature/data_management/sync/fetch_basis_data.py |
| 資料驗證 | app/feature/data_management/sync/data_validator.py |
| 缺口掃描 | app/feature/data_management/sync/gap_scanner.py |
| 圖表與查詢 API | app/feature/data_management/sync/market_data.py |
| 分析 interval 映射/重採樣 | app/feature/screening/indicators/service.py |
| 篩選資料流程 | app/feature/screening/service.py |
| MySQL schema | env/mysql/init.sql |