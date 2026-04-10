/**
 * chart_rsi.js - K 線副圖：RSI 資料生成
 */
window.SubChartRSI = {
    /**
     * 依設定生成 RSI 多線資料
     * @param {Array} chartData - [{time, close}, ...]
     * @param {Object} rsiState - state.chartIndicators.RSI
     * @returns {Object} {RSI1:[...], RSI2:[...], RSI3:[...]}
     */
    buildSeriesData(chartData, rsiState) {
        if (!Array.isArray(chartData) || chartData.length === 0) return {};

        const closes = chartData.map((bar) => Number(bar.close));
        const lines = (rsiState && rsiState.lines) ? rsiState.lines : {};
        const result = {};

        Object.entries(lines).forEach(([lineKey, cfg]) => {
            const period = Math.max(1, Number(cfg?.period) || 6);
            const values = this._calculateRSI(closes, period);
            result[lineKey] = chartData
                .map((bar, idx) => ({ time: bar.time, value: values[idx] }))
                .filter((point) => point.value !== null && point.value !== undefined);
        });

        return result;
    },

    /**
     * 取最後一筆 RSI 值，供控制列顯示
     */
    getLastValues(seriesMap) {
        const output = {};
        if (!seriesMap || typeof seriesMap !== 'object') return output;

        Object.entries(seriesMap).forEach(([key, data]) => {
            if (!Array.isArray(data) || data.length === 0) {
                output[key] = null;
                return;
            }
            output[key] = Number(data[data.length - 1].value);
        });

        return output;
    },

    /**
     * Wilder RSI
     * @param {number[]} closes
     * @param {number} period
     * @returns {(number|null)[]}
     */
    _calculateRSI(closes, period) {
        const len = closes.length;
        const rsi = Array(len).fill(null);
        if (len <= period) return rsi;

        let gainSum = 0;
        let lossSum = 0;

        for (let i = 1; i <= period; i += 1) {
            const diff = closes[i] - closes[i - 1];
            if (diff >= 0) gainSum += diff;
            else lossSum += Math.abs(diff);
        }

        let avgGain = gainSum / period;
        let avgLoss = lossSum / period;

        rsi[period] = this._toRSI(avgGain, avgLoss);

        for (let i = period + 1; i < len; i += 1) {
            const diff = closes[i] - closes[i - 1];
            const gain = diff > 0 ? diff : 0;
            const loss = diff < 0 ? Math.abs(diff) : 0;

            avgGain = ((avgGain * (period - 1)) + gain) / period;
            avgLoss = ((avgLoss * (period - 1)) + loss) / period;
            rsi[i] = this._toRSI(avgGain, avgLoss);
        }

        return rsi;
    },

    _toRSI(avgGain, avgLoss) {
        if (avgLoss === 0) return 100;
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    },
};
