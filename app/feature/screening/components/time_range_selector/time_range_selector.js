/**
 * Analysis Time Range Block
 * 負責「分析時間範圍」區塊的互動邏輯：
 *   - 今天        → analysis_end_date = 今日, analysis_start_date = ''
 *   - 自訂特定時點  → analysis_end_date = 選取日期, analysis_start_date = ''
 *   - 自訂分析時間範圍 → 兩端日期均設定
 *   - 所有模式均設 time_range = null（由後端依 end_date 自動算起始）
 */
window.ScreeningBlockTimeRange = {

    _todayStr: function () {
        return new Date().toISOString().slice(0, 10);
    },

    init: function () {
        this.bindEvents();
        this.syncFromState();
    },

    /** 根據 state 決定要選哪個 radio，並顯示對應子面板 */
    syncFromState: function () {
        const f = window.state.filters;
        if (!f) return;

        // 從舊版 time_range 非 null 狀態（1D/1W/1M...）遷移 → 回落到「今天」
        if (f.time_range && f.time_range !== null) {
            this._activateMode('today');
            this.updateState();
            return;
        }

        // 判斷目前模式
        if (f.analysis_start_date) {
            // 有開始日期 → custom 模式
            this._activateMode('custom');
            const startEl = document.getElementById('startDate');
            if (startEl) startEl.value = f.analysis_start_date;
            const endEl = document.getElementById('endDate');
            if (endEl) endEl.value = f.analysis_end_date || '';
        } else if (f.analysis_end_date && f.analysis_end_date !== this._todayStr()) {
            // 有結束日期且不是今天 → specific 模式
            this._activateMode('specific');
            const specEl = document.getElementById('specificDate');
            if (specEl) specEl.value = f.analysis_end_date;
        } else {
            // 預設：今天
            this._activateMode('today');
        }

        this.updateState();
    },

    /** 選中指定 radio 並切換子面板顯示 */
    _activateMode: function (mode) {
        document.querySelectorAll('input[name="timeRangeMode"]').forEach(r => {
            r.checked = (r.value === mode);
        });
        this._togglePanels(mode);
    },

    /** 顯示/隱藏子面板 */
    _togglePanels: function (mode) {
        const specificPanel = document.getElementById('specificDatePanel');
        const customRange = document.getElementById('customDateRange');
        if (specificPanel) {
            specificPanel.classList.toggle('is-hidden', mode !== 'specific');
            specificPanel.classList.toggle('is-block', mode === 'specific');
        }
        if (customRange) {
            customRange.classList.toggle('is-hidden', mode !== 'custom');
            customRange.classList.toggle('is-flex', mode === 'custom');
        }
    },

    bindEvents: function () {
        // ── Radio 按鈕切換 ─────────────────────────────────
        document.querySelectorAll('input[name="timeRangeMode"]').forEach(radio => {
            radio.addEventListener('change', () => {
                this._togglePanels(radio.value);
                this.updateState();
            });
        });

        // ── 特定時點日期選取 ───────────────────────────────
        const specEl = document.getElementById('specificDate');
        if (specEl) specEl.addEventListener('change', () => this.updateState());

        // ── 自訂範圍日期選取 ───────────────────────────────
        ['startDate', 'endDate'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => this.updateState());
        });
    },

    /** 將目前 UI 狀態寫入 window.state.filters */
    updateState: function () {
        const selected = document.querySelector('input[name="timeRangeMode"]:checked');
        const mode = selected ? selected.value : 'today';

        window.state.filters.time_range = null;  // 統一不用 time_range

        if (mode === 'today') {
            window.state.filters.analysis_end_date   = this._todayStr();
            window.state.filters.analysis_start_date = '';
        } else if (mode === 'specific') {
            const v = document.getElementById('specificDate')?.value || '';
            window.state.filters.analysis_end_date   = v;
            window.state.filters.analysis_start_date = '';
        } else {
            // custom
            window.state.filters.analysis_start_date =
                document.getElementById('startDate')?.value || '';
            window.state.filters.analysis_end_date =
                document.getElementById('endDate')?.value || '';
        }
    },

    /** 驗證時間範圍設定是否合法 */
    validate: function () {
        this.updateState();
        const f = window.state.filters;
        const selected = document.querySelector('input[name="timeRangeMode"]:checked');
        const mode = selected ? selected.value : 'today';

        if (mode === 'specific') {
            if (!f.analysis_end_date) {
                return { isValid: false, error: '自訂特定時點：請選擇日期' };
            }
        } else if (mode === 'custom') {
            if (!f.analysis_start_date || !f.analysis_end_date) {
                return { isValid: false, error: '自訂時間範圍：請填寫開始日期與結束日期' };
            }
            if (f.analysis_start_date > f.analysis_end_date) {
                return { isValid: false, error: '開始日期不能晚於結束日期' };
            }
        }

        return { isValid: true, error: null };
    },
};
