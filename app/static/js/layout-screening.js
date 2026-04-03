/**
 * Legacy compatibility entry for /static/js/layout-screening.js.
 *
 * GoldenLayout integration for screening is handled by feature-level scripts.
 * Keep this file so old references do not return 404.
 */
window.ScreeningLayout = window.ScreeningLayout || {
    toggleSidebar() {
        const sidebar = document.getElementById("app-sidebar");
        if (!sidebar) return;
        sidebar.classList.toggle("is-hidden");
    },
};
