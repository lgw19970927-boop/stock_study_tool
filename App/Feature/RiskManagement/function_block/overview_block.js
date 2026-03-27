/**
 * App/Feature/RiskManagement/function_block/overview_block.js
 * 概覽卡片區塊：帳戶總風險、全失敗停損金額、停損後剩餘資金、資金使用率
 * 依賴：RiskParams（已於 params_block.js 定義）
 */

window.OverviewBlock = (function () {
    'use strict';

    const $ = id => document.getElementById(id);

    function _fmtPct(n, d = 2) {
        return (n == null || isNaN(n)) ? '—' : n.toFixed(d) + '%';
    }
    function _fmtMoney(n) {
        if (n == null || isNaN(n)) return '—';
        const abs = Math.abs(n).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        return (n >= 0 ? '+$' : '-$') + abs;
    }
    function _fmtMoneyAbs(n) {
        if (n == null || isNaN(n)) return '—';
        return '$' + Math.abs(n).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    /**
     * 更新概覽卡片
     * @param {object} data
     *   data.totalContrib   {number}  Σ 各列帳戶貢獻% (正=獲利, 負=風險)
     *   data.totalCtrlPos   {number}  Σ 各列控風倉位%
     *   data.allCalcs       {Array}   各列 calc 結果（用於全失敗停損計算）
     */
    function update(data) {
        const totalContrib = (data && data.totalContrib != null) ? data.totalContrib : 0;
        const totalCtrlPos = (data && data.totalCtrlPos != null) ? data.totalCtrlPos : 0;
        const allCalcs     = (data && data.allCalcs) ? data.allCalcs : [];

        const capital = window.RiskParams ? window.RiskParams.capital() : 1000000;

        // 全失敗停損總金額 = Σ (avgStopPct/100 × ctrlPosPct/100 × Capital)
        const totalStopLossAmt = allCalcs.reduce((s, c) => {
            if (c.avgStopPct != null && c.ctrlPosPct != null) {
                return s + (c.avgStopPct / 100) * (c.ctrlPosPct / 100) * capital;
            }
            return s;
        }, 0);
        const remaining = capital + totalStopLossAmt;

        // 帳戶總風險（帳戶貢獻加總，含正負值）
        const riskEl = $('rm-ov-totalRisk');
        if (riskEl) {
            riskEl.textContent = _fmtPct(Math.abs(totalContrib));
            riskEl.style.color = totalContrib >= 0 ? '#00d4aa'
                               : Math.abs(totalContrib) <= 2 ? '#00d4aa'
                               : Math.abs(totalContrib) <= 4 ? '#fbbf24' : '#f87171';
        }
        const riskLabelEl = $('rm-ov-riskLabel');
        if (riskLabelEl) {
            const absVal = Math.abs(totalContrib);
            if (totalContrib >= 0) {
                riskLabelEl.textContent = '淨正貢獻';
                riskLabelEl.style.color = '#00d4aa';
            } else if (absVal <= 2) {
                riskLabelEl.textContent = '低風險範圍';
                riskLabelEl.style.color = '#00d4aa';
            } else if (absVal <= 4) {
                riskLabelEl.textContent = '⚠ 偏高風險';
                riskLabelEl.style.color = '#fbbf24';
            } else {
                riskLabelEl.textContent = '🔴 高風險';
                riskLabelEl.style.color = '#f87171';
            }
        }

        // 全失敗停損金額
        const lossEl = $('rm-ov-maxLoss');
        if (lossEl) {
            lossEl.textContent = _fmtMoney(totalStopLossAmt);
            lossEl.style.color = totalStopLossAmt < 0 ? '#f87171' : '#00d4aa';
        }

        // 停損後剩餘資金
        const remEl = $('rm-ov-remaining');
        if (remEl) remEl.textContent = _fmtMoneyAbs(remaining);

        // 資金使用率
        const usageEl = $('rm-ov-usage');
        const barEl   = $('rm-ov-usageBar');
        if (usageEl) usageEl.textContent = _fmtPct(totalCtrlPos);
        if (barEl)   barEl.style.width   = Math.min(Math.max(totalCtrlPos, 0), 100) + '%';
    }

    return { update };
})();
