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
     * @param {number} totalRisk    帳戶總風險 %
     * @param {number} totalUsage   資金使用率 %（控制風險後倉位比例 加總）
     * @param {number} totalLossPct 全失敗停損損失 %（= totalRisk）
     */
    function update(totalRisk, totalUsage) {
        const capital  = window.RiskParams ? window.RiskParams.capital() : 1000000;
        const maxLoss  = -(capital * totalRisk / 100);
        const remaining = capital + maxLoss;

        // 帳戶總風險
        const riskEl = $('rm-ov-totalRisk');
        if (riskEl) {
            riskEl.textContent = _fmtPct(totalRisk);
            riskEl.style.color = totalRisk <= 1 ? '#00d4aa'
                               : totalRisk <= 2 ? '#00d4aa'
                               : totalRisk <= 4 ? '#fbbf24' : '#f87171';
        }
        const riskLabelEl = $('rm-ov-riskLabel');
        if (riskLabelEl) {
            riskLabelEl.textContent = totalRisk <= 1 ? '低風險範圍'
                                    : totalRisk <= 2 ? '中度風險'
                                    : totalRisk <= 4 ? '⚠ 偏高風險' : '🔴 高風險';
            riskLabelEl.style.color = totalRisk <= 2 ? '#00d4aa'
                                    : totalRisk <= 4 ? '#fbbf24' : '#f87171';
        }

        // 全失敗停損金額
        const lossEl = $('rm-ov-maxLoss');
        if (lossEl) {
            lossEl.textContent = _fmtMoney(maxLoss);
            lossEl.style.color = maxLoss < 0 ? '#f87171' : '#00d4aa';
        }

        // 停損後剩餘資金
        const remEl = $('rm-ov-remaining');
        if (remEl) remEl.textContent = _fmtMoneyAbs(remaining);

        // 資金使用率
        const usageEl  = $('rm-ov-usage');
        const barEl    = $('rm-ov-usageBar');
        if (usageEl) usageEl.textContent = _fmtPct(totalUsage);
        if (barEl)   barEl.style.width   = Math.min(Math.max(totalUsage, 0), 100) + '%';
    }

    return { update };
})();
