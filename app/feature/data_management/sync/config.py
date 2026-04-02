"""
App/Lib/data_sync/config.py
資料同步設定（直接沿用 reference/extracted/backend/data_sync/config.py）
"""

# Rate Limiting & Anti-Ban Strategy
RATE_LIMIT_CONFIG = {
    'chunk_size': 20,              # Number of tickers per batch download
    'batch_delay_seconds': 5,      # Delay between batch downloads to respect API limits
    'max_daily_downloads': 15000,  # Soft cap for warning only; not hard truncate
    'retry_attempts': 3,
    'retry_backoff': [5, 15, 60], # Wait time (seconds) for 1st, 2nd, 3rd retry
    'download_timeout_seconds': 30,
    'single_ticker_fallback_delay_seconds': 0.35,
    'provider_probe_enabled': True,
    'provider_probe_symbol': 'AAPL',
    'provider_probe_cache_seconds': 120,
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
        'coarse_threshold': 0.7,       # completeness < 70% -> full-range refill
        'fine_threshold': 0.9,         # 70%~90% -> targeted patch
    }
}

# Data Storage Map (Timeframe -> Retention Strategy)
TIMEFRAME_SETTINGS = {
    '1d': {'period_limit': 'max', 'desc': 'Full History'},
    '1h': {'period_limit': '2y',  'desc': 'Rolling 2 Years'},
    '5m': {'period_limit': '60d', 'desc': 'Rolling 60 Days'},
    '1m': {'period_limit': '7d',  'desc': 'Rolling 7 Days'}
}

# Dynamic start date windows used by ensure_data/backfill.
DYNAMIC_START_LOOKBACK_DAYS = {
    '1d': 365 * 20,
    '1h': 365 * 2,
    '5m': 60,
    '1m': 7,
}

# Tiered update strategy.
TIER_CONFIG = {
    'active_dollar_volume_threshold': 500000.0,
    'inactive_stale_days': 30,
    'inactive_update_weekday': 0,      # Monday
    'delisted_missing_trading_days': 30,
    'spy_reference_symbol': 'SPY',
    'tier_refresh_lookback_days': 60,
}
