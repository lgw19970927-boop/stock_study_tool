"""
App/Lib/data_sync/fetch_tickers.py
從 NASDAQ Trader 下載股票清單並更新 MySQL stock_meta 資料表
（由 reference/extracted/backend/data_sync/fetch_tickers.py 移植，SQLite → MySQL）
"""
import pandas as pd
import requests
import io
import logging
from datetime import datetime

from App.Feature.data_sync.db import get_market_cursor

logger = logging.getLogger(__name__)

# ── NASDAQ Trader 公開資料 URL ─────────────────────────────────────
NASDAQ_TRADED_URL = "http://www.nasdaqtrader.com/dynamic/SymDir/nasdaqtraded.txt"
OTC_LIST_URL      = "http://www.nasdaqtrader.com/dynamic/SymDir/otclist.txt"


def fetch_listed_tickers() -> pd.DataFrame:
    """下載 NASDAQ（含 NYSE、AMEX）上市股票清單。"""
    try:
        logger.info("Downloading Listed Tickers from NASDAQ Trader...")
        s  = requests.get(NASDAQ_TRADED_URL, timeout=30).content
        df = pd.read_csv(io.BytesIO(s), sep='|')

        if 'Test Issue' in df.columns:
            df = df[df['Test Issue'] == 'N']

        df['Symbol'] = df['Symbol'].astype(str).str.replace('.', '-', regex=False)
        df['market'] = 'Listed'
        return df[['Symbol', 'Security Name', 'market']]

    except Exception as e:
        logger.error(f"Error fetching listed tickers: {e}")
        return pd.DataFrame()


def fetch_otc_tickers() -> pd.DataFrame:
    """下載 OTC 股票清單。"""
    try:
        logger.info("Downloading OTC Tickers from NASDAQ Trader...")
        response = requests.get(OTC_LIST_URL, timeout=30)
        if response.status_code != 200:
            logger.warning(f"Could not download OTC list (Status: {response.status_code})")
            return pd.DataFrame()

        df = pd.read_csv(io.BytesIO(response.content), sep='|')
        if 'Symbol' in df.columns:
            df['Symbol'] = df['Symbol'].astype(str).str.replace('.', '-', regex=False)
            df['market'] = 'OTC'
            cols = [c for c in ['Symbol', 'Security Name', 'market'] if c in df.columns]
            return df[cols]

        return pd.DataFrame()

    except Exception as e:
        logger.error(f"Error fetching OTC tickers: {e}")
        return pd.DataFrame()


def update_tickers() -> None:
    """主函式：合併 Listed + OTC 清單並 upsert 至 MySQL stock_meta。"""
    df_listed = fetch_listed_tickers()
    logger.info(f"Fetched {len(df_listed)} listed tickers.")

    df_otc = fetch_otc_tickers()
    logger.info(f"Fetched {len(df_otc)} OTC tickers.")

    all_tickers = pd.concat([df_listed, df_otc], ignore_index=True)
    all_tickers.drop_duplicates(subset=['Symbol'], inplace=True)
    logger.info(f"Total unique tickers: {len(all_tickers)}")

    now_str = datetime.now().strftime('%Y-%m-%d')
    meta_list = []
    for _, row in all_tickers.iterrows():
        name = row.get('Security Name', '')
        meta_list.append((
            row['Symbol'],
            name,
            row['market'],
            None,     # sector
            None,     # industry
            None,     # listing_date
            now_str,  # last_updated
            'Active', # status
        ))

    # MySQL upsert：symbol 是 PK，已存在則更新 name / market / last_updated
    sql = """
        INSERT INTO stock_meta (symbol, name, market, sector, industry, listing_date, last_updated, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            name         = VALUES(name),
            market       = VALUES(market),
            last_updated = VALUES(last_updated)
    """
    with get_market_cursor() as cursor:
        batch_size = 500
        for i in range(0, len(meta_list), batch_size):
            cursor.executemany(sql, meta_list[i:i + batch_size])
            logger.info(f"  stock_meta upserted {min(i + batch_size, len(meta_list))}/{len(meta_list)}")

    logger.info("Ticker list update complete.")


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    update_tickers()
