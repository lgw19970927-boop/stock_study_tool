/**
 * 圖表渲染工具
 * 提供通用的渲染函數，封裝 Lightweight Charts API
 */
window.ChartRenderer = {
    /**
     * 渲染單線指標（SMA, EMA, RSI）
     * @param {Object} chart - Lightweight Charts 實例
     * @param {Array} data - [{time, value}, ...]
     * @param {Object} config - 渲染配置 {color, lineWidth, title, priceScaleId}
     * @returns {Object} LineSeries 實例
     */
    renderLine(chart, data, config) {
        const series = chart.addLineSeries({
            color: config.color || '#ff5252',
            lineWidth: config.lineWidth || 2,
            title: config.title || '',
            priceScaleId: config.priceScaleId || 'right',
            lastValueVisible: false,
            priceLineVisible: false
        });

        // ✅ 過濾掉 value 為 null 的數據點（數據不足時不應畫線）
        const validData = data.filter(d => d.value !== null && d.value !== undefined);
        series.setData(validData);
        return series;
    },

    /**
     * 渲染多線帶狀指標（Bollinger Bands, Keltner Channels）
     * @param {Object} chart - Lightweight Charts 實例
     * @param {Array} upperData - 上軌數據
     * @param {Array} middleData - 中軌數據
     * @param {Array} lowerData - 下軌數據
     * @param {Object} config - 渲染配置
     * @returns {Object} {upper, middle, lower} Series 實例
     */
    renderBands(chart, upperData, middleData, lowerData, config) {
        const upper = chart.addLineSeries({
            color:             config.upperColor  || '#f48fb1',
            lineWidth:         config.upperLineWidth  || config.lineWidth || 1,
            title:             config.title ? `${config.title} Upper`  : 'Upper',
            lastValueVisible:  false,
            priceLineVisible:  false
        });

        const middle = chart.addLineSeries({
            color:             config.middleColor || '#ce93d8',
            lineWidth:         config.middleLineWidth || config.lineWidth || 1,
            title:             config.title ? `${config.title} Middle` : 'Middle',
            lastValueVisible:  false,
            priceLineVisible:  false
        });

        const lower = chart.addLineSeries({
            color:             config.lowerColor  || '#f48fb1',
            lineWidth:         config.lowerLineWidth  || config.lineWidth || 1,
            title:             config.title ? `${config.title} Lower`  : 'Lower',
            lastValueVisible:  false,
            priceLineVisible:  false
        });

        // ✅ 過濾掉 value 為 null 的數據點
        const validUpper  = upperData.filter(d  => d.value !== null && d.value !== undefined);
        const validMiddle = middleData.filter(d => d.value !== null && d.value !== undefined);
        const validLower  = lowerData.filter(d  => d.value !== null && d.value !== undefined);

        upper.setData(validUpper);
        middle.setData(validMiddle);
        lower.setData(validLower);

        return { upper, middle, lower };
    },

    /**
     * 渲染柱狀圖（MACD, Volume）
     * @param {Object} chart - Lightweight Charts 實例
     * @param {Array} data - [{time, value, color?}, ...]
     * @param {Object} config - 渲染配置
     * @returns {Object} HistogramSeries 實例
     */
    renderHistogram(chart, data, config) {
        const series = chart.addHistogramSeries({
            color: config.color || '#26a69a',
            title: config.title || '',
            priceScaleId: config.priceScaleId || 'left',
            lastValueVisible: false,
            priceLineVisible: false
        });

        series.setData(data);
        return series;
    },

    /**
     * 移除 Series
     * @param {Object} chart - Lightweight Charts 實例
     * @param {Object} series - Series 實例
     */
    removeSeries(chart, series) {
        if (series) {
            try {
                // LightweightCharts v4.x: chart.removeSeries() 已移除，改用 series.remove()
                if (typeof series.remove === 'function') {
                    series.remove();
                } else {
                    // v3.x fallback
                    chart.removeSeries(series);
                }
            } catch (error) {
                console.warn('[ChartRenderer] 移除 Series 失敗:', error);
            }
        }
    }
};
