/**
 * 圖表指標計算引擎
 * 專注於K線圖視覺化顯示，與篩選條件計算完全獨立
 */

/**
 * 計算簡單移動平均線 (SMA)
 * 
 * @param {Array} data - K線數據 [{time, open, high, low, close}, ...]
 * @param {number} period - 週期（如 20, 50, 200）
 * @returns {Array} SMA數據 [{time, value}, ...]
 * 
 * 注意：
 * - 基於收盤價 (close) 計算
 * - 數據不足時不顯示（從第 period 根K線開始返回）
 */
function calculateSMA(data, period) {
    if (!data || data.length < period) {
        console.warn(`SMA${period}: 數據不足（需要 ${period} 筆，實際 ${data?.length || 0} 筆）`);
        return [];
    }

    const result = [];

    // 從第 period 根K線開始計算
    for (let i = period - 1; i < data.length; i++) {
        // 取最近 period 根K線
        const slice = data.slice(i - period + 1, i + 1);

        // 計算平均收盤價
        const sum = slice.reduce((acc, bar) => acc + bar.close, 0);
        const average = sum / period;

        result.push({
            time: data[i].time,
            value: average
        });
    }

    console.log(`計算 SMA${period}: ${result.length} 個數據點`);
    return result;
}

/**
 * 計算布林通道 (Bollinger Bands)
 * 
 * @param {Array} data - K線數據 [{time, open, high, low, close}, ...]
 * @param {number} period - 週期（預設 20）
 * @param {number} stdDev - 標準差倍數（預設 2.0）
 * @returns {Object} {upper: [...], middle: [...], lower: [...]}
 * 
 * 計算邏輯：
 * - 中軌 (Middle) = SMA(period)
 * - 上軌 (Upper) = 中軌 + (標準差 × stdDev)
 * - 下軌 (Lower) = 中軌 - (標準差 × stdDev)
 */
function calculateBollinger(data, period = 20, stdDev = 2.0) {
    if (!data || data.length < period) {
        console.warn(`BOLL(${period},${stdDev}): 數據不足（需要 ${period} 筆，實際 ${data?.length || 0} 筆）`);
        return { upper: [], middle: [], lower: [] };
    }

    // 1. 計算中軌（即 SMA）
    const middle = calculateSMA(data, period);

    const upper = [];
    const lower = [];

    // 2. 計算上軌和下軌
    for (let i = period - 1; i < data.length; i++) {
        // 取最近 period 根K線的收盤價
        const slice = data.slice(i - period + 1, i + 1);
        const closes = slice.map(bar => bar.close);

        // 獲取對應的中軌值
        const mean = middle[i - period + 1].value;

        // 計算標準差
        const squaredDiffs = closes.map(close => Math.pow(close - mean, 2));
        const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / period;
        const std = Math.sqrt(variance);

        // 計算上下軌
        upper.push({
            time: data[i].time,
            value: mean + (std * stdDev)
        });

        lower.push({
            time: data[i].time,
            value: mean - (std * stdDev)
        });
    }

    console.log(`計算 BOLL(${period},${stdDev}): 上軌${upper.length}, 中軌${middle.length}, 下軌${lower.length} 個數據點`);

    return {
        upper: upper,
        middle: middle,
        lower: lower
    };
}

/**
 * 批次計算多個指標
 * 
 * @param {Array} data - K線數據
 * @param {Array} indicators - 指標配置列表
 *   示例: [
 *     { type: 'sma', period: 20 },
 *     { type: 'bollinger', period: 20, stdDev: 2 }
 *   ]
 * @returns {Object} 所有計算結果
 */
function calculateMultipleIndicators(data, indicators) {
    const results = {};

    indicators.forEach(indicator => {
        const type = indicator.type?.toLowerCase();

        try {
            if (type === 'sma') {
                const period = indicator.period || 20;
                const key = `MA${period}`;
                results[key] = calculateSMA(data, period);

            } else if (type === 'bollinger' || type === 'boll') {
                const period = indicator.period || 20;
                const stdDev = indicator.stdDev || 2.0;
                const key = `BOLL${period}_${stdDev}`;
                results[key] = calculateBollinger(data, period, stdDev);

            } else {
                console.warn(`不支援的指標類型: ${type}`);
            }
        } catch (error) {
            console.error(`計算 ${type} 指標時發生錯誤:`, error);
        }
    });

    return results;
}

// 導出到全域 window 物件
window.ChartIndicators = {
    calculateSMA,
    calculateBollinger,
    calculateMultipleIndicators
};

console.log('✅ 圖表指標計算引擎已載入');
