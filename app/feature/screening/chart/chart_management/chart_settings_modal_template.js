/**
 * Chart Settings Modal HTML Template
 * 圖表管理彈窗的 HTML 結構
 */
var ChartSettingsModalTemplate = `
<!-- ========== 圖表管理彈窗 ========== -->
<div id="chartSettingsModal" class="chart-modal-overlay is-hidden">
    <div class="chart-modal-container">
        <!-- 彈窗標題 -->
        <div class="chart-modal-header">
            <div class="modal-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path
                        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z">
                    </path>
                </svg>
                圖表管理
            </div>
            <button class="btn-modal-close" id="btnCloseModalX">×</button>
        </div>

        <!-- Tab 切換 -->
        <div class="chart-modal-tabs">
            <button class="chart-tab-btn" data-tab="general">常規設定</button>
            <button class="chart-tab-btn" data-tab="axis">坐標軸</button>
            <button class="chart-tab-btn active" data-tab="indicators">指標管理</button>
            <button class="chart-tab-btn" data-tab="patterns">型態管理</button>
        </div>

        <!-- 彈窗主體 -->
        <div class="chart-modal-body">
            <!-- 左側：指標列表 -->
            <div class="chart-modal-sidebar">
                <!-- 主圖指標 -->
                <div class="indicator-category" data-category="main" data-collapsed="false">
                    <div class="category-header" role="button" tabindex="0">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                            <path d="M2 4 L6 8 L10 4 Z"></path>
                        </svg>
                        主圖
                    </div>
                    <div class="indicator-items">
                        <div class="indicator-item chart-sidebar-item" data-indicator="ma">
                            <input type="checkbox" id="ma-toggle" checked>
                            <span>MA</span>
                        </div>
                        <div class="indicator-item chart-sidebar-item" data-indicator="boll">
                            <input type="checkbox" id="boll-toggle">
                            <span>BOLL</span>
                        </div>
                        <div class="indicator-item chart-sidebar-item chart-sidebar-item--disabled disabled">
                            <input type="checkbox" disabled>
                            <span>EMA</span>
                        </div>
                        <div class="indicator-item chart-sidebar-item chart-sidebar-item--disabled disabled">
                            <input type="checkbox" disabled>
                            <span>SAR</span>
                        </div>
                        <div class="indicator-item chart-sidebar-item chart-sidebar-item--disabled disabled">
                            <input type="checkbox" disabled>
                            <span>CDP</span>
                        </div>
                        <div class="indicator-item chart-sidebar-item chart-sidebar-item--disabled disabled">
                            <input type="checkbox" disabled>
                            <span>IC</span>
                        </div>
                        <div class="indicator-item chart-sidebar-item chart-sidebar-item--disabled disabled">
                            <input type="checkbox" disabled>
                            <span>KC</span>
                        </div>
                        <div class="indicator-item chart-sidebar-item chart-sidebar-item--disabled disabled">
                            <input type="checkbox" disabled>
                            <span>神奇九轉</span>
                        </div>
                        <div class="indicator-item chart-sidebar-item chart-sidebar-item--disabled disabled">
                            <input type="checkbox" disabled>
                            <span>VWAP</span>
                        </div>
                    </div>
                </div>

                <!-- 副圖指標 -->
                <div class="indicator-category" data-category="sub" data-collapsed="false">
                    <div class="category-header" role="button" tabindex="0">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                            <path d="M2 4 L6 8 L10 4 Z"></path>
                        </svg>
                        副圖
                    </div>
                    <div class="indicator-items">
                        <div class="indicator-item chart-sidebar-item" data-indicator="vol">
                            <input type="checkbox" id="vol-toggle">
                            <span>VOL</span>
                        </div>
                        <div class="indicator-item chart-sidebar-item chart-sidebar-item--disabled disabled">
                            <input type="checkbox" disabled>
                            <span>MACD</span>
                        </div>
                        <div class="indicator-item chart-sidebar-item chart-sidebar-item--disabled disabled">
                            <input type="checkbox" disabled>
                            <span>KDJ</span>
                        </div>
                        <div class="indicator-item chart-sidebar-item" data-indicator="rsi">
                            <input type="checkbox" id="rsi-toggle">
                            <span>RSI</span>
                        </div>
                        <div class="indicator-item chart-sidebar-item chart-sidebar-item--disabled disabled">
                            <input type="checkbox" disabled>
                            <span>ARBR</span>
                        </div>
                    </div>
                </div>

                <!-- 型態管理側邊欄（切換 patterns tab 時顯示）-->
                <div class="indicator-category pattern-sidebar-section is-hidden">
                    <div class="category-header">型態</div>
                    <div class="indicator-items" id="patternSidebarItems">
                        <!-- 由 JS 動態生成 -->
                    </div>
                </div>
            </div>

            <!-- 右側：動態設定面板 -->
            <div class="chart-modal-content">
                <div id="settingsPanelContainer">
                    <!-- 由 JavaScript 動態生成 -->
                    <div class="settings-placeholder">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="1.5">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                        </svg>
                        <p>請選擇左側的指標類型</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- 彈窗底部按鈕 -->
        <div class="chart-modal-footer">
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
