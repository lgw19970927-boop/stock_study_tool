/**
 * Analysis Time Range Block
 * 負責「分析時間範圍」區塊的互動邏輯：
 *   - 快捷按鈕（1D / 1W / 1M / 3M / 6M / 1Y）
 *   - 自訂日期輸入（開始日期 / 結束日期）
 *   - 將結果寫入 window.state.filters 供篩選使用
 */
window.ScreeningBlockTimeRange = {

    init: function () {
        this.bindEvents();
        this.syncFromState();
    },

    syncFromState: function () {
        const f = window.state.filters;
        if (!f) return;

        // 如果狀態完全沒有設定過（例如初次載入），則寫入預設值
        if (f.time_range === undefined && f.analysis_start_date === undefined) {
            this.updateState();
            return;
        }

        if (f.time_range === null) {
            // 自訂模式
            document.querySelectorAll('.time-range-btn').forEach(b => b.classList.remove('active'));
            const customBtn = document.querySelector('.time-range-btn[data-range="custom"]');
            if (customBtn) customBtn.classList.add('active');

            const customRange = document.getElementById('customDateRange');
            if (customRange) customRange.style.display = 'flex';

            const startInput = document.getElementById('startDate');
            if (startInput) startInput.value = f.analysis_start_date || '';

            const endInput = document.getElementById('endDate');
            if (endInput) endInput.value = f.analysis_end_date || '';
        } else if (f.time_range) {
            // 快捷模式
            document.querySelectorAll('.time-range-btn').forEach(b => b.classList.remove('active'));
            const btn = document.querySelector(`.time-range-btn[data-range="${f.time_range}"]`);
            if (btn) btn.classList.add('active');

            const customRange = document.getElementById('customDateRange');
            if (customRange) customRange.style.display = 'none';
        }
    },

    bindEvents: function () {
        // ── 快捷時間區段按鈕 ──────────────────────────────
        document.querySelectorAll('.time-range-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // 切換 active
                document.querySelectorAll('.time-range-btn')
                    .forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // 顯示 / 隱藏自訂日期欄
                const customRange = document.getElementById('customDateRange');
                if (customRange) {
                    customRange.style.display =
                        (btn.dataset.range === 'custom') ? 'flex' : 'none';
                }

                this.updateState();
            });
        });

        // ── 自訂日期輸入 ──────────────────────────────────
        ['startDate', 'endDate'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => this.updateState());
        });
    },

    /**
     * 將目前 UI 狀態寫入 window.state.filters：
     *   - 快捷按鈕  → filters.time_range = "1M" / "3M" / ...
     *   - 自訂日期  → filters.analysis_start_date / analysis_end_date
     */
    updateState: function () {
        const activeBtn = document.querySelector('.time-range-btn.active');
        const range = activeBtn?.dataset.range ?? '1M';

        if (range === 'custom') {
            window.state.filters.analysis_start_date =
                document.getElementById('startDate')?.value || '';
            window.state.filters.analysis_end_date =
                document.getElementById('endDate')?.value || '';
            window.state.filters.time_range = null;
        } else {
            // 快捷按鈕：後端用 time_range 换算實際日期
            window.state.filters.analysis_start_date = '';
            window.state.filters.analysis_end_date = '';
            window.state.filters.time_range = range;  // "1D","1W","1M","3M","6M","1Y"
        }
    },

    /**
     * 驗證時間範圍設定是否合法
     * Returns { isValid: boolean, error: string | null }
     */
    validate: function () {
        this.updateState();
        const f = window.state.filters;

        if (f.time_range === null) {
            // 自訂日期模式
            if (!f.analysis_start_date || !f.analysis_end_date) {
                return { isValid: false, error: '自訂日期範圍：請填寫開始日期與結束日期' };
            }
            if (f.analysis_start_date > f.analysis_end_date) {
                return { isValid: false, error: '開始日期不能晚於結束日期' };
            }
        }

        return { isValid: true, error: null };
    },
};
