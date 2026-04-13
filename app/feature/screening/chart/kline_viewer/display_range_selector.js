/**
 * display_range_selector.js - K 線顯示範圍下拉選單模組
 * 掛載於 window.DisplayRangeSelector
 * 必須在 chart_controller.js 之前載入
 */
window.DisplayRangeSelector = {
    /* ───── 靜態對照表 ───── */
    _TIMEFRAME_NAME_MAP: {
        '1m': '1分K', '3m': '3分K', '5m': '5分K', '15m': '15分K', '30m': '30分K',
        '1h': '1小時K', '4h': '4小時K', '1d': '日K', '1w': '周K', '1M': '月K', '1y': '年K',
    },

    _PRESETS: [
        { label: '1天：1分K',    duration: { value: 1, unit: 'day' },   timeframe: '1m' },
        { label: '5天：5分K',    duration: { value: 5, unit: 'day' },   timeframe: '5m' },
        { label: '10天：15分K',  duration: { value: 10, unit: 'day' },  timeframe: '15m' },
        { label: '20天：30分K',  duration: { value: 20, unit: 'day' },  timeframe: '30m' },
        { label: '3月：1小時K',  duration: { value: 3, unit: 'month' }, timeframe: '1h' },
        { label: '6月：日K',     duration: { value: 6, unit: 'month' }, timeframe: '1d' },
        { label: '1年：日K',     duration: { value: 1, unit: 'year' },  timeframe: '1d' },
        { label: '3年：日K',     duration: { value: 3, unit: 'year' },  timeframe: '1d' },
        { label: '10年：日K',    duration: { value: 10, unit: 'year' }, timeframe: '1d' },
        { label: '全部：周K',    duration: { value: 0, unit: 'all' },   timeframe: '1w' },
    ],

    /* 第一層過濾：依時間範圍單位可選粒度 */
    _ALLOWED_TIMEFRAMES: {
        day:   ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M', '1y'],
        month: ['3m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M', '1y'],
        year:  ['1d', '1w', '1M', '1y'],
    },

    /* 第二層驗證：各粒度允許的最大時間跨度（秒） */
    _MAX_DURATION: {
        '1m':  30 * 86400,           // 30 天
        '3m':  30 * 86400,
        '5m':  30 * 86400,
        '15m': 90 * 86400,
        '30m': 90 * 86400,
        '1h':  365 * 86400,
        '4h':  365 * 86400,
        '1d':  30 * 365 * 86400,     // 30 年
        '1w':  Infinity,
        '1M':  Infinity,
        '1y':  Infinity,
    },

    _STORAGE_KEY: 'screening_custom_display_ranges',

    /* ───── 狀態 ───── */
    _currentRange: null,       // { label, duration, timeframe }
    _customRanges: [],
    _dropdownOpen: false,
    _isUpdatingFromDropdown: false,

    /* ───── DOM 快取 ───── */
    _btnEl: null,
    _dropdownEl: null,
    _addModalEl: null,
    _outsideClickHandler: null,

    /* ───── 初始化 ───── */
    init() {
        this._customRanges = this._loadCustomRanges();
        this._currentRange = this._PRESETS[6]; // 預設 1年：日K
        this._renderButton();
        this._renderDropdown();
        this._bindOutsideClick();
    },

    /* ===== 公開 API ===== */

    /** 取得當前選擇的範圍物件 */
    getCurrentRange() {
        return this._currentRange;
    },

    /** Timeframe 按鈕點擊後，由 chart_controller 呼叫更新標籤 */
    syncFromTimeframeButton(tf) {
        if (this._isUpdatingFromDropdown) return;
        const tfName = this._TIMEFRAME_NAME_MAP[tf] || tf;
        // 檢查是否有匹配的預設/自訂項（duration + timeframe 完全一致）
        const match = this._findMatchingRange('1年', tf);
        if (match) {
            this._currentRange = match;
        } else {
            // 臨時自訂文字，不加入列表
            this._currentRange = {
                label: `1年：${tfName}`,
                duration: { value: 1, unit: 'year' },
                timeframe: tf,
            };
        }
        this._updateButtonLabel();
        this._refreshDropdownItems();
    },

    /* ===== UI 渲染 ===== */

    _renderButton() {
        const group = document.querySelector('.timeframe-group');
        if (!group) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'display-range-wrapper';
        wrapper.innerHTML = `
            <button type="button" class="display-range-btn" id="displayRangeBtn">
                <span class="display-range-label">1年：日K</span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                    <path d="M2 3.5L5 6.5L8 3.5"/>
                </svg>
            </button>`;
        group.parentNode.insertBefore(wrapper, group.nextSibling);

        this._btnEl = wrapper.querySelector('#displayRangeBtn');
        this._btnEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggleDropdown();
        });
    },

    _renderDropdown() {
        const wrapper = this._btnEl?.closest('.display-range-wrapper');
        if (!wrapper) return;

        const dd = document.createElement('div');
        dd.className = 'display-range-dropdown is-hidden';
        dd.id = 'displayRangeDropdown';
        wrapper.appendChild(dd);
        this._dropdownEl = dd;
        this._refreshDropdownItems();
    },

    _refreshDropdownItems() {
        if (!this._dropdownEl) return;
        const curLabel = this._currentRange?.label;

        let html = '';

        // 預設項目
        this._PRESETS.forEach(p => {
            const checked = p.label === curLabel ? '<span class="dr-check">✓</span>' : '<span class="dr-check"></span>';
            html += `<div class="dr-item" data-label="${this._escAttr(p.label)}">${checked}<span class="dr-item-text">${p.label}</span></div>`;
        });

        // 自訂項目分隔線
        if (this._customRanges.length > 0) {
            html += '<div class="dr-divider"></div>';
            this._customRanges.forEach(c => {
                const checked = c.label === curLabel ? '<span class="dr-check">✓</span>' : '<span class="dr-check"></span>';
                html += `<div class="dr-item dr-item--custom" data-label="${this._escAttr(c.label)}">` +
                    `${checked}<span class="dr-item-text">${c.label}</span>` +
                    `<button type="button" class="dr-delete" title="刪除">🗑</button></div>`;
            });
        }

        // 添加範圍
        html += '<div class="dr-divider"></div>';
        html += '<div class="dr-item dr-item--add"><span class="dr-check"></span><span class="dr-item-text">+ 添加範圍</span></div>';

        this._dropdownEl.innerHTML = html;

        // 綁定事件
        this._dropdownEl.querySelectorAll('.dr-item').forEach(item => {
            if (item.classList.contains('dr-item--add')) {
                item.addEventListener('click', (e) => { e.stopPropagation(); this._showAddModal(); });
                return;
            }
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const label = item.dataset.label;
                if (e.target.closest('.dr-delete')) {
                    this._deleteCustomRange(label);
                    return;
                }
                this._selectByLabel(label);
            });
        });
    },

    _updateButtonLabel() {
        const labelEl = this._btnEl?.querySelector('.display-range-label');
        if (labelEl) labelEl.textContent = this._currentRange?.label || '1年：日K';
    },

    _toggleDropdown() {
        this._dropdownOpen = !this._dropdownOpen;
        if (this._dropdownEl) {
            this._dropdownEl.classList.toggle('is-hidden', !this._dropdownOpen);
        }
    },

    _closeDropdown() {
        this._dropdownOpen = false;
        if (this._dropdownEl) this._dropdownEl.classList.add('is-hidden');
    },

    _bindOutsideClick() {
        this._outsideClickHandler = (e) => {
            if (this._dropdownOpen && !e.target.closest('.display-range-wrapper')) {
                this._closeDropdown();
            }
        };
        document.addEventListener('click', this._outsideClickHandler);
    },

    /* ===== 選取邏輯 ===== */

    _selectByLabel(label) {
        const all = [...this._PRESETS, ...this._customRanges];
        const found = all.find(r => r.label === label);
        if (!found) return;

        this._currentRange = found;
        this._updateButtonLabel();
        this._refreshDropdownItems();
        this._closeDropdown();

        // 同步 Timeframe 按鈕 UI + 載入數據
        this._isUpdatingFromDropdown = true;

        const cc = window.ChartController;
        cc.syncTimeframeUI(found.timeframe);

        const currentSymbol = document.getElementById('chartSymbol')?.textContent;
        if (currentSymbol && currentSymbol !== '--') {
            const fromFilter = !!(window.state?.filters?.analysis_end_date);
            cc.loadStock(currentSymbol, { fromFilterClick: fromFilter });
        }

        this._isUpdatingFromDropdown = false;
    },

    _deleteCustomRange(label) {
        this._customRanges = this._customRanges.filter(c => c.label !== label);
        this._saveCustomRanges();
        // 若刪除的是當前選中的，回落到預設
        if (this._currentRange?.label === label) {
            this._currentRange = this._PRESETS[6]; // 1年：日K
            this._updateButtonLabel();

            // 同步載入
            this._isUpdatingFromDropdown = true;
            const cc = window.ChartController;
            cc.syncTimeframeUI(this._currentRange.timeframe);
            const sym = document.getElementById('chartSymbol')?.textContent;
            if (sym && sym !== '--') {
                cc.loadStock(sym, { fromFilterClick: !!(window.state?.filters?.analysis_end_date) });
            }
            this._isUpdatingFromDropdown = false;
        }
        this._refreshDropdownItems();
    },

    /* ===== 添加範圍 Modal ===== */

    _showAddModal() {
        this._closeDropdown();
        const old = document.getElementById('addRangeModal');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.id = 'addRangeModal';
        overlay.className = 'csv-export-overlay';
        overlay.innerHTML = `
            <div class="add-range-container">
                <div class="add-range-header">
                    <span class="csv-export-title">添加範圍</span>
                    <button type="button" class="btn-modal-close" data-action="close">&times;</button>
                </div>
                <div class="add-range-body">
                    <div class="add-range-row">
                        <label class="add-range-label">時間範圍：</label>
                        <select id="addRangeUnit" class="add-range-select">
                            <option value="day">天</option>
                            <option value="month">月</option>
                            <option value="year">年</option>
                        </select>
                        <input type="number" id="addRangeValue" class="add-range-input" min="1" value="1">
                        <span class="add-range-unit-text" id="addRangeUnitText">天</span>
                    </div>
                    <div class="add-range-row">
                        <label class="add-range-label">K線粒度：</label>
                        <select id="addRangeTF" class="add-range-select add-range-select--wide">
                        </select>
                    </div>
                    <p class="add-range-error is-hidden" id="addRangeError"></p>
                </div>
                <div class="csv-export-footer">
                    <button type="button" class="btn btn-ghost btn-sm" data-action="close">取消</button>
                    <button type="button" class="btn btn-primary btn-sm" id="addRangeConfirm">確定</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);
        this._addModalEl = overlay;

        // 拖移支援
        const addContainer = overlay.querySelector('.add-range-container');
        const addHeader = overlay.querySelector('.add-range-header');
        this._makeDraggable(addContainer, addHeader);

        const unitSel = overlay.querySelector('#addRangeUnit');
        const valueSel = overlay.querySelector('#addRangeValue');
        const tfSel = overlay.querySelector('#addRangeTF');
        const unitText = overlay.querySelector('#addRangeUnitText');
        const errEl = overlay.querySelector('#addRangeError');
        const confirmBtn = overlay.querySelector('#addRangeConfirm');

        // 初始填充粒度選項
        this._populateTFOptions(tfSel, 'day');

        // 單位切換 → 重新渲染粒度選項 + 更新顯示文字
        unitSel.addEventListener('change', () => {
            const unit = unitSel.value;
            unitText.textContent = unit === 'day' ? '天' : unit === 'month' ? '月' : '年';
            this._populateTFOptions(tfSel, unit);
            this._validateAddRange(unitSel, valueSel, tfSel, errEl, confirmBtn);
        });

        // 數值變更 → 即時驗證
        valueSel.addEventListener('input', () => {
            this._validateAddRange(unitSel, valueSel, tfSel, errEl, confirmBtn);
        });

        // 粒度變更 → 即時驗證
        tfSel.addEventListener('change', () => {
            this._validateAddRange(unitSel, valueSel, tfSel, errEl, confirmBtn);
        });

        // 關閉
        overlay.querySelectorAll('[data-action="close"]').forEach(el => {
            el.addEventListener('click', () => overlay.remove());
        });
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        // 確定
        confirmBtn.addEventListener('click', () => {
            const unit = unitSel.value;
            const value = parseInt(valueSel.value, 10);
            const tf = tfSel.value;
            if (!value || value < 1) return;

            const tfName = this._TIMEFRAME_NAME_MAP[tf];
            const unitName = unit === 'day' ? '天' : unit === 'month' ? '月' : '年';
            const label = `${value}${unitName}：${tfName}`;

            // 檢查重複
            const all = [...this._PRESETS, ...this._customRanges];
            if (all.find(r => r.label === label)) {
                errEl.textContent = '此範圍已存在';
                errEl.classList.remove('is-hidden');
                return;
            }

            const newRange = { label, duration: { value, unit }, timeframe: tf };
            this._customRanges.push(newRange);
            this._saveCustomRanges();
            overlay.remove();

            // 立即套用
            this._currentRange = newRange;
            this._updateButtonLabel();
            this._refreshDropdownItems();

            this._isUpdatingFromDropdown = true;
            const cc = window.ChartController;
            cc.syncTimeframeUI(tf);
            const sym = document.getElementById('chartSymbol')?.textContent;
            if (sym && sym !== '--') {
                cc.loadStock(sym, { fromFilterClick: !!(window.state?.filters?.analysis_end_date) });
            }
            this._isUpdatingFromDropdown = false;
        });
    },

    _populateTFOptions(selectEl, unit) {
        const allowed = this._ALLOWED_TIMEFRAMES[unit] || this._ALLOWED_TIMEFRAMES.day;
        const prevVal = selectEl.value;
        selectEl.innerHTML = '';
        allowed.forEach(tf => {
            const opt = document.createElement('option');
            opt.value = tf;
            opt.textContent = this._TIMEFRAME_NAME_MAP[tf];
            selectEl.appendChild(opt);
        });
        // 保留之前的選擇（若仍合理）
        if (allowed.includes(prevVal)) {
            selectEl.value = prevVal;
        }
    },

    _validateAddRange(unitSel, valueSel, tfSel, errEl, confirmBtn) {
        const unit = unitSel.value;
        const value = parseInt(valueSel.value, 10);
        const tf = tfSel.value;

        errEl.classList.add('is-hidden');
        confirmBtn.disabled = false;

        if (!value || value < 1) {
            confirmBtn.disabled = true;
            return;
        }

        const durationSec = this._rangeDurationToSeconds({ value, unit });
        const maxSec = this._MAX_DURATION[tf];
        if (maxSec !== Infinity && durationSec > maxSec) {
            const maxLabel = this._maxDurationLabel(tf);
            errEl.textContent = `此粒度最大允許 ${maxLabel}`;
            errEl.classList.remove('is-hidden');
            confirmBtn.disabled = true;
        }
    },

    /* ===== 時間工具 ===== */

    _rangeDurationToSeconds(dur) {
        if (dur.unit === 'all') return Infinity;
        const multipliers = { day: 86400, month: 30 * 86400, year: 365 * 86400 };
        return dur.value * (multipliers[dur.unit] || 86400);
    },

    _maxDurationLabel(tf) {
        const sec = this._MAX_DURATION[tf];
        if (sec === Infinity) return '無限制';
        if (sec >= 365 * 86400) return `${Math.round(sec / (365 * 86400))} 年`;
        if (sec >= 30 * 86400) return `${Math.round(sec / (30 * 86400))} 月`;
        return `${Math.round(sec / 86400)} 天`;
    },

    /* ===== localStorage ===== */

    _loadCustomRanges() {
        try {
            const raw = localStorage.getItem(this._STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.warn('[DisplayRangeSelector] localStorage read failed:', e);
            return [];
        }
    },

    _saveCustomRanges() {
        try {
            localStorage.setItem(this._STORAGE_KEY, JSON.stringify(this._customRanges));
        } catch (e) {
            console.warn('[DisplayRangeSelector] localStorage write failed:', e);
        }
    },

    /* ===== 工具 ===== */

    /**
     * 拖移支援（複用 ChartSettingsModal 相同邏輯）
     */
    _makeDraggable(containerEl, handleEl) {
        let isDragging = false;
        let startX = 0, startY = 0, startLeft = 0, startTop = 0;

        handleEl.style.cursor = 'move';
        handleEl.addEventListener('mousedown', (e) => {
            if (e.button !== 0 || e.target.closest('button')) return;
            isDragging = true;
            containerEl.classList.add('is-dragging');
            const rect = containerEl.getBoundingClientRect();
            containerEl.style.position = 'fixed';
            containerEl.style.margin = '0';
            containerEl.style.left = rect.left + 'px';
            containerEl.style.top = rect.top + 'px';
            startX = e.clientX; startY = e.clientY;
            startLeft = rect.left; startTop = rect.top;
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const newLeft = Math.max(0, Math.min(window.innerWidth - containerEl.offsetWidth, startLeft + e.clientX - startX));
            const newTop = Math.max(0, Math.min(window.innerHeight - containerEl.offsetHeight, startTop + e.clientY - startY));
            containerEl.style.left = newLeft + 'px';
            containerEl.style.top = newTop + 'px';
        });
        document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            containerEl.classList.remove('is-dragging');
        });
    },

    _findMatchingRange(durationLabel, tf) {
        const all = [...this._PRESETS, ...this._customRanges];
        return all.find(r => r.timeframe === tf &&
            r.duration.value === 1 && r.duration.unit === 'year') || null;
    },

    _escAttr(str) {
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
};
