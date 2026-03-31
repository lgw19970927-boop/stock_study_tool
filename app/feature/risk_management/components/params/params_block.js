/**
 * App/Feature/RiskManagement/function_block/params_block.js
 * 頂部風險參數設定區塊：初始資金 & 單筆停損%
 * 提供 RiskParams 全域物件供其他模組讀取
 */

window.RiskParams = (function () {
    'use strict';

    const LS_KEY = 'rm-risk-params-v1';
    const DEFAULT_CAPITAL = 1000000;
    const DEFAULT_RISK_PCT = 1.0;

    let _capital = DEFAULT_CAPITAL;   // 初始資金
    let _riskPct = DEFAULT_RISK_PCT;  // 單筆停損 %

    function _parseCapital(str) {
        const v = parseFloat(String(str).replace(/,/g, ''));
        return (!isNaN(v) && v > 0) ? v : DEFAULT_CAPITAL;
    }

    function _parsePct(str) {
        const v = parseFloat(str);
        return (!isNaN(v) && v > 0) ? v : DEFAULT_RISK_PCT;
    }

    function _formatCapital(value) {
        const safe = (!isNaN(value) && value > 0) ? Math.round(value) : DEFAULT_CAPITAL;
        return safe.toLocaleString('en-US');
    }

    function _formatPct(value) {
        const safe = (!isNaN(value) && value > 0) ? value : DEFAULT_RISK_PCT;
        return safe.toFixed(2).replace(/\.00$/, '.0').replace(/(\.\d)0$/, '$1');
    }

    function _saveToStorage() {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify({
                capital: _capital,
                riskPct: _riskPct
            }));
        } catch (_) {}
    }

    function _loadFromStorage() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return;

            const data = JSON.parse(raw);
            if (data && typeof data === 'object') {
                if (typeof data.capital === 'number' && data.capital > 0) {
                    _capital = data.capital;
                }
                if (typeof data.riskPct === 'number' && data.riskPct > 0) {
                    _riskPct = data.riskPct;
                }
            }
        } catch (_) {}
    }

    function _bindCapitalFormatter(capEl) {
        if (!capEl) return;

        capEl.addEventListener('input', () => {
            const value = capEl.value;
            const cursor = capEl.selectionStart || value.length;
            const digitsBeforeCursor = value.slice(0, cursor).replace(/\D/g, '').length;
            const digits = value.replace(/\D/g, '');

            if (!digits) {
                capEl.value = '';
                return;
            }

            const formatted = Number(digits).toLocaleString('en-US');
            capEl.value = formatted;

            let next = formatted.length;
            let seenDigits = 0;
            for (let i = 0; i < formatted.length; i++) {
                if (/\d/.test(formatted[i])) {
                    seenDigits++;
                }
                if (seenDigits >= digitsBeforeCursor) {
                    next = i + 1;
                    break;
                }
            }
            capEl.setSelectionRange(next, next);

            _capital = _parseCapital(formatted);
            _saveToStorage();
        });

        capEl.addEventListener('blur', () => {
            _capital = _parseCapital(capEl.value);
            capEl.value = _formatCapital(_capital);
            _saveToStorage();
        });
    }

    /** 從 DOM 讀取最新參數 */
    function read() {
        const capEl = document.getElementById('rm-capitalInput');
        const riskEl = document.getElementById('rm-riskPctInput');

        if (capEl) {
            _capital = _parseCapital(capEl.value);
            capEl.value = _formatCapital(_capital);
        }
        if (riskEl) {
            _riskPct = _parsePct(riskEl.value);
            riskEl.value = _formatPct(_riskPct);
        }

        _saveToStorage();
    }

    /** 取得目前資金 */
    function capital() { return _capital; }

    /** 取得單筆停損 % */
    function riskPct() { return _riskPct; }

    /** 初始化：綁定「更新計算」與 Enter 快捷鍵 */
    function init(onRecalc) {
        const recalcBtn = document.getElementById('rm-recalcBtn');
        const capEl     = document.getElementById('rm-capitalInput');
        const riskEl    = document.getElementById('rm-riskPctInput');

        _loadFromStorage();

        if (capEl) capEl.value = _formatCapital(_capital);
        if (riskEl) riskEl.value = _formatPct(_riskPct);

        _bindCapitalFormatter(capEl);

        if (riskEl) {
            riskEl.addEventListener('input', () => {
                _riskPct = _parsePct(riskEl.value);
                _saveToStorage();
            });

            riskEl.addEventListener('blur', () => {
                _riskPct = _parsePct(riskEl.value);
                riskEl.value = _formatPct(_riskPct);
                _saveToStorage();
            });
        }

        function _triggerRecalc() {
            read();
            document.dispatchEvent(new CustomEvent('rm-params-updated'));
            onRecalc();
        }

        if (recalcBtn) {
            recalcBtn.addEventListener('click', _triggerRecalc);
        }
        [capEl, riskEl].forEach(el => {
            if (!el) return;
            el.addEventListener('keydown', e => {
                if (e.key === 'Enter') _triggerRecalc();
            });
        });
    }

    return { init, read, capital, riskPct };
})();
