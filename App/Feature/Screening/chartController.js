/**
 * Chart Controller - 圖表管理協調器
 * 負責 K 線圖的初始化、數據加載、指標渲染等功能
 */
window.ChartController = {
    // Chart Instance Storage
    chart: null,
    candleSeries: null,
    currentTimeframe: '1d',
    currentSymbol: null,
    isIndicatorsVisible: true, // 控制圖表指標是否顯示的開關

    /**
     * 初始化圖表
     */
    init() {
        const chartContainer = document.getElementById('chart');
        if (!chartContainer) {
            console.error('[ChartController] 找不到圖表容器');
            return;
        }

        // ✅ Ensure chart is hidden on initialization
        chartContainer.style.display = 'none';

        // Create Chart
        this.chart = LightweightCharts.createChart(chartContainer, {
            width: chartContainer.clientWidth,
            height: chartContainer.clientHeight,
            layout: {
                background: { color: '#131722' },
                textColor: '#d1d4dc',
            },
            grid: {
                vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
                horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
            },
            timeScale: {
                borderColor: 'rgba(197, 203, 206, 0.8)',
            },
        });

        // Add Candlestick Series
        this.candleSeries = this.chart.addCandlestickSeries({
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
        });

        // Handle Resize using ResizeObserver
        const resizeObserver = new ResizeObserver(entries => {
            if (entries.length === 0 || !entries[0].contentRect) return;
            const newRect = entries[0].contentRect;
            this.chart.applyOptions({ width: newRect.width, height: newRect.height });
        });
        resizeObserver.observe(chartContainer);

        console.log('[ChartController] 圖表初始化完成');
    },

    /**
     * 加載股票 K 線數據
     * @param {string} symbol - 股票代碼
     */
    async loadStock(symbol) {
        // Hide placeholder, show chart
        document.querySelector('.chart-placeholder').style.display = 'none';
        document.getElementById('chart').style.display = 'block';

        // Update Header
        document.getElementById('chartSymbol').textContent = symbol;
        const stockData = window.state.lastResults ? window.state.lastResults.find(s => s.symbol === symbol) : null;
        document.getElementById('chartName').textContent = stockData ? stockData.name : symbol;

        this.currentSymbol = symbol;

        try {
            // 從 UI 讀取當前選中的時間週期
            const activeBtn = document.querySelector('.timeframe-btn.active');
            const interval = activeBtn ? activeBtn.dataset.tf : '1d';
            this.currentTimeframe = interval;

            // 構建 API URL - 載入完整歷史數據
            const apiUrl = window.API_CONFIG.getURL('MARKET_DATA', `/${symbol}`) +
                window.API_CONFIG.buildQuery({ interval, period: 'max' });

            console.log(`[ChartController] Fetching K-line data: ${apiUrl}`);

            // 調用 API
            const response = await fetch(apiUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const json = await response.json();

            // 檢查是否有數據
            if (!json.data || json.data.length === 0) {
                console.warn(`[ChartController] No data for ${symbol}`);
                this.candleSeries.setData([]);
                return;
            }

            // 轉換數據格式為 lightweight-charts 格式
            const chartData = json.data.map(bar => ({
                time: bar.time.split(' ')[0], // 只取日期部分 "YYYY-MM-DD"
                open: bar.open,
                high: bar.high,
                low: bar.low,
                close: bar.close,
                volume: bar.volume
            }));

            // 0. 在載入新數據前，先清除舊的指標系列，避免時間軸衝突導致 Value is null 錯誤
            this.clearIndicatorSeries();

            // 設置圖表數據
            this.candleSeries.setData(chartData);

            console.log(`[ChartController] Loaded ${chartData.length} bars for ${symbol}`);

            // ✅ 設置初始可視範圍為最近1年
            this.setVisibleRangeToLastYear(chartData);

            // ✅ 渲染圖表指標
            this.renderIndicators(chartData);

        } catch (error) {
            console.error('[ChartController] Failed to fetch K-line data:', error);
            alert(`載入 ${symbol} 數據失敗：${error.message}`);
        }
    },

    /**
     * 設置可視範圍為最近一年
     * @param {Array} chartData - K 線數據
     */
    setVisibleRangeToLastYear(chartData) {
        if (chartData.length === 0) return;

        const lastBar = chartData[chartData.length - 1];
        const firstBar = chartData[0];

        // 確保時間正確轉換
        let lastTime = lastBar.time;
        if (typeof lastTime === 'string') {
            // YYYY-MM-DD -> timestamp (seconds)
            lastTime = new Date(lastTime + ' 00:00:00').getTime() / 1000;
        }

        // 計算一年前的時間戳
        const oneYearInSeconds = 365 * 24 * 60 * 60;
        const oneYearAgo = lastTime - oneYearInSeconds;

        console.log(`[ChartController] Setting visible range: ${new Date(oneYearAgo * 1000).toISOString()} to ${new Date(lastTime * 1000).toISOString()}`);
        console.log(`[ChartController] Total data range: ${firstBar.time} to ${lastBar.time}`);

        this.chart.timeScale().setVisibleRange({
            from: oneYearAgo,
            to: lastTime
        });
    },

    /**
     * 同步時間週期選擇器 UI
     * @param {string} interval - 時間週期 (1d, 1W, 1M 等)
     */
    syncTimeframeUI(interval) {
        const buttons = document.querySelectorAll('.timeframe-btn');
        buttons.forEach(btn => {
            if (btn.dataset.tf === interval) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        this.currentTimeframe = interval;
    },

    /**
     * 綁定時間週期按鈕事件
     */
    bindTimeframeButtons() {
        document.querySelectorAll('.timeframe-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const interval = e.target.dataset.tf;
                const currentSymbol = document.getElementById('chartSymbol').textContent;

                // 如果當前有顯示股票，重新載入數據
                if (currentSymbol && currentSymbol !== '--') {
                    this.syncTimeframeUI(interval);
                    this.loadStock(currentSymbol);
                } else {
                    // 只更新 UI 狀態
                    this.syncTimeframeUI(interval);
                }
            });
        });
    },

    /**
     * ✅ 渲染圖表指標（通過註冊表）
     * @param {Array} chartData - K線數據
     */
    renderIndicators(chartData) {
        if (!chartData || chartData.length === 0) {
            console.warn('[ChartController] 無K線數據，跳過指標渲染');
            return;
        }

        console.log('[ChartController] 開始渲染指標...');

        // 清除舊的指標系列
        this.clearIndicatorSeries();

        // 檢查指標總開關是否開啟
        if (!this.isIndicatorsVisible) {
            console.log('[ChartController] 指標顯示已關閉，停止渲染');
            return;
        }

        // 渲染 SMA 指標（通過註冊表）
        if (window.state.chartIndicators.MA && window.state.chartIndicators.MA.length > 0) {
            window.state.chartIndicators.MA.forEach(ma => {
                if (ma.visible) {
                    const series = window.IndicatorRegistry.render(
                        this.chart,
                        chartData,
                        'sma',
                        ma
                    );

                    if (series) {
                        ma.series = series;
                        console.log(`[ChartController] ✅ 渲染 MA${ma.period}`);
                    }
                }
            });
        }

        // 渲染 Bollinger Bands（通過註冊表）
        const boll = window.state.chartIndicators.BOLL;
        if (boll && boll.visible) {
            const series = window.IndicatorRegistry.render(
                this.chart,
                chartData,
                'bollinger',
                boll
            );

            if (series) {
                boll.series = series;
                console.log(`[ChartController] ✅ 渲染 BOLL(${boll.period},${boll.stdDev})`);
            }
        }

        console.log('[ChartController] 指標渲染完成');
    },

    /**
     * ✅ 清除所有指標系列
     */
    clearIndicatorSeries() {
        // 清除 MA 系列
        if (window.state.chartIndicators.MA) {
            window.state.chartIndicators.MA.forEach(ma => {
                if (ma.series) {
                    window.ChartRenderer.removeSeries(this.chart, ma.series);
                    ma.series = null;
                }
            });
        }

        // 清除 Bollinger 系列
        const boll = window.state.chartIndicators.BOLL;
        if (boll && boll.series) {
            if (boll.series.upper) {
                window.ChartRenderer.removeSeries(this.chart, boll.series.upper);
            }
            if (boll.series.middle) {
                window.ChartRenderer.removeSeries(this.chart, boll.series.middle);
            }
            if (boll.series.lower) {
                window.ChartRenderer.removeSeries(this.chart, boll.series.lower);
            }
            boll.series = {};
        }
    },

    /**
     * ✅ Phase 5: 切換是否顯示圖表管理設定的指標
     */
    toggleIndicatorsVisibility() {
        console.log(`[ChartController] 【顯示指標】按鈕點擊... 目前狀態: ${this.isIndicatorsVisible}`);

        // 切換顯示狀態
        this.isIndicatorsVisible = !this.isIndicatorsVisible;

        // 重新渲染圖表
        const currentSymbol = document.getElementById('chartSymbol').textContent;
        if (currentSymbol && currentSymbol !== '--') {
            this.loadStock(currentSymbol);
            console.log(`[ChartController] 指標顯示狀態切換為: ${this.isIndicatorsVisible ? '開' : '關'}`);
        } else {
            console.warn('[ChartController] 無可用的股票符號，無法刷新指標');
        }
    },

    /**
     * 從 SMA 條件中提取 MA 週期
     * @param {Object} indicator - SMA 指標配置對象
     * @returns {Array} 週期數組，如 [20, 150]
     */
    extractMAPeriods(indicator) {
        const periods = new Set();

        // 從 custom 條件中提取
        if (indicator.custom && Array.isArray(indicator.custom)) {
            indicator.custom.forEach((cond) => {
                // t1 = 'MA', v1 = '20'
                if (cond.t1 === 'MA' && cond.v1) {
                    const period = parseInt(cond.v1, 10);
                    if (!isNaN(period)) {
                        periods.add(period);
                    }
                }

                // t2 = 'MA', v2 = '150'
                if (cond.t2 === 'MA' && cond.v2) {
                    const period = parseInt(cond.v2, 10);
                    if (!isNaN(period)) {
                        periods.add(period);
                    }
                }
            });
        }

        return Array.from(periods).sort((a, b) => a - b);
    },

    /**
     * 輔助函數：獲取MA線顏色
     * @param {number} index - MA線索引
     * @returns {string} 顏色代碼
     */
    getMAColor(index) {
        const colors = [
            '#ff5252',  // 紅
            '#ff9800',  // 橙
            '#ffeb3b',  // 黃
            '#2196f3',  // 藍
            '#4caf50',  // 綠
            '#00bcd4',  // 青
            '#9c27b0',  // 紫
            '#7986cb'   // 靛
        ];
        return colors[index % colors.length];
    },

    /**
     * ✅ Phase 6: 打開圖表管理彈窗
     */
    openChartSettingsModal() {
        if (window.ChartSettingsModal) {
            window.ChartSettingsModal.open();
        } else {
            console.error('[ChartController] ChartSettingsModal 模組未載入');
        }
    }
};
