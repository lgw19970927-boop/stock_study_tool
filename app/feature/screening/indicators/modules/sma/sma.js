/**
 * SMA Indicator Logic
 * Encapsulates all SMA-related functionality
 */
window.SMAIndicator = {
    getConfigHTML: function () {
        return `
            <div class="sma-config-container ind-config-container">
                <!-- 1. Period -->
                <div class="config-row ind-config-row">
                    <div class="config-label ind-config-label">週期</div>
                    <div class="pill-group ind-pill-group">
                        <button type="button" class="config-pill-btn active ind-pill-flex" data-group="sma-period">日K</button>
                        <button type="button" class="config-pill-btn ind-pill-flex" data-group="sma-period">周K</button>
                        <button type="button" class="config-pill-btn ind-pill-flex" data-group="sma-period">月K</button>
                        <button type="button" class="config-pill-btn ind-pill-flex" data-group="sma-period">60分K</button>
                    </div>
                </div>

                <!-- 2. Range -->
                <div class="config-row ind-config-row">
                    <div class="config-label ind-config-label">範圍</div>
                    <div class="pill-group ind-pill-group">
                        <button type="button" class="config-pill-btn active ind-pill-flex" data-group="sma-range">當前值</button>
                        <button type="button" class="config-pill-btn ind-pill-flex" data-group="sma-range">連續週期</button>
                    </div>
                </div>

                <div class="config-row ind-config-row ind-consecutive-row is-hidden">
                    <div class="config-label ind-config-label">連續次數</div>
                    <div class="ind-param-inline">
                        <span class="ind-unit-note">連續</span>
                        <input type="number" class="number-input consecutive-n-input ind-input-60" value="" min="1" max="100" placeholder="">
                        <span class="ind-unit-note">次</span>
                    </div>
                </div>

                <!-- 3. Predefined Conditions -->
                <div class="config-row ind-config-row">
                    <div class="config-label ind-config-label">條件</div>
                    <div class="pill-group ind-pill-group">
                        <button type="button" class="config-pill-btn ind-pill-flex" data-group="sma-mode" data-mode="bull">多頭排列</button>
                        <button type="button" class="config-pill-btn ind-pill-flex" data-group="sma-mode" data-mode="bear">空頭排列</button>
                        <button type="button" class="config-pill-btn active ind-pill-flex ind-pill-warning" data-group="sma-mode" data-mode="custom">自訂</button>
                    </div>
                </div>

                <!-- 4. Dynamic Conditions List -->
                <div class="conditions-list-container ind-conditions-list">
                     <!-- Default Row -->
                     ${this.getConditionRowHTML()}
                </div>

                <!-- 5. Add Condition Link -->
                <div class="ind-add-condition-wrap">
                    <span class="btn-add-condition ind-add-condition">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        添加條件
                    </span>
                </div>

                <!-- 6. Footer -->
                <div class="config-footer ind-config-footer">
                     <div class="ind-config-footer-actions">
                        <button type="button" class="btn btn-sm btn-ghost btn-cancel-sma ind-btn-compact">取消</button>
                        <button type="button" class="btn btn-sm btn-secondary btn-confirm-sma ind-btn-compact">確定</button>
                     </div>
                </div>
            </div>
        `;
    },

    getConditionRowHTML: function () {
        return `
            <div class="condition-row">
                <select>
                    <option value="MA">MA</option>
                    <option value="Price">價格</option>
                </select>
                <input type="number" value="20">
                
                <select>
                    <option value="gt">大於</option>
                    <option value="lt">小於</option>
                    <option value="gte">大於等於</option>
                    <option value="lte">小於等於</option>
                </select>
                
                <select>
                    <option value="MA">MA</option>
                    <option value="Price">價格</option>
                    <option value="Value">數值</option>
                </select>
                <input type="number" value="60">

                <span class="btn-delete-row ind-delete-row">
                    刪除
                </span>
            </div>
        `;
    },

    _setupConditionRow: function (row) {
        if (!row) return;
        const leftSelect = row.querySelector('select');
        const periodInput = row.querySelector('input[type="number"]');
        if (!leftSelect || !periodInput) return;

        const syncLeftType = () => {
            const isPrice = leftSelect.value === 'Price';
            periodInput.classList.toggle('is-hidden', isPrice);
            periodInput.classList.toggle('is-block', !isPrice);
        };

        if (row.dataset.leftSyncBound !== '1') {
            leftSelect.addEventListener('change', syncLeftType);
            row.dataset.leftSyncBound = '1';
        }
        syncLeftType();
    },

    afterRender: function (card) {
        card.querySelectorAll('.condition-row').forEach(row => this._setupConditionRow(row));
        this.onPillStateChanged(card);
    },

    _getActiveText: function (card, groupName, fallback) {
        const active = card.querySelector(`.config-pill-btn[data-group="${groupName}"].active`);
        return active ? active.textContent.trim() : fallback;
    },

    _getActiveMode: function (card) {
        const active = card.querySelector('.config-pill-btn[data-group="sma-mode"].active');
        return active ? active.dataset.mode : 'custom';
    },

    _syncRangeUI: function (card) {
        const rangeMode = this._getActiveText(card, 'sma-range', '當前值');
        const row = card.querySelector('.ind-consecutive-row');
        if (!row) return;

        const show = rangeMode === '連續週期';
        row.classList.toggle('is-hidden', !show);
        row.classList.toggle('is-block', show);
    },

    _syncModeUI: function (card) {
        const mode = this._getActiveMode(card);
        const configContainer = card.querySelector('.sma-config-container');
        if (!configContainer) return;

        const list = configContainer.querySelector('.conditions-list-container');
        const addWrap = configContainer.querySelector('.ind-add-condition-wrap');
        if (!list || !addWrap) return;

        const showCustom = mode === 'custom';
        list.classList.toggle('is-hidden', !showCustom);
        list.classList.toggle('is-block', showCustom);
        addWrap.classList.toggle('is-hidden', !showCustom);
        addWrap.classList.toggle('is-block', showCustom);

        const bullBtn = card.querySelector('.config-pill-btn[data-group="sma-mode"][data-mode="bull"]');
        const bearBtn = card.querySelector('.config-pill-btn[data-group="sma-mode"][data-mode="bear"]');
        const sharedTooltipDesc =
            '說明：\n' +
            '- MA5（約 1 週）、MA10（約 2 週）、MA20（約 1 個月）代表短期趨勢\n' +
            '- MA50（約 2.5 個月）代表中期趨勢\n' +
            '- MA200（約 1 個交易年）代表長期趨勢\n' +
            '- 此 5 條均線為美股分析最常見組合，後端預設在多頭 / 空頭排列時會計算並評估這 5 條。';
        if (bullBtn) {
            bullBtn.title =
                'MA5 > MA10 > MA20 > MA50 > MA200\n' +
                sharedTooltipDesc;
        }
        if (bearBtn) {
            bearBtn.title =
                'MA5 < MA10 < MA20 < MA50 < MA200\n' +
                sharedTooltipDesc;
        }
    },

    onPillStateChanged: function (card) {
        this._syncRangeUI(card);
        this._syncModeUI(card);
    },

    addConditionRow: function (configArea) {
        const list = configArea.querySelector('.conditions-list-container');
        if (list) {
            list.insertAdjacentHTML('beforeend', this.getConditionRowHTML());
            this._setupConditionRow(list.lastElementChild);
        }
    },

    confirmConfig: function (card) {
        const period = this._getActiveText(card, 'sma-period', '日K');
        const rangeMode = this._getActiveText(card, 'sma-range', '當前值');
        const mode = this._getActiveMode(card);
        const nInput = card.querySelector('.consecutive-n-input');
        const rawN = parseInt(((nInput && nInput.value) || '').trim(), 10);
        const rangeN = rangeMode === '連續週期'
            ? Math.max(1, Math.min(Number.isFinite(rawN) ? rawN : 1, 100))
            : 1;

        const periodToTimeframe = {
            '日K': '1d',
            '周K': '1w',
            '月K': '1M',
            '60分K': '1h'
        };
        const timeframe = periodToTimeframe[period] || '1d';

        const presets = [];
        const customConfigs = [];
        const displayConditions = [];
        const backendConditions = [];

        if (mode === 'bull' || mode === 'bear') {
            const isBull = mode === 'bull';
            const op = isBull ? '>' : '<';
            presets.push(isBull ? '多頭排列' : '空頭排列');
            displayConditions.push(isBull ? '多頭排列' : '空頭排列');

            backendConditions.push(
                { left: 'MA5', operator: op, right: 'MA10' },
                { left: 'MA10', operator: op, right: 'MA20' },
                { left: 'MA20', operator: op, right: 'MA50' },
                { left: 'MA50', operator: op, right: 'MA200' }
            );
        } else {
            card.querySelectorAll('.condition-row').forEach(row => {
                const selects = row.querySelectorAll('select');
                const inputs = row.querySelectorAll('input');
                if (selects.length < 3) return;

                const t1 = selects[0].value;
                const v1 = (inputs[0] && inputs[0].value) || '';
                const op = selects[1].value;
                const t2 = selects[2].value;
                const v2 = inputs[1] ? inputs[1].value : '';

                customConfigs.push({ t1, v1, op, t2, v2 });

                const leftStr = t1 === 'Price' ? '價格' : `MA${v1}`;
                const opMap = { gt: '>', lt: '<', gte: '>=', lte: '<=', cross_up: '升穿', cross_down: '跌破' };
                const opStr = opMap[op] || op;

                let rightStr = '';
                if (t2 === 'Value') rightStr = v2;
                else if (t2 === 'Price') rightStr = '價格';
                else rightStr = `MA${v2}`;

                displayConditions.push(`${leftStr}${opStr}${rightStr}`);

                const backendOpMap = { gt: '>', lt: '<', gte: '>=', lte: '<=', cross_up: '>', cross_down: '<' };
                const operator = backendOpMap[op] || op;

                const left = t1 === 'Price' ? 'close' : `MA${v1}`;
                let right;
                if (t2 === 'Value') right = parseFloat(v2);
                else if (t2 === 'Price') right = 'close';
                else right = `MA${v2}`;

                backendConditions.push({
                    left: left,
                    operator: operator,
                    right: right
                });
            });
        }

        const helper = window.IndicatorFormatHelpers;
        const summaryLines = (helper && typeof helper.buildSummaryLines === 'function')
            ? helper.buildSummaryLines('MA', period, displayConditions.length > 0 ? displayConditions : ['自訂條件'], rangeN)
            : (displayConditions.length > 0 ? displayConditions : ['自訂條件']).map(cond => {
                const prefix = rangeN > 1 ? `連續${rangeN}次` : '';
                return `MA-${prefix}${period}: ${cond}`;
            });

        const config = {
            type: 'sma',
            timeframe: timeframe,
            period: period,
            range: rangeMode,
            range_n: rangeN,
            presets: presets,
            custom: customConfigs,
            conditions: backendConditions
        };

        const configJson = JSON.stringify(config).replace(/"/g, '&quot;');

        const summaryHTML = summaryLines.map((line, idx) => `
            <div class="indicator-summary-item ind-summary-item" data-config="${configJson}" data-line-index="${idx}">
                <div class="summary-text ind-summary-text">${line}</div>
                <div class="summary-actions ind-summary-actions">
                     <button type="button" class="btn-icon btn-edit-summary" title="編輯">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                     </button>
                     <button type="button" class="btn-icon btn-remove" title="刪除" onclick="window.ScreeningBlockIndicator.removeSummaryCondition(this)">
                         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                     </button>
                </div>
            </div>
        `).join('');

        card.innerHTML = summaryHTML;
        card.classList.add('indicator-card--summary');
    },

    restoreState: function (container, config) {
        if (!container || !config) return;

        const periodBtns = container.querySelectorAll('.config-pill-btn[data-group="sma-period"]');
        periodBtns.forEach(btn => {
            const isActive = btn.textContent.trim() === (config.period || '日K');
            btn.classList.toggle('active', isActive);
        });

        const rangeBtns = container.querySelectorAll('.config-pill-btn[data-group="sma-range"]');
        rangeBtns.forEach(btn => {
            const isActive = btn.textContent.trim() === (config.range || '當前值');
            btn.classList.toggle('active', isActive);
        });

        const nInput = container.querySelector('.consecutive-n-input');
        if (nInput) {
            const isConsecutive = (config.range || '當前值') === '連續週期';
            if (!isConsecutive) {
                nInput.value = '';
            } else {
                const n = Math.max(1, Math.min(parseInt(config.range_n || 1, 10) || 1, 100));
                nInput.value = String(n);
            }
        }

        const modeBtns = container.querySelectorAll('.config-pill-btn[data-group="sma-mode"]');
        modeBtns.forEach(btn => btn.classList.remove('active'));
        const mode = (config.presets && config.presets[0] === '多頭排列')
            ? 'bull'
            : (config.presets && config.presets[0] === '空頭排列')
                ? 'bear'
                : 'custom';
        const modeBtn = container.querySelector(`.config-pill-btn[data-group="sma-mode"][data-mode="${mode}"]`);
        if (modeBtn) modeBtn.classList.add('active');

        const list = container.querySelector('.conditions-list-container');
        if (list) {
            if (config.custom && config.custom.length > 0) {
                list.innerHTML = '';
                config.custom.forEach(c => {
                    this.addConditionRow(container);
                    const lastRow = list.lastElementChild;
                    const selects = lastRow.querySelectorAll('select');
                    const inputs = lastRow.querySelectorAll('input');

                    selects[0].value = c.t1;
                    if (inputs[0]) inputs[0].value = c.v1;
                    selects[1].value = c.op;
                    selects[2].value = c.t2;
                    if (inputs[1]) inputs[1].value = c.v2;
                    this._setupConditionRow(lastRow);
                });
            } else {
                const defaultRow = list.querySelector('.condition-row');
                this._setupConditionRow(defaultRow);
            }
        }

        this.onPillStateChanged(container.closest('.indicator-card'));
    },

    /**
     * ✅ 計算 SMA 指標（Phase 1 重構新增）
     * @param {Array} chartData - K 線數據 [{time, open, high, low, close, volume}, ...]
     * @param {Object} config - 配置 {period: 20, color: '#ff5252', ...}
     * @returns {Array} SMA 數據 [{time, value}, ...]
     */
    calculate: function (chartData, config) {
        const period = config.period || 20;
        const result = [];

        for (let i = 0; i < chartData.length; i++) {
            if (i < period - 1) {
                result.push({ time: chartData[i].time, value: null });
            } else {
                const sum = chartData.slice(i - period + 1, i + 1)
                    .reduce((acc, bar) => acc + bar.close, 0);
                result.push({
                    time: chartData[i].time,
                    value: sum / period
                });
            }
        }

        return result;
    },

    /**
     * ✅ 獲取渲染配置（Phase 1 重構新增）
     * @param {Object} config - 指標配置 {period: 20, color: '#ff5252', ...}
     * @returns {Object} 渲染配置
     */
    getRenderConfig: function (config) {
        return {
            renderType: 'line',
            color: config.color || '#ff5252',
            lineWidth: config.lineWidth || 1,
            title: `MA${config.period || 20}`,
            priceScaleId: 'right'
        };
    }
};

// ========== ✅ 自動註冊到指標註冊中心 ==========
if (window.IndicatorRegistry) {
    window.IndicatorRegistry.register('sma', window.SMAIndicator);
}
