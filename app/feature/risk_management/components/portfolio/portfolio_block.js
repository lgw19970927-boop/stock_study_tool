/**
 * App/Feature/RiskManagement/function_block/portfolio_block.js
 * 投資組合風险明細表格模組 (Portfolio Risk Manager)
 *
 * 設計原則:
 *   - 資料驅動: _rows[] 為 SSOT，渲染由資料產生
 *   - localStorage 持久化
 *   - 事件委派: tbody 層級，減少事件綁定
 *   - 最後一批鎖定: 最後 pct 永遠 null（自動計算）
 *   - 狀態機: 規劃 -> 持倉 -> 已結案
 *
 * 依賴: RiskParams, OverviewBlock
 */

window.PortfolioBlock = (function () {
    'use strict';

    const LS_KEY = 'rm-portfolio-rows';
    let _rows = [];   // Array<RowData>
    let _listenerAttached = false;

    // ──────────────────────────────────────────────────────────
    // 1. UID helpers
    // ──────────────────────────────────────────────────────────

    function _uid() {
        return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    /** Returns auto-calculated locked pct for last batch: 100 - sum(others) */
    function _lockedPct(batches) {
        if (!batches || batches.length === 0) return 100;
        if (batches.length === 1) return 100;
        const sumOthers = batches.slice(0, -1).reduce((s, b) => s + (b.pct || 0), 0);
        return Math.max(0, 100 - sumOthers);
    }

    /** Returns row state: planned / holding / closed */
    function _getState(row) {
        // closed: triggered when all manual exit pct sum >= 100%
        const ex = row.exitBatches || [];
        if (ex.length > 1) {
            const manualSum = ex.slice(0, -1).reduce((s, b) => s + (b.pct || 0), 0);
            if (manualSum >= 100) return 'closed';
        }
        if (row.executed) return 'holding';
        return 'planned';
    }

    // ──────────────────────────────────────────────────────────
    // 2. 計算邏輯
    // ──────────────────────────────────────────────────────────

    function _calc(row) {
        const capital    = window.RiskParams ? window.RiskParams.capital() : 1000000;
        const maxRiskPct = window.RiskParams ? window.RiskParams.riskPct() : 1.0;
        const dir        = row.direction === 'short' ? -1 : 1;
        const avgPrice   = row.avgPrice   || 0;
        const capitalPct = row.capitalPct || 0;

        // ?? Stop-loss batches ??
        const sl = row.stopLossBatches || [{ price: 0, pct: null }];
        const slLocked = _lockedPct(sl);

        let avgStopPct = null;
        if (avgPrice > 0 && sl.some(b => b.price > 0)) {
            avgStopPct = sl.reduce((sum, b, i) => {
                const bPct = (i === sl.length - 1) ? slLocked : (b.pct || 0);
                return sum + dir * (b.price - avgPrice) / avgPrice * (bPct / 100);
            }, 0) * 100;
        }

        // F-1: Suggested shares
        let sugShares = null;
        if (avgStopPct !== null && Math.abs(avgStopPct) > 0 && avgPrice > 0) {
            // 讓單筆停損%永遠參與建議股數計算（不再以 1 為下限鉗制）
            const multiplier = maxRiskPct / Math.abs(avgStopPct);
            sugShares = Math.floor((capitalPct / 100 * capital * multiplier) / avgPrice);
        }

        // F-2: Risk-controlled capital %
        let ctrlPosPct = null;
        if (sugShares !== null && capital > 0) {
            ctrlPosPct = (sugShares * avgPrice / capital) * 100;
        }

        // ?? Exit batches ??
        const ex = row.exitBatches || [{ price: 0, pct: null }];
        const exLocked = _lockedPct(ex);

        let avgPnlPct = null;
        if (avgPrice > 0 && ex.some(b => b.price > 0)) {
            avgPnlPct = ex.reduce((sum, b, i) => {
                const bPct = (i === ex.length - 1) ? exLocked : (b.pct || 0);
                return sum + dir * (b.price - avgPrice) / avgPrice * (bPct / 100);
            }, 0) * 100;
        }

        // F-5: R/R Ratio
        let rrRatio = null;
        if (avgPnlPct !== null && avgStopPct !== null && Math.abs(avgStopPct) > 0) {
            rrRatio = avgPnlPct / Math.abs(avgStopPct);
        }

        // F-6: P/L Amount
        let plAmount = null;
        if (avgPnlPct !== null && sugShares !== null) {
            plAmount = avgPnlPct / 100 * sugShares * avgPrice;
        }

        // F-7: Account contribution %
        let accountContrib = null;
        if (ctrlPosPct !== null) {
            const base = (avgPnlPct !== null) ? avgPnlPct : avgStopPct;
            if (base !== null) {
                accountContrib = base / 100 * ctrlPosPct;
            }
        }

        return { avgStopPct, sugShares, ctrlPosPct, avgPnlPct, rrRatio, plAmount, accountContrib, slLocked, exLocked };
    }

    // ──────────────────────────────────────────────────────────
    // 3. 格式化 & 顏色 helpers
    // ──────────────────────────────────────────────────────────

    const fmt = {
        num:      n => (n == null || isNaN(n)) ? '--'
                     : n.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
        pct:      (n, d) => { d = d == null ? 2 : d; return (n == null || isNaN(n)) ? '--' : n.toFixed(d) + '%'; },
        pctSign:  (n, d) => { d = d == null ? 2 : d; return (n == null || isNaN(n)) ? '--' : (n >= 0 ? '+' : '') + n.toFixed(d) + '%'; },
        moneyStr: n => {
            if (n == null || isNaN(n)) return '--';
            const sign = n >= 0 ? '+' : '-';
            const abs  = Math.abs(n).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
            return sign + '$' + abs;
        },
        rr: n => (n == null || isNaN(n)) ? '--' : n.toFixed(2),
    };

    const clr = {
        pnl:     n => (n == null || isNaN(n)) ? 'var(--text-primary)' : (n >= 0 ? '#00d4aa' : '#f87171'),
        sl:      n => {
            if (n == null || isNaN(n)) return 'var(--text-muted)';
            const a = Math.abs(n);
            return a > 10 ? '#f87171' : a > 5 ? '#fbbf24' : '#00d4aa';
        },
        rr:      n => (n == null || isNaN(n)) ? 'var(--text-muted)' : (n > 1 ? '#00d4aa' : n < 1 ? '#f87171' : 'var(--text-primary)'),
        contrib: n => (n == null || isNaN(n)) ? 'var(--text-muted)' : (n >= 0 ? '#00d4aa' : '#f87171'),
    };

    function _contribLabel(state, contrib) {
        if (contrib == null || isNaN(contrib)) return { text: '\u2014', color: 'var(--text-muted)' };
        if (state === 'planned') {
            return contrib < 0
                ? { text: '\u26a0\ufe0f \u9810\u4f30\u98a8\u9669', color: '#f87171' }
                : { text: '\ud83d\udcca \u898f\u5283\u4e2d',        color: '#fbbf24' };
        }
        if (state === 'holding') {
            if (contrib > 0) return { text: '\ud83d\udcc8 \u5be6\u969b\u7372\u5229', color: '#00d4aa' };
            if (contrib < 0) return { text: '\ud83d\udcc9 \u5be6\u969b\u865f\u640d', color: '#f87171' };
            return { text: '\u6301\u5e73', color: 'var(--text-muted)' };
        }
        if (state === 'closed') {
            if (contrib > 0) return { text: '\ud83d\udcc8 \u5df2\u5be6\u73fe\u7372\u5229', color: '#00d4aa' };
            if (contrib < 0) return { text: '\ud83d\udcc9 \u5df2\u5be6\u73fe\u865f\u640d', color: '#f87171' };
            return { text: '\u6301\u5e73', color: 'var(--text-muted)' };
        }
        return { text: '\u2014', color: 'var(--text-muted)' };
    }

    // ──────────────────────────────────────────────────────────
    // 4. HTML 建構器
    // ──────────────────────────────────────────────────────────

    function _batchListHTML(batches, type, state, locked) {
        const isSlClosed  = (type === 'sl' && state === 'closed');
        const isExPlanned = (type === 'ex' && state === 'planned');
        const label       = type === 'sl' ? '\u505c\u640d' : '\u51fa\u5834';

        if (isExPlanned) {
            return '<div class="pm-exit-waiting">\u2014 \u7b49\u5f85\u51fa\u5834 \u2014</div>' +
                   '<button class="pm-add-batch-btn" data-add="ex" disabled>\uff0b \u65b0\u589e\u51fa\u5834</button>';
        }

        const manualSum  = batches.slice(0, -1).reduce((s, b) => s + (b.pct || 0), 0);
        const pctExceed  = manualSum >= 100;

        let html = '<div class="pm-batch-list pm-batch-list-centered">';
        batches.forEach(function(b, i) {
            const isLast  = (i === batches.length - 1);
            const dispPct = isLast ? locked : (b.pct || 0);
            const warnCls = (isLast && pctExceed) ? ' pm-pct-warn' : '';
            const canDel  = !isLast && !isSlClosed && batches.length > 1;
            const delBtn  = canDel
                ? '<button class="pm-batch-del-btn" data-batch="' + i + '" data-del-type="' + type + '" title="\u522a\u9664\u6b64\u6279\u6b21"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>'
                : '<span class="pm-inline-placeholder"></span>';

            html += '<div class="pm-batch-row pm-batch-row-centered">' +
                    '<span class="pm-batch-symbol">$</span>' +
                    '<input class="pm-batch-input pm-' + type + '-price' + (isSlClosed ? ' locked' : '') + '"' +
                    ' value="' + (b.price || '') + '" data-batch="' + i + '" data-btype="' + type + '"' +
                    ' type="number" step="any" placeholder="0"' + (isSlClosed ? ' readonly' : '') + '>' +
                    '<span class="pm-batch-symbol">@</span>' +
                    '<input class="pm-batch-input pm-pct-input pm-' + type + '-pct' + (isLast || isSlClosed ? ' locked' : '') + warnCls + '"' +
                    ' value="' + dispPct.toFixed(1) + '" data-batch="' + i + '" data-btype="' + type + '"' +
                    ' type="number" step="0.1" min="0" max="100"' + (isLast || isSlClosed ? ' readonly' : '') + '>' +
                    '<span class="pm-batch-symbol">%</span>' +
                    (isLast ? '<span class="pm-lock-icon">\ud83d\udd12</span>' : delBtn) +
                    '</div>';
        });

        if (!isSlClosed) {
            html += '<button class="pm-add-batch-btn pm-add-batch-btn-center" data-add="' + type + '">\uff0b \u65b0\u589e' + label + '</button>';
        }
        html += '</div>';
        return html;
    }

    function _slCellHTML(row, calc, state) {
        const bHtml = _batchListHTML(row.stopLossBatches, 'sl', state, calc.slLocked);
        const sc    = clr.sl(calc.avgStopPct);
        return bHtml +
               '<hr class="pm-cell-divider">' +
               '<div class="pm-avg-output pm-c-avgstop" style="color:' + sc + ';">' +
               '\u5e73\u5747\u505c\u640d: <span>' + fmt.pct(calc.avgStopPct) + '</span></div>';
    }

    function _exCellHTML(row, calc, state) {
        const bHtml = _batchListHTML(row.exitBatches, 'ex', state, calc.exLocked);
        const pc    = clr.pnl(calc.avgPnlPct);
        const avgTxt = state === 'planned' ? '--' : fmt.pctSign(calc.avgPnlPct);
        const avgClr  = state === 'planned' ? 'var(--text-muted)' : pc;
        return bHtml +
               '<hr class="pm-cell-divider">' +
               '<div class="pm-avg-output pm-c-avgpnl" style="color:' + avgClr + ';">' +
               '\u5e73\u5747\u640d\u76ca: <span>' + avgTxt + '</span></div>';
    }

    function _stateBadgeHTML(state) {
        const MAP = { planned: '\ud83d\udfe1 \u898f\u5283', holding: '\ud83d\udfe2 \u6301\u5009', closed: '\u26aa \u5df2\u7d50\u6848' };
        return '<span class="pm-status-badge ' + state + '">' + MAP[state] + '</span>';
    }

    function _esc(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function _rowCellsHTML(row) {
        const calc  = _calc(row);
        const state = _getState(row);
        const cl    = _contribLabel(state, calc.accountContrib);

        // col1: status badge + executed checkbox
        const col1 = '<div class="pm-cell-stack pm-cell-stack-start">' +
            _stateBadgeHTML(state) +
            '<label class="pm-executed-label">' +
            '<input type="checkbox" class="pm-executed-cb"' + (row.executed ? ' checked' : '') + '>' +
            '\u5df2\u9032\u5834</label></div>';

        // col2: ticker + direction
        const col2 = '<div class="pm-cell-stack">' +
            '<input class="rm-row-input pm-f-ticker pm-input-ticker" type="text" value="' + _esc(row.ticker) + '" placeholder="AAPL">' +
            '<button class="pm-direction-btn ' + row.direction + '">' + (row.direction === 'short' ? '\u7a7a \u2193' : '\u591a \u2191') + '</button>' +
            '</div>';

        // col3: entry plan (avg price / capital% / sugShares / ctrlPos)
        const sugTxt  = fmt.num(calc.sugShares);
        const ctrlTxt = calc.ctrlPosPct != null ? fmt.pct(calc.ctrlPosPct) : '--';
        const col3 = '<div class="pm-cell-stack pm-cell-stack-compact pm-plan-col">' +
            '<div class="pm-field-row"><span class="pm-field-label">\u5747\u50f9</span>' +
            '<span class="pm-unit-label">$</span>' +
            '<input class="rm-row-input pm-f-avgprice pm-input-avgprice" type="number" step="any" value="' + (row.avgPrice || '') + '" placeholder="0"></div>' +
            '<div class="pm-field-row"><span class="pm-field-label">\u4f54\u6bd4</span>' +
            '<input class="rm-row-input pm-f-capitalpct pm-input-capitalpct" type="number" step="any" value="' + (row.capitalPct || 5) + '">' +
            '<span class="pm-unit-label">%</span></div>' +
            '<hr class="pm-cell-divider">' +
            '<div class="pm-field-row"><span class="pm-field-label">\u5efa\u8b70\u80a1\u6578</span>' +
            '<strong class="pm-output-val pm-c-sugshares pm-output-primary">' + sugTxt + '</strong></div>' +
            '<div class="pm-field-row"><span class="pm-field-label">\u63a7\u98a8\u5009\u4f4d</span>' +
            '<strong class="pm-output-val pm-c-ctrlpos pm-output-muted">' + ctrlTxt + '</strong></div></div>';

        // col4: stop-loss batches
        const col4 = '<div class="pm-batch-col">' + _slCellHTML(row, calc, state) + '</div>';

        // col5: exit batches
        const col5 = '<div class="pm-batch-col">' + _exCellHTML(row, calc, state) + '</div>';

        // col6: trade performance (R/R, P&L amount)
        const rrTxt = fmt.rr(calc.rrRatio);
        const rrC   = clr.rr(calc.rrRatio);
        const plTxt = fmt.moneyStr(calc.plAmount);
        const plC   = clr.pnl(calc.plAmount);
        const col6 = '<div class="pm-cell-stack pm-cell-stack-compact">' +
            '<div>\u76c8\u8667\u6bd4: <strong class="pm-output-val pm-c-rr" style="color:' + rrC + ';">' + rrTxt + '</strong></div>' +
            '<div>\u91d1\u984d: <strong class="pm-output-val pm-c-plamount" style="color:' + plC + ';">' + plTxt + '</strong></div></div>';

        // col7: account contribution
        const contribTxt = fmt.pctSign(calc.accountContrib);
        const contribC   = clr.contrib(calc.accountContrib);
        const col7 = '<div class="pm-cell-stack pm-cell-stack-tight">' +
            '<span class="pm-c-contriblabel" style="color:' + cl.color + ';">' + cl.text + '</span>' +
            '<strong class="pm-output-val pm-c-contrib" style="color:' + contribC + ';">' + contribTxt + '</strong></div>';

        // col8: delete button
        const col8 = '<button class="pm-row-del-btn" title="\u522a\u9664\u6b64\u5217">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>' +
            '<path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>';

        return '<td>' + col1 + '</td><td>' + col2 + '</td><td>' + col3 + '</td><td>' + col4 + '</td>' +
               '<td>' + col5 + '</td><td>' + col6 + '</td><td>' + col7 + '</td><td>' + col8 + '</td>';
    }

    // ──────────────────────────────────────────────────────────
    // 5. DOM 更新（保持 focus）
    // ──────────────────────────────────────────────────────────

    function _updateOutputs(tr, row) {
        const calc  = _calc(row);
        const state = _getState(row);
        const cl    = _contribLabel(state, calc.accountContrib);

        function setStyle(sel, text, color) {
            var el = tr.querySelector(sel);
            if (!el) return;
            el.textContent = text;
            if (color) el.style.color = color;
        }

        setStyle('.pm-c-sugshares',   fmt.num(calc.sugShares),       'var(--text-primary)');
        setStyle('.pm-c-ctrlpos',     fmt.pct(calc.ctrlPosPct),      'var(--text-muted)');
        setStyle('.pm-c-rr',          fmt.rr(calc.rrRatio),          clr.rr(calc.rrRatio));
        setStyle('.pm-c-plamount',    fmt.moneyStr(calc.plAmount),    clr.pnl(calc.plAmount));
        setStyle('.pm-c-contrib',     fmt.pctSign(calc.accountContrib), clr.contrib(calc.accountContrib));
        setStyle('.pm-c-contriblabel', cl.text, cl.color);

        var slAvg = tr.querySelector('.pm-c-avgstop');
        if (slAvg) {
            slAvg.style.color = clr.sl(calc.avgStopPct);
            var sp = slAvg.querySelector('span');
            if (sp) sp.textContent = fmt.pct(calc.avgStopPct);
        }

        var exAvg = tr.querySelector('.pm-c-avgpnl');
        if (exAvg) {
            exAvg.style.color = (state === 'planned') ? 'var(--text-muted)' : clr.pnl(calc.avgPnlPct);
            var sp2 = exAvg.querySelector('span');
            if (sp2) sp2.textContent = (state === 'planned') ? '--' : fmt.pctSign(calc.avgPnlPct);
        }

            // re-render locked batch pct fields
        var slPcts = Array.prototype.slice.call(tr.querySelectorAll('.pm-sl-pct'));
        if (slPcts.length > 0) {
            var lastSl = slPcts[slPcts.length - 1];
            if (lastSl && lastSl.readOnly) lastSl.value = calc.slLocked.toFixed(1);
        }
        var exPcts = Array.prototype.slice.call(tr.querySelectorAll('.pm-ex-pct'));
        if (exPcts.length > 0) {
            var lastEx = exPcts[exPcts.length - 1];
            if (lastEx && lastEx.readOnly) lastEx.value = calc.exLocked.toFixed(1);
        }

            // add new batch
        var badge = tr.querySelector('.pm-status-badge');
        if (badge) {
            badge.className = 'pm-status-badge ' + state;
            var MAP = { planned: '\ud83d\udfe1 \u898f\u5283', holding: '\ud83d\udfe2 \u6301\u5009', closed: '\u26aa \u5df2\u7d50\u6848' };
            badge.textContent = MAP[state];
        }
    }

    function _rebuildBatchCell(tr, row, type) {
        var calc  = _calc(row);
        var state = _getState(row);
        var td    = type === 'sl' ? tr.cells[3] : tr.cells[4];
        if (!td) return;
        td.innerHTML = '<div>' + (type === 'sl' ? _slCellHTML(row, calc, state) : _exCellHTML(row, calc, state)) + '</div>';
        _updateOutputs(tr, row);
    }

    function _rebuildExitCellIfStateChanged(tr, row, prevState) {
        var newState = _getState(row);
        if (prevState !== newState) {
            _rebuildBatchCell(tr, row, 'ex');
            if (prevState === 'closed' || newState === 'closed') {
                _rebuildBatchCell(tr, row, 'sl');
            }
        } else {
            _updateOutputs(tr, row);
        }
    }

    // ──────────────────────────────────────────────────────────
    // 6. 從 DOM 同步 _rows
    // ──────────────────────────────────────────────────────────

    function _findRow(rowId) {
        for (var i = 0; i < _rows.length; i++) {
            if (_rows[i].id === rowId) return _rows[i];
        }
        return null;
    }

    function _syncFromDOM(tr, row) {
        var tickerEl    = tr.querySelector('.pm-f-ticker');
        var avgPriceEl  = tr.querySelector('.pm-f-avgprice');
        var capitalPctEl= tr.querySelector('.pm-f-capitalpct');
        if (tickerEl)    row.ticker     = tickerEl.value.trim();
        if (avgPriceEl)  row.avgPrice   = parseFloat(avgPriceEl.value)   || 0;
        if (capitalPctEl)row.capitalPct = parseFloat(capitalPctEl.value) || 5;

        var slPrices = Array.prototype.slice.call(tr.querySelectorAll('.pm-sl-price'));
        slPrices.forEach(function(el, i) {
            if (row.stopLossBatches[i]) row.stopLossBatches[i].price = parseFloat(el.value) || 0;
        });
        var slPcts = Array.prototype.slice.call(tr.querySelectorAll('.pm-sl-pct'));
        slPcts.forEach(function(el, i) {
            if (i < row.stopLossBatches.length - 1 && row.stopLossBatches[i])
                row.stopLossBatches[i].pct = parseFloat(el.value) || 0;
        });

        var exPrices = Array.prototype.slice.call(tr.querySelectorAll('.pm-ex-price'));
        exPrices.forEach(function(el, i) {
            if (row.exitBatches[i]) row.exitBatches[i].price = parseFloat(el.value) || 0;
        });
        var exPcts = Array.prototype.slice.call(tr.querySelectorAll('.pm-ex-pct'));
        exPcts.forEach(function(el, i) {
            if (i < row.exitBatches.length - 1 && row.exitBatches[i])
                row.exitBatches[i].pct = parseFloat(el.value) || 0;
        });
    }

    // ──────────────────────────────────────────────────────────
    // 7. 事件委派: tbody 層級
    // ──────────────────────────────────────────────────────────

    function _getTR(el) {
        var cur = el;
        while (cur && cur.tagName !== 'TR') cur = cur.parentElement;
        return (cur && cur.dataset && cur.dataset.rowId) ? cur : null;
    }

    function _onTableInput(e) {
        var tr = _getTR(e.target);
        if (!tr) return;
        var row = _findRow(tr.dataset.rowId);
        if (!row) return;

        var t = e.target;
        var classes = t.className || '';
        if (classes.indexOf('pm-f-ticker') >= 0    || classes.indexOf('pm-f-avgprice') >= 0  ||
            classes.indexOf('pm-f-capitalpct') >= 0 || classes.indexOf('pm-sl-price') >= 0   ||
            classes.indexOf('pm-ex-price') >= 0     || classes.indexOf('pm-sl-pct') >= 0     ||
            classes.indexOf('pm-ex-pct') >= 0) {

            var prevState = _getState(row);
            _syncFromDOM(tr, row);
            _rebuildExitCellIfStateChanged(tr, row, prevState);
            _refreshFooter();
            _save();
        }
    }

    function _onTableClick(e) {
        var tr = _getTR(e.target);
        if (!tr) return;
        var rowId = tr.dataset.rowId;
        var row   = _findRow(rowId);
        if (!row) return;

            // delete row
        var delRowBtn = e.target.closest ? e.target.closest('.pm-row-del-btn') : null;
        if (!delRowBtn && e.target.classList && e.target.classList.contains('pm-row-del-btn')) delRowBtn = e.target;
        if (delRowBtn) {
            _rows = _rows.filter(function(r) { return r.id !== rowId; });
            tr.parentNode.removeChild(tr);
            _renderEmptyIfNeeded();
            _refreshFooter();
            _save();
            return;
        }

        // add batch
        var addBtn = e.target.closest ? e.target.closest('[data-add]') : null;
        if (addBtn && addBtn.dataset.add) {
            var addType = addBtn.dataset.add;
            var prevState2 = _getState(row);
            _syncFromDOM(tr, row);
            if (addType === 'sl') {
                var sl  = row.stopLossBatches;
                var lkd = _lockedPct(sl);
                if (sl.length > 0) sl[sl.length - 1].pct = lkd;
                sl.push({ price: 0, pct: null });
            } else {
                var ex  = row.exitBatches;
                var lkd2 = _lockedPct(ex);
                if (ex.length > 0) ex[ex.length - 1].pct = lkd2;
                ex.push({ price: 0, pct: null });
            }
            _rebuildBatchCell(tr, row, addType);
            _rebuildExitCellIfStateChanged(tr, row, prevState2);
            _refreshFooter();
            _save();
            return;
        }

            // EX: add batch
        var delBatchBtn = e.target.closest ? e.target.closest('[data-del-type]') : null;
        if (delBatchBtn && delBatchBtn.dataset.delType) {
            var delType = delBatchBtn.dataset.delType;
            var bIdx    = parseInt(delBatchBtn.dataset.batch, 10);
            var prevState3 = _getState(row);
            _syncFromDOM(tr, row);
            if (delType === 'sl') {
                if (row.stopLossBatches.length > 1) {
                    row.stopLossBatches.splice(bIdx, 1);
                    row.stopLossBatches[row.stopLossBatches.length - 1].pct = null;
                }
            } else {
                if (row.exitBatches.length > 1) {
                    row.exitBatches.splice(bIdx, 1);
                    row.exitBatches[row.exitBatches.length - 1].pct = null;
                }
            }
            _rebuildBatchCell(tr, row, delType);
            _rebuildExitCellIfStateChanged(tr, row, prevState3);
            _refreshFooter();
            _save();
            return;
        }

            // delete batch
        var dirBtn = e.target.closest ? e.target.closest('.pm-direction-btn') : null;
        if (!dirBtn && e.target.classList && e.target.classList.contains('pm-direction-btn')) dirBtn = e.target;
        if (dirBtn) {
            _syncFromDOM(tr, row);
            row.direction = row.direction === 'short' ? 'long' : 'short';
            dirBtn.className = 'pm-direction-btn ' + row.direction;
            dirBtn.textContent = row.direction === 'short' ? '\u7a7a \u2193' : '\u591a \u2191';
            _updateOutputs(tr, row);
            _refreshFooter();
            _save();
            return;
        }
    }

    function _onTableChange(e) {
        var tr = _getTR(e.target);
        if (!tr) return;
        var row = _findRow(tr.dataset.rowId);
        if (!row) return;

        if (e.target.classList && e.target.classList.contains('pm-executed-cb')) {
            var prevState = _getState(row);
            _syncFromDOM(tr, row);
            row.executed = e.target.checked;
            _rebuildExitCellIfStateChanged(tr, row, prevState);
            _refreshFooter();
            _save();
        }
    }

    // ──────────────────────────────────────────────────────────
    // 8. 頁腳 / 渲染全部
    // ──────────────────────────────────────────────────────────

    function _createRowElement(row) {
        var tr = document.createElement('tr');
        tr.dataset.rowId = row.id;
        tr.innerHTML = _rowCellsHTML(row);
        return tr;
    }

    function _renderEmptyIfNeeded() {
        var tbody = document.getElementById('rm-tableBody');
        if (!tbody) return;
        if (_rows.length === 0) {
            tbody.innerHTML = '<tr class="pm-empty-row"><td colspan="8">\u9ede\u64ca\u300e\uff0b \u65b0\u589e\u6301\u80a1\u300f\u958b\u59cb\u898f\u5283\u4ea4\u6613</td></tr>';
        }
    }

    function _renderAllRows() {
        var tbody = document.getElementById('rm-tableBody');
        if (!tbody) return;
        if (_rows.length === 0) {
            _renderEmptyIfNeeded();
            return;
        }
        var frag = document.createDocumentFragment();
        _rows.forEach(function(row) { frag.appendChild(_createRowElement(row)); });
        tbody.innerHTML = '';
        tbody.appendChild(frag);
    }

    function _refreshFooter() {
        var calcs = _rows.map(function(r) { return _calc(r); });

        var totalCtrlPos = calcs.reduce(function(s, c) { return s + (c.ctrlPosPct  || 0); }, 0);
        var totalContrib = calcs.reduce(function(s, c) { return s + (c.accountContrib || 0); }, 0);

        var ctrlEl = document.getElementById('rm-foot-ctrlPos');
        if (ctrlEl) ctrlEl.textContent = _rows.length ? fmt.pct(totalCtrlPos) : '\u2014';

        var contribEl = document.getElementById('rm-foot-contrib');
        if (contribEl) {
            contribEl.textContent = _rows.length ? fmt.pctSign(totalContrib) : '\u2014';
            contribEl.style.color = _rows.length ? clr.pnl(totalContrib) : 'var(--text-muted)';
        }

        if (window.OverviewBlock) {
            window.OverviewBlock.update({ totalContrib: totalContrib, totalCtrlPos: totalCtrlPos, allCalcs: calcs });
        }
    }

    // ──────────────────────────────────────────────────────────
    // 9. Save / Load
    // ──────────────────────────────────────────────────────────

    function _save() {
        try { localStorage.setItem(LS_KEY, JSON.stringify(_rows)); } catch (_) {}
    }

    function _load() {
        try {
            var raw = localStorage.getItem(LS_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (_) { return null; }
    }

    // ──────────────────────────────────────────────────────────
    // 10. 公開 API
    // ──────────────────────────────────────────────────────────

    function recalcAll() {
        var tbody = document.getElementById('rm-tableBody');
        if (!tbody) return;
        Array.prototype.slice.call(tbody.querySelectorAll('tr[data-row-id]')).forEach(function(tr) {
            var row = _findRow(tr.dataset.rowId);
            if (row) _updateOutputs(tr, row);
        });
        _refreshFooter();
    }

    function addRow(data) {
        var defaults = {
            id: _uid(), executed: false, direction: 'long',
            ticker: '', avgPrice: 0, capitalPct: 5,
            stopLossBatches: [{ price: 0, pct: null }],
            exitBatches:     [{ price: 0, pct: null }],
        };
        var row = {};
        Object.keys(defaults).forEach(function(k) { row[k] = defaults[k]; });
        if (data) Object.keys(data).forEach(function(k) { row[k] = data[k]; });
        if (!row.id) row.id = _uid();

        if (!Array.isArray(row.stopLossBatches) || row.stopLossBatches.length === 0)
            row.stopLossBatches = [{ price: 0, pct: null }];
        else
            row.stopLossBatches[row.stopLossBatches.length - 1].pct = null;

        if (!Array.isArray(row.exitBatches) || row.exitBatches.length === 0)
            row.exitBatches = [{ price: 0, pct: null }];
        else
            row.exitBatches[row.exitBatches.length - 1].pct = null;

        _rows.push(row);

        var tbody = document.getElementById('rm-tableBody');
        if (tbody) {
            var empty = tbody.querySelector('.pm-empty-row');
            if (empty) empty.parentNode.removeChild(empty);
            tbody.appendChild(_createRowElement(row));
        }
        _refreshFooter();
        _save();
    }

    function exportCsv() {
        var headers = ['\u72c0\u614b','\u80a1\u7968\u4ee3\u78bc','\u65b9\u5411','\u8cb7\u5165\u5747\u50f9','\u9810\u8a08\u5009\u4f4d%',
            '\u505c\u640d\u6279\u6b21\u6578','\u5e73\u5747\u505c\u640d%','\u5efa\u8b70\u80a1\u6578','\u63a7\u98a8\u5009\u4f4d%',
            '\u51fa\u5834\u6279\u6b21\u6578','\u5e73\u5747\u640d\u76ca%','\u76c8\u8667\u6bd4','\u640d\u76ca\u91d1\u984d','\u5e33\u6236\u8ca2\u737b%'];
        var stateMap = { planned: '\u898f\u5283', holding: '\u6301\u5009', closed: '\u5df2\u7d50\u6848' };
        var rowData = _rows.map(function(r) {
            var c = _calc(r), s = _getState(r);
            return [stateMap[s], r.ticker, r.direction === 'short' ? '\u7a7a' : '\u591a',
                r.avgPrice, r.capitalPct, r.stopLossBatches.length,
                c.avgStopPct  != null ? c.avgStopPct.toFixed(2)  : '',
                c.sugShares   != null ? c.sugShares               : '',
                c.ctrlPosPct  != null ? c.ctrlPosPct.toFixed(2)  : '',
                r.exitBatches.length,
                c.avgPnlPct   != null ? c.avgPnlPct.toFixed(2)   : '',
                c.rrRatio     != null ? c.rrRatio.toFixed(2)     : '',
                c.plAmount    != null ? c.plAmount.toFixed(0)    : '',
                c.accountContrib != null ? c.accountContrib.toFixed(2) : ''];
        });
        var csv  = [headers].concat(rowData).map(function(r) { return r.join(','); }).join('\n');
        var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        var a    = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = '\u98a8\u96aa\u7ba1\u7406_' + new Date().toISOString().slice(0, 10) + '.csv';
        a.click();
        URL.revokeObjectURL(a.href);
    }

    var _initialized = false;
    function init() {
        if (_initialized) return;
        _initialized = true;

        var saved = _load();
        if (saved && saved.length > 0) {
            _rows = saved;
        } else {
            _rows = [
                { id: _uid(), executed: true,  direction: 'long',
                  ticker: 'NVDA', avgPrice: 850,  capitalPct: 10,
                  stopLossBatches: [{ price: 782, pct: 40 }, { price: 760, pct: 30 }, { price: 750, pct: null }],
                  exitBatches:     [{ price: 950, pct: 50 }, { price: 1000, pct: null }] },
                { id: _uid(), executed: false, direction: 'long',
                  ticker: 'AAPL', avgPrice: 225,  capitalPct: 15,
                  stopLossBatches: [{ price: 213, pct: null }],
                  exitBatches:     [{ price: 0,   pct: null }] },
            ];
        }

        _renderAllRows();
        _refreshFooter();

        if (!_listenerAttached) {
            var tbody = document.getElementById('rm-tableBody');
            if (tbody) {
                tbody.addEventListener('input',  _onTableInput);
                tbody.addEventListener('click',  _onTableClick);
                tbody.addEventListener('change', _onTableChange);
                _listenerAttached = true;
            }
        }

        var addBtn = document.getElementById('rm-addRowBtn');
        if (addBtn) addBtn.addEventListener('click', function() { addRow({}); });

        var expBtn = document.getElementById('rm-exportCsvBtn');
        if (expBtn) expBtn.addEventListener('click', exportCsv);
    }

    return { init: init, addRow: addRow, recalcAll: recalcAll, exportCsv: exportCsv };
})();
