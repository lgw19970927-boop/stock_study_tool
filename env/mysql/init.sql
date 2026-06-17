-- ==============================================
-- Stock Study Tool - MySQL Schema 初始化
-- 建立兩個獨立 schema：market_data / user_data
-- 從 SQLite 遷移至 MySQL 8.0
-- ==============================================

-- -------------------------
-- Schema 1: market_data
-- -------------------------
CREATE DATABASE IF NOT EXISTS market_data
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE market_data;

-- 1. 股票元數據
CREATE TABLE IF NOT EXISTS stock_meta (
    symbol       VARCHAR(20)  NOT NULL,
    name         VARCHAR(255),
    market       VARCHAR(20),           -- 'Listed', 'OTC', 'IPO'
    sector       VARCHAR(100),
    industry     VARCHAR(100),
    listing_date DATE,
    last_updated DATETIME,
    dollar_vol_20d_avg DECIMAL(20,2) DEFAULT NULL,
    last_trade_date DATE DEFAULT NULL,
    update_tier VARCHAR(20) DEFAULT 'active', -- active, inactive, suspected_delisted
    last_tier_updated DATETIME DEFAULT NULL,
    status       VARCHAR(20) DEFAULT 'Active', -- Active, Delisted, Suspended
    PRIMARY KEY (symbol)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_meta_market ON stock_meta (market);
CREATE INDEX idx_meta_status ON stock_meta (status);
CREATE INDEX idx_meta_tier ON stock_meta (update_tier);
CREATE INDEX idx_meta_last_trade_date ON stock_meta (last_trade_date);

-- 舊資料庫升級：補齊 tier 欄位（MySQL 8+）
ALTER TABLE stock_meta ADD COLUMN IF NOT EXISTS dollar_vol_20d_avg DECIMAL(20,2) DEFAULT NULL;
ALTER TABLE stock_meta ADD COLUMN IF NOT EXISTS last_trade_date DATE DEFAULT NULL;
ALTER TABLE stock_meta ADD COLUMN IF NOT EXISTS update_tier VARCHAR(20) DEFAULT 'active';
ALTER TABLE stock_meta ADD COLUMN IF NOT EXISTS last_tier_updated DATETIME DEFAULT NULL;

-- 2. 市場 K 線數據（核心表，約 700MB）
CREATE TABLE IF NOT EXISTS market_data_ohlcv (
    symbol    VARCHAR(20)  NOT NULL,
    timeframe VARCHAR(10)  NOT NULL,   -- '1d', '1h', '5m', '1m', '1w', '1M'
    datetime  DATETIME     NOT NULL,   -- 標準 YYYY-MM-DD HH:MM:SS
    open      DECIMAL(15,4),
    high      DECIMAL(15,4),
    low       DECIMAL(15,4),
    close     DECIMAL(15,4),
    volume    BIGINT,
    PRIMARY KEY (symbol, timeframe, datetime)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_data_lookup ON market_data_ohlcv (symbol, timeframe, datetime);
CREATE INDEX idx_data_symbol  ON market_data_ohlcv (symbol);
CREATE INDEX idx_data_time    ON market_data_ohlcv (datetime);

-- 3. 下載失敗紀錄
CREATE TABLE IF NOT EXISTS download_failures (
    id            INT          NOT NULL AUTO_INCREMENT,
    symbol        VARCHAR(20)  NOT NULL,
    interval_type VARCHAR(10)  NOT NULL,
    attempted_at  DATETIME,
    error_message TEXT,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. 補充歷史紀錄（Backfill History）
CREATE TABLE IF NOT EXISTS backfill_history (
    id               INT         NOT NULL AUTO_INCREMENT,
    interval_type    VARCHAR(10) NOT NULL,  -- '1d', '1h'
    start_date       DATE,
    end_date         DATE,
    completed_at     DATETIME,
    total_tickers    INT,
    downloaded_count INT,
    status           VARCHAR(20),            -- 'completed', 'failed', 'partial'
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. 資料缺口紀錄（Gap Scanner）
CREATE TABLE IF NOT EXISTS data_gaps (
    id          INT         NOT NULL AUTO_INCREMENT,
    symbol      VARCHAR(20) NOT NULL,
    interval_type VARCHAR(10) NOT NULL,
    gap_start   DATE,
    gap_end     DATE,
    detected_at DATETIME,
    filled_at   DATETIME,
    status      VARCHAR(20),  -- 'detected', 'filled', 'ignored'
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. job checkpoint（斷點續跑）
CREATE TABLE IF NOT EXISTS job_state (
    id             INT          NOT NULL AUTO_INCREMENT,
    job_name       VARCHAR(50)  NOT NULL,
    interval_type  VARCHAR(10)  NOT NULL,
    status         VARCHAR(20)  NOT NULL,   -- running, completed, interrupted
    last_ticker    VARCHAR(20),
    last_chunk_idx INT,
    target_start   DATE,
    target_end     DATE,
    started_at     DATETIME,
    updated_at     DATETIME,
    PRIMARY KEY (id),
    UNIQUE KEY uq_job_state_name_interval (job_name, interval_type),
    INDEX idx_job_state_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 授予使用者權限（market_data）
GRANT SELECT, INSERT, UPDATE, DELETE ON market_data.* TO 'stockapp'@'%';


-- -------------------------
-- Schema 2: user_data
-- -------------------------
CREATE DATABASE IF NOT EXISTS user_data
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE user_data;

-- 6. 使用者策略
CREATE TABLE IF NOT EXISTS strategies (
    id            INT          NOT NULL AUTO_INCREMENT,
    name          VARCHAR(255) NOT NULL,
    description   TEXT,
    is_active     TINYINT(1)   DEFAULT 1,
    created_at    DATETIME,
    updated_at    DATETIME,
    configuration LONGTEXT     NOT NULL,  -- JSON: indicators, timeframe, selection rules
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_strategies_name ON strategies (name);

-- 7. 篩選結果快取（Screening Results Cache）
CREATE TABLE IF NOT EXISTS screening_results (
    id           INT         NOT NULL AUTO_INCREMENT,
    strategy_id  INT         NOT NULL,
    symbol       VARCHAR(20) NOT NULL,
    result_date  DATE        NOT NULL,   -- 執行篩選的日期
    price        DECIMAL(15,4),
    change_pct   DECIMAL(8,4),           -- 漲跌幅 %
    volume       BIGINT,
    signals      LONGTEXT,               -- JSON: 觸發的條件詳情
    created_at   DATETIME,
    PRIMARY KEY (id),
    FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_results_strategy ON screening_results (strategy_id);
CREATE INDEX idx_results_date     ON screening_results (result_date);

-- 授予使用者權限（user_data）
GRANT SELECT, INSERT, UPDATE, DELETE ON user_data.* TO 'stockapp'@'%';

FLUSH PRIVILEGES;
