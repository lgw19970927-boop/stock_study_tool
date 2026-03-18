/**
 * StockFilter PRO - Screening Page Logic
 * Implements logic defined in filter_v4.3.md
 */

// Global State
window.state = {
    filters: {
        markets: [],
        frequency: '', // 'daily', 'weekly', 'monthly'
        indicators: [],
        patterns: [],
        sensitivity: 75,
        patternTimeframe: { min: 20, max: 60, interval: '1D' },
        // 分析時間範圍（由 ScreeningBlockTimeRange 寫入）
        time_range: '1M',               // 快捷鍵，null 代表自訂
        analysis_start_date: '',        // 自訂模式用
        analysis_end_date: '',        // 自訂模式用
    },
    currentStrategyId: null,
    savedStrategies: [
        {
            id: 'default-strat-1',
            name: '測試選型態功能',
            timestamp: Date.now(),
            descLines: ['市場範圍: 上市/上櫃/興櫃 | 篩選頻率: 每日', '技術型態: 頭肩底 | 敏感度: 40% | 週期: 8~50根 (1D)'],
            data: {
                markets: ['listed', 'otc', 'ipo'],
                frequency: 'daily',
                indicators: [],
                patterns: ['head_shoulders_bottom'],
                sensitivity: 40,
                patternTimeframe: { min: 8, max: 50, interval: '1D' }
            }
        },
        {
            id: 'default-strat-2',
            name: '測試指標篩選功能',
            timestamp: Date.now(),
            descLines: ['市場範圍: 上市/上櫃/興櫃 | 篩選頻率: 每日', 'MA-日K: MA20 > MA50'],
            data: {
                markets: ['listed', 'otc', 'ipo'],
                frequency: 'daily',
                indicators: [
                    {
                        type: 'sma',
                        timeframe: '1d',
                        period: '日K',
                        range: '當前值',
                        presets: [],
                        custom: [{ t1: 'MA', v1: '20', op: 'gt', t2: 'MA', v2: '50' }],
                        conditions: [{ left: 'MA20', operator: '>', right: 'MA50' }]
                    }
                ],
                patterns: [],
                sensitivity: 75,
                patternTimeframe: { min: 20, max: 60, interval: '1D' }
            }
        }
    ],
    // ✅ Phase 1 SSOT: 圖表指標狀態（與篩選條件完全獨立）
    // 指標控制列 / Canvas / Modal 三者共讀同一份資料來源
    chartIndicators: {
        MA: {
            isGlobalEnabled: true,   // X 叉叉控制（整個 MA 群組）
            lines: []                // [{period, color, lineWidth, opacity, isEnabled, series}]
        },
        BOLL: {
            isGlobalEnabled: false,  // X 叉叉控制（整個 BOLL 群組）
            period: 20,
            stdDev: 2,
            lines: {
                middle: { color: '#ffb6c1', lineWidth: 1, opacity: 100, isEnabled: true, series: null },
                upper:  { color: '#808080', lineWidth: 1, opacity: 100, isEnabled: true, series: null },
                lower:  { color: '#00ffff', lineWidth: 1, opacity: 100, isEnabled: true, series: null }
            }
        }
    }
};

