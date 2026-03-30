/**
 * progress_area.js - SSE 串流 + 進度條更新模組
 * 從 screening.js 拆分；透過 Object.assign 掛載至 window.ScreeningPage
 * 必須在 screening.js 之後載入
 */
Object.assign(window.ScreeningPage, {
    // ── 進度條控制 ─────────────────────────────────────────

    _showProgress: function () {
        const progressArea = document.getElementById('screeningProgressArea');
        const emptyState = document.getElementById('emptyState');
        if (progressArea) {
            progressArea.classList.remove('is-hidden');
            progressArea.classList.add('is-flex');
        }
        if (emptyState) {
            emptyState.classList.add('is-hidden');
            emptyState.classList.remove('is-flex');
        }
        const stockList = document.getElementById('stockList');
        if (stockList) {
            [...stockList.children].forEach(child => {
                if (child.id !== 'screeningProgressArea' && child.id !== 'emptyState') {
                    child.remove();
                }
            });
            stockList.classList.remove('state-idle', 'state-result');
            stockList.classList.add('state-progressing');
        }
    },

    _hideProgress: function () {
        const progressArea = document.getElementById('screeningProgressArea');
        if (progressArea) {
            progressArea.classList.add('is-hidden');
            progressArea.classList.remove('is-flex');
        }
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
            emptyState.classList.remove('is-hidden');
            emptyState.classList.add('is-flex');
            emptyState.innerHTML = `
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none"
                     stroke="#ff6b6b" stroke-width="1.5"
                     stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
                <p class="empty-state-danger">篩選失敗：${message}</p>
                <small class="empty-state-danger-sub">請檢查網絡連接或聯繫管理員</small>
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
                        // Feature Bug 1: 累積中途已篩選出的股票清單
                        if (data.partial_stocks !== undefined) {
                            this._currentPartialResults = {
                                stocks:     data.partial_stocks,
                                statistics: data.partial_statistics || {}
                            };
                        }
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
    }
});