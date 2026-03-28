/**
 * Amount Indicator Logic
 * Encapsulates Amount-related functionality
 */
window.AmountIndicator = {
    getConfigHTML: function () {
        return `
            <div class="amount-config-container" style="padding: 12px 0; border-top: 1px solid var(--border-subtle); margin-top: 8px;">
                 <div class="indicator-params" style="display: flex; flex-direction: column; gap: 12px;">
                     <div class="param-group" style="display: flex; gap: 8px; align-items: center;">
                        <label style="width: 40px; font-size: 12px;">條件</label>
                        <select class="select-input condition-select" style="flex: 1;" onchange="window.AmountIndicator.toggleInputs(this)">
                            <option value="gt">大於 (>)</option>
                            <option value="lt">小於 (<)</option>
                            <option value="range">範圍 (Range)</option>
                        </select>
                     </div>
                     
                     <!-- Single Value Input -->
                     <div class="param-group single-input-group" style="display: flex; gap: 8px; align-items: center;">
                        <label style="width: 40px; font-size: 12px;">數值</label>
                        <input type="number" class="number-input single-val" value="1000" style="flex: 1;">
                        <span style="font-size: 11px; color: var(--text-muted);">萬</span>
                     </div>

                     <!-- Range Inputs (Hidden by default) -->
                     <div class="param-group range-input-group" style="display: none; gap: 8px; align-items: center;">
                        <label style="width: 40px; font-size: 12px;">範圍</label>
                        <input type="number" class="number-input min-val" placeholder="Min" style="flex: 1;">
                        <span style="font-size: 12px;">~</span>
                        <input type="number" class="number-input max-val" placeholder="Max" style="flex: 1;">
                        <span style="font-size: 11px; color: var(--text-muted);">萬</span>
                     </div>
                </div>

                <!-- Footer -->
                <div class="config-footer" style="display: flex; justify-content: flex-end; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 12px; margin-top: 12px;">
                     <div style="display: flex; gap: 8px;">
                        <button type="button" class="btn btn-sm btn-ghost btn-cancel-amount" style="padding: 4px 12px;">取消</button>
                        <button type="button" class="btn btn-sm btn-secondary btn-confirm-amount" style="padding: 4px 12px;">確定</button>
                     </div>
                </div>
            </div>
        `;
    },

    toggleInputs: function (selectElement) {
        const container = selectElement.closest('.amount-config-container');
        const singleGroup = container.querySelector('.single-input-group');
        const rangeGroup = container.querySelector('.range-input-group');

        if (selectElement.value === 'range') {
            singleGroup.style.display = 'none';
            rangeGroup.style.display = 'flex';
        } else {
            singleGroup.style.display = 'flex';
            rangeGroup.style.display = 'none';
        }
    },

    confirmConfig: function (card) {
        const container = card.querySelector('.amount-config-container');
        if (!container) return;

        const sel = container.querySelector('.condition-select');
        const op = sel.value;

        const config = { type: 'amount', op: op };

        let displayStr = '';
        const unit = '萬';

        if (op === 'range') {
            config.min = container.querySelector('.min-val').value;
            config.max = container.querySelector('.max-val').value;
            displayStr = `${config.min} ~ ${config.max} ${unit}`;
        } else {
            config.val = container.querySelector('.single-val').value;
            const opText = sel.options[sel.selectedIndex].text;
            displayStr = `${opText} ${config.val} ${unit}`;
        }

        const configJson = JSON.stringify(config).replace(/"/g, '&quot;');

        const summaryHTML = `
            <div class="indicator-summary-item" data-config="${configJson}" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border-subtle);">
                <div class="summary-text" style="color: #60a5fa; font-size: 14px; font-weight: 500;">成交額: ${displayStr}</div>
                <div class="summary-actions" style="display: flex; gap: 8px;">
                     <button type="button" class="btn-icon btn-edit-summary" title="編輯">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                     </button>
                     <button type="button" class="btn-icon btn-remove" onclick="this.closest('.indicator-card').remove()">
                         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                     </button>
                </div>
            </div>
        `;

        card.innerHTML = summaryHTML;
        card.style.padding = '0';
        card.style.border = 'none';
        card.style.background = 'transparent';
    },

    restoreState: function (container, config) {
        if (!container || !config) return;

        const sel = container.querySelector('.condition-select');
        sel.value = config.op;

        this.toggleInputs(sel);

        if (config.op === 'range') {
            const minInput = container.querySelector('.min-val');
            const maxInput = container.querySelector('.max-val');
            if (minInput) minInput.value = config.min;
            if (maxInput) maxInput.value = config.max;
        } else {
            const valInput = container.querySelector('.single-val');
            if (valInput) valInput.value = config.val;
        }
    }
};
