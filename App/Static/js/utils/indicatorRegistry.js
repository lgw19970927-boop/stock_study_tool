/**
 * 指標註冊中心
 * 所有指標自動註冊到此，chartController 通過註冊表渲染
 */
window.IndicatorRegistry = {
    // 註冊表
    _registry: {},

    /**
     * 註冊指標
     * @param {string} type - 指標類型 (sma, bollinger, rsi)
     * @param {Object} indicator - 指標模組
     * @returns {boolean} 註冊是否成功
     */
    register(type, indicator) {
        // 驗證接口完整性
        const requiredMethods = ['getConfigHTML', 'confirmConfig', 'calculate', 'getRenderConfig'];
        const missing = requiredMethods.filter(method => typeof indicator[method] !== 'function');

        if (missing.length > 0) {
            console.error(`[IndicatorRegistry] ${type} 缺少必要方法: ${missing.join(', ')}`);
            return false;
        }

        this._registry[type] = indicator;
        console.log(`[IndicatorRegistry] ✅ ${type} 已註冊`);
        return true;
    },

    /**
     * 獲取指標
     * @param {string} type - 指標類型
     * @returns {Object|null} 指標模組
     */
    get(type) {
        return this._registry[type] || null;
    },

    /**
     * 獲取所有已註冊指標
     * @returns {Object} 所有指標的副本
     */
    getAll() {
        return { ...this._registry };
    },

    /**
     * 渲染指標（通用渲染邏輯）
     * @param {Object} chart - Lightweight Charts 實例
     * @param {Array} chartData - K 線數據
     * @param {string} type - 指標類型
     * @param {Object} config - 指標配置
     * @returns {Object|null} Series 實例或 null（失敗時）
     */
    render(chart, chartData, type, config) {
        try {
            const indicator = this.get(type);
            if (!indicator) {
                console.warn(`[IndicatorRegistry] 未找到指標: ${type}`);
                return null;
            }

            // 1. 計算指標
            const data = indicator.calculate(chartData, config);
            if (!data) {
                console.warn(`[IndicatorRegistry] ${type} 計算失敗`);
                return null;
            }

            // 2. 獲取渲染配置
            const renderConfig = indicator.getRenderConfig(config);

            // 3. 根據渲染類型選擇渲染器
            let series = null;
            switch (renderConfig.renderType) {
                case 'line':
                    series = window.ChartRenderer.renderLine(chart, data, renderConfig);
                    break;
                case 'bands':
                    series = window.ChartRenderer.renderBands(
                        chart,
                        data.upper,
                        data.middle,
                        data.lower,
                        renderConfig
                    );
                    break;
                case 'histogram':
                    series = window.ChartRenderer.renderHistogram(chart, data, renderConfig);
                    break;
                default:
                    console.error(`[IndicatorRegistry] 未知渲染類型: ${renderConfig.renderType}`);
            }

            return series;

        } catch (error) {
            console.error(`[IndicatorRegistry] 渲染失敗 (${type}):`, error);
            return null;
        }
    }
};
