/**
 * chart_vol.js - K 線副圖：成交量資料生成
 */
window.SubChartVOL = {
    /**
     * 依 K 棒漲跌產生成交量柱狀圖資料
     * @param {Array} chartData - [{time, open, close, volume}, ...]
     * @param {string} bullColor - 上漲色
     * @param {string} bearColor - 下跌色
     * @param {number} opacity - 0~100
     * @returns {Array}
     */
    buildSeriesData(chartData, bullColor, bearColor, opacity = 100) {
        if (!Array.isArray(chartData)) return [];

        const alpha = Math.max(0, Math.min(100, Number(opacity) || 100)) / 100;
        return chartData.map((bar) => {
            const isBull = Number(bar.close) > Number(bar.open);
            const baseColor = isBull ? bullColor : bearColor;
            return {
                time: bar.time,
                value: Number(bar.volume) || 0,
                color: this._withAlpha(baseColor, alpha),
            };
        });
    },

    /**
     * 取得最後一筆成交量，供控制列初始值顯示
     */
    getLastValue(chartData) {
        if (!Array.isArray(chartData) || chartData.length === 0) return null;
        const last = chartData[chartData.length - 1];
        return Number(last.volume);
    },

    _withAlpha(color, alpha) {
        const hex = String(color || '').trim();
        const clamped = Math.max(0, Math.min(1, alpha));

        if (/^#([0-9a-fA-F]{3})$/.test(hex)) {
            const short = hex.slice(1);
            const r = parseInt(short[0] + short[0], 16);
            const g = parseInt(short[1] + short[1], 16);
            const b = parseInt(short[2] + short[2], 16);
            return `rgba(${r}, ${g}, ${b}, ${clamped})`;
        }

        if (/^#([0-9a-fA-F]{6})$/.test(hex)) {
            const full = hex.slice(1);
            const r = parseInt(full.slice(0, 2), 16);
            const g = parseInt(full.slice(2, 4), 16);
            const b = parseInt(full.slice(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${clamped})`;
        }

        return hex || '#26a69a';
    },
};
