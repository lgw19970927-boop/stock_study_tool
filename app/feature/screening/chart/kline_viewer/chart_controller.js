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
    seriesType: 'candlestick', // 當前圖表類型
    _tooltipMode: 'floating',  // 懸浮窗模式: 'floating' | 'crosshair' | 'hidden'
    _tooltipSide: 'right',     // BUG2: 'right'=左上 / 'left'=右上（屬於固定模式）
    _tooltipBoundary: null,    // BUG2: 懸浮窗邊界，用於判斷吸附方向
    _mirrorSeries: null,       // Bug7: 雙邊坐標用隱形左側 series
    _currentAxisPlacement: 'right', // 追加Bug Fix: 記錄當前座標軸 placement，供 loadStock 補建 mirrorSeries 使用

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
        chartContainer.classList.add('is-hidden');

        // 初始常規設定（供圖表與十字線初始化使用）
        const initCfg = (window.ChartSettingsModal && window.ChartSettingsModal._generalConfig) || {};
        const _defGenCfg = (window.ChartSettingsModal && window.ChartSettingsModal.defaultGeneralConfig) || {};
        const initBgTheme = initCfg.bgTheme || _defGenCfg.bgTheme || 'dark';
        const initCrosshairTheme = this._getCrosshairLabelStyle(initBgTheme);

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
                vertLine: {
                    visible: true,
                    labelVisible: true,
                    labelBackgroundColor: initCrosshairTheme.vertLabelBg,
                },
                horzLine: {
                    visible: true,
                    labelVisible: true,
                    labelBackgroundColor: initCrosshairTheme.horzLabelBg,
                }
            },
            timeScale: {
                borderColor: initCrosshairTheme.timeBorderColor,
            },
            localization: {
                timeFormatter: (time) => this._formatCrosshairTimeLabel(time)
            }
        });

        // Add Candlestick Series — Bug4 Fix: 使用 hollow 樣式與 defaultGeneralConfig 一致
        // defaultGeneralConfig.bullStyle='hollow': 陽線空心描邊，陰線實心
        const initBull = initCfg.bullColor || _defGenCfg.bullColor || '#26a69a';
        const initBear = initCfg.bearColor || _defGenCfg.bearColor || '#ef5350';
        const initStyle = initCfg.bullStyle || _defGenCfg.bullStyle || 'solid';
        this.candleSeries = this.chart.addCandlestickSeries({
            upColor:         initStyle === 'solid' ? initBull : 'transparent',
            downColor:       initBear,
            borderUpColor:   initBull,
            borderDownColor: initBear,
            borderVisible:   true,
            wickUpColor:     initBull,
            wickDownColor:   initBear,
        });

        // Handle Resize using ResizeObserver
        this._resizeObserver = new ResizeObserver(entries => {
            if (entries.length === 0 || !entries[0].contentRect) return;
            const newRect = entries[0].contentRect;
            if (this.chart) this.chart.applyOptions({ width: newRect.width, height: newRect.height });
        });
        this._resizeObserver.observe(chartContainer);

        // ✅ Feature B: crosshair 移動時更新指標控制列數值 + 懸浮窗
        this.chart.subscribeCrosshairMove(param => {
            if (window.IndicatorTopBar) window.IndicatorTopBar.updateValues(param);
            this._updateCrosshairTooltip(param);
        });

        // ✅ 綁定型態標註 Toggle（每次 init 後重新綁定）
        const patToggle = document.getElementById('patternAnnotationToggle');
        if (patToggle) {
            patToggle.onchange = (e) => {
                if (window.PatternAnnotation) window.PatternAnnotation.setEnabled(e.target.checked);
            };
        }

        // BUG2: DOM 模式懸浮窗事件（吸附、左右邊界切換、Y軸碰撞偵測）
        this._bindTooltipMouseEvents(chartContainer);

        // Task4: 雙擊圖表區域即切換至懸浮窗模式
        chartContainer.addEventListener('dblclick', () => {
            this._applyTooltipMode('floating');
            if (window.ChartSettingsModal) {
                if (!window.ChartSettingsModal._generalConfig) {
                    window.ChartSettingsModal._generalConfig =
                        JSON.parse(JSON.stringify(window.ChartSettingsModal.defaultGeneralConfig));
                }
                window.ChartSettingsModal._generalConfig.tooltipMode = 'floating';
                window.ChartSettingsModal.saveToLocalStorage();
            }
            const slt = document.getElementById('generalTooltipMode');
            if (slt) slt.value = 'floating';
        });

        console.log('[ChartController] 圖表初始化完成');

        // Bug 10: 圖表重建後重新訂閱 PatternAnnotation的縮放事件，避免綁定舊 timeScale 實例
        if (window.PatternAnnotation) window.PatternAnnotation._subscribeRedraw();

        // Bug5 Fix: 套用已從 localStorage 載入的常規設定與坐標軸設定
        // loadFromLocalStorage 可能比 init 先執行，此處確保設定被套用至新建的 chart instance
        // - applyGeneralSettings: currentChartData=null 時 _switchChartSeries 會安全 return
        // - applyAxisSettings:    currentChartData=null 時 _ensureMirrorSeries 安全 return，
        //   但 _currentAxisPlacement 已寫入，chart axes 可見性已設定，之後 loadStock 能補建 mirrorSeries
        if (window.ChartSettingsModal) {
            if (window.ChartSettingsModal._generalConfig) {
                this.applyGeneralSettings(window.ChartSettingsModal._generalConfig);
            }
            if (window.ChartSettingsModal._axisConfig) {
                this.applyAxisSettings(window.ChartSettingsModal._axisConfig);
            }
        }
    },

    /**
     * 加載股票 K 線數據
     * @param {string} symbol - 股票代碼
     */
    async loadStock(symbol, opts = {}) {
        // Hide placeholder, show chart
        const placeholder = document.querySelector('.chart-placeholder');
        if (placeholder) {
            placeholder.classList.add('is-hidden');
        }
        const chartEl = document.getElementById('chart');
        chartEl.classList.remove('is-hidden');

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

            // Bug4 Fix: 先同步 mirrorSeries 時間軸資料，再設置主 series 與 setVisibleRange
            // 若 mirrorSeries 仍保留舊頻率的時間戳，LW 的 setData() 會重算時間軸並觸發 auto-fit
            // 導致 setVisibleRange（設定 end_date）被後續的 auto-fit scroll 覆蓋 → 圖表捲到最左邊
            if (this._mirrorSeries && chartData && chartData.length > 0) {
                try {
                    this._mirrorSeries.setData(chartData.map(b => ({ time: b.time, value: b.close })));
                } catch (e) {}
            }

            // 設置圖表數據
            this.candleSeries.setData(chartData);

            // ✅ 保存 K 線資料供後續本地重渲染使用
            this.currentChartData = chartData;

            console.log(`[ChartController] Loaded ${chartData.length} bars for ${symbol}`);

            // Bug3 Fix: 雙邊模式下首次載入股票時補建 mirrorSeries
            // applyAxisSettings 設定雙邊時若尚無股票（currentChartData=null），_ensureMirrorSeries() 會提早 return
            // 此處在 currentChartData 就緒後補建，確保左軸有 series 可顯示刻度
            if (this._currentAxisPlacement === 'dual' && !this._mirrorSeries) {
                this._ensureMirrorSeries();
            }

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
                    // Bug2 Fix: 時間框架切換也需對齊 analysis_end_date（若有設定）
                    this.loadStock(currentSymbol, { fromFilterClick: !!(window.state?.filters?.analysis_end_date) });
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

    // ========== Feature 3: 常規設定 ==========

    /**
     * 計算平均K線（Heikin Ashi）資料
     * @param {Array} data - OHLC K線資料
     * @returns {Array} Heikin Ashi K線資料
     */
    _computeHeikinAshi(data) {
        const result = [];
        for (let i = 0; i < data.length; i++) {
            const bar = data[i];
            const haClose = (bar.open + bar.high + bar.low + bar.close) / 4;
            let haOpen;
            if (i === 0) {
                haOpen = (bar.open + bar.close) / 2;
            } else {
                haOpen = (result[i - 1].open + result[i - 1].close) / 2;
            }
            const haHigh = Math.max(bar.high, haOpen, haClose);
            const haLow  = Math.min(bar.low,  haOpen, haClose);
            result.push({ time: bar.time, open: haOpen, high: haHigh, low: haLow, close: haClose });
        }
        return result;
    },

    /**
     * 切換圖表類型（銷毀舊 series 並建立新 series）
     * @param {string} type - 'candlestick' | 'bar' | 'line' | 'monochrome_candle' | 'heikin_ashi'
     * @param {Array} chartData - OHLC K線資料
     */
    _switchChartSeries(type, chartData) {
        if (!this.chart || !chartData || chartData.length === 0) return;
        const LW = window.LightweightCharts;
        if (!LW) return;

        // If same type already active, just re-apply visual options (colour/style)
        if (this.seriesType === type && this.candleSeries) {
            this._applySeriesVisualOptions(type);
            return;
        }

        // Save visible range to restore after rebuild
        let visRange = null;
        try { visRange = this.chart.timeScale().getVisibleLogicalRange(); } catch (e) {}

        // Clear indicator overlays first (they reference the old series)
        this.clearIndicatorSeries();

        // Destroy old main series
        if (this.candleSeries) {
            // Bug2 Fix: 改用 ChartRenderer.removeSeries（支援 LW v4 series.remove() API）
            // 原來的 chart.removeSeries() 是 LW v3 API，在 v4 下靜默失敗留下孤兒 series
            // 孤兒 series 保留舊時間軸時間戳，切換頻率時 LW 合併新舊時間戳導致 K 線稀疏
            window.ChartRenderer.removeSeries(this.chart, this.candleSeries);
            this.candleSeries = null;
        }

        const cfg = (window.ChartSettingsModal && window.ChartSettingsModal._generalConfig) || {};
        const bullColor = cfg.bullColor || '#26a69a';
        const bearColor = cfg.bearColor || '#ef5350';

        if (type === 'bar') {
            this.candleSeries = this.chart.addBarSeries({ upColor: bullColor, downColor: bearColor });
            this.candleSeries.setData(chartData);
        } else if (type === 'line') {
            this.candleSeries = this.chart.addLineSeries({ color: bullColor, lineWidth: 2 });
            this.candleSeries.setData(chartData.map(b => ({ time: b.time, value: b.close })));
        } else if (type === 'monochrome_candle') {
            // BUG2+3 Fix: 依 bgTheme 和 bullStyle 決定顏色
            const bullStyle  = cfg.bullStyle || 'hollow';
            const isDark     = (cfg.bgTheme || 'dark') === 'dark';
            const upFill     = bullStyle === 'solid' ? '#ffffff' : 'transparent';
            const borderUp   = isDark ? '#c8ccd4' : '#000000'; // 淡雅銀灰 or 黑
            const downFill   = '#000000';
            const borderDown = isDark ? '#888888' : '#000000';
            this.candleSeries = this.chart.addCandlestickSeries({
                upColor:         upFill,
                downColor:       downFill,
                borderUpColor:   borderUp,
                borderDownColor: borderDown,
                wickUpColor:     borderUp,
                wickDownColor:   borderDown,
                borderVisible:   true
            });
            this.candleSeries.setData(chartData);
        } else if (type === 'heikin_ashi') {
            this.candleSeries = this.chart.addCandlestickSeries({
                upColor: bullColor, downColor: bearColor,
                borderVisible: false,
                wickUpColor: bullColor, wickDownColor: bearColor
            });
            this.candleSeries.setData(this._computeHeikinAshi(chartData));
        } else {
            // candlestick (default)
            const bullStyle = cfg.bullStyle || 'hollow';
            this.candleSeries = this.chart.addCandlestickSeries({
                upColor:        bullStyle === 'solid' ? bullColor : 'transparent',
                downColor:      bearColor,
                borderUpColor:  bullColor,
                borderDownColor: bearColor,
                wickUpColor:    bullColor,
                wickDownColor:  bearColor,
                borderVisible:  true
            });
            this.candleSeries.setData(chartData);
        }

        this.seriesType = type;

        // Restore visible range
        if (visRange) {
            try { this.chart.timeScale().setVisibleLogicalRange(visRange); } catch (e) {}
        }

        // Re-render indicators and pattern annotations on new series
        this.renderIndicators(chartData);
        if (window.PatternAnnotation) {
            const results = window.state && window.state.lastResults;
            const stock = results ? results.find(s => s.symbol === this.currentSymbol) : null;
            window.PatternAnnotation.setData(stock ? (stock.patterns_found || []) : [], chartData);
        }

        // 追加Bug Fix: _switchChartSeries 重建 candleSeries 後預設 priceScaleId 回到 right
        // 需重新套用當前 placement，確保左軸/雙邊模式下 scaleId 正確
        this._applyScalePlacement();

        console.log('[ChartController] _switchChartSeries:', type);
    },

    /**
     * 追加Bug Fix: 根據 _currentAxisPlacement 將 candleSeries 綁定至正確的價格刻度
     * 在 _switchChartSeries 重建 series 後呼叫，避免 priceScaleId 被重置
     */
    _applyScalePlacement() {
        if (!this.candleSeries) return;
        const placement = this._currentAxisPlacement || 'right';
        const scaleId = placement === 'left' ? 'left' : 'right'; // dual 模式 candleSeries 在右軸
        try { this.candleSeries.applyOptions({ priceScaleId: scaleId }); } catch (e) {}
    },

    /**
     * 僅重新套用當前 series 的顏色/樣式（不重建 series）
     * @param {string} type - 圖表類型
     */
    _applySeriesVisualOptions(type) {
        if (!this.candleSeries) return;
        const cfg = (window.ChartSettingsModal && window.ChartSettingsModal._generalConfig) || {};
        const bullColor = cfg.bullColor || '#26a69a';
        const bearColor = cfg.bearColor || '#ef5350';
        if (type === 'candlestick') {
            const bullStyle = cfg.bullStyle || 'hollow';
            this.candleSeries.applyOptions({
                upColor:        bullStyle === 'solid' ? bullColor : 'transparent',
                downColor:      bearColor,
                borderUpColor:  bullColor,
                borderDownColor: bearColor,
                wickUpColor:    bullColor,
                wickDownColor:  bearColor
            });
        } else if (type === 'bar') {
            this.candleSeries.applyOptions({ upColor: bullColor, downColor: bearColor });
        } else if (type === 'line') {
            this.candleSeries.applyOptions({ color: bullColor });
        } else if (type === 'heikin_ashi') {
            this.candleSeries.applyOptions({
                upColor: bullColor, downColor: bearColor,
                wickUpColor: bullColor, wickDownColor: bearColor
            });
        } else if (type === 'monochrome_candle') {
            // BUG3 Fix: 依 bgTheme 和 bullStyle 決定顏色
            const bullStyle  = cfg.bullStyle || 'hollow';
            const isDark     = (cfg.bgTheme || 'dark') === 'dark';
            const upFill     = bullStyle === 'solid' ? '#ffffff' : 'transparent';
            const borderUp   = isDark ? '#c8ccd4' : '#000000';
            const borderDown = isDark ? '#888888' : '#000000';
            this.candleSeries.applyOptions({
                upColor:         upFill,
                borderUpColor:   borderUp,
                wickUpColor:     borderUp,
                downColor:       '#000000',
                borderDownColor: borderDown,
                wickDownColor:   borderDown
            });
        }
    },

    /**
     * 十字線時間標籤格式：YYYY/MM/DD 週X
     * @param {number|string|Object} time - Lightweight Charts time
     * @returns {string}
     */
    _formatCrosshairTimeLabel(time) {
        if (time === null || time === undefined) return '';

        let d = null;
        if (typeof time === 'number') {
            d = new Date(time * 1000);
        } else if (typeof time === 'string') {
            d = new Date(time + 'T00:00:00');
        } else if (typeof time === 'object' && typeof time.year === 'number') {
            d = new Date(time.year, (time.month || 1) - 1, time.day || 1);
        }

        if (!d || Number.isNaN(d.getTime())) return '';

        const weekdays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}/${m}/${day} ${weekdays[d.getDay()]}`;
    },

    /**
     * 依背景主題取得十字線標籤配色
     * @param {string} bgTheme - 'dark' | 'silver'
     * @returns {{vertLabelBg: string, horzLabelBg: string, timeBorderColor: string}}
     */
    _getCrosshairLabelStyle(bgTheme) {
        if (bgTheme === 'silver') {
            return {
                vertLabelBg: 'rgba(232, 236, 243, 0.88)',
                horzLabelBg: 'rgba(232, 236, 243, 0.88)',
                timeBorderColor: 'rgba(150, 160, 176, 0.75)'
            };
        }
        return {
            vertLabelBg: 'rgba(42, 46, 57, 0.78)',
            horzLabelBg: 'rgba(42, 46, 57, 0.78)',
            timeBorderColor: 'rgba(197, 203, 206, 0.8)'
        };
    },

    /**
     * 套用十字線標籤主題配色
     * @param {string} bgTheme - 'dark' | 'silver'
     */
    _applyCrosshairLabelTheme(bgTheme) {
        if (!this.chart) return;
        const style = this._getCrosshairLabelStyle(bgTheme || 'dark');
        this.chart.applyOptions({
            crosshair: {
                vertLine: { labelBackgroundColor: style.vertLabelBg },
                horzLine: { labelBackgroundColor: style.horzLabelBg }
            },
            timeScale: {
                borderColor: style.timeBorderColor
            }
        });
    },


    /**
     * 套用常規設定（圖表類型、現價線、十字線、K線顏色）
     * @param {Object} cfg - defaultGeneralConfig 結構
     */
    applyGeneralSettings(cfg) {
        if (!cfg || !this.chart) return;
        const LW = window.LightweightCharts;
        if (!LW) return;

        // BUG1: 背景主題切換
        const bgTheme = cfg.bgTheme || 'dark';
        if (bgTheme === 'silver') {
            this.chart.applyOptions({
                layout: { background: { color: '#f0f3fa' }, textColor: '#333333' },
                grid: {
                    vertLines: { color: 'rgba(180,185,200,0.4)' },
                    horzLines:  { color: 'rgba(180,185,200,0.4)' }
                }
            });
        } else {
            this.chart.applyOptions({
                layout: { background: { color: '#131722' }, textColor: '#d1d4dc' },
                grid: {
                    vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
                    horzLines:  { color: 'rgba(42, 46, 57, 0.5)' }
                }
            });
        }

        // 十字線標籤配色需隨背景主題同步
        this._applyCrosshairLabelTheme(bgTheme);

        // 現價線
        if (this.candleSeries) {
            this.candleSeries.applyOptions({
                lastValueVisible: !!cfg.showPriceLine,
                priceLineVisible: !!cfg.showPriceLine
            });
        }

        // 懸浮窗模式
        this._applyTooltipMode(cfg.tooltipMode || 'floating');

        // 圖表類型
        const newType = cfg.chartType || 'candlestick';
        if (newType !== this.seriesType) {
            this._switchChartSeries(newType, this.currentChartData);
        } else {
            this._applySeriesVisualOptions(newType);
        }

        console.log('[ChartController] applyGeneralSettings:', newType, cfg.tooltipMode, 'theme:', bgTheme);
    },

    // ========== Feature 4: 坐標軸設定 ==========

    /**
     * 套用坐標軸設定（坐標模式、左右刻度）
     * @param {Object} cfg - defaultAxisConfig 結構
     */
    applyAxisSettings(cfg) {
        if (!cfg || !this.chart) return;
        const LW = window.LightweightCharts;
        if (!LW) return;

        // Bug 6: 用可選鏈 + 數值 fallback 防止 enum 引用失敗
        const modeMap = {
            normal:      LW.PriceScaleMode?.Normal       ?? 0,
            logarithmic: LW.PriceScaleMode?.Logarithmic  ?? 1,
            percentage:  LW.PriceScaleMode?.Percentage   ?? 2,
            indexed:     LW.PriceScaleMode?.IndexedTo100 ?? 3
        };
        const primaryMode = modeMap[cfg.priceScaleMode] ?? 0;
        console.log('[Axis] priceScaleMode resolved:', primaryMode, '(from:', cfg.priceScaleMode, ')');

        // 坐標顯示位置
        const placement = cfg.scalePlacement || 'right';
        this._currentAxisPlacement = placement; // Bug3/追加Bug Fix: 記錄供 loadStock/_switchChartSeries 使用
        const showLeft  = placement === 'left'  || placement === 'dual';
        const showRight = placement === 'right' || placement === 'dual';
        const isNormal  = cfg.priceScaleMode === 'normal';

        // 左右各自 mode
        // 普通坐標：依 leftScaleType/rightScaleType 獨立映射；非普通坐標：左右鏡像相同
        const leftMode  = isNormal && cfg.leftScaleType  === 'change' ? (LW.PriceScaleMode?.Percentage  ?? 2) : primaryMode;
        const rightMode = isNormal && cfg.rightScaleType === 'change' ? (LW.PriceScaleMode?.Percentage  ?? 2) : primaryMode;

        // Bug 7: 雙邊坐標需要 mirror series 讓左側 scale 有資料可計算刻度
        if (placement === 'dual') {
            this._ensureMirrorSeries();
        } else {
            this._removeMirrorSeries();
            // 追加Bug Fix: 左軸模式時，_removeMirrorSeries 的副作用是把 candleSeries 移回右軸
            // 但右軸此時設為不可見 → 左軸無任何 series → 刻度完全消失
            // 解法：_removeMirrorSeries 後若 placement==='left' 需將 candleSeries 移至左軸
            if (placement === 'left' && this.candleSeries) {
                try { this.candleSeries.applyOptions({ priceScaleId: 'left' }); } catch (e) {}
            }
        }

        this.chart.applyOptions({
            rightPriceScale: { mode: rightMode, visible: showRight },
            leftPriceScale:  { mode: leftMode,  visible: showLeft  }
        });

        console.log('[ChartController] applyAxisSettings:', cfg.priceScaleMode, placement);

        // Bug1 防禦：坐標軸設定後重新訂閱縮放事件，確保 PatternAnnotation 仍連動
        if (window.PatternAnnotation) window.PatternAnnotation._subscribeRedraw();
    },

    /**
     * Bug 7: 建立/更新雙邊坐標用的左側 mirror series（不可見，僅用於讓 leftPriceScale 有 series 掛靠）
     */
    _ensureMirrorSeries() {
        const data = this.currentChartData;
        if (!data || data.length === 0 || !this.chart) return;
        const LW = window.LightweightCharts;
        if (!LW) return;

        // 先確保 candleSeries 在右側
        if (this.candleSeries) {
            try { this.candleSeries.applyOptions({ priceScaleId: 'right' }); } catch (e) {}
        }

        // 若 mirror series 已存在，直接更新資料即可
        if (!this._mirrorSeries) {
            try {
                this._mirrorSeries = this.chart.addLineSeries({
                    priceScaleId: 'left',
                    lineWidth: 1,
                    color: 'transparent',
                    lastValueVisible: false,
                    priceLineVisible: false,
                    crosshairMarkerVisible: false
                });
            } catch (e) {
                console.warn('[ChartController] mirror series 建立失敗:', e);
                return;
            }
        }
        this._mirrorSeries.setData(data.map(b => ({ time: b.time, value: b.close })));
    },

    /**
     * Bug 7: 銷毀 mirror series（離開雙邊坐標模式時呼叫）
     */
    _removeMirrorSeries() {
        if (!this._mirrorSeries || !this.chart) return;
        // Bug2 Fix: 改用 ChartRenderer.removeSeries（支援 LW v4 series.remove() API）
        window.ChartRenderer.removeSeries(this.chart, this._mirrorSeries);
        this._mirrorSeries = null;
        // 把 candleSeries 歸還到 right（預設 scale id）
        if (this.candleSeries) {
            try { this.candleSeries.applyOptions({ priceScaleId: 'right' }); } catch (e) {}
        }
    },

    // ========== Feature 2: 型態設定 ==========

    /**
     * 套用型態視覺設定到 PatternAnnotation
     * @param {Object} cfg - defaultPatternConfig 結構
     */
    applyPatternConfig(cfg) {
        if (!cfg) return;
        window.state.patternConfig = cfg;
        // Bug 8a: 修正大小寫（window.PatternAnnotation），並呼叫存在的 render() 方法
        if (window.PatternAnnotation) {
            window.PatternAnnotation.render();
        }
        console.log('[ChartController] applyPatternConfig applied');
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
