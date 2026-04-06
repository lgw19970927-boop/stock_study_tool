/**
 * API Configuration
 * 前端 API 配置文件
 */

// API 基礎 URL (動態取得當前來源，避免 localhost 與 127.0.0.1 的 CORS 問題)
var API_BASE_URL = window.location.origin;

// API 端點配置
window.API_CONFIG = {
    BASE_URL: API_BASE_URL,

    ENDPOINTS: {
        // 股票列表
        STOCKS: '/api/stocks',

        // K線數據
        MARKET_DATA: '/api/market-data',

        // 篩選（同步 POST，保留向後相容）
        SCREENING: '/api/screening/filter',

        // 篩選 SSE 串流（指標篩選，情況一/三階段一）
        SCREENING_STREAM: '/api/screening/filter/stream',

        // 型態辨識 SSE 串流（情況二/三階段二）
        PATTERN_STREAM: '/api/screening/pattern-recognition/stream',

        // 策略管理 CRUD
        STRATEGIES: '/api/strategies',
    },

    /**
     * 構建完整 API URL
     * @param {string} endpoint - 端點名稱
     * @param {string} path - 路徑參數（可選）
     * @returns {string} 完整 URL
     */
    getURL(endpoint, path = '') {
        const baseEndpoint = this.ENDPOINTS[endpoint];
        if (!baseEndpoint) {
            console.error(`Unknown endpoint: ${endpoint}`);
            return '';
        }
        return `${this.BASE_URL}${baseEndpoint}${path}`;
    },

    /**
     * 構建查詢字符串
     * @param {Object} params - 查詢參數
     * @returns {string} 查詢字符串
     */
    buildQuery(params) {
        const query = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                query.append(key, value);
            }
        });
        const queryString = query.toString();
        return queryString ? `?${queryString}` : '';
    }
};

// 使用示例：
// API_CONFIG.getURL('STOCKS') + API_CONFIG.buildQuery({ market: 'listed' })
// => "http://localhost:8000/api/stocks?market=listed"
//
// API_CONFIG.getURL('MARKET_DATA', '/AAPL') + API_CONFIG.buildQuery({ interval: '1d', period: '1M' })
// => "http://localhost:8000/api/market-data/AAPL?interval=1d&period=1M"
