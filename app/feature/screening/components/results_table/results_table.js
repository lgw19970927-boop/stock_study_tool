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
        this._syncExportButtonState();
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

    // ── CSV 匯出 ──────────────────────────────────────────

    _bindExportCSV: function () {
        const btn = document.getElementById('btnExportCSV');
        if (!btn) return;
        btn.addEventListener('click', () => this._showExportModal());
    },

    /** 篩選結束後啟用按鈕，篩選中 / 無資料時禁用 */
    _syncExportButtonState: function () {
        const btn = document.getElementById('btnExportCSV');
        if (!btn) return;
        const hasResults = window.state.lastResults && window.state.lastResults.length > 0;
        btn.disabled = !hasResults;
        btn.title = hasResults ? '匯出篩選結果為 CSV 檔案' : '尚無篩選結果';
    },

    _showExportModal: function () {
        const results = window.state.lastResults;
        if (!results || results.length === 0) return;

        // 移除可能殘留的模態
        const old = document.getElementById('csvExportModal');
        if (old) old.remove();

        const count = results.length;
        const overlay = document.createElement('div');
        overlay.id = 'csvExportModal';
        overlay.className = 'csv-export-overlay';
        overlay.innerHTML = `
            <div class="csv-export-container">
                <div class="csv-export-header">
                    <span class="csv-export-title">匯出 CSV</span>
                    <button type="button" class="btn-modal-close" data-action="close">&times;</button>
                </div>
                <div class="csv-export-body">
                    <p class="csv-export-prompt">請選擇匯出內容：</p>
                    <label class="csv-export-option csv-export-option--selected">
                        <input type="radio" name="csvMode" value="full" checked>
                        <span class="csv-export-option-title">完整篩選結果</span>
                        <span class="csv-export-option-desc">含股票代碼、公司名稱、現價、漲跌幅、成交量、篩選標籤等所有欄位</span>
                    </label>
                    <label class="csv-export-option">
                        <input type="radio" name="csvMode" value="ticker">
                        <span class="csv-export-option-title">僅匯出股票代碼 (Ticker)</span>
                        <span class="csv-export-option-desc">僅包含篩選結果的股票代碼清單</span>
                    </label>
                    <p class="csv-export-preview">預覽：共 ${count} 筆資料</p>
                </div>
                <div class="csv-export-footer">
                    <button type="button" class="btn btn-ghost btn-sm" data-action="close">取消</button>
                    <button type="button" class="btn btn-primary btn-sm" data-action="export">匯出並儲存</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        // 拖移支援
        const container = overlay.querySelector('.csv-export-container');
        const header = overlay.querySelector('.csv-export-header');
        this._makeDraggable(container, header);

        // 選項高亮切換
        overlay.querySelectorAll('input[name="csvMode"]').forEach(radio => {
            radio.addEventListener('change', () => {
                overlay.querySelectorAll('.csv-export-option').forEach(o => o.classList.remove('csv-export-option--selected'));
                radio.closest('.csv-export-option').classList.add('csv-export-option--selected');
            });
        });

        // 關閉
        overlay.querySelectorAll('[data-action="close"]').forEach(el => {
            el.addEventListener('click', () => overlay.remove());
        });
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        // 匯出
        overlay.querySelector('[data-action="export"]').addEventListener('click', () => {
            const mode = overlay.querySelector('input[name="csvMode"]:checked').value;
            this._exportCSV(mode);
            overlay.remove();
        });
    },

    /**
     * 拖移支援（複用 ChartSettingsModal 相同邏輯）
     */
    _makeDraggable: function (containerEl, handleEl) {
        let isDragging = false;
        let startX = 0, startY = 0, startLeft = 0, startTop = 0;

        handleEl.style.cursor = 'move';
        handleEl.addEventListener('mousedown', (e) => {
            if (e.button !== 0 || e.target.closest('button')) return;
            isDragging = true;
            containerEl.classList.add('is-dragging');
            const rect = containerEl.getBoundingClientRect();
            containerEl.style.position = 'fixed';
            containerEl.style.margin = '0';
            containerEl.style.left = rect.left + 'px';
            containerEl.style.top = rect.top + 'px';
            startX = e.clientX; startY = e.clientY;
            startLeft = rect.left; startTop = rect.top;
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const newLeft = Math.max(0, Math.min(window.innerWidth - containerEl.offsetWidth, startLeft + e.clientX - startX));
            const newTop = Math.max(0, Math.min(window.innerHeight - containerEl.offsetHeight, startTop + e.clientY - startY));
            containerEl.style.left = newLeft + 'px';
            containerEl.style.top = newTop + 'px';
        });
        document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            containerEl.classList.remove('is-dragging');
        });
    },

    _exportCSV: function (mode) {
        const results = window.state.lastResults;
        if (!results || results.length === 0) return;

        let csvContent = '\uFEFF'; // UTF-8 BOM for Excel
        const now = new Date();
        const ts = now.getFullYear().toString()
            + String(now.getMonth() + 1).padStart(2, '0')
            + String(now.getDate()).padStart(2, '0')
            + '_' + String(now.getHours()).padStart(2, '0')
            + String(now.getMinutes()).padStart(2, '0')
            + String(now.getSeconds()).padStart(2, '0');

        if (mode === 'ticker') {
            csvContent += 'Symbol\r\n';
            results.forEach(s => { csvContent += s.symbol + '\r\n'; });
            this._downloadCSV(csvContent, `screening_tickers_${ts}.csv`);
        } else {
            csvContent += 'Symbol,Name,Price,Change%,Volume,Matched_Indicators,Matched_Patterns\r\n';
            results.forEach(s => {
                const name = this._csvEscape(s.name || '');
                const price = (s.price ?? 0).toFixed(2);
                const change = (s.change_percent > 0 ? '+' : '') + (s.change_percent ?? 0) + '%';
                const volume = s.volume ?? 0;
                const indicators = (s.matched_indicators || []).join('|');
                const patterns = (s.patterns_found || []).map(p => p.display_name).join('|');
                csvContent += `${s.symbol},${name},${price},${change},${volume},${this._csvEscape(indicators)},${this._csvEscape(patterns)}\r\n`;
            });
            this._downloadCSV(csvContent, `screening_results_${ts}.csv`);
        }
    },

    /** RFC 4180: 含逗號/引號/換行時用雙引號包裹 */
    _csvEscape: function (val) {
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    },

    _downloadCSV: async function (csvContent, filename) {
        // 優先使用 File System Access API（Chrome/Edge）
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: filename,
                    types: [{ description: 'CSV Files', accept: { 'text/csv': ['.csv'] } }]
                });
                const writable = await handle.createWritable();
                await writable.write(csvContent);
                await writable.close();
                return;
            } catch (e) {
                if (e.name === 'AbortError') return; // 使用者取消
                // fallback 到 <a download>
            }
        }
        // Fallback: <a download> 方式
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
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