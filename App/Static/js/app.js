/**
 * StockFilter PRO - Shared Application Logic
 * Handles Navigation and Global Utilities
 */

var App = {
    init: function () {
        console.log('App Initializing...');
        this.bindEvents();
    },

    bindEvents: function () {
        // Navigation logic removed - handled by HTMX and layout.js now.
    }
};

// ====== HTMX 相容初始化邏輯 ======
window.initApp = function () {
    App.init();
};

// 1. 正常全頁面載入
document.addEventListener('DOMContentLoaded', window.initApp);

// 2. HTMX 動態載入
document.addEventListener('htmx:afterSettle', window.initApp);

// 3. 若 JS 被動態載入且 DOMContentLoaded 已觸發過
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    window.initApp();
}
