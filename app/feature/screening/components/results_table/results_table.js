/**
 * results_table.js - 結果列表渲染 + 排序 + CSV 匯出模組
 * 從 screening.js 拆分；透過 Object.assign 掛載至 window.ScreeningPage
 * 必須在 screening.js 之後載入
 */
Object.assign(window.ScreeningPage, {
    _renderResults: function (stocks, statistics) {
        const stockList = document.getElementById('stockList');
        // 移除進行中 / idle 的 state class，切換為 result 狀態（顯示 scrollbar）
        if (stockList) {
            stockList.classList.remove('state-idle', 'state-progressing');
            stockList.classList.add('state-result');
        }
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
        this._lastRenderStocks = stocks;
        this._lastRenderStats = statistics;
        this._selectedStockIndex = null;
        const sortedStocks = this._sortStocks(stocks);

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
                emptyState.classList.remove('is-hidden');
                emptyState.classList.add('is-flex');
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

        if (emptyState) {
            emptyState.classList.add('is-hidden');
            emptyState.classList.remove('is-flex');
        }

        sortedStocks.forEach(stock => {
            const rawChangePercent = Number(stock.change_percent);
            const numericChangePercent = Number.isFinite(rawChangePercent) ? rawChangePercent : 0;
            const isZero = Object.is(numericChangePercent, 0) || Object.is(numericChangePercent, -0);
            const displayChangePercent = isZero ? 0 : numericChangePercent;
            const changeToneClass = isZero
                ? 'text-text-secondary bg-[rgba(150,150,150,0.1)]'
                : displayChangePercent > 0
                    ? 'text-color-success bg-[rgba(63,185,80,0.1)]'
                    : 'text-color-danger bg-[rgba(248,81,73,0.1)]';
            const changeSign = displayChangePercent > 0 ? '+' : '';

            // 1. 整理所有標籤並去重
            const uniqueLabels = new Set();
            let finalTagsHTML = '';

            // 2. 第一優先：符合的指標 (原灰色樣式)
            if (stock.matched_indicators?.length > 0) {
                stock.matched_indicators.forEach(ind => {
                    if (!uniqueLabels.has(ind)) {
                        uniqueLabels.add(ind);
                        finalTagsHTML += `<span class="pattern-tag inline-block shrink-0 whitespace-nowrap rounded-[3px] bg-[rgba(124,58,237,0.15)] px-1.5 py-0.5 text-[0.625rem] font-medium text-accent-secondary">${ind}</span>`;
                    }
                });
            }

            // 3. 第二優先：資料不足放行的指標 (原紅色警告樣式)
            if (stock.insufficient_indicators?.length > 0) {
                stock.insufficient_indicators.forEach(ind => {
                    const warnLabel = `⚠️ ${ind} 資料不足`;
                    if (!uniqueLabels.has(warnLabel)) {
                        uniqueLabels.add(warnLabel);
                        finalTagsHTML += `<span class="pattern-tag inline-block shrink-0 whitespace-nowrap rounded-[3px] bg-[rgba(255,107,107,0.15)] px-1.5 py-0.5 text-[0.625rem] font-medium text-[#ff6b6b]">${warnLabel}</span>`;
                    }
                });
            } else if (stock.data_insufficient && (!stock.insufficient_indicators || stock.insufficient_indicators.length === 0)) {
                // 向下相容舊資料結構
                const warnLabel = '⚠️ 資料不足';
                if (!uniqueLabels.has(warnLabel)) {
                    uniqueLabels.add(warnLabel);
                    finalTagsHTML += `<span class="pattern-tag inline-block shrink-0 whitespace-nowrap rounded-[3px] bg-[rgba(255,107,107,0.15)] px-1.5 py-0.5 text-[0.625rem] font-medium text-[#ff6b6b]">${warnLabel}</span>`;
                }
            }

            // 4. 第三優先：AI 型態 (原綠色樣式)
            if (stock.patterns_found?.length > 0) {
                stock.patterns_found.forEach(pf => {
                    if (!uniqueLabels.has(pf.display_name)) {
                        uniqueLabels.add(pf.display_name);
                        finalTagsHTML += `<span class="pattern-tag inline-block shrink-0 whitespace-nowrap rounded-[3px] bg-[rgba(0,212,170,0.15)] px-1.5 py-0.5 text-[0.625rem] font-medium text-accent-primary" title="信心値: ${pf.confidence}%">${pf.display_name}</span>`;
                    }
                });
            }

            if (!finalTagsHTML) {
                finalTagsHTML = '<span class="pattern-tag inline-block shrink-0 whitespace-nowrap rounded-[3px] bg-[rgba(124,58,237,0.15)] px-1.5 py-0.5 text-[0.625rem] font-medium text-accent-secondary">—</span>';
            }

            const item = document.createElement('div');
            item.className = 'stock-item grid min-w-[800px] cursor-pointer grid-cols-[100px_1fr_100px_100px_120px_100px] items-center gap-[var(--spacing-md)] border-l-[3px] border-l-transparent px-[var(--spacing-lg)] py-[var(--spacing-sm)] transition-[background] duration-fast hover:bg-bg-hover [animation:fadeIn_0.3s_ease_forwards]';
            item.dataset.symbol = stock.symbol;
            item.innerHTML = `
                <div class="stock-symbol font-mono font-semibold text-accent-primary">${stock.symbol}</div>
                <div class="stock-name overflow-hidden text-ellipsis whitespace-nowrap text-sm text-text-secondary">${stock.name}</div>
                <div class="stock-price font-mono font-medium">${stock.price.toFixed(2)}</div>
                <div class="stock-change rounded-sm px-2 py-0.5 text-center font-mono text-xs font-medium ${changeToneClass}">${changeSign}${displayChangePercent}%</div>
                <div class="stock-volume font-mono text-xs text-text-secondary">${stock.volume.toLocaleString()}</div>
                <div class="stock-pattern flex gap-1">${finalTagsHTML}</div>
            `;

            item.addEventListener('click', () => {
                const items = [...document.querySelectorAll('#stockList .stock-item')];
                items.forEach(el => {
                    el.classList.remove('stock-item--selected');
                    el.classList.remove('selected');
                });

                item.classList.add('stock-item--selected');
                item.classList.add('selected');
                window.ScreeningPage._selectedStockIndex = items.indexOf(item);
                window.ScreeningPage.onStockClick(stock.symbol);
            });

            stockList.appendChild(item);
        });
    },

    // ── 欄位排序 ─────────────────────────────────────────

    _initSortHeaders: function () {
        document.querySelectorAll('.list-header .sortable').forEach(col => {
            col.addEventListener('click', () => {
                const field = col.dataset.sort;
                if (this._sortState.field === field) {
                    if (this._sortState.order === 'desc') {
                        this._sortState.order = 'asc';
                    } else {
                        this._sortState.field = null;
                        this._sortState.order = null;
                    }
                } else {
                    this._sortState.field = field;
                    this._sortState.order = 'desc';
                }
                this._updateSortIcons();
                if (this._lastRenderStocks) {
                    this._renderResults(this._lastRenderStocks, this._lastRenderStats);
                }
            });
        });
    },

    _sortStocks: function (stocks) {
        if (!this._sortState.field || !this._sortState.order) return [...stocks];
        const field = this._sortState.field;
        const dir = this._sortState.order === 'desc' ? -1 : 1;
        return [...stocks].sort((a, b) => {
            if (field === 'symbol') return dir * a.symbol.localeCompare(b.symbol);
            if (field === 'price')  return dir * (a.price - b.price);
            if (field === 'change') return dir * (a.change_percent - b.change_percent);
            if (field === 'volume') return dir * (a.volume - b.volume);
            return 0;
        });
    },

    _updateSortIcons: function () {
        document.querySelectorAll('.list-header .sortable').forEach(col => {
            const icon = col.querySelector('.sort-icon');
            if (!icon) return;
            if (this._sortState.field === col.dataset.sort) {
                icon.textContent = this._sortState.order === 'desc' ? '↓' : '↑';
                col.classList.add('sorted');
            } else {
                icon.textContent = '⇅';
                col.classList.remove('sorted');
            }
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
    }
});

// ── 觸發初始化（此為最後載入的 ScreeningPage 擴充腳本）──
// 不論是全頁面載入、HTMX 首次注入或動態載入，執行到此時
// window.ScreeningPage 已完整組裝（所有 Object.assign 均已執行）
if (typeof window.initScreeningPage === 'function') {
    window.initScreeningPage();
}