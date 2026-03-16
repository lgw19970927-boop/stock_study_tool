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
    currentChartData: null,   // ✅ 保存最新 K 線資料供重渲染使用（不重新 fetch）
    _resizeObserver: null,    // ✅ 用於正確銷毀 ResizeObserver（防記憶體洩漏）

    /**
     * 初始化圖表
     */
    init() {
        const chartContainer = document.getElementById('chart');
        if (!chartContainer) {
            console.error('[ChartController] 找不到圖表容器');
            return;
        }

        // ✅ Bug1 Destroy guard: 若舊 chart 實例存在，先完整銷毀以防記憶體洩漏
        if (this.chart) {
            try {
                if (this._resizeObserver) {
                    this._resizeObserver.disconnect();
                    this._resizeObserver = null;
                }
                this.clearIndicatorSeries();
                this.chart.remove();
            } catch (e) {
                console.warn('[ChartController] 銷毀舊圖表時發生錯誤:', e);
            }
            this.chart = null;
            this.candleSeries = null;
            this.currentChartData = null;
            this.currentSymbol = null;
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
        this._resizeObserver = new ResizeObserver(entries => {
            if (entries.length === 0 || !entries[0].contentRect) return;
            const newRect = entries[0].contentRect;
            if (this.chart) this.chart.applyOptions({ width: newRect.width, height: newRect.height });
        });
        this._resizeObserver.observe(chartContainer);

        // ✅ Feature B: crosshair 移動時更新指標控制列數值
        this.chart.subscribeCrosshairMove(param => {
            if (window.IndicatorTopBar) window.IndicatorTopBar.updateValues(param);
        });

        // ✅ 綁定型態標註 Toggle（每次 init 後重新綁定）
        const patToggle = document.getElementById('patternAnnotationToggle');
        if (patToggle) {
            patToggle.onchange = (e) => {
                if (window.PatternAnnotation) window.PatternAnnotation.setEnabled(e.target.checked);
            };
        }

        console.log('[ChartController] 圖表初始化完成');
    },

    /**
     * 加載股票 K 線數據
     * @param {string} symbol - 股票代碼
     */
    async loadStock(symbol, opts = {}) {
        // Hide placeholder, show chart
        document.querySelector('.chart-placeholder').style.display = 'none';
        const chartEl = document.getElementById('chart');
        chartEl.style.display = 'block';

        // ✅ Bug1: 確保圖表在容器顯示後有正確尺寸（修復隱藏容器導致的 0x0 初始化問題）
        if (this.chart) {
            this.chart.applyOptions({
                width:  chartEl.clientWidth  || chartEl.offsetWidth  || 800,
                height: chartEl.clientHeight || chartEl.offsetHeight || 500
            });
        }

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

            // ✅ 保存 K 線資料供後續本地重渲染使用
            this.currentChartData = chartData;

            console.log(`[ChartController] Loaded ${chartData.length} bars for ${symbol}`);

            // ✅ Feature A: 依觸發方式決定初始視角
            // fromFilterClick=true → 對齊 analysis_end_date；否則維持當前視角（切換 timeframe 等）
            if (opts.fromFilterClick) {
                this.setVisibleRangeToAnalysisEndDate(chartData);
            } else {
                this.setVisibleRangeToLastYear(chartData);
            }

            // ✅ 渲染圖表指標
            this.renderIndicators(chartData);

            // ✅ Feature C: 型態標註
            if (window.PatternAnnotation) {
                const stockData = window.state.lastResults
                    ? window.state.lastResults.find(s => s.symbol === symbol)
                    : null;
                window.PatternAnnotation.setData(
                    stockData?.patterns_found || [],
                    chartData
                );
            }

            // ✅ Feature B: 渲染指標控制列
            if (window.IndicatorTopBar) window.IndicatorTopBar.render();

        } catch (error) {
            console.error('[ChartController] Failed to fetch K-line data:', error);
            alert(`載入 ${symbol} 數據失敗：${error.message}`);
        }
    },

    /**
     * ✅ Feature A: 設置初始可視範圍對齊 analysis_end_date
     * 若 analysis_end_date 為空（快捷按鈕模式），fallback 到 setVisibleRangeToLastYear
     * @param {Array} chartData - K 線數據
     */
    setVisibleRangeToAnalysisEndDate(chartData) {
        if (!chartData || chartData.length === 0) return;

        const endDateStr = window.state?.filters?.analysis_end_date || '';

        if (!endDateStr) {
            // 快捷按鈕模式：end_date = 今天，效果等同 setVisibleRangeToLastYear
            this.setVisibleRangeToLastYear(chartData);
            return;
        }

        // 將日期字串轉為 Unix timestamp（秒）
        const endTimestamp = new Date(endDateStr + 'T00:00:00').getTime() / 1000;
        if (isNaN(endTimestamp)) {
            console.warn('[ChartController] setVisibleRangeToAnalysisEndDate: 無效日期，使用 fallback');
            this.setVisibleRangeToLastYear(chartData);
            return;
        }

        const oneYearInSeconds = 365 * 24 * 60 * 60;
        const fromTimestamp = endTimestamp - oneYearInSeconds;

        console.log(`[ChartController] setVisibleRangeToAnalysisEndDate: ${new Date(fromTimestamp * 1000).toISOString().split('T')[0]} → ${endDateStr}`);

        try {
            this.chart.timeScale().setVisibleRange({
                from: fromTimestamp,
                to: endTimestamp
            });
        } catch (e) {
            console.warn('[ChartController] setVisibleRange 失敗，使用 fallback:', e);
            this.setVisibleRangeToLastYear(chartData);
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
     * ✅ 渲染圖表指標（通過註冊表，讀取 SSOT 新結構）
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

        // ✅ Bug3: 指標總開關（顯示指標按鈕）
        if (!this.isIndicatorsVisible) {
            console.log('[ChartController] 指標顯示已關閉，停止渲染');
            return;
        }

        // ✅ SSOT: 渲染 MA 指標
        const maState = window.state.chartIndicators.MA;
        if (maState && maState.isGlobalEnabled && maState.lines && maState.lines.length > 0) {
            maState.lines.forEach(ma => {
                if (!ma.isEnabled) return;
                const series = window.IndicatorRegistry.render(this.chart, chartData, 'sma', ma);
                if (series) {
                    ma.series = series;
                    console.log(`[ChartController] ✅ 渲染 MA${ma.period}`);
                }
            });
        }

        // ✅ SSOT: 渲染 Bollinger Bands，依各線 isEnabled 決定是否保留
        const bollState = window.state.chartIndicators.BOLL;
        if (bollState && bollState.isGlobalEnabled) {
            const series = window.IndicatorRegistry.render(this.chart, chartData, 'bollinger', bollState);
            if (series) {
                const lines = bollState.lines;
                if (lines.upper.isEnabled)  lines.upper.series  = series.upper;
                else if (series.upper)  { window.ChartRenderer.removeSeries(this.chart, series.upper);  }
                if (lines.middle.isEnabled) lines.middle.series = series.middle;
                else if (series.middle) { window.ChartRenderer.removeSeries(this.chart, series.middle); }
                if (lines.lower.isEnabled)  lines.lower.series  = series.lower;
                else if (series.lower)  { window.ChartRenderer.removeSeries(this.chart, series.lower);  }
                console.log(`[ChartController] ✅ 渲染 BOLL(${bollState.period},${bollState.stdDev})`);
            }
        }

        console.log('[ChartController] 指標渲染完成');
    },

    /**
     * ✅ Bug3/Feature B: 使用現有 K 線資料重新渲染所有指標（不重新 fetch API）
     * 供「顯示指標」按鈕、Chart Setting apply、top bar 互動使用
     */
    renderIndicatorsFromState() {
        if (!this.currentChartData || this.currentChartData.length === 0) {
            console.warn('[ChartController] renderIndicatorsFromState: 無 K 線資料');
            return;
        }
        this.renderIndicators(this.currentChartData);
        if (window.IndicatorTopBar) window.IndicatorTopBar.render();
    },

    /**
     * ✅ 清除所有指標系列（SSOT 新結構）
     */
    clearIndicatorSeries() {
        // 清除 MA 系列
        const maState = window.state.chartIndicators.MA;
        if (maState && maState.lines) {
            maState.lines.forEach(ma => {
                if (ma.series) {
                    window.ChartRenderer.removeSeries(this.chart, ma.series);
                    ma.series = null;
                }
            });
        }

        // 清除 Bollinger 系列（各線獨立儲存）
        const bollState = window.state.chartIndicators.BOLL;
        if (bollState && bollState.lines) {
            ['upper', 'middle', 'lower'].forEach(key => {
                const line = bollState.lines[key];
                if (line && line.series) {
                    window.ChartRenderer.removeSeries(this.chart, line.series);
                    line.series = null;
                }
            });
        }
    },

    /**
     * ✅ Bug3 Fix: 顯示指標總開關
     * OFF → 清除畫布所有指標（不影響 modal 勾選狀態）
     * ON  → 依 Chart Setting modal 的勾選狀態重渲染所有指標
     */
    toggleIndicatorsVisibility() {
        this.isIndicatorsVisible = !this.isIndicatorsVisible;
        console.log(`[ChartController] 指標顯示切換為: ${this.isIndicatorsVisible ? '開' : '關'}`);
        // 使用現有 K 線資料重渲染，不重新 fetch API
        this.renderIndicatorsFromState();
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
