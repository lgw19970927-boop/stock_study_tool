/**
 * App/Static/js/layout-screening.js
 * Screening 頁面佈局管理
 *
 * TODO [P1-Step2]: GoldenLayout v2 正式實作
 *   - 此檔案目前為「純 CSS content-area 佈局」暫行版本，GoldenLayout 邏輯已暫停
 *   - GoldenLayout v2 實作時，需重寫 init()、registerComponent() 等邏輯
 *   - 參考：https://golden-layout.com/docs/2.6/
 *
 * 目前版本：
 *   - sidebar toggle 由 layout.js 的 LayoutManager 直接操作 #app-sidebar
 *   - 此處僅保留 window.ScreeningLayout 殼，避免 layout.js 呼叫時報錯
 */

window.ScreeningLayout = {
    /**
     * 切換 sidebar 展開/收合（Fallback）
     * 正常情況下 layout.js LayoutManager.toggleSidebar() 直接操作 #app-sidebar，
     * 此方法作為保險備用
     */
    toggleSidebar() {
        const sidebar = document.getElementById('app-sidebar');
        if (!sidebar) return;
        const isHidden = sidebar.style.display === 'none';
        sidebar.style.display = isHidden ? '' : 'none';
    }
};
