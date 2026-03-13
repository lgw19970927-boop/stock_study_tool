/**
 * App/Feature/RiskManagement/function_block/portfolio_block.js
 * 投資組合風險明細表格 — 核心計算邏輯
 *
 * 公式依據 Spec/資金與風險管理/資金與風控分頁.docx：
 *   平均停損%   = ( (均價-停損1)/均價 + (均價-停損2)/均價 ) / 2
 *   建議股數    = (初始資金 × 單筆停損%) ÷ (買入均價 × 平均停損%)
 *   控風倉位%   = 建議股數 × 買入均價 ÷ 初始資金
 *   單筆損益%   = 出場1損益% × 出場1占比% + 出場2損益% × 出場2占比%
 *   倉位潛在風險 = 平均停損% × 控風倉位%
 *   帳戶總風險  = Σ 倉位潛在風險
 *
 * 依賴：RiskParams、OverviewBlock
 */

window.PortfolioBlock = (function () {
    'use strict';

    let _rowSeq = 0;  // 列 ID 計數器

    // ── 格式化工具 ──
    const fmtNum   = n => (n == null || isNaN(n)) ? '—'
        : n.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const fmtPct   = (n, d = 2) => (n == null || isNaN(n)) ? '—' : n.toFixed(d) + '%';
    const fmtPctSign = (n, d = 2) => (n == null || isNaN(n)) ? '—'
        : (n >= 0 ? '+' : '') + n.toFixed(d) + '%';

    // ── 核心計算（依 docx 公式） ──
    function _calc(d) {
        const capital  = window.RiskParams ? window.RiskParams.capital() : 1000000;
        const riskPct  = window.RiskParams ? window.RiskParams.riskPct() : 1.0;

        // 平均停損% = 兩個停損位到買入均價距離的平均（各佔一半）
        const sl1Pct = d.entryPrice > 0 ? (d.entryPrice - d.sl1) / d.entryPrice * 100 : 0;
        const sl2Pct = d.entryPrice > 0 ? (d.entryPrice - d.sl2) / d.entryPrice * 100 : 0;
        const avgSlPct = (sl1Pct + sl2Pct) / 2;

        // 控制停損後購買股數 = (初始資金 × 單筆停損%) ÷ (買入均價 × 平均停損%)
        const riskAmt  = capital * (riskPct / 100);
        const sugShares = (d.entryPrice > 0 && avgSlPct > 0)
            ? Math.floor(riskAmt / (d.entryPrice * (avgSlPct / 100)))
            : 0;

        // 控制風險後倉位比例 = 建議股數 × 買入均價 ÷ 初始資金
        const ctrlPositionPct = capital > 0 && sugShares > 0
            ? (sugShares * d.entryPrice / capital) * 100
            : 0;

        // 出場損益% = (出場價 - 買入均價) / 買入均價 × 100
        const pnl1 = d.entryPrice > 0 ? (d.exit1 - d.entryPrice) / d.entryPrice * 100 : 0;
        const pnl2 = d.entryPrice > 0 ? (d.exit2 - d.entryPrice) / d.entryPrice * 100 : 0;

        // 單筆實際平均損益% = 加權平均
        const exit1W  = (d.exit1Pct || 0) / 100;
        const exit2W  = (d.exit2Pct || 0) / 100;
        const avgPnl  = pnl1 * exit1W + pnl2 * exit2W;

        // 倉位潛在風險 = 平均停損% × 控制風險後倉位比例
        const posRisk = avgSlPct * (ctrlPositionPct / 100);

        return { avgSlPct, sugShares, ctrlPositionPct, avgPnl, posRisk };
    }

    // ── 色彩判斷 ──
    function _slColor(pct)   { return pct > 10 ? '#f87171' : pct > 5 ? '#fbbf24' : '#00d4aa'; }
    function _riskColor(pct) { return pct > 2  ? '#f87171' : pct > 1.5 ? '#fbbf24' : '#00d4aa'; }
    function _pnlColor(pct)  { return pct >= 0 ? '#00d4aa' : '#f87171'; }

    // ── 從列 DOM 讀取資料 ──
    function _readRow(tr) {
        const v = cls => parseFloat(tr.querySelector('.' + cls)?.value || '0') || 0;
        const s = cls => tr.querySelector('.' + cls)?.value?.trim() || '';
        return {
            ticker:     s('rm-f-ticker'),
            entryPrice: v('rm-f-entry'),
            positionPct:v('rm-f-pos'),
            sl1:        v('rm-f-sl1'),
            sl2:        v('rm-f-sl2'),
            exit1:      v('rm-f-exit1'),
            exit2:      v('rm-f-exit2'),
            exit1Pct:   v('rm-f-exit1pct'),
            exit2Pct:   v('rm-f-exit2pct'),
        };
    }

    // ── 建立輸入框 HTML ──
    function _inp(type, val, cls, w = '56px', step = 'any') {
        return `<input type="${type}" class="rm-row-input ${cls}" value="${val}" step="${step}" style="width:${w};min-width:${w};">`;
    }

    // ── 建立一列 DOM ──
    function _createRow(data) {
        const id   = _rowSeq++;
        const calc = _calc(data);
        const tr   = document.createElement('tr');
        tr.dataset.rowId = id;

        const slC   = _slColor(calc.avgSlPct);
        const riskC = _riskColor(calc.posRisk);
        const pnlC  = _pnlColor(calc.avgPnl);

        tr.innerHTML = `
            <td>${_inp('text', data.ticker, 'rm-f-ticker', '88px')}</td>
            <td>${_inp('number', data.entryPrice, 'rm-f-entry')}</td>
            <td style="display:flex;align-items:center;gap:3px;">
                ${_inp('number', data.positionPct, 'rm-f-pos', '46px')}
                <span class="text-muted" style="font-size:.78rem;">%</span>
            </td>
            <td>${_inp('number', data.sl1, 'rm-f-sl1')}</td>
            <td>${_inp('number', data.sl2, 'rm-f-sl2')}</td>
            <td class="col-calc" style="text-align:center;color:${slC};font-weight:600;">
                <span class="rm-c-slPct">${fmtPct(calc.avgSlPct)}</span>
            </td>
            <td class="col-calc" style="text-align:center;font-weight:700;">
                <span class="rm-c-sugShares">${fmtNum(calc.sugShares)}</span>
            </td>
            <td class="col-calc" style="text-align:center;">
                <span class="rm-c-ctrlPos">${fmtPct(calc.ctrlPositionPct)}</span>
            </td>
            <td>${_inp('number', data.exit1, 'rm-f-exit1')}</td>
            <td>${_inp('number', data.exit2, 'rm-f-exit2')}</td>
            <td style="display:flex;align-items:center;gap:3px;">
                ${_inp('number', data.exit1Pct, 'rm-f-exit1pct', '40px')}
                <span class="text-muted" style="font-size:.78rem;">%</span>
            </td>
            <td>
                <div style="display:flex;align-items:center;gap:3px;">
                    ${_inp('number', data.exit2Pct, 'rm-f-exit2pct', '40px')}
                    <span class="text-muted" style="font-size:.78rem;">%</span>
                </div>
            </td>
            <td class="col-calc" style="text-align:center;color:${pnlC};font-weight:600;">
                <span class="rm-c-avgPnl">${fmtPctSign(calc.avgPnl)}</span>
            </td>
            <td class="col-risk" style="text-align:center;font-weight:700;color:${riskC};">
                <span class="rm-c-posRisk">${fmtPct(calc.posRisk)}</span>
            </td>
            <td style="text-align:center;">
                <button class="btn-danger rm-del-btn" title="刪除此列">✕</button>
            </td>
        `;

        // 即時重算
        tr.querySelectorAll('.rm-row-input').forEach(inp => {
            inp.addEventListener('input',  () => { _refreshRow(tr); _refreshFooter(); });
            inp.addEventListener('change', () => { _refreshRow(tr); _refreshFooter(); });
        });
        // 刪除
        tr.querySelector('.rm-del-btn').addEventListener('click', () => {
            tr.remove();
            _refreshFooter();
        });

        return tr;
    }

    // ── 更新單列計算欄 ──
    function _refreshRow(tr) {
        const data = _readRow(tr);
        const calc = _calc(data);
        const slC   = _slColor(calc.avgSlPct);
        const riskC = _riskColor(calc.posRisk);
        const pnlC  = _pnlColor(calc.avgPnl);

        const set = (cls, val, color) => {
            const el = tr.querySelector(cls);
            if (!el) return;
            el.textContent = val;
            if (color) el.style.color = color;
        };

        set('.rm-c-slPct',     fmtPct(calc.avgSlPct),         slC);
        set('.rm-c-sugShares', fmtNum(calc.sugShares));
        set('.rm-c-ctrlPos',   fmtPct(calc.ctrlPositionPct));
        set('.rm-c-avgPnl',    fmtPctSign(calc.avgPnl),        pnlC);
        set('.rm-c-posRisk',   fmtPct(calc.posRisk),           riskC);

        // 更新 td 背景色（col-risk 欄的文字顏色）
        const riskTd = tr.querySelector('.rm-c-posRisk')?.closest('td');
        if (riskTd) riskTd.style.color = riskC;
    }

    // ── 更新頁尾合計列 ──
    function _refreshFooter() {
        const rows = Array.from(document.querySelectorAll('#rm-tableBody tr'))
            .map(tr => _calc(_readRow(tr)));

        const totalCtrlPos = rows.reduce((s, c) => s + c.ctrlPositionPct, 0);
        const totalRisk    = rows.reduce((s, c) => s + c.posRisk, 0);
        const avgPnl       = rows.length ? rows.reduce((s, c) => s + c.avgPnl, 0) / rows.length : 0;

        const set = (id, val, color) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = val;
            if (color) el.style.color = color;
        };

        set('rm-foot-ctrlPos', rows.length ? fmtPct(totalCtrlPos) : '—');
        set('rm-foot-avgPnl',  rows.length ? fmtPctSign(avgPnl)   : '—');
        set('rm-foot-risk',    rows.length ? fmtPct(totalRisk)     : '—',
            rows.length ? _riskColor(totalRisk) : undefined);

        // 通知概覽卡片更新
        if (window.OverviewBlock) {
            window.OverviewBlock.update(totalRisk, totalCtrlPos);
        }
    }

    // ── 公開：全域重算（換參數後呼叫） ──
    function recalcAll() {
        document.querySelectorAll('#rm-tableBody tr').forEach(tr => _refreshRow(tr));
        _refreshFooter();
    }

    // ── 公開：新增一列 ──
    function addRow(data) {
        const defaults = {
            ticker: '', entryPrice: 0, positionPct: 5,
            sl1: 0, sl2: 0, exit1: 0, exit2: 0,
            exit1Pct: 50, exit2Pct: 50,
        };
        const tbody = document.getElementById('rm-tableBody');
        if (tbody) tbody.appendChild(_createRow(Object.assign({}, defaults, data)));
    }

    // ── 公開：匯出 CSV ──
    function exportCsv() {
        const headers = [
            '持股', '買入均價', '預計倉位%',
            '停損價位1', '停損價位2', '平均停損%',
            '建議股數', '控風倉位%',
            '出場價位1', '出場價位2', '出場1比例%', '出場2比例%',
            '平均損益%', '倉位潛在風險%',
        ];
        const rows = Array.from(document.querySelectorAll('#rm-tableBody tr')).map(tr => {
            const d = _readRow(tr);
            const c = _calc(d);
            return [
                d.ticker, d.entryPrice, d.positionPct,
                d.sl1, d.sl2, c.avgSlPct.toFixed(2),
                c.sugShares, c.ctrlPositionPct.toFixed(2),
                d.exit1, d.exit2, d.exit1Pct, d.exit2Pct,
                c.avgPnl.toFixed(2), c.posRisk.toFixed(2),
            ];
        });
        const csv  = [headers, ...rows].map(r => r.join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const a    = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = '風險管理_' + new Date().toISOString().slice(0, 10) + '.csv';
        a.click();
    }

    // ── 公開：初始化 ──
    let _initialized = false;
    function init() {
        if (_initialized) return;
        _initialized = true;

        const DEFAULT_ROWS = [
            { ticker: 'AAPL.US', entryPrice: 225, positionPct: 15.0,
              sl1: 213, sl2: 208, exit1: 248, exit2: 270, exit1Pct: 50, exit2Pct: 50 },
            { ticker: 'NVDA.US', entryPrice: 850, positionPct: 10.0,
              sl1: 782, sl2: 760, exit1: 950, exit2: 1000, exit1Pct: 60, exit2Pct: 40 },
        ];

        DEFAULT_ROWS.forEach(r => addRow(r));
        _refreshFooter();

        // 新增列
        const addBtn = document.getElementById('rm-addRowBtn');
        if (addBtn) addBtn.addEventListener('click', () => { addRow({}); _refreshFooter(); });

        // 匯出 CSV
        const expBtn = document.getElementById('rm-exportCsvBtn');
        if (expBtn) expBtn.addEventListener('click', exportCsv);
    }

    return { init, addRow, recalcAll, exportCsv };
})();
