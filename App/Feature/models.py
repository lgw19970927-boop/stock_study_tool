"""
App/Feature/models.py
所有 Feature 共用的 Pydantic 模型（原 backend/api/models.py）
"""
from pydantic import BaseModel, Field
from typing import List, Optional


# ==========================================
# 股票相關
# ==========================================

class StockMeta(BaseModel):
    symbol: str = Field(..., description="股票代碼")
    name:   Optional[str] = Field(None, description="公司名稱")
    market: str = Field(..., description="市場類型: listed, otc, ipo")

class StocksResponse(BaseModel):
    total:  int             = Field(..., description="總股票數")
    stocks: List[StockMeta] = Field(..., description="股票列表")


# ==========================================
# K 線數據
# ==========================================

class OHLCBar(BaseModel):
    time:   str   = Field(..., description="時間 ISO 8601")
    open:   float
    high:   float
    low:    float
    close:  float
    volume: int

class MarketDataResponse(BaseModel):
    symbol:   str
    interval: str
    data:     List[OHLCBar]


# ==========================================
# 篩選
# ==========================================

class IndicatorCondition(BaseModel):
    left:     str
    operator: str
    right:    str

class IndicatorConfig(BaseModel):
    type:       str
    timeframe:  str                         = "1d"
    conditions: List[IndicatorCondition]    = []
    parameters: Optional[dict]              = {}

class ScreeningRequest(BaseModel):
    markets:             List[str]
    frequency:           str
    indicators:          List[IndicatorConfig]
    analysis_start_date: Optional[str]      = None
    analysis_end_date:   Optional[str]      = None

class StockResult(BaseModel):
    symbol:                  str
    name:                    str
    market:                  str
    price:                   float
    change_percent:          float
    volume:                  int
    matched_indicators:      List[str] = []
    insufficient_indicators: List[str] = []

class ScreeningResponse(BaseModel):
    total:      int
    stocks:     List[StockResult]
    statistics: dict


# ==========================================
# 型態辨識
# ==========================================

class PatternTimeframe(BaseModel):
    min:      int = 20
    max:      int = 60
    interval: str = "1D"

class PatternFound(BaseModel):
    name:         str
    display_name: str
    confidence:   float
    start_date:   str
    end_date:     str

class StockResultWithPatterns(StockResult):
    patterns_found:    List[PatternFound] = []
    data_insufficient: bool               = False
