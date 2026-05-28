/**
 * Chart Controller - 圖表管理協調器
 * 負責 K 線圖的初始化、數據加載、指標渲染等功能
 */
// ─── 診斷開關：預設關閉。測試前在 console 輸入 chartDiag(true) 開啟，截圖後輸入 chartDiag(false) 關閉 ───
window.chartDiag = (on) => {
    window.ChartController._diagEnabled = !!on;
    console.warn(`[DIAG] 診斷輸出已${on ? '開啟 ✅' : '關閉 ❌'}`);
};
// ─── 單次快照指令：不需開啟 chartDiag，隨時呼叫 chartSnap('標籤') 即可輸出一次當前高度 ───
window.chartSnap = (label = 'snap') => {
    const cc = window.ChartController;
    const prev = cc._diagEnabled;
    cc._diagEnabled = true;
    cc._diagDump(label);
    cc._diagEnabled = prev;
};

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
    _baseMainPaneHeight: null,
    _defaultSubPaneHeight: 120,
    _minMainPaneHeight: 60,
    _minSubPaneHeight: 60,
    _minTotalChartHeight: 420,
    _paneHeightOverhead: 52,
    _manualChartHeight: null,
    _totalContainerHeight: null,
    _defaultTotalHeight: null,
    _preFullscreenHeight: null,  // R3-2: save container height before entering fullscreen
    _rsiReferenceSeries: null,
    _rsiPlaceholderSeries: null,
    _rsiLevelLines: [],
    _onChartPointerDown: null,
    _onChartPointerUp: null,
    _onChartPointerCancel: null,
    _onDocumentPointerUp: null,
    _onDocumentPointerCancel: null,
    _pendingSeparatorDrag: false,
    _lastSubCount: null,
    _skipCaptureOnNextRender: false,
    _isRenderingSubCharts: false,
    _expandRestoreSnapshot: null,

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
                if (this._onChartPointerDown && chartContainer) {
                    chartContainer.removeEventListener('pointerdown', this._onChartPointerDown);
                    this._onChartPointerDown = null;
                }
                if (this._onChartPointerUp && chartContainer) {
                    chartContainer.removeEventListener('pointerup', this._onChartPointerUp);
                    this._onChartPointerUp = null;
                }
                if (this._onChartPointerCancel && chartContainer) {
                    chartContainer.removeEventListener('pointercancel', this._onChartPointerCancel);
                    this._onChartPointerCancel = null;
                }
                if (this._onDocumentPointerUp) {
                    document.removeEventListener('pointerup', this._onDocumentPointerUp);
                    this._onDocumentPointerUp = null;
                }
                if (this._onDocumentPointerCancel) {
                    document.removeEventListener('pointercancel', this._onDocumentPointerCancel);
                    this._onDocumentPointerCancel = null;
                }
                this._pendingSeparatorDrag = false;
                this.clearIndicatorSeries();
                this.chart.remove();
            } catch (e) {
                console.warn('[ChartController] 銷毀舊圖表時發生錯誤:', e);
            }
            this.chart = null;
            this.candleSeries = null;
            this.currentChartData = null;
            this.currentSymbol = null;
            this._baseMainPaneHeight = null;
            this._manualChartHeight = null;
            this._totalContainerHeight = null;
            this._defaultTotalHeight = null;
            this._preFullscreenHeight = null;
            this._rsiReferenceSeries = null;
            this._rsiPlaceholderSeries = null;
            this._rsiLevelLines = [];
            this._lastSubCount = null;
            this._expandRestoreSnapshot = null;
            if (window.SubChartControlBar) {
                window.SubChartControlBar.clear();
            }
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
                panes: {
                    separatorColor: 'rgba(120, 126, 142, 0.45)',
                    separatorHoverColor: 'rgba(120, 126, 142, 0.75)',
                    enableResize: true,
                },
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
        this.candleSeries = this._createChartSeries('candlestick', {
            upColor:         initStyle === 'solid' ? initBull : 'transparent',
            downColor:       initBear,
            borderUpColor:   initBull,
            borderDownColor: initBear,
            borderVisible:   true,
            wickUpColor:     initBull,
            wickDownColor:   initBear,
        }, 0);

        // Handle Resize using ResizeObserver
        this._resizeObserver = new ResizeObserver(entries => {
            if (entries.length === 0 || !entries[0].contentRect) return;
            const newRect = entries[0].contentRect;
            if (this.chart) {
                if (typeof this.chart.resize === 'function') {
                    this.chart.resize(newRect.width, newRect.height);
                } else {
                    this.chart.applyOptions({ width: newRect.width, height: newRect.height });
                }
            }
            if (window.SubChartControlBar) {
                window.SubChartControlBar.updateLayout();
            }
            // Bug N5 Fix: After LW internal resize redistribution, re-apply stored pane heights
            // so sub-chart proportions are preserved when total height changes.
            // Bug1 Fix: also call for main-only (no guard on length) to reset stale LW pane hint.
            // Bug4 Fix: skip during renderSubCharts to prevent intermediate pane states from triggering recalc.
            if (this._totalContainerHeight !== null && !this._isRenderingSubCharts) {
                this._diagDump('ResizeObserver-ENTRY');
                const _enabled = this._getEnabledSubChartOrder();
                const _expanded = window.state?.expandedSubChart;
                const _visible = (_expanded && _enabled.includes(_expanded)) ? [_expanded] : _enabled;
                this._updateSubChartPaneHeights(_enabled.length, _visible, _enabled);
                requestAnimationFrame(() => this._diagDump('ResizeObserver-POST-setHeight+rAF'));
            }
        });
        this._resizeObserver.observe(chartContainer);

        // ✅ Feature B: crosshair 移動時更新指標控制列數值 + 懸浮窗
        this.chart.subscribeCrosshairMove(param => {
            if (window.IndicatorTopBar) window.IndicatorTopBar.updateValues(param);
            if (window.SubChartControlBar) window.SubChartControlBar.updateValues(param);
            this._updateCrosshairTooltip(param);
        });

        // 規則 4：僅在「分隔線拖拉」完成時保存比例，避免一般點擊造成 savedHeight 漂移。
        this._onChartPointerDown = (e) => {
            const target = e?.target;
            const inHitArea = !!(target && typeof target.closest === 'function' && target.closest('.pane-sep-hit'));
            const cls = String(target?.className || '').toLowerCase();
            const nativeSeparator = cls.includes('separator');
            const nearByY = this._isPointerNearPaneSeparator(e);
            this._pendingSeparatorDrag = inHitArea || nativeSeparator || nearByY;
        };
        this._onChartPointerUp = () => {
            if (!this._pendingSeparatorDrag) return;
            this._pendingSeparatorDrag = false;
            if (this._isRenderingSubCharts) return;
            if (this._getEnabledSubChartOrder().length === 0) return;
            requestAnimationFrame(() => {
                this._captureCurrentPaneHeights();
                if (window.SubChartControlBar) {
                    window.SubChartControlBar.updateLayout();
                }
            });
        };
        this._onChartPointerCancel = () => {
            this._pendingSeparatorDrag = false;
        };
        // 分隔線拖拉時可能在 chart 外放開滑鼠，使用 document 層級 pointerup 保證會保存比例。
        this._onDocumentPointerUp = () => {
            if (!this._pendingSeparatorDrag) return;
            this._onChartPointerUp();
        };
        this._onDocumentPointerCancel = () => {
            this._pendingSeparatorDrag = false;
        };
        chartContainer.addEventListener('pointerdown', this._onChartPointerDown);
        chartContainer.addEventListener('pointerup', this._onChartPointerUp);
        chartContainer.addEventListener('pointercancel', this._onChartPointerCancel);
        document.addEventListener('pointerup', this._onDocumentPointerUp);
        document.addEventListener('pointercancel', this._onDocumentPointerCancel);

        // ✅ 綁定型態標註 Toggle（每次 init 後重新綁定）
        const patToggle = document.getElementById('patternAnnotationToggle');
        if (patToggle) {
            patToggle.onchange = (e) => {
                if (window.PatternAnnotation) window.PatternAnnotation.setEnabled(e.target.checked);
            };
        }

        // BUG2: DOM 模式懸浮窗事件（吸附、左右邊界切換、Y軸碰撞偵測）
        this._bindTooltipMouseEvents(chartContainer);

        if (window.SubChartControlBar) {
            window.SubChartControlBar.init();
            window.SubChartControlBar.clear();
        }

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
            const width = chartEl.clientWidth  || chartEl.offsetWidth  || 800;
            const height = chartEl.clientHeight || chartEl.offsetHeight || 500;
            if (typeof this.chart.resize === 'function') {
                this.chart.resize(width, height);
            } else {
                this.chart.applyOptions({ width, height });
            }
        }

        // Update Header
        document.getElementById('chartSymbol').textContent = symbol;
        const stockData = window.state.lastResults ? window.state.lastResults.find(s => s.symbol === symbol) : null;
        const chartNameEl = document.getElementById('chartName');
        if (chartNameEl) {
            const fullName = stockData ? stockData.name : symbol;
            chartNameEl.textContent = fullName;
            chartNameEl.title = fullName;
        }

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

            // Bug4 補強：單副圖情境下，切股前先讀取當前實際 pane 比例，避免分隔線拖拉後 savedHeight 未落盤。
            // two-sub 仍維持跳過 capture，避免把 LW 過渡態寫回 state。
            const enabledBeforeSwitch = this._getEnabledSubChartOrder();
            if (enabledBeforeSwitch.length === 1 && !window.state?.expandedSubChart) {
                this._diagDump('loadStock-PRE-capture(single-sub)');
                this._captureCurrentPaneHeights();
                this._diagDump('loadStock-POST-capture(single-sub)');
            } else {
                this._diagDump('loadStock-SKIP-capture(keep-saved-ratio)');
            }
            this.clearIndicatorSeries();
            this._skipCaptureOnNextRender = true;  // Bug4 Fix: 告知 renderIndicators 跳過重複 capture

            // Bug4 Fix: 先同步 mirrorSeries 時間軸資料，再設置主 series 與 setVisibleRange
            // 若 mirrorSeries 仍保留舊頻率的時間戳，LW 的 setData() 會重算時間軸並觸發 auto-fit
            // 導致 setVisibleRange（設定 end_date）被後續的 auto-fit scroll 覆蓋 → 圖表捲到最左邊
            if (this._mirrorSeries && chartData && chartData.length > 0) {
                try {
                    this._mirrorSeries.setData(chartData.map(b => ({
                        time: b.time, open: b.open, high: b.high, low: b.low, close: b.close,
                    })));
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
            // fromFilterClick=true → 對齊 analysis_end_date（範圍長度取 DisplayRangeSelector）；
            // 否則依 DisplayRangeSelector 當前選擇的 duration 決定可見範圍
            if (opts.fromFilterClick) {
                this.setVisibleRangeToAnalysisEndDate(chartData);
            } else {
                this.setVisibleRangeByDuration(chartData);
            }

            // 切換股票後重新套用座標軸（在渲染副圖前套用，確保 mirrorSeries 在副圖重建前就緒）
            if (window.ChartSettingsModal && window.ChartSettingsModal._axisConfig) {
                this.applyAxisSettings(window.ChartSettingsModal._axisConfig);
            }

            // ✅ 渲染圖表指標
            this.renderIndicators(chartData);

            // Bug3 Fix: 渲染副圖後再次同步 mirrorSeries，防止副圖 pane 重建時的 LW 內部重組
            // 影響主圖 priceScale 設定，造成左右坐標軸不一致
            if (this._mirrorSeries && chartData && chartData.length > 0) {
                try {
                    this._mirrorSeries.setData(chartData.map(b => ({
                        time: b.time, open: b.open, high: b.high, low: b.low, close: b.close,
                    })));
                } catch (e) {}
            }

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
            if (window.SubChartControlBar) {
                requestAnimationFrame(() => requestAnimationFrame(() => window.SubChartControlBar.updateLayout()));
            }

        } catch (error) {
            this._skipCaptureOnNextRender = false;  // Bug4 Fix: 例外時重置旗標，防止下次渲染跳過 capture
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
            // 快捷按鈕模式：end_date = 今天，依 DisplayRangeSelector 設定範圍
            this.setVisibleRangeByDuration(chartData);
            return;
        }

        // 將日期字串轉為 Unix timestamp（秒）
        const endTimestamp = new Date(endDateStr + 'T00:00:00').getTime() / 1000;
        if (isNaN(endTimestamp)) {
            console.warn('[ChartController] setVisibleRangeToAnalysisEndDate: 無效日期，使用 fallback');
            this.setVisibleRangeByDuration(chartData);
            return;
        }

        // 規則 5: 範圍長度取 DisplayRangeSelector 當前 duration（而非固定 1 年）
        const drs = window.DisplayRangeSelector;
        const dur = drs ? drs.getCurrentRange()?.duration : null;

        // 「全部」→ fitContent，不受 analysis_end_date 約束
        if (dur && dur.unit === 'all') {
            console.log('[ChartController] setVisibleRangeToAnalysisEndDate: duration=all → fitContent');
            this.chart.timeScale().fitContent();
            return;
        }

        const oneYearInSeconds = 365 * 24 * 60 * 60;
        const rangeSec = (dur && drs._rangeDurationToSeconds(dur) !== Infinity)
            ? drs._rangeDurationToSeconds(dur) : oneYearInSeconds;
        const fromTimestamp = endTimestamp - rangeSec;

        console.log(`[ChartController] setVisibleRangeToAnalysisEndDate: ${new Date(fromTimestamp * 1000).toISOString().split('T')[0]} → ${endDateStr}`);

        try {
            this.chart.timeScale().setVisibleRange({
                from: fromTimestamp,
                to: endTimestamp
            });
        } catch (e) {
            console.warn('[ChartController] setVisibleRange 失敗，使用 fallback:', e);
            this.setVisibleRangeByDuration(chartData);
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
     * 依 DisplayRangeSelector 當前選擇的 duration 設定可視範圍
     * duration.unit='all' → fitContent()
     * @param {Array} chartData - K 線數據
     */
    setVisibleRangeByDuration(chartData) {
        if (!chartData || chartData.length === 0) return;

        const drs = window.DisplayRangeSelector;
        const dur = drs ? drs.getCurrentRange()?.duration : null;

        // 全部 → fitContent
        if (dur && dur.unit === 'all') {
            this.chart.timeScale().fitContent();
            return;
        }

        const rangeSec = dur ? drs._rangeDurationToSeconds(dur) : 365 * 86400;
        if (rangeSec === Infinity) {
            this.chart.timeScale().fitContent();
            return;
        }

        const lastBar = chartData[chartData.length - 1];
        let lastTime = lastBar.time;
        if (typeof lastTime === 'string') {
            lastTime = new Date(lastTime + ' 00:00:00').getTime() / 1000;
        }
        const from = lastTime - rangeSec;

        console.log(`[ChartController] setVisibleRangeByDuration: ${rangeSec / 86400} days from end`);

        try {
            this.chart.timeScale().setVisibleRange({ from, to: lastTime });
        } catch (e) {
            console.warn('[ChartController] setVisibleRangeByDuration failed, fallback:', e);
            this.setVisibleRangeToLastYear(chartData);
        }
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

                // 規則 2: 同步更新顯示範圍下拉標籤
                if (window.DisplayRangeSelector) {
                    window.DisplayRangeSelector.syncFromTimeframeButton(interval);
                }

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

        // Bug2/4 Fix: 非拖拉操作（開關副圖、切股）不在此重算 savedHeight，避免比例漂移。
        if (!this._skipCaptureOnNextRender) {
            this._diagDump('renderIndicators-NO-capture(non-drag-op)');
        } else {
            this._diagDump('renderIndicators-SKIP(loadStock-captured)');
        }
        this._skipCaptureOnNextRender = false;

        // 清除舊的指標系列
        this.clearIndicatorSeries();

        // ✅ Bug3: 指標總開關（顯示指標按鈕）
        if (!this.isIndicatorsVisible) {
            console.log('[ChartController] 指標顯示已關閉，停止渲染');
            this._syncChartContainerHeight(0, []);
            if (window.SubChartControlBar) window.SubChartControlBar.clear();
            return;
        }

        // ✅ SSOT: 渲染 MA 指標
        const maState = window.state.chartIndicators.MA;
        if (maState && maState.isGlobalEnabled && maState.lines && maState.lines.length > 0) {
            maState.lines.forEach(ma => {
                const series = window.IndicatorRegistry.render(this.chart, chartData, 'sma', ma);
                if (series) {
                    ma.series = series;
                    try {
                        series.applyOptions({ visible: ma.isEnabled !== false });
                    } catch (e) {}
                    console.log(`[ChartController] ✅ 渲染 MA${ma.period}${ma.isEnabled === false ? ' (隱藏)' : ''}`);
                }
            });
        }

        // ✅ SSOT: 渲染 Bollinger Bands，依各線 isEnabled 決定是否保留
        const bollState = window.state.chartIndicators.BOLL;
        if (bollState && bollState.isGlobalEnabled) {
            const series = window.IndicatorRegistry.render(this.chart, chartData, 'bollinger', bollState);
            if (series) {
                const lines = bollState.lines || {};
                ['upper', 'middle', 'lower'].forEach((key) => {
                    const line = lines[key];
                    if (!line) return;
                    line.series = series[key] || null;
                    if (line.series) {
                        try {
                            line.series.applyOptions({ visible: line.isEnabled !== false });
                        } catch (e) {}
                    }
                });
                console.log(`[ChartController] ✅ 渲染 BOLL(${bollState.period},${bollState.stdDev})`);
            }
        }

        // ✅ 副圖渲染（VOL / RSI）
        this.renderSubCharts(chartData);

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

        this._clearSubChartSeries();
    },

    /**
     * 清除副圖 series
     */
    _clearSubChartSeries() {
        const state = window.state?.chartIndicators;
        if (!state) return;

        const volLine = state.VOL?.lines?.VOL1;
        if (volLine?.series) {
            window.ChartRenderer.removeSeries(this.chart, volLine.series);
            volLine.series = null;
        }

        const rsiLines = state.RSI?.lines || {};
        Object.values(rsiLines).forEach((lineCfg) => {
            if (lineCfg?.series) {
                window.ChartRenderer.removeSeries(this.chart, lineCfg.series);
                lineCfg.series = null;
            }
        });

        if (this._rsiPlaceholderSeries) {
            window.ChartRenderer.removeSeries(this.chart, this._rsiPlaceholderSeries);
            this._rsiPlaceholderSeries = null;
        }

        if (state.VOL) state.VOL.paneIndex = null;
        if (state.RSI) state.RSI.paneIndex = null;
        this._rsiReferenceSeries = null;
        this._rsiLevelLines = [];
    },

    /**
     * 依勾選順序取得啟用中的副圖項目
     */
    _getEnabledSubChartOrder() {
        const state = window.state?.chartIndicators;
        if (!state) return [];

        const preferred = Array.isArray(state.subChartOrder) ? state.subChartOrder.slice() : [];
        const enabled = preferred.filter((name) => {
            if (name !== 'VOL' && name !== 'RSI') return false;
            return !!state[name]?.isGlobalEnabled;
        });

        ['VOL', 'RSI'].forEach((name) => {
            if (state[name]?.isGlobalEnabled && !enabled.includes(name)) {
                enabled.push(name);
            }
        });

        state.subChartOrder = enabled.slice();
        if (window.state?.expandedSubChart && !enabled.includes(window.state.expandedSubChart)) {
            window.state.expandedSubChart = null;
        }

        return enabled;
    },

    /**
     * 渲染副圖（VOL / RSI）
     */
    renderSubCharts(chartData) {
        if (!this.chart || !chartData || chartData.length === 0) return;

        const state = window.state?.chartIndicators;
        if (!state) return;

        // Bug4 Fix: 移除重複 capture — renderSubCharts 的呼叫者（renderIndicators / toggleSubChartExpand）
        // 已在 clearIndicatorSeries 執行前呼叫 _captureCurrentPaneHeights。
        // 此處再次捕捉時 paneIndex 已為 null，LW 可能已重新分配 pane 空間，會污染 savedHeight/_baseMainPaneHeight。

        // enabledOrder is mutable; _forceCloseCascade may splice elements out
        const enabledOrder = this._getEnabledSubChartOrder();

        // B-3 Cascade: fire only when user ADDS a new sub-chart (count increased from last render).
        // Skip when _lastSubCount===null (first render / stock-switch) to preserve saved state.
        // 保留既有 savedHeight，避免「重開副圖」時把已調整過的高度覆蓋回預設值。
        if (this._lastSubCount !== null && enabledOrder.length > this._lastSubCount) {
            this._forceCloseCascade(enabledOrder);
        }
        this._lastSubCount = enabledOrder.length;

        const totalEnabled = enabledOrder.length;

        // Cascade may have removed the currently-expanded sub; clear stale reference
        if (window.state?.expandedSubChart && !enabledOrder.includes(window.state.expandedSubChart)) {
            window.state.expandedSubChart = null;
        }
        const expanded = window.state?.expandedSubChart;
        const visibleOrder = (expanded && enabledOrder.includes(expanded)) ? [expanded] : enabledOrder;

        this._diagDump('renderSubCharts-ENTRY');
        this._isRenderingSubCharts = true;
        this._clearSubChartSeries();
        this._diagDump('renderSubCharts-POST-clearSeries');
        this._pruneExtraPanes(1 + visibleOrder.length);
        this._diagDump('renderSubCharts-POST-prunePanes');
        this._syncChartContainerHeight(totalEnabled, enabledOrder);

        if (totalEnabled === 0) {
            // Ensure main-only pane height is re-applied immediately after last sub-chart is closed.
            this._isRenderingSubCharts = false;
            this._updateSubChartPaneHeights(0, [], []);
            if (window.SubChartControlBar) window.SubChartControlBar.clear();
            return;
        }

        visibleOrder.forEach((name, idx) => {
            const paneIndex = idx + 1;
            if (state[name]) state[name].paneIndex = paneIndex;

            if (name === 'VOL') this._renderVOLSubChart(chartData, paneIndex);
            if (name === 'RSI') this._renderRSISubChart(chartData, paneIndex);
        });

        ['VOL', 'RSI'].forEach((name) => {
            if (!visibleOrder.includes(name) && state[name]) {
                state[name].paneIndex = null;
            }
            if (state[name]) {
                state[name].isExpanded = window.state?.expandedSubChart === name;
            }
        });

        // Bug2 Fix: double rAF — LW 在 addLineSeries/pane 創建後會自動均分 pane 高度；
        // 延至下兩幀再呼叫 setHeight，確保 LW 已完成均分後我們的設定才覆蓋上去，避免又被 auto-distribution 覆蓋。
        // Bug3 Fix: _renderGeneration 防止陳舊 rAF（來自上一次 expand/collapse）覆蓋當前 pane 狀態。
        this._renderGeneration = (this._renderGeneration || 0) + 1;
        const _gen = this._renderGeneration;
        const _total = totalEnabled, _vis = visibleOrder.slice(), _ena = enabledOrder.slice();
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (_gen !== this._renderGeneration) return;
                this._isRenderingSubCharts = false;
                this._skipPaneRead = true;
                this._diagDump('double-rAF-PRE-setHeight(LW-auto-equalized)');
                this._updateSubChartPaneHeights(_total, _vis, _ena);
                requestAnimationFrame(() => this._diagDump('double-rAF-POST-setHeight+rAF'));
                if (window.SubChartControlBar) {
                    window.SubChartControlBar.render();
                    window.SubChartControlBar.updateLayout();
                }
            });
        });
    },

    /**
     * B-3 Cascade: 當新增副圖後 mainHeight < _minMainPaneHeight 時，
     * 強制關閉「最先開啟」的副圖（enabledOrder[0]），直到 mainHeight 恢復合法值。
     * 行為等同使用者手動關閉：isGlobalEnabled=false、捨棄 savedHeight、同步 DOM toggle。
     * enabledOrder 為 mutable array，此方法直接 splice in place。
     */
    _forceCloseCascade(enabledOrder) {
        const state = window.state?.chartIndicators;
        if (!state) return;

        const totalHeight = Math.max(
            this._minTotalChartHeight,
            this._totalContainerHeight || this._defaultTotalHeight || 420
        );

        let sumSub = enabledOrder.reduce((sum, name) => {
            const h = Number(state[name]?.savedHeight);
            return sum + (Number.isFinite(h) && h >= 40 ? Math.round(h) : this._defaultSubPaneHeight);
        }, 0);
        let mainHeight = totalHeight - sumSub;

        // No violation → nothing to do
        if (mainHeight >= this._minMainPaneHeight) return;

        // Cascade: force-close earliest-opened sub(s) until main >= minimum
        while (mainHeight < this._minMainPaneHeight && enabledOrder.length > 0) {
            const victim = enabledOrder[0]; // earliest opened = first in subChartOrder

            const victimH = (() => {
                const h = Number(state[victim]?.savedHeight);
                return Number.isFinite(h) && h >= 40 ? Math.round(h) : this._defaultSubPaneHeight;
            })();

            // Disable + discard savedHeight (next re-enable starts fresh at _defaultSubPaneHeight)
            if (state[victim]) {
                state[victim].isGlobalEnabled = false;
                delete state[victim].savedHeight;
            }
            if (state.subChartOrder) {
                state.subChartOrder = state.subChartOrder.filter(n => n !== victim);
            }
            if (window.state?.expandedSubChart === victim) {
                window.state.expandedSubChart = null;
            }

            // Sync DOM toggle checkbox (chart management modal)
            const toggleId = victim === 'VOL' ? 'vol-toggle' : 'rsi-toggle';
            const toggle = document.getElementById(toggleId);
            if (toggle) toggle.checked = false;

            enabledOrder.splice(0, 1);
            sumSub -= victimH;
            mainHeight = totalHeight - sumSub;
        }

        if (window.ChartSettingsModal) {
            window.ChartSettingsModal.saveToLocalStorage();
        }
    },

    _renderVOLSubChart(chartData, paneIndex) {
        const state = window.state?.chartIndicators;
        const volState = state?.VOL;
        const volLine = volState?.lines?.VOL1;
        if (!volState || !volLine) return;

        const generalCfg = (window.ChartSettingsModal && window.ChartSettingsModal._generalConfig) || {};
        const defaultCfg = (window.ChartSettingsModal && window.ChartSettingsModal.defaultGeneralConfig) || {};
        const bullColor = generalCfg.bullColor || defaultCfg.bullColor || '#26a69a';
        const bearColor = generalCfg.bearColor || defaultCfg.bearColor || '#ef5350';

        const data = window.SubChartVOL
            ? window.SubChartVOL.buildSeriesData(chartData, bullColor, bearColor, volLine.opacity)
            : [];

        volLine.lastValue = window.SubChartVOL ? window.SubChartVOL.getLastValue(chartData) : null;

        const series = window.ChartRenderer.renderHistogram(this.chart, data, {
            title: '',
            paneIndex,
            priceScaleId: 'right',
            priceFormat: { type: 'volume' },
        });
        volLine.series = series;
        if (series && typeof series.applyOptions === 'function') {
            try {
                series.applyOptions({ visible: volLine.isEnabled !== false, lastValueVisible: false, priceLineVisible: false });
            } catch (e) {}
        }
    },

    _renderRSISubChart(chartData, paneIndex) {
        const state = window.state?.chartIndicators;
        const rsiState = state?.RSI;
        if (!rsiState) return;

        const dataMap = window.SubChartRSI
            ? window.SubChartRSI.buildSeriesData(chartData, rsiState)
            : {};
        const lineOrder = ['RSI1', 'RSI2', 'RSI3'];
        const enabledLineKeys = [];
        let refSeries = null;

        lineOrder.forEach((lineKey) => {
            const lineCfg = rsiState.lines?.[lineKey];
            if (!lineCfg) return;

            const lineData = dataMap[lineKey] || [];
            lineCfg.lastValue = lineData.length > 0 ? Number(lineData[lineData.length - 1].value) : null;

            const series = window.ChartRenderer.renderLine(this.chart, lineData, {
                title: '',
                color: this._withOpacity(lineCfg.color, lineCfg.opacity),
                lineWidth: lineCfg.lineWidth || 1,
                paneIndex,
                priceScaleId: 'right',
                autoscaleInfoProvider: () => ({
                    priceRange: { minValue: 0, maxValue: 100 },
                }),
            });

            lineCfg.series = series;
            if (series && typeof series.applyOptions === 'function') {
                try {
                    series.applyOptions({ visible: lineCfg.isEnabled !== false, lastValueVisible: false, priceLineVisible: false });
                } catch (e) {}
            }

            if (lineCfg.isEnabled !== false && series) {
                enabledLineKeys.push(lineKey);
                if (!refSeries) refSeries = series;
            }
        });

        if (!refSeries) {
            const placeholderData = (Array.isArray(chartData) ? chartData : []).map((bar) => ({
                time: bar.time,
                value: 50,
            }));

            this._rsiPlaceholderSeries = window.ChartRenderer.renderLine(this.chart, placeholderData, {
                title: 'RSI_PLACEHOLDER',
                color: 'rgba(0, 0, 0, 0)',
                lineWidth: 1,
                paneIndex,
                priceScaleId: 'right',
                autoscaleInfoProvider: () => ({
                    priceRange: { minValue: 0, maxValue: 100 },
                }),
            });

            if (this._rsiPlaceholderSeries && typeof this._rsiPlaceholderSeries.applyOptions === 'function') {
                try {
                    this._rsiPlaceholderSeries.applyOptions({
                        visible: true,
                        lastValueVisible: false,
                        priceLineVisible: false,
                        crosshairMarkerVisible: false,
                    });
                } catch (e) {}
            }
        } else {
            this._rsiPlaceholderSeries = null;
        }

        this._rsiReferenceSeries = refSeries;
        this._rsiLevelLines = [];
        if (refSeries && enabledLineKeys.length > 0 && typeof refSeries.createPriceLine === 'function') {
            const dashed = window.LightweightCharts?.LineStyle?.Dashed ?? 2;
            [80, 50, 20].forEach((level) => {
                const priceLine = refSeries.createPriceLine({
                    price: level,
                    color: 'rgba(170, 178, 194, 0.65)',
                    lineWidth: 1,
                    lineStyle: dashed,
                    axisLabelVisible: false,
                    title: '',
                });
                if (priceLine) this._rsiLevelLines.push(priceLine);
            });
        }
    },

    _updateSubChartPaneHeights(totalEnabled, visibleOrder, enabledOrder) {
        if (!this.chart || typeof this.chart.panes !== 'function') return;
        const panes = this.chart.panes();
        if (!Array.isArray(panes) || panes.length === 0) return;

        const chartWrapper = document.getElementById('chartWrapper');
        const wrapperHeight = Math.round(
            this._totalContainerHeight
            || chartWrapper?.getBoundingClientRect().height
            || chartWrapper?.clientHeight
            || 0
        );
        const totalHeight = Math.max(this._minTotalChartHeight, wrapperHeight || this._defaultTotalHeight || 420);
        this._totalContainerHeight = totalHeight;
        const measuredPaneArea = panes.reduce((sum, p) => sum + (this._paneHeight(p) || 0), 0);
        const paneAreaHeight = measuredPaneArea > 0
            ? measuredPaneArea
            : Math.max(1, totalHeight - this._paneHeightOverhead);
        const logicalToPanePx = (logicalPx, minPx = 0) => {
            if (!Number.isFinite(logicalPx)) return Math.max(minPx, 0);
            if (!(totalHeight > 0)) return Math.max(minPx, Math.round(logicalPx));
            return Math.max(minPx, Math.round((logicalPx * paneAreaHeight) / totalHeight));
        };

        const availableHeight = totalHeight;
        const allEnabledOrder = Array.isArray(enabledOrder) && enabledOrder.length > 0
            ? enabledOrder
            : visibleOrder;
        const subCount = allEnabledOrder.length;
        const state = window.state?.chartIndicators;

        this._diagDump(`_updateSub-ENTRY skip=${!!this._skipPaneRead} vis=${JSON.stringify(visibleOrder)} ena=${JSON.stringify(enabledOrder)}`);

        // 僅在 double-rAF 首次套用後跳過一次讀回；不在此處重算 savedHeight，避免非拖拉操作污染比例。
        if (this._skipPaneRead && this._diagEnabled) {
            console.warn('[DIAG] _updateSub skip pane read once after render');
        }
        this._skipPaneRead = false;

        // R3-1/R3-4: New sub-chart height logic:
        //   - Each new sub-chart gets _defaultSubPaneHeight (120px) from the main chart.
        //   - Once the user drags a separator, savedHeight is updated and preserved.
        //   - Main chart = available - sum(all sub heights).

        if (subCount === 0 || visibleOrder.length === 0) {
            // Bug1 Fix: 收斂殘留 pane 後，使用超大 weight 給 pane[0]，讓殘留 ghost pane (weight=1)
            // 佔比趨近於零，確保主圖完整填滿容器，避免黑底留白。
            this._collapseExtraPanesForMainOnly();
            this._baseMainPaneHeight = Math.max(this._minMainPaneHeight, totalHeight);
            const freshPanes0 = this.chart.panes();
            if (Array.isArray(freshPanes0) && freshPanes0.length > 0) {
                if (freshPanes0[0] && typeof freshPanes0[0].setHeight === 'function') {
                    freshPanes0[0].setHeight(totalHeight * 100);
                }
                for (let i = 1; i < freshPanes0.length; i++) {
                    if (freshPanes0[i] && typeof freshPanes0[i].setHeight === 'function') {
                        freshPanes0[i].setHeight(1);
                    }
                }
            }
            this._attachPaneSeparatorTooltips([]);
            return;
        }

        // Gather sub-chart heights (use savedHeight if available, otherwise default)
        const subHeights = allEnabledOrder.map((name) => {
            const saved = Number(state?.[name]?.savedHeight);
            if (Number.isFinite(saved) && saved >= 40) return Math.round(saved);
            return this._defaultSubPaneHeight;
        });

        const mainPane = panes[0];
        const expanded = window.state?.expandedSubChart;

        // --- Expanded mode: expanded sub takes all sub-chart combined space ---
        // Bug6 Fix: 主圖高度保持不變（使用 _baseMainPaneHeight），expanded 副圖佔剩餘全部空間
        if (expanded && visibleOrder.length === 1) {
            const mainHeight = Math.max(
                this._minMainPaneHeight,
                Number.isFinite(this._baseMainPaneHeight) && this._baseMainPaneHeight > 0
                    ? this._baseMainPaneHeight
                    : availableHeight - this._defaultSubPaneHeight
            );
            const expandedHeight = Math.max(this._minSubPaneHeight, availableHeight - mainHeight);
            const minMainPanePx = logicalToPanePx(this._minMainPaneHeight, 1);
            const maxMainPanePx = Math.max(1, Math.round(paneAreaHeight - this._minSubPaneHeight));
            const mainPanePx = Math.min(maxMainPanePx, Math.max(minMainPanePx, logicalToPanePx(mainHeight, 1)));
            const expandedPanePx = Math.max(this._minSubPaneHeight, Math.round(paneAreaHeight - mainPanePx));

            if (this._diagEnabled) console.warn('[DIAG] _updateSub-EXPANDED want', JSON.stringify({
                mainHeight,
                expandedHeight,
                mainPanePx,
                expandedPanePx,
                paneAreaHeight,
                expanded,
                paneCount: panes.length,
            }));

            // 注意：不要主動 set 主圖，避免 main/sub 互相擠壓造成偏移；主圖由剩餘空間自動決定。
            if (panes[1] && typeof panes[1].setHeight === 'function') {
                panes[1].setHeight(expandedPanePx);
            }
            // Bug3 Fix: pane[2+] 在 expanded 模式下為 ghost（無 series）但殘留舊 weight。
            // 若不歸零，LW 以 main_w + expanded_w + ghost_w 均分，使 expanded 副圖只得到
            // expandedHeight/(main+expanded+ghost) 比例的空間，造成展開高度遠小於預期。
            for (let i = 2; i < panes.length; i++) {
                if (panes[i] && typeof panes[i].setHeight === 'function') {
                    panes[i].setHeight(1);
                }
            }

            this._baseMainPaneHeight = mainHeight;
            this._attachPaneSeparatorTooltips(visibleOrder);
            requestAnimationFrame(() => this._diagDump('EXPANDED-POST-setHeight+rAF'));
            return;
        }

        // --- Normal mode ---
        // Bug5 Fix: 新增副圖的空間永遠從主圖扣，已有 savedHeight 的副圖不受影響。
        // 識別哪些副圖「剛新增」（無 savedHeight）vs 已有 savedHeight。
        // Bug2 Fix: 新副圖的初始高度依容器比例動態計算（120px × containerHeight/420px），而非固定 120px
        const scaledDefault = this._scaledSubPaneHeight(availableHeight);
        let sumSub = 0;
        const adjustedSubHeights = allEnabledOrder.map((name, i) => {
            const raw = Number(state?.[name]?.savedHeight);
            if (Number.isFinite(raw) && raw >= 40) {
                // 已有 savedHeight：維持原高度
                sumSub += Math.round(raw);
                return Math.round(raw);
            } else {
                // 新副圖：依容器高度比例動態計算初始高度，從主圖扣
                sumSub += scaledDefault;
                return scaledDefault;
            }
        });
        // 用 adjustedSubHeights 取代原 subHeights 計算（覆蓋 subHeights）
        subHeights.splice(0, subHeights.length, ...adjustedSubHeights);

        let mainHeight = availableHeight - sumSub;

        // 若 mainHeight < 最小值，不自動擴展容器：直接以最小值保底
        if (mainHeight < this._minMainPaneHeight) {
            mainHeight = this._minMainPaneHeight;
        }

        // 注意：Normal 模式也不主動 set 主圖；只設定副圖高度，主圖自動吃剩餘空間。

        this._baseMainPaneHeight = mainHeight;
        allEnabledOrder.forEach((name, idx) => {
            if (state?.[name]) {
                state[name].savedHeight = Math.max(40, Math.round(subHeights[idx]));
            }
        });

        if (this._diagEnabled) console.warn('[DIAG] _updateSub-NORMAL want', JSON.stringify({
            mainHeight,
            subs: allEnabledOrder.map((n, i) => ({ name: n, h: subHeights[i], pi: state?.[n]?.paneIndex })),
            visibleOrder, paneCount: panes.length,
        }));

        const minMainPanePx = logicalToPanePx(this._minMainPaneHeight, 1);
        const maxSubBudgetPx = Math.max(0, Math.round(paneAreaHeight - minMainPanePx));
        const desiredSubByVisible = visibleOrder.map((name) => {
            const mappedIdx = allEnabledOrder.indexOf(name);
            const mappedHeight = mappedIdx >= 0 ? subHeights[mappedIdx] : this._defaultSubPaneHeight;
            return {
                name,
                px: logicalToPanePx(mappedHeight, this._minSubPaneHeight),
            };
        });
        let sumDesiredSubPx = desiredSubByVisible.reduce((s, x) => s + x.px, 0);
        if (sumDesiredSubPx > maxSubBudgetPx && desiredSubByVisible.length > 0) {
            let overflow = sumDesiredSubPx - maxSubBudgetPx;
            let guard = 0;
            while (overflow > 0 && guard < 1000) {
                for (let i = desiredSubByVisible.length - 1; i >= 0 && overflow > 0; i--) {
                    if (desiredSubByVisible[i].px > this._minSubPaneHeight) {
                        desiredSubByVisible[i].px -= 1;
                        overflow -= 1;
                    }
                }
                guard += 1;
            }
        }

        // 先壓低可見範圍之外的 ghost pane，避免殘留權重偷走可用空間。
        for (let i = visibleOrder.length + 1; i < panes.length; i++) {
            if (panes[i] && typeof panes[i].setHeight === 'function') {
                panes[i].setHeight(1);
            }
        }

        let applyMode = 'direct';

        if (desiredSubByVisible.length === 2
            && panes[1] && typeof panes[1].setHeight === 'function'
            && panes[2] && typeof panes[2].setHeight === 'function') {
            // two-sub：使用補償解 + 分幀套用，避免同一 tick 連續 setHeight 造成目標失真。
            const target1 = desiredSubByVisible[0].px;
            const target2 = desiredSubByVisible[1].px;
            const targetMain = Math.max(minMainPanePx, Math.round(paneAreaHeight - target1 - target2));

            const A = Math.max(1, paneAreaHeight);
            const computeFirstCommand = (curMain, cur1, cur2) => {
                const D = Math.max(1, A - cur1);
                const K = Math.max(1, A - target2);
                const denom = (K * D) - (target1 * cur2);
                let cmd = Number.isFinite(denom) && denom > 1
                    ? Math.round((target1 * A * curMain) / denom)
                    : target1;
                cmd = Math.max(this._minSubPaneHeight, Math.min(maxSubBudgetPx, cmd));
                return cmd;
            };

            const currentMain = Math.max(1, this._paneHeight(panes[0]) || 1);
            const current1 = Math.max(1, this._paneHeight(panes[1]) || 1);
            const current2 = Math.max(1, this._paneHeight(panes[2]) || 1);
            const firstCommandPx = computeFirstCommand(currentMain, current1, current2);

            panes[1].setHeight(firstCommandPx);
            applyMode = 'two-sub-staged';

            this._paneApplyGeneration = (this._paneApplyGeneration || 0) + 1;
            const applyGen = this._paneApplyGeneration;
            requestAnimationFrame(() => {
                if (applyGen !== this._paneApplyGeneration) return;
                if (!this.chart || typeof this.chart.panes !== 'function') return;

                const stagedPanes = this.chart.panes();
                if (!Array.isArray(stagedPanes) || !stagedPanes[2] || typeof stagedPanes[2].setHeight !== 'function') return;

                stagedPanes[2].setHeight(target2);

                // 第二輪補償：以上一輪結果為新初值再解一次，降低 3~10px 的殘差漂移。
                requestAnimationFrame(() => {
                    if (applyGen !== this._paneApplyGeneration) return;
                    if (!this.chart || typeof this.chart.panes !== 'function') return;
                    const corrPanes = this.chart.panes();
                    if (!Array.isArray(corrPanes) || !corrPanes[1] || !corrPanes[2]) return;

                    const cm2 = Math.max(1, this._paneHeight(corrPanes[0]) || 1);
                    const c12 = Math.max(1, this._paneHeight(corrPanes[1]) || 1);
                    const c22 = Math.max(1, this._paneHeight(corrPanes[2]) || 1);
                    const correctedFirstPx = computeFirstCommand(cm2, c12, c22);

                    if (typeof corrPanes[1].setHeight === 'function') {
                        corrPanes[1].setHeight(correctedFirstPx);
                    }

                    requestAnimationFrame(() => {
                        if (applyGen !== this._paneApplyGeneration) return;
                        if (!this.chart || typeof this.chart.panes !== 'function') return;
                        const finalPanes = this.chart.panes();
                        if (!Array.isArray(finalPanes) || !finalPanes[2] || typeof finalPanes[2].setHeight !== 'function') return;

                        finalPanes[2].setHeight(target2);
                        for (let i = visibleOrder.length + 1; i < finalPanes.length; i++) {
                            if (finalPanes[i] && typeof finalPanes[i].setHeight === 'function') {
                                finalPanes[i].setHeight(1);
                            }
                        }
                        if (window.SubChartControlBar) {
                            window.SubChartControlBar.updateLayout();
                        }

                        if (this._diagEnabled) {
                            const afterPanes = this.chart.panes();
                            const afterPx = Array.isArray(afterPanes)
                                ? afterPanes.map((p, i) => ({ i, px: this._paneHeight(p) }))
                                : [];
                            console.warn('[DIAG] _updateSub-twoSubApply', JSON.stringify({
                                paneAreaHeight,
                                targetMain,
                                target1,
                                target2,
                                firstCommandPx,
                                currentMain,
                                current1,
                                current2,
                                correctedFirstPx,
                                afterPx,
                            }));
                        }
                    });
                });
            });
        } else {
            desiredSubByVisible.forEach(({ px }, idx) => {
                const pane = panes[idx + 1];
                if (!pane || typeof pane.setHeight !== 'function') return;
                pane.setHeight(px);
            });
        }

        if (this._diagEnabled) {
            const afterPanes = this.chart.panes();
            const afterPx = Array.isArray(afterPanes)
                ? afterPanes.map((p, i) => ({ i, px: this._paneHeight(p) }))
                : [];
            console.warn('[DIAG] _updateSub-apply', JSON.stringify({
                desired: desiredSubByVisible,
                applyMode,
                afterPx,
            }));
        }

        // Bug3 Fix: collapse any ghost panes beyond visible sub-charts to prevent them stealing space
        for (let i = visibleOrder.length + 1; i < panes.length; i++) {
            if (panes[i] && typeof panes[i].setHeight === 'function') {
                panes[i].setHeight(1);
            }
        }

        this._attachPaneSeparatorTooltips(visibleOrder);
        if (window.SubChartControlBar) {
            requestAnimationFrame(() => window.SubChartControlBar.updateLayout());
        }
        requestAnimationFrame(() => this._diagDump('NORMAL-POST-setHeight+rAF'));
    },

    _collapseExtraPanesForMainOnly() {
        if (!this.chart || typeof this.chart.panes !== 'function') return;

        let panes = this.chart.panes();
        if (!Array.isArray(panes) || panes.length <= 1) return;

        // v5 API: remove stale empty panes explicitly when available
        if (typeof this.chart.removePane === 'function') {
            for (let i = panes.length - 1; i >= 1; i--) {
                try {
                    this.chart.removePane(i);
                } catch (e) {}
            }
            panes = this.chart.panes();
        }

        // Fallback: if pane removal API is unavailable, shrink extra panes to near-zero height
        if (Array.isArray(panes) && panes.length > 1) {
            for (let i = 1; i < panes.length; i++) {
                if (panes[i] && typeof panes[i].setHeight === 'function') {
                    panes[i].setHeight(1);
                }
            }
        }
    },

    _pruneExtraPanes(targetPaneCount = 1) {
        if (!this.chart || typeof this.chart.panes !== 'function') return;

        const minCount = Math.max(1, Math.round(Number(targetPaneCount) || 1));
        let panes = this.chart.panes();
        if (!Array.isArray(panes) || panes.length <= minCount) return;

        if (typeof this.chart.removePane === 'function') {
            for (let i = panes.length - 1; i >= minCount; i--) {
                try {
                    this.chart.removePane(i);
                } catch (e) {}
            }
            panes = this.chart.panes();
        }

        if (Array.isArray(panes) && panes.length > minCount) {
            for (let i = minCount; i < panes.length; i++) {
                if (panes[i] && typeof panes[i].setHeight === 'function') {
                    panes[i].setHeight(1);
                }
            }
        }
    },

    _syncChartContainerHeight(subChartCount, enabledOrder) {
        const chartContainer = document.getElementById('chartContainer');
        const chartWrapper = document.getElementById('chartWrapper');
        if (!chartContainer || !chartWrapper) return;

        // Bug N2 Fix: no stock loaded → always restore flex-1 behaviour for the placeholder area
        const stockLoaded = !!(this.currentChartData && this.currentChartData.length > 0);
        if (!stockLoaded) {
            chartContainer.classList.remove('chart-container--with-subcharts');
            return;
        }

        const hasSubCharts = subChartCount > 0;
        chartContainer.classList.toggle('chart-container--with-subcharts', hasSubCharts);

        const measuredHeight = Math.round(chartWrapper.getBoundingClientRect().height || chartWrapper.clientHeight || 0);
        if (measuredHeight > 0 && !this._defaultTotalHeight) {
            this._defaultTotalHeight = Math.max(this._minTotalChartHeight, measuredHeight);
        }

        if (!hasSubCharts && this._totalContainerHeight === null && this._manualChartHeight === null) {
            chartWrapper.style.removeProperty('height');
            chartWrapper.style.removeProperty('min-height');
            chartWrapper.style.removeProperty('max-height');

            if (this.chart) {
                if (typeof this.chart.resize === 'function') {
                    this.chart.resize(chartWrapper.clientWidth, chartWrapper.clientHeight);
                } else {
                    this.chart.applyOptions({ width: chartWrapper.clientWidth, height: chartWrapper.clientHeight });
                }
            }

            if (window.SubChartControlBar) window.SubChartControlBar.updateLayout();
            return;
        }

        if (this._totalContainerHeight === null) {
            this._totalContainerHeight = Math.max(
                this._minTotalChartHeight,
                this._manualChartHeight || measuredHeight || this._defaultTotalHeight || 420
            );
        }

        const dynamicMinTotal = this._getMinTotalHeightForState(enabledOrder);
        const targetHeight = Math.max(
            dynamicMinTotal,
            Math.round(this._manualChartHeight || this._totalContainerHeight || measuredHeight || this._defaultTotalHeight || 420)
        );

        this._totalContainerHeight = targetHeight;
        this._setChartWrapperHeight(targetHeight);

        const order = Array.isArray(enabledOrder) && enabledOrder.length > 0
            ? enabledOrder
            : this._getEnabledSubChartOrder();
        const state = window.state?.chartIndicators;
        const hasSavedHeight = order.some((name) => {
            const saved = Number(state?.[name]?.savedHeight);
            return Number.isFinite(saved) && saved >= 40;
        });

        if (hasSubCharts && !hasSavedHeight) {
            // R3-4 / Bug2 Fix: 新副圖初始高度依容器比例動態計算（非固定 120px）；主圖取剩餘空間
            const availableHeight = targetHeight;
            const scaledDefault = this._scaledSubPaneHeight(targetHeight);
            order.forEach((name) => {
                if (state?.[name]) {
                    state[name].savedHeight = scaledDefault;
                }
            });
            const sumSub = scaledDefault * order.length;
            this._baseMainPaneHeight = Math.max(this._minMainPaneHeight, availableHeight - sumSub);
        }

        if (window.SubChartControlBar) window.SubChartControlBar.updateLayout();
    },

    // ─── DIAG helper: dump all pane pixel heights + saved state + container ────
    _diagEnabled: false,

    _diagDump(label) {
        if (!this._diagEnabled) return;
        if (!this.chart || typeof this.chart.panes !== 'function') {
            console.warn(`[DIAG] ${label} | no chart`);
            return;
        }
        const panes = this.chart.panes();
        const panePx = Array.isArray(panes) ? panes.map((p, i) => ({ i, px: this._paneHeight(p) })) : [];
        const panePxSum = panePx.reduce((s, p) => s + p.px, 0);
        const state = window.state?.chartIndicators || {};
        const cw = document.getElementById('chartWrapper');
        const wrapperPx = cw ? Math.round(cw.getBoundingClientRect().height) : -1;
        console.warn(`[DIAG] ${label}`, JSON.stringify({
            panePx, panePxSum, wrapperPx,
            totalContH: this._totalContainerHeight,
            _baseMH: this._baseMainPaneHeight,
            VOL: { saved: state.VOL?.savedHeight, paneIdx: state.VOL?.paneIndex, enabled: !!state.VOL?.isGlobalEnabled },
            RSI: { saved: state.RSI?.savedHeight, paneIdx: state.RSI?.paneIndex, enabled: !!state.RSI?.isGlobalEnabled },
            expanded: window.state?.expandedSubChart || null,
            rendering: this._isRenderingSubCharts,
        }));
    },
    // ─────────────────────────────────────────────────────────────────────────────

    _captureCurrentPaneHeights() {
        if (this._isRenderingSubCharts) {
            if (this._diagEnabled) console.warn('[DIAG] _captureCurrentPaneHeights SKIPPED (rendering=true)');
            return;
        }

        // --- Container size tracking ---
        const chartWrapper = document.getElementById('chartWrapper');
        const enabledSnapshot = this._getEnabledSubChartOrder();
        if (chartWrapper) {
            const wrapperHeight = Math.round(chartWrapper.getBoundingClientRect().height || chartWrapper.clientHeight || 0);
            if (wrapperHeight > 0) {
                this._defaultTotalHeight = this._defaultTotalHeight || Math.max(this._minTotalChartHeight, wrapperHeight);
                if (this._totalContainerHeight === null && (enabledSnapshot.length > 0 || this._manualChartHeight !== null)) {
                    this._totalContainerHeight = Math.max(this._minTotalChartHeight, wrapperHeight);
                }
            }
        }

        // --- Pane height capture: detect user LW separator drag ---
        if (!this.chart || typeof this.chart.panes !== 'function') return;
        const panes = this.chart.panes();
        if (!Array.isArray(panes) || panes.length <= 1) return;

        const state = window.state?.chartIndicators;
        if (!state) return;

        const totalH = Math.max(this._minTotalChartHeight,
            this._totalContainerHeight || this._defaultTotalHeight || 420);
        const expanded = window.state?.expandedSubChart;

        const mainPx = this._paneHeight(panes[0]) || 0;
        if (mainPx <= 0) return;

        let subPxSum = 0;
        const subEntries = [];
        ['VOL', 'RSI'].forEach(name => {
            const pi = state[name]?.paneIndex;
            if (!Number.isFinite(pi) || pi < 1 || pi >= panes.length) return;
            const px = this._paneHeight(panes[pi]) || 0;
            if (px > 0) {
                subEntries.push({ name, px, pi });
                subPxSum += px;
            }
        });

        const renderSum = mainPx + subPxSum;
        const oldBaseMH = this._baseMainPaneHeight;
        const oldVOL = state.VOL?.savedHeight, oldRSI = state.RSI?.savedHeight;

        if (subEntries.length > 0 && renderSum > 0) {
            this._baseMainPaneHeight = Math.max(this._minMainPaneHeight,
                Math.round(mainPx / renderSum * totalH));
            if (!expanded) {
                subEntries.forEach(({ name, px }) => {
                    if (state[name]?.isGlobalEnabled) {
                        state[name].savedHeight = Math.max(40, Math.round(px / renderSum * totalH));
                    }
                });
            }
        }

        if (this._diagEnabled) console.warn('[DIAG] _captureCurrentPaneHeights', JSON.stringify({
            paneCount: panes.length,
            lw_px: panes.map((p, i) => ({ i, px: this._paneHeight(p) })),
            lw_px_sum: panes.reduce((s, p) => s + this._paneHeight(p), 0),
            mainPx,
            subEntries: subEntries.map(e => ({ name: e.name, px: e.px, pi: e.pi })),
            renderSum, totalH, expanded: expanded || null,
            _baseMH: { old: oldBaseMH, new: this._baseMainPaneHeight },
            VOL_saved: { old: oldVOL, new: state.VOL?.savedHeight },
            RSI_saved: { old: oldRSI, new: state.RSI?.savedHeight },
        }));

        if (window.SubChartControlBar) {
            window.SubChartControlBar.updateLayout();
        }
    },

    _getSubChartStoredHeight(indicator) {
        const raw = Number(window.state?.chartIndicators?.[indicator]?.savedHeight);
        if (Number.isFinite(raw) && raw >= 40) return Math.round(raw);

        const enabledCount = this._getEnabledSubChartOrder().length;
        const totalHeight = Math.max(this._minTotalChartHeight, Number(this._totalContainerHeight || this._defaultTotalHeight || 420));
        const available = totalHeight; // pane heights sum to totalHeight directly

        if (enabledCount <= 1) {
            return Math.max(this._minSubPaneHeight, Math.round(available * 0.28));
        }
        return Math.max(this._minSubPaneHeight, Math.round(available * 0.18));
    },

    _getDefaultMainPaneRatio(subCount) {
        if (subCount <= 0) return 1;
        if (subCount === 1) return 0.72;
        if (subCount === 2) return 0.64;
        return 0.58;
    },

    _distributeHeights(total, baseHeights, minEach = 0) {
        const count = Array.isArray(baseHeights) ? baseHeights.length : 0;
        if (count === 0) return [];

        const safeTotal = Math.max(0, Math.round(Number(total) || 0));
        const minValue = Math.max(0, Math.round(Number(minEach) || 0));
        const clampedMin = Math.min(minValue, Math.floor(safeTotal / count));

        const minBudget = clampedMin * count;
        const extraBudget = Math.max(0, safeTotal - minBudget);

        const weights = baseHeights.map((h) => {
            const n = Number(h);
            return Number.isFinite(n) && n > 0 ? n : 1;
        });
        const weightSum = weights.reduce((sum, w) => sum + w, 0) || count;

        const output = weights.map((w) => clampedMin + Math.round(extraBudget * (w / weightSum)));
        let diff = safeTotal - output.reduce((sum, h) => sum + h, 0);

        if (diff !== 0) {
            const sorted = output
                .map((h, idx) => ({ idx, h }))
                .sort((a, b) => (diff > 0 ? b.h - a.h : a.h - b.h));

            let cursor = 0;
            while (diff !== 0 && sorted.length > 0) {
                const target = sorted[cursor % sorted.length];
                const nextValue = output[target.idx] + (diff > 0 ? 1 : -1);
                if (nextValue >= clampedMin) {
                    output[target.idx] = nextValue;
                    diff += diff > 0 ? -1 : 1;
                }
                cursor += 1;
                if (cursor > 1000) break;
            }
        }

        return output;
    },

    _setChartWrapperHeight(targetHeight) {
        const chartWrapper = document.getElementById('chartWrapper');
        const chartContainer = document.getElementById('chartContainer');
        if (!chartWrapper) return;

        // Bug N2 Fix: don't set a fixed height when there is no stock data
        if (!this.currentChartData || this.currentChartData.length === 0) return;

        // Bug 8 Fix: in fullscreen mode, CSS flex:1 controls the height — don't override with inline style
        const isFullscreen = !!(chartContainer?.classList.contains('chart-viewport-fullscreen'));
        if (isFullscreen) {
            chartWrapper.style.removeProperty('max-height');
            if (this.chart) {
                const h = chartWrapper.clientHeight || chartWrapper.offsetHeight;
                if (h > 0) {
                    if (typeof this.chart.resize === 'function') {
                        this.chart.resize(chartWrapper.clientWidth, h);
                    } else {
                        this.chart.applyOptions({ width: chartWrapper.clientWidth, height: h });
                    }
                }
            }
            return;
        }

        const nextHeight = Math.max(this._minTotalChartHeight, Math.round(Number(targetHeight) || 0));
        chartWrapper.style.minHeight = `${nextHeight}px`;
        chartWrapper.style.height = `${nextHeight}px`;
        chartWrapper.style.maxHeight = `${nextHeight}px`;

        if (this.chart) {
            if (typeof this.chart.resize === 'function') {
                this.chart.resize(chartWrapper.clientWidth, nextHeight);
            } else {
                this.chart.applyOptions({ width: chartWrapper.clientWidth, height: nextHeight });
            }
        }
    },

    _getMinTotalHeightForState(enabledOrder) {
        const order = Array.isArray(enabledOrder) ? enabledOrder : this._getEnabledSubChartOrder();
        if (!order || order.length === 0) return this._minTotalChartHeight;

        const expanded = window.state?.expandedSubChart;
        const activeSubCount = (expanded && order.includes(expanded)) ? 1 : order.length;
        return Math.max(
            this._minTotalChartHeight,
            this._minMainPaneHeight + (this._minSubPaneHeight * activeSubCount) + this._paneHeightOverhead
        );
    },

    _attachPaneSeparatorTooltips(visibleOrder) {
        const chartWrapper = document.getElementById('chartWrapper');
        if (!chartWrapper) return;

        // Remove old tooltip hit-area divs
        chartWrapper.querySelectorAll('.pane-sep-hit').forEach(el => el.remove());

        // Remove leftover tooltip bubble (may have been orphaned)
        const oldTip = document.getElementById('pane-sep-tooltip');
        if (oldTip) oldTip.remove();

        // Bug2 Fix: 無副圖時，清除 LW separator DOM 的殘留 title 屬性
        if (!visibleOrder || visibleOrder.length === 0) {
            requestAnimationFrame(() => {
                if (!chartWrapper) return;
                chartWrapper.querySelectorAll('[class*="separator"]').forEach(sep => {
                    sep.removeAttribute('title');
                });
            });
            return;
        }

        // Use double-rAF so LightweightCharts has finished setting pane heights before we read them
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (!this.chart || typeof this.chart.panes !== 'function') return;
                const panes = this.chart.panes();
                if (!Array.isArray(panes) || panes.length < 2) return;

                // Build tooltip bubble (singleton, re-used across all separators)
                const bubble = document.createElement('div');
                bubble.id = 'pane-sep-tooltip';
                bubble.style.cssText = [
                    'left:50%',
                ].join(';');
                chartWrapper.appendChild(bubble);

                // Accumulate pane top-offsets (each separator sits between pane[i] and pane[i+1])
                let offsetY = 0;
                for (let i = 0; i < panes.length - 1; i++) {
                    const paneHeight = this._paneHeight(panes[i]);
                    offsetY += paneHeight;

                    const above = i === 0 ? '主圖' : (visibleOrder[i - 1] || '副圖');
                    const below = visibleOrder[i] || '副圖';
                    const label = `拖拉調整「${above}」與「${below}」的高度比例`;
                    const hitHeight = i === 0 ? 16 : 10;
                    const halfHit = Math.round(hitHeight / 2);

                    // Invisible hit area centred over the separator line
                    const hit = document.createElement('div');
                    hit.className = 'pane-sep-hit';
                    hit.style.cssText = [
                        'position:absolute',
                        'left:0',
                        'width:100%',
                        `height:${hitHeight}px`,
                        `top:${Math.round(offsetY - halfHit)}px`,
                        'cursor:row-resize',
                        'z-index:9989',
                        'touch-action:none',
                    ].join(';');
                    hit.addEventListener('pointerdown', () => {
                        this._pendingSeparatorDrag = true;
                    });
                    hit.addEventListener('mouseenter', () => {
                        bubble.textContent = label;
                        bubble.style.setProperty('--pane-sep-bubble-top', `${Math.round(offsetY - 20)}px`);
                        bubble.classList.add('is-visible');
                    });
                    hit.addEventListener('mouseleave', () => {
                        bubble.classList.remove('is-visible');
                    });
                    chartWrapper.appendChild(hit);
                }

                // Also attach native title to LW's own separator elements as fallback
                const separators = chartWrapper.querySelectorAll('[class*="separator"]');
                separators.forEach((sep, idx) => {
                    const above = idx === 0 ? '主圖' : (visibleOrder[idx - 1] || '副圖');
                    const below = visibleOrder[idx] || '副圖';
                    sep.setAttribute('title', `拖拉調整「${above}」與「${below}」的高度比例`);
                });
            });
        });
    },

    _isPointerNearPaneSeparator(evt) {
        if (!evt || !this.chart || typeof this.chart.panes !== 'function') return false;
        const chartContainer = document.getElementById('chart');
        if (!chartContainer) return false;

        const rect = chartContainer.getBoundingClientRect();
        const clientY = Number(evt.clientY);
        if (!Number.isFinite(clientY)) return false;

        const y = clientY - rect.top;
        const panes = this.chart.panes();
        if (!Array.isArray(panes) || panes.length < 2) return false;

        let offsetY = 0;
        for (let i = 0; i < panes.length - 1; i++) {
            offsetY += this._paneHeight(panes[i]) || 0;
            const tolerance = i === 0 ? 10 : 7;
            if (Math.abs(y - offsetY) <= tolerance) {
                return true;
            }
        }
        return false;
    },

    setChartHeightByDrag(targetHeight) {
        const chartWrapper = document.getElementById('chartWrapper');
        if (!chartWrapper || !this.chart) return;

        // Bug4 Fix: capture any pending LW separator drag before reading savedHeight for ratio scaling.
        this._captureCurrentPaneHeights();

        const enabledOrder = this._getEnabledSubChartOrder();
        const minTotal = this._getMinTotalHeightForState(enabledOrder);
        const nextHeight = Math.max(minTotal, Math.round(Number(targetHeight) || 0));

        this._manualChartHeight = nextHeight;
        this._totalContainerHeight = nextHeight;

        if (enabledOrder.length > 0) {
            const state = window.state?.chartIndicators;
            const expanded = window.state?.expandedSubChart;
            const availableNext = nextHeight; // pane heights sum to totalHeight directly

            // Collect current pane heights (main + subs) to compute ratios
            const oldMain = Number.isFinite(Number(this._baseMainPaneHeight)) && this._baseMainPaneHeight > 0
                ? this._baseMainPaneHeight
                : availableNext * 0.7;
            const oldSubHeights = enabledOrder.map((name) => {
                const saved = Number(state?.[name]?.savedHeight);
                return (Number.isFinite(saved) && saved >= 40) ? saved : this._defaultSubPaneHeight;
            });
            const oldTotal = Math.max(1, oldMain + oldSubHeights.reduce((s, h) => s + h, 0));

            // Proportional scaling based on current ratios
            const mainRatio = oldMain / oldTotal;
            let nextMain = Math.round(availableNext * mainRatio);
            nextMain = Math.max(this._minMainPaneHeight, nextMain);

            const subBudget = Math.max(0, availableNext - nextMain);
            const oldSubTotal = oldSubHeights.reduce((s, h) => s + h, 0) || 1;
            const nextSubs = oldSubHeights.map((h) => {
                return Math.max(this._minSubPaneHeight, Math.round(subBudget * (h / oldSubTotal)));
            });

            // Fix rounding
            const sumNextSubs = nextSubs.reduce((s, h) => s + h, 0);
            const diff = availableNext - (nextMain + sumNextSubs);
            if (nextSubs.length > 0 && diff !== 0) {
                nextSubs[nextSubs.length - 1] += diff;
            }

            this._baseMainPaneHeight = nextMain;
            enabledOrder.forEach((name, idx) => {
                if (state?.[name]) {
                    state[name].savedHeight = Math.max(40, Math.round(nextSubs[idx] || this._minSubPaneHeight));
                }
            });

            this._syncChartContainerHeight(enabledOrder.length, enabledOrder);
            const visibleOrder = (expanded && enabledOrder.includes(expanded)) ? [expanded] : enabledOrder;
            this._updateSubChartPaneHeights(enabledOrder.length, visibleOrder, enabledOrder);
        } else {
            // Bug1 Fix: main-only 拖拉時，使用超大 weight 確保主圖完整填充容器。
            this._baseMainPaneHeight = Math.max(this._minMainPaneHeight, nextHeight);
            this._syncChartContainerHeight(0, []);
            this._collapseExtraPanesForMainOnly();
            const dragPanes = this.chart && typeof this.chart.panes === 'function' ? this.chart.panes() : [];
            if (Array.isArray(dragPanes) && dragPanes.length > 0) {
                if (dragPanes[0] && typeof dragPanes[0].setHeight === 'function') {
                    dragPanes[0].setHeight(nextHeight * 100);
                }
                for (let i = 1; i < dragPanes.length; i++) {
                    if (dragPanes[i] && typeof dragPanes[i].setHeight === 'function') {
                        dragPanes[i].setHeight(1);
                    }
                }
            }
        }

        if (window.SubChartControlBar) window.SubChartControlBar.updateLayout();
    },

    syncSubChartLayout() {
        const enabledOrder = this._getEnabledSubChartOrder();
        if (enabledOrder.length === 0) return;

        this._syncChartContainerHeight(enabledOrder.length, enabledOrder);
        const expanded = window.state?.expandedSubChart;
        const visibleOrder = (expanded && enabledOrder.includes(expanded)) ? [expanded] : enabledOrder;
        this._updateSubChartPaneHeights(enabledOrder.length, visibleOrder, enabledOrder);
        if (window.SubChartControlBar) window.SubChartControlBar.updateLayout();
    },

    toggleMainIndicatorLineVisibility(type, identifier) {
        const state = window.state?.chartIndicators;
        if (!state || !this.chart || !Array.isArray(this.currentChartData) || this.currentChartData.length === 0) return;

        if (type === 'MA') {
            const ma = state.MA?.lines?.find((item) => item.period === identifier);
            if (!ma) return;

            if (!ma.series && ma.isEnabled !== false) {
                ma.series = window.IndicatorRegistry.render(this.chart, this.currentChartData, 'sma', ma);
            }

            if (ma.series && typeof ma.series.applyOptions === 'function') {
                try {
                    ma.series.applyOptions({ visible: ma.isEnabled !== false });
                } catch (e) {}
            }
            return;
        }

        if (type === 'BOLL') {
            const bollState = state.BOLL;
            const line = bollState?.lines?.[identifier];
            if (!bollState || !line) return;

            if (!line.series && line.isEnabled !== false) {
                const rendered = window.IndicatorRegistry.render(this.chart, this.currentChartData, 'bollinger', bollState);
                if (rendered) {
                    ['upper', 'middle', 'lower'].forEach((key) => {
                        if (bollState.lines?.[key]) {
                            bollState.lines[key].series = rendered[key] || bollState.lines[key].series;
                        }
                    });
                }
            }

            if (line.series && typeof line.series.applyOptions === 'function') {
                try {
                    line.series.applyOptions({ visible: line.isEnabled !== false });
                } catch (e) {}
            }
        }
    },

    toggleSubChartLineVisibility(indicator, lineKey) {
        const state = window.state?.chartIndicators;
        if (!state || !this.chart) return;

        if (indicator === 'VOL') {
            const volLine = state.VOL?.lines?.VOL1;
            if (volLine?.series && typeof volLine.series.applyOptions === 'function') {
                try {
                    volLine.series.applyOptions({ visible: volLine.isEnabled !== false });
                } catch (e) {}
            }
            return;
        }

        if (indicator !== 'RSI') return;
        const rsiLine = state.RSI?.lines?.[lineKey];
        if (rsiLine?.series && typeof rsiLine.series.applyOptions === 'function') {
            try {
                rsiLine.series.applyOptions({ visible: rsiLine.isEnabled !== false });
            } catch (e) {}
        }

        const allDisabled = ['RSI1', 'RSI2', 'RSI3'].every((key) => state.RSI?.lines?.[key]?.isEnabled === false);

        if (this._rsiLevelLines && this._rsiLevelLines.length > 0) {
            this._rsiLevelLines.forEach((priceLine) => {
                if (priceLine && typeof priceLine.applyOptions === 'function') {
                    try {
                        priceLine.applyOptions({ lineVisible: !allDisabled });
                    } catch (e) {}
                }
            });
        }

        if (allDisabled) {
            const paneIndex = state.RSI?.paneIndex;
            if (!this._rsiPlaceholderSeries && paneIndex !== null && paneIndex !== undefined && Array.isArray(this.currentChartData)) {
                const placeholderData = this.currentChartData.map((bar) => ({ time: bar.time, value: 50 }));
                this._rsiPlaceholderSeries = window.ChartRenderer.renderLine(this.chart, placeholderData, {
                    title: 'RSI_PLACEHOLDER',
                    color: 'rgba(0, 0, 0, 0)',
                    lineWidth: 1,
                    paneIndex,
                    priceScaleId: 'right',
                    autoscaleInfoProvider: () => ({
                        priceRange: { minValue: 0, maxValue: 100 },
                    }),
                });
            }

            if (this._rsiPlaceholderSeries && typeof this._rsiPlaceholderSeries.applyOptions === 'function') {
                try {
                    this._rsiPlaceholderSeries.applyOptions({
                        visible: true,
                        lastValueVisible: false,
                        priceLineVisible: false,
                        crosshairMarkerVisible: false,
                    });
                } catch (e) {}
            }
            return;
        }

        if (this._rsiPlaceholderSeries) {
            window.ChartRenderer.removeSeries(this.chart, this._rsiPlaceholderSeries);
            this._rsiPlaceholderSeries = null;
        }
    },

    _paneHeight(paneApi) {
        if (!paneApi) return 0;
        if (typeof paneApi.getHeight === 'function') return paneApi.getHeight();
        if (typeof paneApi.height === 'function') return paneApi.height();
        return 0;
    },

    /**
     * Bug2 Fix / 規格變更協議 item 2:
     * 新增副圖的初始高度依容器高度比例動態計算：120 × (containerHeight / 420)
     * @param {number} containerHeight - 當前容器高度（px），若未傳則使用 _totalContainerHeight
     */
    _scaledSubPaneHeight(containerHeight) {
        const totalH = (containerHeight > 0 ? containerHeight
            : Math.max(420, this._totalContainerHeight || this._defaultTotalHeight || 420));
        return Math.max(this._defaultSubPaneHeight, Math.round(this._defaultSubPaneHeight * (totalH / 420)));
    },

    _withOpacity(color, opacity) {
        const hex = String(color || '').trim();
        const alpha = Math.max(0, Math.min(100, Number(opacity) || 100)) / 100;
        if (/^#([0-9a-fA-F]{3})$/.test(hex)) {
            const s = hex.slice(1);
            const r = parseInt(s[0] + s[0], 16);
            const g = parseInt(s[1] + s[1], 16);
            const b = parseInt(s[2] + s[2], 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        if (/^#([0-9a-fA-F]{6})$/.test(hex)) {
            const f = hex.slice(1);
            const r = parseInt(f.slice(0, 2), 16);
            const g = parseInt(f.slice(2, 4), 16);
            const b = parseInt(f.slice(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        return hex;
    },

    /**
     * 切換副圖展開/收合
     */
    toggleSubChartExpand(indicator) {
        const order = this._getEnabledSubChartOrder();
        if (!order.includes(indicator) || order.length < 2) return;

        this._diagDump(`toggleExpand-BEFORE indicator=${indicator}`);

        // Bug3 Fix: 展開/收合不重算 savedHeight；僅鎖定現有主圖邏輯高度。
        const state = window.state?.chartIndicators;
        const totalH = Math.max(this._minTotalChartHeight, this._totalContainerHeight || this._defaultTotalHeight || 420);
        const sumSub = order.reduce((sum, name) => {
            const h = Number(state?.[name]?.savedHeight);
            return sum + (Number.isFinite(h) && h >= 40 ? Math.round(h) : this._defaultSubPaneHeight);
        }, 0);
        const wasExpanded = window.state?.expandedSubChart || null;

        // 進入展開前，保存目前 normal 模式的實際 pane 像素比例，供收合時精準還原。
        if (!wasExpanded) {
            const snapPanes = (this.chart && typeof this.chart.panes === 'function') ? this.chart.panes() : [];
            if (Array.isArray(snapPanes) && snapPanes.length > 1) {
                const paneAreaPx = snapPanes.reduce((sum, p) => sum + (this._paneHeight(p) || 0), 0);
                const subPxByName = {};
                order.forEach((name) => {
                    const pi = state?.[name]?.paneIndex;
                    if (!Number.isFinite(pi) || pi < 1 || pi >= snapPanes.length) return;
                    subPxByName[name] = this._paneHeight(snapPanes[pi]) || 0;
                });

                this._expandRestoreSnapshot = {
                    paneAreaPx,
                    mainPx: this._paneHeight(snapPanes[0]) || 0,
                    subPxByName,
                };
            }
        }

        const panes = (this.chart && typeof this.chart.panes === 'function') ? this.chart.panes() : [];
        const paneMainPx = Array.isArray(panes) && panes.length > 0 ? (this._paneHeight(panes[0]) || 0) : 0;
        const paneSumPx = Array.isArray(panes)
            ? panes.reduce((sum, p) => sum + (this._paneHeight(p) || 0), 0)
            : 0;
        const logicalFromPane = (paneMainPx > 0 && paneSumPx > 0)
            ? Math.round((paneMainPx / paneSumPx) * totalH)
            : null;
        const lockedMainHeight = Number.isFinite(logicalFromPane) && logicalFromPane > 0
            ? Math.max(this._minMainPaneHeight, logicalFromPane)
            : ((Number.isFinite(this._baseMainPaneHeight) && this._baseMainPaneHeight > 0)
                ? this._baseMainPaneHeight
                : Math.max(this._minMainPaneHeight, totalH - sumSub));
        this._diagDump('toggleExpand-LOCK-MAIN(no-capture)');

        window.state.expandedSubChart = (window.state.expandedSubChart === indicator) ? null : indicator;

        // 從 expanded 收合回 normal 時，把展開前的實際比例寫回 savedHeight，避免主圖/副圖漂移。
        if (wasExpanded === indicator && !window.state.expandedSubChart && this._expandRestoreSnapshot) {
            const snap = this._expandRestoreSnapshot;
            const snapArea = Math.max(1, Number(snap.paneAreaPx) || paneSumPx || 1);
            const snapMain = Math.max(1, Number(snap.mainPx) || paneMainPx || 1);

            this._baseMainPaneHeight = Math.max(this._minMainPaneHeight,
                Math.round((snapMain / snapArea) * totalH));

            order.forEach((name) => {
                const px = Number(snap.subPxByName?.[name]);
                if (!Number.isFinite(px) || px <= 0 || !state?.[name]) return;
                state[name].savedHeight = Math.max(40, Math.round((px / snapArea) * totalH));
            });

            this._expandRestoreSnapshot = null;
        }

        if (window.state.expandedSubChart !== null && Number.isFinite(lockedMainHeight) && lockedMainHeight > 0) {
            this._baseMainPaneHeight = lockedMainHeight;
        }

        if (this._diagEnabled) console.warn('[DIAG] toggleExpand-LOCKED', JSON.stringify({
            after_expanded: window.state?.expandedSubChart,
            _baseMH: this._baseMainPaneHeight, lockedMH: lockedMainHeight,
        }));

        this.renderSubCharts(this.currentChartData || []);
        requestAnimationFrame(() => requestAnimationFrame(() => this._diagDump('toggleExpand-POST-render+2rAF')));

        if (window.ChartSettingsModal) {
            window.ChartSettingsModal.saveToLocalStorage();
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
     * 統一建立 chart series（優先走 ChartRenderer v5 相容層）
     */
    _createChartSeries(type, options, paneIndex = null) {
        if (!this.chart) return null;

        if (window.ChartRenderer && typeof window.ChartRenderer.createSeries === 'function') {
            return window.ChartRenderer.createSeries(this.chart, type, options || {}, paneIndex);
        }

        const methodMap = {
            line: 'addLineSeries',
            histogram: 'addHistogramSeries',
            candlestick: 'addCandlestickSeries',
            bar: 'addBarSeries',
            area: 'addAreaSeries',
        };
        const method = methodMap[type];
        if (method && typeof this.chart[method] === 'function') {
            return this.chart[method](options || {});
        }

        return null;
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
            this.candleSeries = this._createChartSeries('bar', { upColor: bullColor, downColor: bearColor }, 0);
            this.candleSeries.setData(chartData);
        } else if (type === 'line') {
            this.candleSeries = this._createChartSeries('line', { color: bullColor, lineWidth: 2 }, 0);
            this.candleSeries.setData(chartData.map(b => ({ time: b.time, value: b.close })));
        } else if (type === 'monochrome_candle') {
            // BUG2+3 Fix: 依 bgTheme 和 bullStyle 決定顏色
            const bullStyle  = cfg.bullStyle || 'hollow';
            const isDark     = (cfg.bgTheme || 'dark') === 'dark';
            const upFill     = bullStyle === 'solid' ? '#ffffff' : 'transparent';
            const borderUp   = isDark ? '#c8ccd4' : '#000000'; // 淡雅銀灰 or 黑
            const downFill   = '#000000';
            const borderDown = isDark ? '#888888' : '#000000';
            this.candleSeries = this._createChartSeries('candlestick', {
                upColor:         upFill,
                downColor:       downFill,
                borderUpColor:   borderUp,
                borderDownColor: borderDown,
                wickUpColor:     borderUp,
                wickDownColor:   borderDown,
                borderVisible:   true
            }, 0);
            this.candleSeries.setData(chartData);
        } else if (type === 'heikin_ashi') {
            this.candleSeries = this._createChartSeries('candlestick', {
                upColor: bullColor, downColor: bearColor,
                borderVisible: false,
                wickUpColor: bullColor, wickDownColor: bearColor
            }, 0);
            this.candleSeries.setData(this._computeHeikinAshi(chartData));
        } else {
            // candlestick (default)
            const bullStyle = cfg.bullStyle || 'hollow';
            this.candleSeries = this._createChartSeries('candlestick', {
                upColor:        bullStyle === 'solid' ? bullColor : 'transparent',
                downColor:      bearColor,
                borderUpColor:  bullColor,
                borderDownColor: bearColor,
                wickUpColor:    bullColor,
                wickDownColor:  bearColor,
                borderVisible:  true
            }, 0);
            this.candleSeries.setData(chartData);
        }

        if (!this.candleSeries) {
            console.error('[ChartController] _switchChartSeries: 無法建立主圖 series');
            return;
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
     * R3-3: 建立/更新雙邊坐標用的左側 mirror series
     * 使用隱形 candlestick series (OHLC) 讓左軸的 auto-scale 範圍與右軸完全一致，
     * 確保十字線在同一 Y 像素位置顯示相同價格值。
     */
    _ensureMirrorSeries() {
        const data = this.currentChartData;
        if (!data || data.length === 0 || !this.chart) return;
        const LW = window.LightweightCharts;
        if (!LW) return;

        // 確保 candleSeries 在右側
        if (this.candleSeries) {
            try { this.candleSeries.applyOptions({ priceScaleId: 'right' }); } catch (e) {}
        }

        // 若 mirror series 已存在，直接更新資料
        if (!this._mirrorSeries) {
            try {
                this._mirrorSeries = this._createChartSeries('candlestick', {
                    priceScaleId: 'left',
                    upColor: 'transparent',
                    downColor: 'transparent',
                    borderUpColor: 'transparent',
                    borderDownColor: 'transparent',
                    wickUpColor: 'transparent',
                    wickDownColor: 'transparent',
                    borderVisible: false,
                    lastValueVisible: false,
                    priceLineVisible: false,
                    crosshairMarkerVisible: false,
                }, 0);
            } catch (e) {
                console.warn('[ChartController] mirror series 建立失敗:', e);
                return;
            }
        }
        // Set OHLC data so left axis auto-scales identically to right axis
        this._mirrorSeries.setData(data.map(b => ({
            time: b.time,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
        })));
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
