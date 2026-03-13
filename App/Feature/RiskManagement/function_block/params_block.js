/**
 * App/Feature/RiskManagement/function_block/params_block.js
 * 頂部風險參數設定區塊：初始資金 & 單筆停損%
 * 提供 RiskParams 全域物件供其他模組讀取
 */

window.RiskParams = (function () {
    'use strict';

    let _capital = 1000000;   // 初始資金
    let _riskPct = 1.0;       // 單筆停損 %

    function _parseCapital(str) {
        return parseFloat(String(str).replace(/,/g, '')) || 1000000;
    }
    function _parsePct(str) {
        const v = parseFloat(str);
        return (!isNaN(v) && v > 0) ? v : 1.0;
    }

    /** 從 DOM 讀取最新參數 */
    function read() {
        const capEl = document.getElementById('rm-capitalInput');
        const riskEl = document.getElementById('rm-riskPctInput');
        if (capEl)  _capital = _parseCapital(capEl.value);
        if (riskEl) _riskPct = _parsePct(riskEl.value);
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

        if (recalcBtn) {
            recalcBtn.addEventListener('click', () => { read(); onRecalc(); });
        }
        [capEl, riskEl].forEach(el => {
            if (!el) return;
            el.addEventListener('keydown', e => {
                if (e.key === 'Enter') { read(); onRecalc(); }
            });
        });
    }

    return { init, read, capital, riskPct };
})();
