/**
 * Bollinger Bands Indicator Logic
 * Encapsulates all Bollinger-related functionality
 */
window.BollingerIndicator = {
    getConfigHTML: function () {
        return `
            <div class="boll-config-container ind-config-container">
                <!-- 1. Period -->
                <div class="config-row ind-config-row">
                    <div class="config-label ind-config-label">週期</div>
                    <div class="pill-group ind-pill-group">
                        <button type="button" class="config-pill-btn active ind-pill-flex" data-group="boll-period">日K</button>
                        <button type="button" class="config-pill-btn ind-pill-flex" data-group="boll-period">周K</button>
                        <button type="button" class="config-pill-btn ind-pill-flex" data-group="boll-period">月K</button>
                        <button type="button" class="config-pill-btn ind-pill-flex" data-group="boll-period">60分K</button>
                    </div>
                </div>

                <!-- 2. Range -->
                <div class="config-row ind-config-row">
                    <div class="config-label ind-config-label">範圍</div>
                    <div class="pill-group ind-pill-group">
                        <button type="button" class="config-pill-btn active ind-pill-flex" data-group="boll-range">當前值</button>
                        <button type="button" class="config-pill-btn ind-pill-flex" data-group="boll-range">連續週期</button>
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

                <!-- 3. Conditions (Presets) -->
                <div class="config-row ind-config-row">
                    <div class="config-label ind-config-label">條件</div>
                    <div class="pill-group ind-pill-group-wrap ind-boll-presets">
                        <button type="button" class="config-pill-btn ind-pill-flex ind-pill-min" data-group="boll-mode" data-mode="break-upper">升穿上軌</button>
                        <button type="button" class="config-pill-btn ind-pill-flex ind-pill-min" data-group="boll-mode" data-mode="break-middle-up">升穿中軌</button>
                        <button type="button" class="config-pill-btn ind-pill-flex ind-pill-min" data-group="boll-mode" data-mode="break-middle-down">跌穿中軌</button>
                        <button type="button" class="config-pill-btn ind-pill-flex ind-pill-min" data-group="boll-mode" data-mode="break-lower">跌穿下軌</button>
                    </div>
                     <div class="pill-group ind-pill-group mt-2">
                        <button type="button" class="config-pill-btn active ind-pill-warning" data-group="boll-mode" data-mode="custom">自訂</button>
                    </div>
                </div>
                
                <!-- 4. Parameters -->
                <div class="config-row ind-params-panel">
                     <div class="config-label ind-config-label-primary">參數設定</div>
                     <div class="ind-params-row">
                        <div class="ind-param-inline">
                             <label class="ind-config-label">計算週期</label>
                             <input type="number" class="number-input param-p ind-input-60" value="20">
                        </div>
                        <div class="ind-param-inline">
                             <label class="ind-config-label">標準差</label>
                             <input type="number" class="number-input param-std ind-input-60" value="2">
                        </div>
                     </div>
                </div>

                <!-- 5. Dynamic Conditions List -->
                <div class="conditions-list-container ind-conditions-list">
                     ${this.getConditionRowHTML()}
                </div>

                <!-- 6. Add Condition Link -->
                <div class="ind-add-condition-wrap">
                    <span class="btn-add-condition ind-add-condition">
                         <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        添加條件
                    </span>
                </div>

                <!-- 7. Footer -->
                <div class="config-footer ind-config-footer">
                     <div class="ind-config-footer-actions">
                        <button type="button" class="btn btn-sm btn-ghost btn-cancel-boll ind-btn-compact">取消</button>
                        <button type="button" class="btn btn-sm btn-secondary btn-confirm-boll ind-btn-compact">確定</button>
                     </div>
                </div>
            </div>
        `;
    },

    getConditionRowHTML: function () {
        return `
            <div class="condition-row ind-condition-row-flex">
                <select class="select-input ind-select-flex">
                    <option value="" selected></option>
                    <option value="upper">UPPER</option>
                    <option value="middle">MIDDLE</option>
                    <option value="lower">LOWER</option>
                </select>
                
                <select class="select-input ind-select-flex">
                    <option value="gt">大於</option>
                    <option value="lt">小於</option>
                    <option value="cross_up">升穿</option>
                    <option value="cross_down">跌破</option>
                </select>
                
                <select class="select-input ind-select-flex">
                    <option value="" selected></option>
                    <option value="price">價格</option>
                    <option value="value">數值</option>
                    <option value="upper">UPPER</option>
                    <option value="middle">MIDDLE</option>
                    <option value="lower">LOWER</option>
                </select>
                <input type="number" class="number-input is-hidden ind-input-60" placeholder="數值">

                <span class="btn-delete-row ind-delete-row">
                    刪除
                </span>
            </div>
        `;
    },

    addConditionRow: function (configArea) {
        const list = configArea.querySelector('.conditions-list-container');
        if (list) {
            list.insertAdjacentHTML('beforeend', this.getConditionRowHTML());
            this._setupConditionRow(list.lastElementChild);
        }
    },

    _setupConditionRow: function (row) {
        if (!row) return;
        const selects = row.querySelectorAll('select');
        const rightSelect = selects[2];
        const valInput = row.querySelector('input');
        if (!rightSelect || !valInput) return;

        const syncValueInput = () => {
            const showValue = rightSelect.value === 'value';
            valInput.classList.toggle('is-hidden', !showValue);
            valInput.classList.toggle('is-block', showValue);
        };

        if (row.dataset.valueSyncBound !== '1') {
            rightSelect.addEventListener('change', syncValueInput);
            row.dataset.valueSyncBound = '1';
        }

        syncValueInput();
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
        const active = card.querySelector('.config-pill-btn[data-group="boll-mode"].active');
        return active ? active.dataset.mode : 'custom';
    },

    _syncRangeUI: function (card) {
        const rangeMode = this._getActiveText(card, 'boll-range', '當前值');
        const row = card.querySelector('.ind-consecutive-row');
        if (!row) return;

        const show = rangeMode === '連續週期';
        row.classList.toggle('is-hidden', !show);
        row.classList.toggle('is-block', show);
    },

    _syncModeUI: function (card) {
        const mode = this._getActiveMode(card);
        const configContainer = card.querySelector('.boll-config-container');
        if (!configContainer) return;

        const list = configContainer.querySelector('.conditions-list-container');
        const addWrap = configContainer.querySelector('.ind-add-condition-wrap');
        if (!list || !addWrap) return;

        const showCustom = mode === 'custom';
        list.classList.toggle('is-hidden', !showCustom);
        list.classList.toggle('is-block', showCustom);
        addWrap.classList.toggle('is-hidden', !showCustom);
        addWrap.classList.toggle('is-block', showCustom);

        const pInput = configContainer.querySelector('.param-p');
        const stdInput = configContainer.querySelector('.param-std');
        if (pInput && stdInput) {
            if (showCustom) {
                pInput.disabled = false;
                stdInput.disabled = false;
                if (configContainer.dataset.customPeriod) pInput.value = configContainer.dataset.customPeriod;
                if (configContainer.dataset.customStd) stdInput.value = configContainer.dataset.customStd;
                delete configContainer.dataset.customPeriod;
                delete configContainer.dataset.customStd;
            } else {
                configContainer.dataset.customPeriod = pInput.value || '20';
                configContainer.dataset.customStd = stdInput.value || '2';
                pInput.value = '20';
                stdInput.value = '2';
                pInput.disabled = true;
                stdInput.disabled = true;
            }
        }

        const tooltipText = '預設 BOLL period=20、std_dev=2\n此為美股布林帶國際標準用法（John Bollinger 原始定義）';
        card.querySelectorAll('.config-pill-btn[data-group="boll-mode"]').forEach(btn => {
            if (btn.dataset.mode !== 'custom') {
                btn.title = tooltipText;
            } else {
                btn.title = '';
            }
        });
    },

    onPillStateChanged: function (card) {
        this._syncRangeUI(card);
        this._syncModeUI(card);
    },

    confirmConfig: function (card) {
        const period = this._getActiveText(card, 'boll-period', '日K');
        const rangeMode = this._getActiveText(card, 'boll-range', '當前值');
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

        const pInput = card.querySelector('.param-p');
        const stdInput = card.querySelector('.param-std');
        const pVal = parseInt((pInput && pInput.value) || '20', 10) || 20;
        const stdVal = parseFloat((stdInput && stdInput.value) || '2') || 2;

        const customConfigs = [];
        const presetMapByMode = {
            'break-upper': {
                name: '升穿上軌',
                condition: { left: 'close', operator: '>', right: 'BB_UPPER' }
            },
            'break-middle-up': {
                name: '升穿中軌',
                condition: { left: 'close', operator: '>', right: 'BB_MIDDLE' }
            },
            'break-middle-down': {
                name: '跌穿中軌',
                condition: { left: 'close', operator: '<', right: 'BB_MIDDLE' }
            },
            'break-lower': {
                name: '跌穿下軌',
                condition: { left: 'close', operator: '<', right: 'BB_LOWER' }
            }
        };

        const backendConditions = [];
        const displayConditions = [];
        const presets = [];

        if (mode !== 'custom' && presetMapByMode[mode]) {
            const preset = presetMapByMode[mode];
            presets.push(preset.name);
            backendConditions.push(preset.condition);
            displayConditions.push(preset.name);
        }

        if (mode === 'custom') {
            card.querySelectorAll('.condition-row').forEach(row => {
                const selects = row.querySelectorAll('select');
                if (selects.length < 3) return;

                const leftVal = selects[0].value;
                const opVal = selects[1].value;
                const rightSelect = selects[2].value;

                if (!leftVal || !rightSelect) {
                    return;
                }

                let rightVal;

                if (rightSelect === 'value') {
                    const valInput = row.querySelector('input');
                    const parsedValue = parseFloat((valInput && valInput.value) || '');
                    if (!Number.isFinite(parsedValue)) {
                        return;
                    }
                    rightVal = parsedValue;
                } else {
                    const map = { upper: 'BB_UPPER', middle: 'BB_MIDDLE', lower: 'BB_LOWER', price: 'close' };
                    rightVal = map[rightSelect] || rightSelect;
                }

                const leftMap = { upper: 'BB_UPPER', middle: 'BB_MIDDLE', lower: 'BB_LOWER', price: 'close' };
                const finalLeft = leftMap[leftVal] || leftVal;

                const opMap = { gt: '>', lt: '<', gte: '>=', lte: '<=', cross_up: '>', cross_down: '<' };
                const finalOp = opMap[opVal] || opVal;

                backendConditions.push({
                    left: finalLeft,
                    operator: finalOp,
                    right: rightVal
                });

                customConfigs.push({
                    left: leftVal,
                    op: opVal,
                    right: rightSelect,
                    val: rightSelect === 'value' ? rightVal : ''
                });

                const appendParams = (str) => {
                    if (['UPPER', 'MIDDLE', 'MIDDLER', 'LOWER'].includes(str)) {
                        return `${str}${pVal}_${stdVal}`;
                    }
                    if (str === '價格') {
                        return '價格';
                    }
                    return str;
                };

                const leftText = selects[0].options[selects[0].selectedIndex].text;
                const opSymbol = opMap[opVal] || opVal;
                let rightText = selects[2].options[selects[2].selectedIndex].text;
                if (rightSelect === 'value') rightText = String(rightVal);

                const leftStr = appendParams(leftText);
                const rightStr = appendParams(rightText);

                displayConditions.push(`${leftStr}${opSymbol}${rightStr}`);
            });

            if (backendConditions.length === 0) {
                alert('請至少設定一個有效的 BOLL 自訂條件');
                return;
            }
        }

        const helper = window.IndicatorFormatHelpers;
        const summaryLines = (helper && typeof helper.buildSummaryLines === 'function')
            ? helper.buildSummaryLines('BOLL', period, displayConditions.length > 0 ? displayConditions : ['自訂條件'], rangeN)
            : (displayConditions.length > 0 ? displayConditions : ['自訂條件']).map(cond => {
                const prefix = rangeN > 1 ? `連續${rangeN}次` : '';
                return `BOLL-${prefix}${period}: ${cond}`;
            });

        const config = {
            type: 'bollinger',
            timeframe: timeframe,
            period: period,
            range: rangeMode,
            range_n: rangeN,
            presets: presets,
            parameters: { period: pVal, std_dev: stdVal },
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

        const periodBtns = container.querySelectorAll('.config-pill-btn[data-group="boll-period"]');
        periodBtns.forEach(btn => {
            const isActive = btn.textContent.trim() === (config.period || '日K');
            btn.classList.toggle('active', isActive);
        });

        const rangeBtns = container.querySelectorAll('.config-pill-btn[data-group="boll-range"]');
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

        if (config.parameters || config.params) {
            const p = config.parameters ? config.parameters.period : config.params.p;
            const std = config.parameters ? config.parameters.std_dev : config.params.std;
            const pInput = container.querySelector('.param-p');
            const stdInput = container.querySelector('.param-std');
            if (pInput) pInput.value = p;
            if (stdInput) stdInput.value = std;
        }

        const modeBtns = container.querySelectorAll('.config-pill-btn[data-group="boll-mode"]');
        modeBtns.forEach(btn => btn.classList.remove('active'));

        const presetName = (config.presets && config.presets[0]) || '';
        const modeMap = {
            '升穿上軌': 'break-upper',
            '升穿中軌': 'break-middle-up',
            '跌穿中軌': 'break-middle-down',
            '跌穿下軌': 'break-lower'
        };
        const mode = modeMap[presetName] || 'custom';
        const modeBtn = container.querySelector(`.config-pill-btn[data-group="boll-mode"][data-mode="${mode}"]`);
        if (modeBtn) modeBtn.classList.add('active');

        const list = container.querySelector('.conditions-list-container');
        if (list) {
            if (config.custom && config.custom.length > 0) {
                list.innerHTML = '';
                config.custom.forEach(rowConfig => {
                    this.addConditionRow(container);
                    const lastRow = list.lastElementChild;
                    const selects = lastRow.querySelectorAll('select');

                    selects[0].value = rowConfig.left;
                    selects[1].value = rowConfig.op;
                    selects[2].value = rowConfig.right;

                    if (rowConfig.right === 'value') {
                        const input = lastRow.querySelector('input');
                        input.classList.remove('is-hidden');
                        input.classList.add('is-block');
                        input.value = rowConfig.val;
                    }

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
     * ✅ 計算 Bollinger Bands 指標（Phase 1 重構新增）
     * @param {Array} chartData - K 線數據 [{time, open, high, low, close, volume}, ...]
     * @param {Object} config - 配置 {period: 20, stdDev: 2, ...}
     * @returns {Object} {upper: [{time, value}], middle: [{time, value}], lower: [{time, value}]}
     */
    calculate: function (chartData, config) {
        const period = config.period || 20;
        const stdDev = config.stdDev || 2;

        const upper = [];
        const middle = [];
        const lower = [];

        for (let i = 0; i < chartData.length; i++) {
            if (i < period - 1) {
                upper.push({ time: chartData[i].time, value: null });
                middle.push({ time: chartData[i].time, value: null });
                lower.push({ time: chartData[i].time, value: null });
            } else {
                // Calculate MA (middle band)
                const slice = chartData.slice(i - period + 1, i + 1);
                const sum = slice.reduce((acc, bar) => acc + bar.close, 0);
                const ma = sum / period;

                // Calculate Standard Deviation
                const variance = slice.reduce((acc, bar) => {
                    return acc + Math.pow(bar.close - ma, 2);
                }, 0) / period;
                const std = Math.sqrt(variance);

                upper.push({ time: chartData[i].time, value: ma + stdDev * std });
                middle.push({ time: chartData[i].time, value: ma });
                lower.push({ time: chartData[i].time, value: ma - stdDev * std });
            }
        }

        return { upper, middle, lower };
    },

    /**
     * ✅ 獲取渲染配置（支援 SSOT 新結構的 per-band 顏色/線寬）
     * @param {Object} config - 指標配置 {period, stdDev, lines: {upper, middle, lower}}
     * @returns {Object} 渲染配置
     */
    getRenderConfig: function (config) {
        const lines = config.lines || {};
        return {
            renderType:   'bands',
            upperColor:   (lines.upper  && lines.upper.color)  || '#808080',
            middleColor:  (lines.middle && lines.middle.color) || '#ffb6c1',
            lowerColor:   (lines.lower  && lines.lower.color)  || '#00ffff',
            upperLineWidth:  (lines.upper  && lines.upper.lineWidth)  || 1,
            middleLineWidth: (lines.middle && lines.middle.lineWidth) || 1,
            lowerLineWidth:  (lines.lower  && lines.lower.lineWidth)  || 1,
            lineWidth: 1,
            title: `BOLL(${config.period || 20},${config.stdDev || 2})`,
            priceScaleId: 'right'
        };
    }
};

// ========== ✅ 自動註冊到指標註冊中心 ==========
if (window.IndicatorRegistry) {
    window.IndicatorRegistry.register('bollinger', window.BollingerIndicator);
}
