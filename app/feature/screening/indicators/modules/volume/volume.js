/**
 * Volume Indicator Logic
 * Encapsulates Volume-related functionality
 */
window.VolumeIndicator = {
    getConfigHTML: function () {
        return `
                <div class="volume-config-container ind-config-container">
                      <div class="indicator-params flex flex-col gap-3">
                            <div class="param-group ind-param-inline">
                                <label class="ind-param-label-fixed">條件</label>
                                <select class="select-input condition-select ind-select-flex" onchange="window.VolumeIndicator.toggleInputs(this)">
                            <option value="gt">大於 (>)</option>
                            <option value="lt">小於 (<)</option>
                            <option value="range">範圍 (Range)</option>
                        </select>
                     </div>
                     
                     <!-- Single Value Input -->
                            <div class="param-group single-input-group ind-param-inline is-flex">
                                <label class="ind-param-label-fixed">數值</label>
                                <input type="number" class="number-input single-val ind-input-flex" value="1000">
                                <span class="ind-unit-note">股</span>
                     </div>

                     <!-- Range Inputs (Hidden by default) -->
                            <div class="param-group range-input-group ind-param-inline is-hidden">
                                <label class="ind-param-label-fixed">範圍</label>
                                <input type="number" class="number-input min-val ind-input-flex" placeholder="Min">
                                <span class="text-xs">~</span>
                                <input type="number" class="number-input max-val ind-input-flex" placeholder="Max">
                                <span class="ind-unit-note">股</span>
                     </div>
                </div>

                <!-- Footer -->
                     <div class="config-footer ind-config-footer mt-3">
                            <div class="ind-config-footer-actions">
                                <button type="button" class="btn btn-sm btn-ghost btn-cancel-volume ind-btn-compact">取消</button>
                                <button type="button" class="btn btn-sm btn-secondary btn-confirm-volume ind-btn-compact">確定</button>
                     </div>
                </div>
            </div>
        `;
    },

    toggleInputs: function (selectElement) {
        const container = selectElement.closest('.volume-config-container');
        const singleGroup = container.querySelector('.single-input-group');
        const rangeGroup = container.querySelector('.range-input-group');

        if (selectElement.value === 'range') {
            singleGroup.classList.add('is-hidden');
            singleGroup.classList.remove('is-flex');
            rangeGroup.classList.remove('is-hidden');
            rangeGroup.classList.add('is-flex');
        } else {
            singleGroup.classList.remove('is-hidden');
            singleGroup.classList.add('is-flex');
            rangeGroup.classList.add('is-hidden');
            rangeGroup.classList.remove('is-flex');
        }
    },

    confirmConfig: function (card) {
        const container = card.querySelector('.volume-config-container');
        if (!container) return;

        const sel = container.querySelector('.condition-select');
        const op = sel.value;

        const config = { type: 'volume', op: op };

        let displayStr = '';
        const unit = '張';

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
            <div class="ind-summary-outer">
                <div class="ind-summary-inner">
                    <div class="indicator-summary-item ind-summary-item" data-config="${configJson}">
                        <div class="summary-text ind-summary-text" title="VOL: ${displayStr}">VOL: ${displayStr}</div>
                        <div class="summary-actions ind-summary-actions">
                             <button type="button" class="btn-icon btn-edit-summary" title="編輯">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                             </button>
                             <button type="button" class="btn-icon btn-remove" title="刪除" onclick="window.ScreeningBlockIndicator.removeSummaryCondition(this)">
                                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                             </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        card.innerHTML = summaryHTML;
        card.classList.add('indicator-card--summary');
    },

    restoreState: function (container, config) {
        if (!container || !config) return;

        const sel = container.querySelector('.condition-select');
        sel.value = config.op;

        // Manually trigger toggle logic since dispatchEvent might be overkill or rely on listener attachment
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
