/**
 * 圖表渲染工具
 * 提供通用的渲染函數，封裝 Lightweight Charts API
 */
window.ChartRenderer = {
    /**
     * 以統一入口建立 series，優先使用 LW v5 addSeries(definition, options, paneIndex)
     * @param {Object} chart - Lightweight Charts 實例
     * @param {string} type - line | histogram | candlestick | bar | area
     * @param {Object} options - series options
     * @param {number|null} paneIndex - pane index（v5）
     * @returns {Object|null}
     */
    createSeries(chart, type, options = {}, paneIndex = null) {
        if (!chart) return null;

        const LW = window.LightweightCharts || {};
        const defMap = {
            line: LW.LineSeries,
            histogram: LW.HistogramSeries,
            candlestick: LW.CandlestickSeries,
            bar: LW.BarSeries,
            area: LW.AreaSeries,
        };

        // v5: addSeries(definition, options, paneIndex)
        if (typeof chart.addSeries === 'function' && defMap[type]) {
            if (paneIndex === null || paneIndex === undefined) {
                return chart.addSeries(defMap[type], options);
            }
            return chart.addSeries(defMap[type], options, paneIndex);
        }

        // v4 fallback
        const methodMap = {
            line: 'addLineSeries',
            histogram: 'addHistogramSeries',
            candlestick: 'addCandlestickSeries',
            bar: 'addBarSeries',
            area: 'addAreaSeries',
        };
        const method = methodMap[type];
        if (method && typeof chart[method] === 'function') {
            return chart[method](options);
        }

        console.error(`[ChartRenderer] 無法建立 series，未知型別或 API 不相容: ${type}`);
        return null;
    },

    /**
     * 渲染單線指標（SMA, EMA, RSI）
     * @param {Object} chart - Lightweight Charts 實例
     * @param {Array} data - [{time, value}, ...]
     * @param {Object} config - 渲染配置 {color, lineWidth, title, priceScaleId}
     * @returns {Object} LineSeries 實例
     */
    renderLine(chart, data, config) {
        const seriesOptions = {
            color: config.color || '#ff5252',
            lineWidth: config.lineWidth || 2,
            title: config.title || '',
            priceScaleId: config.priceScaleId || 'right',
            lastValueVisible: false,
            priceLineVisible: false
        };

        if (typeof config.autoscaleInfoProvider === 'function') {
            seriesOptions.autoscaleInfoProvider = config.autoscaleInfoProvider;
        }

        const series = this.createSeries(chart, 'line', seriesOptions, config.paneIndex ?? null);
        if (!series) return null;

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
        const paneIndex = config.paneIndex ?? null;
        const upper = this.createSeries(chart, 'line', {
            color:             config.upperColor  || '#f48fb1',
            lineWidth:         config.upperLineWidth  || config.lineWidth || 1,
            title:             config.title ? `${config.title} Upper`  : 'Upper',
            lastValueVisible:  false,
            priceLineVisible:  false
        }, paneIndex);

        const middle = this.createSeries(chart, 'line', {
            color:             config.middleColor || '#ce93d8',
            lineWidth:         config.middleLineWidth || config.lineWidth || 1,
            title:             config.title ? `${config.title} Middle` : 'Middle',
            lastValueVisible:  false,
            priceLineVisible:  false
        }, paneIndex);

        const lower = this.createSeries(chart, 'line', {
            color:             config.lowerColor  || '#f48fb1',
            lineWidth:         config.lowerLineWidth  || config.lineWidth || 1,
            title:             config.title ? `${config.title} Lower`  : 'Lower',
            lastValueVisible:  false,
            priceLineVisible:  false
        }, paneIndex);

        if (!upper || !middle || !lower) {
            return null;
        }

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
        const series = this.createSeries(chart, 'histogram', {
            color: config.color || '#26a69a',
            title: config.title || '',
            priceScaleId: config.priceScaleId || 'left',
            lastValueVisible: false,
            priceLineVisible: false,
            priceFormat: config.priceFormat || undefined,
        }, config.paneIndex ?? null);

        if (!series) return null;

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
                // v5+ 主流程
                if (chart && typeof chart.removeSeries === 'function') {
                    chart.removeSeries(series);
                    return;
                }

                // v4 fallback
                if (typeof series.remove === 'function') {
                    series.remove();
                }
            } catch (error) {
                console.warn('[ChartRenderer] 移除 Series 失敗:', error);
            }
        }
    }
};
