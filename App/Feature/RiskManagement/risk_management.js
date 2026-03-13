/**
 * App/Feature/RiskManagement/risk_management.js
 * 資金與風險管理分頁主控制器
 * 初始化各子模組：RiskParams → OverviewBlock → PortfolioBlock
 */

(function () {
    'use strict';

    function init() {
        // 1. 初始化參數區塊，並串接「更新計算」→ 全域重算
        if (window.RiskParams) {
            window.RiskParams.init(function onRecalc() {
                if (window.PortfolioBlock) window.PortfolioBlock.recalcAll();
            });
        }

        // 2. 初始化投資組合表格（已含概覽更新）
        if (window.PortfolioBlock) {
            window.PortfolioBlock.init();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
