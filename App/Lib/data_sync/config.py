"""
App/Lib/data_sync/config.py
資料同步設定（直接沿用 reference/extracted/backend/data_sync/config.py）
"""

# Rate Limiting & Anti-Ban Strategy
RATE_LIMIT_CONFIG = {
    'chunk_size': 20,            # Number of tickers per batch download
    'batch_delay_seconds': 5,    # Delay between batch downloads to respect API limits
    'max_daily_downloads': 500,  # Safety cap to prevent accidental IP bans
    'retry_attempts': 3,
    'retry_backoff': [5, 15, 60] # Wait time (seconds) for 1st, 2nd, 3rd retry
}

# Sync Schedules
SCHEDULE_CONFIG = {
    'incremental_update': {
        'enabled': True,
        'description': 'Daily update of latest market data',
        'schedule': '0 18 * * 1-5',   # Mon-Fri 18:00
        'timeframes': ['1d', '1h', '5m', '1m']
    },
    'progressive_backfill': {
        'enabled': True,
        'description': 'Background job to fill historical data progressively',
        'schedule': '0 2 * * *',      # Daily 2:00 AM
        'years_per_run': 5,           # How many years to go back per run
        'max_history_years': 20       # Do not go back further than this
    },
    'gap_scanner': {
        'enabled': True,
        'schedule': '0 3 * * 0',      # Sunday 3:00 AM
    }
}

# Data Storage Map (Timeframe -> Retention Strategy)
TIMEFRAME_SETTINGS = {
    '1d': {'period_limit': 'max', 'desc': 'Full History'},
    '1h': {'period_limit': '2y',  'desc': 'Rolling 2 Years'},
    '5m': {'period_limit': '60d', 'desc': 'Rolling 60 Days'},
    '1m': {'period_limit': '7d',  'desc': 'Rolling 7 Days'}
}
