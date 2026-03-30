/**
 * Chart Settings Modal HTML Template
 * 圖表管理彈窗的 HTML 結構
 */
var ChartSettingsModalTemplate = `
<!-- ========== 圖表管理彈窗 ========== -->
<div id="chartSettingsModal" class="chart-modal-overlay is-hidden fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-[4px] [animation:fadeIn_0.2s_ease] pointer-events-none">
    <div class="chart-modal-container pointer-events-auto flex h-[70vh] max-h-[700px] w-[90%] max-w-[1000px] flex-col rounded-lg border border-border-color bg-bg-elevated shadow-lg [animation:slideUp_0.3s_ease]">
        <!-- 彈窗標題 -->
        <div class="chart-modal-header flex cursor-move select-none items-center justify-between border-b border-border-color px-6 py-4">
            <div class="modal-title flex items-center gap-2 text-lg font-semibold text-text-primary">
                <svg class="text-accent-primary" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path
                        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z">
                    </path>
                </svg>
                圖表管理
            </div>
            <button class="btn-modal-close flex h-8 w-8 items-center justify-center rounded-sm border-0 bg-transparent text-[1.75rem] leading-none text-text-secondary transition-colors duration-fast hover:bg-bg-hover hover:text-text-primary" id="btnCloseModalX">×</button>
        </div>

        <!-- Tab 切換 -->
        <div class="chart-modal-tabs flex border-b border-border-color bg-bg-secondary px-6">
            <button class="chart-tab-btn border-0 border-b-2 border-b-transparent bg-transparent px-4 py-2 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-white/5 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:text-text-muted" data-tab="general">常規設定</button>
            <button class="chart-tab-btn border-0 border-b-2 border-b-transparent bg-transparent px-4 py-2 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-white/5 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:text-text-muted" data-tab="axis">坐標軸</button>
            <button class="chart-tab-btn active border-0 border-b-2 border-b-transparent bg-transparent px-4 py-2 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-white/5 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:text-text-muted" data-tab="indicators">指標管理</button>
            <button class="chart-tab-btn border-0 border-b-2 border-b-transparent bg-transparent px-4 py-2 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-white/5 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:text-text-muted" data-tab="patterns">型態管理</button>
        </div>

        <!-- 彈窗主體 -->
        <div class="chart-modal-body flex flex-1 overflow-hidden">
            <!-- 左側：指標列表 -->
            <div class="chart-modal-sidebar w-[180px] overflow-y-auto border-r border-border-color bg-bg-secondary p-2">
                <!-- 主圖指標 -->
                <div class="indicator-category mb-4">
                    <div class="category-header flex select-none items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-[0.5px] text-text-secondary">
                        <svg class="transition-transform duration-fast" width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                            <path d="M2 4 L6 8 L10 4 Z"></path>
                        </svg>
                        主圖
                    </div>
                    <div class="indicator-items mt-1 flex flex-col gap-[2px]">
                        <div class="indicator-item flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1 text-[0.875rem] text-text-primary transition-all duration-fast hover:bg-bg-hover" data-indicator="ma">
                            <input type="checkbox" id="ma-toggle" checked>
                            <span>MA</span>
                        </div>
                        <div class="indicator-item flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1 text-[0.875rem] text-text-primary transition-all duration-fast hover:bg-bg-hover" data-indicator="boll">
                            <input type="checkbox" id="boll-toggle">
                            <span>BOLL</span>
                        </div>
                        <div class="indicator-item disabled flex cursor-not-allowed select-none items-center gap-2 rounded-sm px-2 py-1 text-[0.875rem] text-text-muted opacity-50 hover:bg-transparent">
                            <input type="checkbox" disabled>
                            <span>EMA</span>
                        </div>
                        <div class="indicator-item disabled flex cursor-not-allowed select-none items-center gap-2 rounded-sm px-2 py-1 text-[0.875rem] text-text-muted opacity-50 hover:bg-transparent">
                            <input type="checkbox" disabled>
                            <span>SAR</span>
                        </div>
                        <div class="indicator-item disabled flex cursor-not-allowed select-none items-center gap-2 rounded-sm px-2 py-1 text-[0.875rem] text-text-muted opacity-50 hover:bg-transparent">
                            <input type="checkbox" disabled>
                            <span>CDP</span>
                        </div>
                        <div class="indicator-item disabled flex cursor-not-allowed select-none items-center gap-2 rounded-sm px-2 py-1 text-[0.875rem] text-text-muted opacity-50 hover:bg-transparent">
                            <input type="checkbox" disabled>
                            <span>IC</span>
                        </div>
                        <div class="indicator-item disabled flex cursor-not-allowed select-none items-center gap-2 rounded-sm px-2 py-1 text-[0.875rem] text-text-muted opacity-50 hover:bg-transparent">
                            <input type="checkbox" disabled>
                            <span>KC</span>
                        </div>
                        <div class="indicator-item disabled flex cursor-not-allowed select-none items-center gap-2 rounded-sm px-2 py-1 text-[0.875rem] text-text-muted opacity-50 hover:bg-transparent">
                            <input type="checkbox" disabled>
                            <span>神奇九轉</span>
                        </div>
                        <div class="indicator-item disabled flex cursor-not-allowed select-none items-center gap-2 rounded-sm px-2 py-1 text-[0.875rem] text-text-muted opacity-50 hover:bg-transparent">
                            <input type="checkbox" disabled>
                            <span>VWAP</span>
                        </div>
                    </div>
                </div>

                <!-- 副圖指標 -->
                <div class="indicator-category mb-4">
                    <div class="category-header flex select-none items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-[0.5px] text-text-secondary">
                        <svg class="transition-transform duration-fast" width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                            <path d="M2 4 L6 8 L10 4 Z"></path>
                        </svg>
                        副圖
                    </div>
                    <div class="indicator-items mt-1 flex flex-col gap-[2px]">
                        <div class="indicator-item disabled flex cursor-not-allowed select-none items-center gap-2 rounded-sm px-2 py-1 text-[0.875rem] text-text-muted opacity-50 hover:bg-transparent">
                            <input type="checkbox" disabled>
                            <span>換手率</span>
                        </div>
                        <div class="indicator-item disabled flex cursor-not-allowed select-none items-center gap-2 rounded-sm px-2 py-1 text-[0.875rem] text-text-muted opacity-50 hover:bg-transparent">
                            <input type="checkbox" disabled>
                            <span>MI</span>
                        </div>
                    </div>
                </div>

                <!-- 型態管理側邊欄（切換 patterns tab 時顯示）-->
                <div class="indicator-category pattern-sidebar-section is-hidden mb-4">
                    <div class="category-header flex select-none items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-[0.5px] text-text-secondary">型態</div>
                    <div class="indicator-items mt-1 flex flex-col gap-[2px]" id="patternSidebarItems">
                        <!-- 由 JS 動態生成 -->
                    </div>
                </div>
            </div>

            <!-- 右側：動態設定面板 -->
            <div class="chart-modal-content flex-1 overflow-y-auto bg-bg-elevated p-6">
                <div id="settingsPanelContainer">
                    <!-- 由 JavaScript 動態生成 -->
                    <div class="settings-placeholder flex h-full flex-col items-center justify-center text-text-muted">
                        <svg class="mb-4 opacity-30" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="1.5">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                        </svg>
                        <p class="text-sm">請選擇左側的指標類型</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- 彈窗底部按鈕 -->
        <div class="chart-modal-footer flex justify-end gap-2 border-t border-border-color bg-bg-secondary px-6 py-4">
            <button class="btn btn-ghost" id="btnCancelSettings">取消</button>
            <button class="btn btn-primary" id="btnApplySettings">確定</button>
        </div>
    </div>
</div>
`;

// 強制替換舊有 DOM（確保 HTMX 切換後模板始終最新）
const _existingChartModal = document.getElementById('chartSettingsModal');
if (_existingChartModal) _existingChartModal.parentNode.removeChild(_existingChartModal);
document.body.insertAdjacentHTML('beforeend', ChartSettingsModalTemplate);