window.ScreeningPage = {
    init: function () {
        console.log('ScreeningPage Initializing...');

        // Initialize Market Module
        if (window.ScreeningBlockMarket) window.ScreeningBlockMarket.init();

        // Initialize Time Range Module
        if (window.ScreeningBlockTimeRange) window.ScreeningBlockTimeRange.init();

        // Initialize Indicator Module
        if (window.ScreeningBlockIndicator) window.ScreeningBlockIndicator.init();

        // Initialize Pattern Module
        if (window.ScreeningBlockPattern) window.ScreeningBlockPattern.init();

        this.bindEvents();
        this.setupTabs();
        // setupTimeRange 已委託給 ScreeningBlockTimeRange，此處不再重複呼叫

        // ✅ Phase 1 重構：使用 ChartController 初始化圖表
        if (window.ChartController) {
            window.ChartController.init();
            window.ChartController.bindTimeframeButtons();
        }

        // Feature1: 全螢幕功能
        this.initFullscreen();
        // Feature3: 側邊欄拖拉調整
        this.initSidebarResize();
    },

    // ✅ Phase 1 重構：圖表初始化已移至 ChartController.init()
    // 此函數已移除，請使用 window.ChartController.init()

    // ✅ Feature A: 傳遞 fromFilterClick=true，觸發視角對齊邏輯
    onStockClick: function (symbol) {
        if (window.ChartController) {
            window.ChartController.loadStock(symbol, { fromFilterClick: true });
        }
    },

    // ✅ Phase 1 重構：以下函數已移至 ChartController
    // - syncTimeframeUI, bindTimeframeButtons, renderIndicators, clearIndicatorSeries
    // - showFilterIndicators, extractMAPeriods, getMAColor, openChartSettingsModal

    // ... (rest of bindEvents, etc)




    bindEvents: function () {
        // Tab Switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Market & Frequency logic delegated to ScreeningBlockMarket


        // Run Filter Button (Filter Design Tab)
        const runBtn = document.getElementById('runFilter');
        if (runBtn) runBtn.addEventListener('click', () => this.runFilter());

        // Run Filter Button (My Strategies Tab)
        const runBtnStrategy = document.getElementById('runFilterFromStrategy');
        if (runBtnStrategy) runBtnStrategy.addEventListener('click', () => this.runFilter());

        // ✅ Phase 2: Save Buttons (委託給 StrategyManager)
        const saveOverwriteBtn = document.getElementById('saveOverwriteStrategy');
        const saveNewBtn = document.getElementById('saveStrategy');

        if (saveOverwriteBtn) {
            saveOverwriteBtn.addEventListener('click', () => {
                if (window.StrategyManager) {
                    window.StrategyManager.save(true);
                }
            });
        }
        if (saveNewBtn) {
            saveNewBtn.addEventListener('click', () => {
                if (window.StrategyManager) {
                    window.StrategyManager.save(false);
                }
            });
        }

        // Indicator Logic delegated to ScreeningBlockIndicator

        // ✅ Phase 5: Bind Phase 5 buttons (Show Indicators, Chart Settings)
        const indicatorsToggle = document.getElementById('indicatorsToggle');
        if (indicatorsToggle) {
            indicatorsToggle.addEventListener('change', () => {
                if (window.ChartController) {
                    window.ChartController.isIndicatorsVisible = indicatorsToggle.checked;
                    window.ChartController.renderIndicatorsFromState();
                }
            });
        }

        const btnChartSettings = document.getElementById('btnChartSettings');
        if (btnChartSettings) {
            btnChartSettings.addEventListener('click', () => {
                if (window.ChartController) {
                    window.ChartController.openChartSettingsModal();
                }
            });
        }

        // Feature2: 停止篩選對話框按鈕
        const btnStopFilter = document.getElementById('btnStopFilter');
        if (btnStopFilter) btnStopFilter.addEventListener('click', () => this._showStopDialog());
        const btnCancelStop = document.getElementById('btnCancelStop');
        if (btnCancelStop) btnCancelStop.addEventListener('click', () => this._cancelStop());
        const btnConfirmStop = document.getElementById('btnConfirmStop');
        if (btnConfirmStop) btnConfirmStop.addEventListener('click', () => this._confirmStop());

    },

    setupTabs: function (tabId) {
        // Default using dataset or fallback
        if (!tabId) tabId = 'filter-design';

        document.querySelectorAll('.tab-btn').forEach(btn => {
            const isActive = btn.dataset.tab === tabId;
            btn.classList.toggle('active', isActive);
        });

        document.querySelectorAll('.tab-content').forEach(content => {
            content.style.display = content.id === `${tabId}-tab` ? 'block' : 'none';
            if (content.id === `${tabId}-tab`) content.classList.add('active');
            else content.classList.remove('active');
        });
    },

    switchTab: function (tabId) {
        this.setupTabs(tabId);
        if (tabId === 'my-strategies') {
            // ✅ Phase 2: 委託給 StrategyManager
            if (window.StrategyManager) {
                window.StrategyManager.renderList();
            }
        }
    },

    setupTimeRange: function () {
        // 已委託給 ScreeningBlockTimeRange.init()，此處保留空殼供舊程式碼相容
    },

    // setupSliders delegated to ScreeningBlockPattern

    updateStateFromDOM: function () {
        // Market & Frequency (Delegated)
        if (window.ScreeningBlockMarket) window.ScreeningBlockMarket.updateState();

        // Analysis Time Range (Delegated)
        if (window.ScreeningBlockTimeRange) window.ScreeningBlockTimeRange.updateState();

        // Pattern, Sensitivity, Timeframe (Delegated)
        if (window.ScreeningBlockPattern) window.ScreeningBlockPattern.updateState();

        // Indicators (Delegated)
        if (window.ScreeningBlockIndicator) window.ScreeningBlockIndicator.updateState();
    },

    validateRunFilter: function () {
        this.updateStateFromDOM();
        const f = window.state.filters;

        // V4.3 Validation Logic

        // 1. Check Market & Frequency (Delegated)
        if (window.ScreeningBlockMarket && window.ScreeningBlockMarket.validate) {
            const v = window.ScreeningBlockMarket.validate();
            if (!v.isValid) {
                alert(v.error);
                return false;
            }
        } else {
            // Fallback if module not loaded
            if (f.markets.length === 0) {
                alert('請至少選擇一個市場範圍（Listed Stocks / OTC Stocks / IPO Stocks）');
                return false;
            }
            if (!f.frequency) {
                alert('請選擇篩選頻率（每日 / 每周 / 每月）');
                return false;
            }
        }

        // 3. Check Conditions (Indicators OR Patterns)
        const hasIndicators = document.querySelectorAll('.indicator-card').length > 0;
        const hasPatterns = f.patterns.length > 0;

        if (!hasIndicators && !hasPatterns) {
            alert('請至少設定一個指標或型態');
            return false;
        }

        return true;
    },

    runFilter: async function () {
        const currentTab = document.querySelector('.tab-btn.active').dataset.tab;
        let filtersToRun = null;

        if (currentTab === 'my-strategies') {
            // Execution from "My Strategies" Tab
            // 1. Check if a strategy is selected
            if (!window.state.currentStrategyId) {
                alert('請選擇一個策略');
                return;
            }

            // 2. Find the strategy data
            const selectedStrategy = window.state.savedStrategies.find(s => s.id === window.state.currentStrategyId);
            if (!selectedStrategy) {
                alert('找不到選取的策略');
                return;
            }

            // 3. Use the strategy's data directly (Skipping DOM Validation)
            // 將策略拷貝出來，避免污染原本存檔的策略
            filtersToRun = { ...selectedStrategy.data };

            // ✅ 依照使用者需求：執行策略時，一律使用畫面上「分析時間範圍」區塊設定的當下值，而非寫死的 1M
            if (window.ScreeningBlockTimeRange) window.ScreeningBlockTimeRange.updateState();
            filtersToRun.time_range = window.state.filters.time_range;
            filtersToRun.analysis_start_date = window.state.filters.analysis_start_date;
            filtersToRun.analysis_end_date = window.state.filters.analysis_end_date;

            console.log('Running Filter from Saved Strategy:', filtersToRun);

        } else {
            // Execution from "Filter Design" Tab

            // 1. Priority 1: Basic Validations (Market, Frequency, Existence)
            if (!this.validateRunFilter()) return;

            // 2. Priority 2: Unconfirmed indicators check
            // Only check this if basic validations passed
            if (window.ScreeningBlockIndicator && window.ScreeningBlockIndicator.hasUnconfirmed()) {
                alert('尚有指標未確認，請先完成指標設定');
                return;
            }

            // 3. Use current DOM state
            filtersToRun = window.state.filters;
            console.log('Running Filter with validated state:', filtersToRun);
        }

        // ✅ 重構：SSE 串流篩選（三種情境）
        const hasIndicators = (filtersToRun.indicators?.length > 0);

        // 讀取型態篩選狀態
        let patternState;
        if (currentTab === 'my-strategies') {
            // 如果從策略列表執行，應該直接使用策略內存的參數，而不是讀取畫面上的 DOM
            patternState = {
                patterns: filtersToRun.patterns || [],
                sensitivity: filtersToRun.sensitivity || 75,
                patternTimeframe: filtersToRun.patternTimeframe || { min: 20, max: 60, interval: '1D' }
            };
        } else {
            // 從設計頁面執行，則讀取塊狀模組的狀態
            patternState = window.ScreeningBlockPattern?.getState?.() ?? {};
        }

        const hasPatterns = (patternState.patterns?.length > 0);

        if (!hasIndicators && !hasPatterns) {
            alert('請至少設定一項篩選條件（指標或型態）');
            return;
        }

        // ✅ 強制精準防呆：向後端詢問這段時間真實的 K 線數量
        if (hasPatterns) {
            try {
                const pTimeframe = patternState.patternTimeframe;
                const minBars = pTimeframe?.min || 20; // 預設 20
                const interval = pTimeframe?.interval || '1D';

                // 組裝查詢參數
                const queryParams = new URLSearchParams({ interval: interval });
                if (filtersToRun.time_range) {
                    queryParams.append('time_range', filtersToRun.time_range);
                }
                if (filtersToRun.analysis_start_date) {
                    queryParams.append('analysis_start_date', filtersToRun.analysis_start_date);
                }
                if (filtersToRun.analysis_end_date) {
                    queryParams.append('analysis_end_date', filtersToRun.analysis_end_date);
                }

                // 呼叫極速防呆 API
                const apiBase = window.API_CONFIG?.BASE_URL ?? 'http://127.0.0.1:8000';
                const response = await fetch(`${apiBase}/api/market-data/kline-count?${queryParams.toString()}`);
                if (!response.ok) {
                    console.error("K-line count API failed", await response.text());
                } else {
                    const data = await response.json();
                    console.log("Validation API returned:", data);

                    if (data.count !== undefined && data.count < minBars) {
                        // 若被阻擋，完全不要顯示 progress，直接 alert 並結束
                        alert(`【資料不足阻擋】\n您設定的時間範圍扣除假日後，實際只包含 ${data.count} 根 K 線。\n\n但目前您設定的型態識別「最少需要 ${minBars} 根」。\n\n請延長「分析時間範圍」，或縮小「所需 K 線數」後再試。`);
                        return; // 強制阻擋，不往下送出沉重的分析請求
                    }
                }
            } catch (err) {
                console.error("Failed to fetch kline count validation:", err);
                // API 壞掉時默默放行，避免前端卡死
            }
            // 驗證通過，繼續原本的流程
        }

        // 🎯 只有當所有阻擋驗證都通過後，才正式顯示「正在篩選」的進度條與清空畫面
        this._isStopped = false;
        this._currentEvtSrc = null;
        this._showProgress();

        try {
            if (hasIndicators && !hasPatterns) {
                // ── 情況一：只有指標篩選 ──────────────────
                const result = await this._streamIndicators(filtersToRun, '正在篩選指標...');
                this._renderResults(result.stocks, result.statistics);

            } else if (!hasIndicators && hasPatterns) {
                // ── 情況二：只有型態篩選 ──────────────────
                const result = await this._streamPatterns(patternState, filtersToRun, null, '正在辨識型態...');
                this._renderResults(result.stocks, result.statistics);

            } else {
                // ── 情況三：指標 + 型態（Sequential）─────────────────
                const indicatorResult = await this._streamIndicators(
                    filtersToRun, '[1/2] 正在篩選指標...'
                );
                const symbols = indicatorResult.stocks.map(s => s.symbol);

                if (symbols.length === 0) {
                    this._renderResults([], indicatorResult.statistics);
                    return;
                }

                const patternResult = await this._streamPatterns(
                    patternState, filtersToRun, symbols, '[2/2] 正在辨識型態...'
                );

                // ✅ 系統修正：將第一階段算出的指標標籤，合併回最終的型態結果中
                const indicatorMap = new Map();
                indicatorResult.stocks.forEach(s => {
                    indicatorMap.set(s.symbol, {
                        matched: s.matched_indicators || [],
                        insufficient: s.insufficient_indicators || []
                    });
                });

                patternResult.stocks.forEach(s => {
                    const mapping = indicatorMap.get(s.symbol);
                    if (mapping) {
                        s.matched_indicators = mapping.matched;
                        s.insufficient_indicators = mapping.insufficient;
                    }
                });

                // ✅ 系統修正：重新清點最終活下來的清單中，有多少人帶有資料不足標籤
                let realInsufficientCount = 0;
                patternResult.stocks.forEach(s => {
                    if (s.data_insufficient || (s.insufficient_indicators && s.insufficient_indicators.length > 0)) {
                        realInsufficientCount++;
                    }
                });

                const mergedStats = {
                    ...patternResult.statistics,
                    data_insufficient: realInsufficientCount,
                };
                this._renderResults(patternResult.stocks, mergedStats);
            }
        } catch (err) {
            if (err.message !== 'STOPPED') {
                console.error('runFilter 失敗:', err);
                this._showError(err.message);
            }
        } finally {
            this._hideProgress();
            this._isStopped = false;
            this._currentEvtSrc = null;
        }
    },

    // ── 進度條控制 ─────────────────────────────────────────

    _showProgress: function () {
        const progressArea = document.getElementById('screeningProgressArea');
        const emptyState = document.getElementById('emptyState');
        if (progressArea) progressArea.style.display = 'flex';
        if (emptyState) emptyState.style.display = 'none';
        const stockList = document.getElementById('stockList');
        if (stockList) {
            [...stockList.children].forEach(child => {
                if (child.id !== 'screeningProgressArea' && child.id !== 'emptyState') {
                    child.remove();
                }
            });
        }
    },

    _hideProgress: function () {
        const progressArea = document.getElementById('screeningProgressArea');
        if (progressArea) progressArea.style.display = 'none';
    },

    _updateProgressBar: function (current, total, matched, stageText) {
        const pct = total > 0 ? Math.round((current / total) * 100) : 0;
        const fillEl = document.getElementById('progressFill');
        const detailEl = document.getElementById('progressDetailText');
        const pctEl = document.getElementById('progressPercent');
        const stageEl = document.getElementById('progressStageText');
        const matchEl = document.getElementById('progressMatchedText');
        if (fillEl) fillEl.style.width = pct + '%';
        if (detailEl) detailEl.textContent = `已分析 ${current.toLocaleString()} / ${total.toLocaleString()} 支`;
        if (pctEl) pctEl.textContent = pct + '%';
        if (stageEl && stageText) stageEl.textContent = '⏳ ' + stageText;
        if (matchEl) matchEl.textContent = `找到符合：${matched} 支`;
    },

    _showError: function (message) {
        this._hideProgress();
        const emptyState = document.getElementById('emptyState');
        if (emptyState) {
            emptyState.style.display = 'flex';  // 保持 CSS flex 置中
            emptyState.innerHTML = `
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none"
                     stroke="#ff6b6b" stroke-width="1.5"
                     stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
                <p style="color:#ff6b6b;">篩選失敗：${message}</p>
                <small style="color:#ff6b6b;">請檢查網絡連接或聯繫管理員</small>
            `;
        }
    },

    // ── SSE 輔助：消費 SSE 串流，回傳最終 done 資料 ──────────────

    _consumeSSE: async function (url, stageText) {
        return new Promise((resolve, reject) => {
            const evtSrc = new EventSource(url);
            this._currentEvtSrc = evtSrc;
            evtSrc.onmessage = (e) => {
                if (this._isStopped) {
                    evtSrc.close();
                    this._currentEvtSrc = null;
                    reject(new Error('STOPPED'));
                    return;
                }
                try {
                    const data = JSON.parse(e.data);
                    if (data.type === 'progress') {
                        this._updateProgressBar(data.current, data.total, data.matched, stageText);
                    } else if (data.type === 'done') {
                        evtSrc.close();
                        this._currentEvtSrc = null;
                        resolve(data);
                    } else if (data.type === 'error') {
                        evtSrc.close();
                        this._currentEvtSrc = null;
                        reject(new Error(data.message));
                    }
                } catch (err) {
                    evtSrc.close();
                    this._currentEvtSrc = null;
                    reject(err);
                }
            };
            evtSrc.onerror = () => {
                evtSrc.close();
                this._currentEvtSrc = null;
                reject(new Error('SSE 連線中斷'));
            };
        });
    },

    _streamIndicators: async function (filters, stageText) {
        const base = window.API_CONFIG?.getURL?.('SCREENING_STREAM')
            ?? 'http://localhost:8000/api/screening/filter/stream';
        const params = new URLSearchParams({
            markets: (filters.markets || []).join(','),
            frequency: filters.frequency || 'daily',
            indicators_json: JSON.stringify(filters.indicators || []),
            analysis_start_date: filters.analysis_start_date || '',
            analysis_end_date: filters.analysis_end_date || '',
        });
        // time_range 傳給後端做日期換算（快捷按鈕模式）
        if (filters.time_range) params.append('time_range', filters.time_range);
        return this._consumeSSE(`${base}?${params}`, stageText);
    },

    _streamPatterns: async function (patternState, filters, stockSymbols, stageText) {
        const base = window.API_CONFIG?.getURL?.('PATTERN_STREAM')
            ?? 'http://localhost:8000/api/screening/pattern-recognition/stream';
        const params = new URLSearchParams({
            markets_str: (filters.markets || []).join(','),          // → Optional[str]
            patterns_str: (patternState.patterns || []).join(','),    // → Optional[str]
            sensitivity: patternState.sensitivity ?? 75,
            pattern_min: patternState.patternTimeframe?.min ?? 20,
            pattern_max: patternState.patternTimeframe?.max ?? 60,
            interval: patternState.patternTimeframe?.interval ?? '1D',
            start_date: filters.analysis_start_date || '',
            end_date: filters.analysis_end_date || '',
        });
        // 快捷按鈕模式（time_range 讓後端換算）
        if (filters.time_range) params.append('time_range', filters.time_range);
        if (stockSymbols?.length > 0) {
            params.append('stock_symbols_str', stockSymbols.join(','));  // 逗號合併，對應後端 Optional[str]
        }
        return this._consumeSSE(`${base}?${params}`, stageText);
    },

    _renderResults: function (stocks, statistics) {
        const stockList = document.getElementById('stockList');
        const totalStocksEl = document.getElementById('totalStocks');
        const gainersEl = document.getElementById('gainers');
        const losersEl = document.getElementById('losers');
        const dataInsufficientEl = document.getElementById('dataInsufficient');
        const emptyState = document.getElementById('emptyState');

        // 更新 stats-bar
        if (totalStocksEl) totalStocksEl.textContent = statistics?.total ?? stocks.length;
        if (gainersEl) gainersEl.textContent = statistics?.gainers ?? 0;
        if (losersEl) losersEl.textContent = statistics?.losers ?? 0;
        if (dataInsufficientEl) dataInsufficientEl.textContent = statistics?.data_insufficient ?? 0;

        window.state.lastResults = stocks;

        // 清空舊 stock item
        if (stockList) {
            [...stockList.children].forEach(child => {
                if (child.id !== 'screeningProgressArea' && child.id !== 'emptyState') {
                    child.remove();
                }
            });
        }

        if (!stocks || stocks.length === 0) {
            if (emptyState) {
                emptyState.style.display = 'flex';  // 保持 CSS flex 置中
                emptyState.innerHTML = `
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="1">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <p>沒有符合條件的股票</p>
                `;
            }
            return;
        }

        if (emptyState) emptyState.style.display = 'none';

        stocks.forEach(stock => {
            const changeClass = stock.change_percent >= 0 ? 'positive' : 'negative';
            const changeSign = stock.change_percent >= 0 ? '+' : '';

            // 1. 整理所有標籤並去重
            const uniqueLabels = new Set();
            let finalTagsHTML = '';

            // 2. 第一優先：符合的指標 (原灰色樣式)
            if (stock.matched_indicators?.length > 0) {
                stock.matched_indicators.forEach(ind => {
                    if (!uniqueLabels.has(ind)) {
                        uniqueLabels.add(ind);
                        finalTagsHTML += `<span class="pattern-tag">${ind}</span>`;
                    }
                });
            }

            // 3. 第二優先：資料不足放行的指標 (原紅色警告樣式)
            if (stock.insufficient_indicators?.length > 0) {
                stock.insufficient_indicators.forEach(ind => {
                    const warnLabel = `⚠️ ${ind} 資料不足`;
                    if (!uniqueLabels.has(warnLabel)) {
                        uniqueLabels.add(warnLabel);
                        finalTagsHTML += `<span class="pattern-tag" style="background:rgba(255,107,107,0.15); color:#ff6b6b;">${warnLabel}</span>`;
                    }
                });
            } else if (stock.data_insufficient && (!stock.insufficient_indicators || stock.insufficient_indicators.length === 0)) {
                // 向下相容舊資料結構
                const warnLabel = '⚠️ 資料不足';
                if (!uniqueLabels.has(warnLabel)) {
                    uniqueLabels.add(warnLabel);
                    finalTagsHTML += `<span class="pattern-tag" style="background:rgba(255,107,107,0.15); color:#ff6b6b;">${warnLabel}</span>`;
                }
            }

            // 4. 第三優先：AI 型態 (原綠色樣式)
            if (stock.patterns_found?.length > 0) {
                stock.patterns_found.forEach(pf => {
                    if (!uniqueLabels.has(pf.display_name)) {
                        uniqueLabels.add(pf.display_name);
                        finalTagsHTML += `<span class="pattern-tag" style="background:rgba(0,212,170,0.15); color:var(--accent,#00d4aa);" title="信心値: ${pf.confidence}%">${pf.display_name}</span>`;
                    }
                });
            }

            const item = document.createElement('div');
            item.className = 'stock-item';
            item.setAttribute('onclick', `window.ScreeningPage.onStockClick('${stock.symbol}')`);
            item.innerHTML = `
                <div class="stock-symbol">${stock.symbol}</div>
                <div class="stock-name">${stock.name}</div>
                <div class="stock-price">${stock.price.toFixed(2)}</div>
                <div class="stock-change ${changeClass}">${changeSign}${stock.change_percent}%</div>
                <div class="stock-volume">${stock.volume.toLocaleString()}</div>
                <div class="stock-pattern">${finalTagsHTML}</div>
            `;
            stockList.appendChild(item);
        });
    },

    // Helper: Generate Mock OHLC Data
    generateMockOHLC: function (count) {
        const prices = [];
        let price = 150;
        const now = new Date();
        for (let i = 0; i < count; i++) {
            const time = new Date(now.getTime() - (count - i) * 86400000);
            const dateStr = time.toISOString().split('T')[0];
            const change = (Math.random() - 0.5) * 5;
            const open = price;
            const close = price + change;
            const high = Math.max(open, close) + Math.random() * 2;
            const low = Math.min(open, close) - Math.random() * 2;
            prices.push({
                time: dateStr,
                open: parseFloat(open.toFixed(2)),
                high: parseFloat(high.toFixed(2)),
                low: parseFloat(low.toFixed(2)),
                close: parseFloat(close.toFixed(2))
            });
            price = close;
        }
        return prices;
    },


    // ✅ Phase 2 重構：策略管理函數已移至 strategyManager.js
    // - saveStrategy(overwrite)
    // - loadStrategy(id)
    // - deleteStrategy(id)
    // - copyStrategy(id)
    // - selectStrategy(id)
    // - renderStrategyList()
    // - toggleStrategyDetails(id)
    // - saveAsNew() (private helper)

    // e.g. 'sma' -> window.SMAIndicator
    // e.g. 'bollinger' -> window.BollingerIndicator
    // Indicator Helper functions are now in ScreeningBlockIndicator

    // ───────────────────────────────────────────────────────────
    // Feature2: 停止篩選
    // ───────────────────────────────────────────────────────────

    stopFilter: function () {
        this._isStopped = true;
        if (this._currentEvtSrc) {
            this._currentEvtSrc.close();
            this._currentEvtSrc = null;
        }
    },

    _showStopDialog: function () {
        const dialog = document.getElementById('stopFilterDialog');
        if (dialog) dialog.style.display = 'flex';
    },

    _cancelStop: function () {
        const dialog = document.getElementById('stopFilterDialog');
        if (dialog) dialog.style.display = 'none';
    },

    _confirmStop: function () {
        const dialog = document.getElementById('stopFilterDialog');
        if (dialog) dialog.style.display = 'none';
        this.stopFilter();
        this._hideProgress();
    },

    // ───────────────────────────────────────────────────────────
    // Feature1: 全螢幕
    // ───────────────────────────────────────────────────────────

    initFullscreen: function () {
        const btn = document.getElementById('btnFullscreen');
        const wrapper = document.getElementById('chartWrapper');
        if (!btn || !wrapper) return;

        btn.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                wrapper.requestFullscreen().catch(err => {
                    console.warn('[Fullscreen] requestFullscreen failed:', err);
                });
            } else {
                document.exitFullscreen();
            }
        });

        document.addEventListener('fullscreenchange', () => {
            const isFull = !!document.fullscreenElement;
            const iconIn  = document.getElementById('iconFullscreen');
            const iconOut = document.getElementById('iconFullscreenExit');
            if (iconIn)  iconIn.style.display  = isFull ? 'none' : '';
            if (iconOut) iconOut.style.display = isFull ? '' : 'none';
            // Resize LW chart to fill new dimensions
            if (window.ChartController && window.ChartController.chart) {
                setTimeout(() => {
                    const el = document.getElementById('chartWrapper');
                    if (el) window.ChartController.chart.applyOptions({
                        width: el.clientWidth,
                        height: el.clientHeight
                    });
                }, 100);
            }
        });
    },

    // ───────────────────────────────────────────────────────────
    // Feature3: 側邊欄拖拉調整
    // ───────────────────────────────────────────────────────────

    initSidebarResize: function () {
        const handle = document.getElementById('sidebarResizeHandle');
        const sidebar = document.getElementById('app-sidebar');
        const pageContent = document.getElementById('page-screening');
        if (!handle || !sidebar || !pageContent) return;

        handle.addEventListener('mousedown', (e) => {
            const startX = e.clientX;
            const startW = sidebar.getBoundingClientRect().width;
            handle.classList.add('is-dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';

            const onMove = (ev) => {
                const delta = ev.clientX - startX;
                const newW = Math.max(200, Math.min(600, startW + delta));
                pageContent.style.setProperty('--sidebar-w', newW + 'px');
            };
            const onUp = () => {
                handle.classList.remove('is-dragging');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    },

};

// ====== HTMX 相容初始化邏輯（含防重複 flag）======

// ✅ Bug1: 防重複初始化 flag
window._screeningPageInit = false;

// 当 HTMX 重新載入 screening 頁面內容時重設 flag
// （DOM 快取顯示時不會觸發 afterSwap，故不會重初始化）
document.addEventListener('htmx:afterSwap', function (evt) {
    const path = evt.detail?.requestConfig?.path || '';
    if (path.includes('/screening')) {
        window._screeningPageInit = false;
    }
});

function initScreeningPage() {
    if (window._screeningPageInit) return;
    if (!document.getElementById('patternBarsMin')) return;
    window._screeningPageInit = true;
    window.ScreeningPage.init();
}

// 1. 正常全頁面載入
document.addEventListener('DOMContentLoaded', initScreeningPage);

// 2. HTMX 動態載入
document.addEventListener('htmx:afterSettle', initScreeningPage);

// 3. 若 JS 被動態載入且 DOMContentLoaded 已觸發過
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initScreeningPage();
}
