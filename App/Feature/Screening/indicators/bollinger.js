/**
 * Bollinger Bands Indicator Logic
 * Encapsulates all Bollinger-related functionality
 */
window.BollingerIndicator = {
    getConfigHTML: function () {
        return `
            <div class="boll-config-container" style="padding: 12px 0; border-top: 1px solid var(--border-subtle); margin-top: 8px;">
                <!-- 1. Period -->
                <div class="config-row" style="margin-bottom: 12px;">
                    <div class="config-label" style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">週期</div>
                    <div class="pill-group" style="display: flex; gap: 8px;">
                        <button type="button" class="config-pill-btn active" style="flex: 1;">日K</button>
                        <button type="button" class="config-pill-btn" style="flex: 1;">周K</button>
                        <button type="button" class="config-pill-btn" style="flex: 1;">月K</button>
                        <button type="button" class="config-pill-btn" style="flex: 1;">60分K</button>
                    </div>
                </div>

                <!-- 2. Range -->
                <div class="config-row" style="margin-bottom: 12px;">
                    <div class="config-label" style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">範圍</div>
                    <div class="pill-group" style="display: flex; gap: 8px;">
                        <button type="button" class="config-pill-btn active" style="flex: 1;">當前值</button>
                        <button type="button" class="config-pill-btn" style="flex: 1;">連續週期</button>
                    </div>
                </div>

                <!-- 3. Conditions (Presets) -->
                <div class="config-row" style="margin-bottom: 12px;">
                    <div class="config-label" style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">條件 (最多10個)</div>
                    <div class="pill-group" style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button type="button" class="config-pill-btn" style="flex: 1; min-width: 80px;">升穿上軌</button>
                        <button type="button" class="config-pill-btn" style="flex: 1; min-width: 80px;">升穿中軌</button>
                        <button type="button" class="config-pill-btn" style="flex: 1; min-width: 80px;">跌穿中軌</button>
                        <button type="button" class="config-pill-btn" style="flex: 1; min-width: 80px;">跌穿下軌</button>
                    </div>
                     <div class="pill-group" style="display: flex; gap: 8px; margin-top: 8px;">
                        <button type="button" class="config-pill-btn active" style="width: 100px; border-color: var(--color-warning); color: var(--color-warning);">自訂</button>
                    </div>
                </div>
                
                <!-- 4. Parameters -->
                <div class="config-row" style="margin-bottom: 12px; background: rgba(255,255,255,0.03); padding: 12px; border-radius: 4px;">
                     <div class="config-label" style="font-size: 12px; color: var(--text-primary); margin-bottom: 8px;">參數設定</div>
                     <div style="display: flex; gap: 16px; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                             <label style="font-size: 12px; color: var(--text-secondary);">計算週期</label>
                             <input type="number" class="number-input param-p" value="20" style="width: 60px;">
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                             <label style="font-size: 12px; color: var(--text-secondary);">標準差</label>
                             <input type="number" class="number-input param-std" value="2" style="width: 60px;">
                        </div>
                     </div>
                </div>

                <!-- 5. Dynamic Conditions List -->
                <div class="conditions-list-container" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">添加條件</div>
                     ${this.getConditionRowHTML()}
                </div>

                <!-- 6. Add Condition Link -->
                <div style="margin-bottom: 16px;">
                    <span class="btn-add-condition" style="font-size: 12px; color: var(--accent-primary); cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                         <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        添加條件
                    </span>
                </div>

                <!-- 7. Footer -->
                <div class="config-footer" style="display: flex; justify-content: flex-end; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 12px;">
                     <div style="display: flex; gap: 8px;">
                        <button type="button" class="btn btn-sm btn-ghost btn-cancel-boll" style="padding: 4px 12px;">取消</button>
                        <button type="button" class="btn btn-sm btn-secondary btn-confirm-boll" style="padding: 4px 12px;">確定</button>
                     </div>
                </div>
            </div>
        `;
    },

    getConditionRowHTML: function () {
        return `
            <div class="condition-row" style="display: flex; align-items: center; gap: 8px;">
                <select class="select-input" style="flex: 1;">
                    <option value="upper" selected>UPPER</option>
                    <option value="middle">MIDDLER</option>
                    <option value="lower">LOWER</option>
                </select>
                
                <select class="select-input" style="flex: 1;">
                    <option value="gt">大於</option>
                    <option value="lt">小於</option>
                    <option value="cross_up">升穿</option>
                    <option value="cross_down">跌破</option>
                </select>
                
                <select class="select-input" style="flex: 1;">
                    <option value="middle" selected>MIDDLER</option>
                    <option value="lower">LOWER</option>
                    <option value="upper">UPPER</option>
                    <option value="price">最新價</option>
                    <option value="value">數值</option>
                </select>
                <input type="number" class="number-input" placeholder="數值" style="width: 60px; display: none;">

                <span class="btn-delete-row" style="color: var(--text-muted); cursor: pointer; font-size: 11px; text-decoration: underline; white-space: nowrap;">
                    刪除
                </span>
            </div>
        `;
    },

    addConditionRow: function (configArea) {
        const list = configArea.querySelector('.conditions-list-container');
        if (list) {
            list.insertAdjacentHTML('beforeend', this.getConditionRowHTML());

            // Add logic to show/hide value input if "Value" is selected
            const lastRow = list.lastElementChild;
            const rightSelect = lastRow.querySelectorAll('select')[2];
            const valInput = lastRow.querySelector('input');

            // Initial check
            if (rightSelect.value === 'value') valInput.style.display = 'block';

            rightSelect.addEventListener('change', (e) => {
                valInput.style.display = e.target.value === 'value' ? 'block' : 'none';
            });
        }
    },

    confirmConfig: function (card) {
        // 1. Get Period & Map to Timeframe
        const periodBtn = card.querySelector('.config-row:nth-child(1) .config-pill-btn.active');
        const period = periodBtn ? periodBtn.textContent.trim() : '日K';

        // ✅ 映射週期到 timeframe（供後端API使用）
        const periodToTimeframe = {
            '日K': '1d',
            '周K': '1w',
            '月K': '1M',
            '60分K': '1h'
        };
        const timeframe = periodToTimeframe[period] || '1d';

        // 2. Get Params
        const pInput = card.querySelector('.param-p');
        const stdInput = card.querySelector('.param-std');
        const pVal = pInput ? pInput.value : 20;
        const stdVal = stdInput ? stdInput.value : 2;

        // 3. Get Conditions (From active pills)
        const conditionPills = card.querySelectorAll('.config-row:nth-child(3) .config-pill-btn.active');
        const conditions = Array.from(conditionPills).map(btn => btn.textContent.trim());

        const customConfigs = [];
        const presetMap = {
            '升穿上軌': { left: 'close', operator: '>', right: 'BB_UPPER' },
            '升穿中軌': { left: 'close', operator: '>', right: 'BB_MIDDLE' },
            '跌穿中軌': { left: 'close', operator: '<', right: 'BB_MIDDLE' },
            '跌穿下軌': { left: 'close', operator: '<', right: 'BB_LOWER' },
        };
        const presetDisplayMap = {
            '升穿上軌': `BOLL 最新價 > UPPER${pVal}_${stdVal}`,
            '升穿中軌': `BOLL 最新價 > MIDDLER${pVal}_${stdVal}`,
            '跌穿中軌': `BOLL 最新價 < MIDDLER${pVal}_${stdVal}`,
            '跌穿下軌': `BOLL 最新價 < LOWER${pVal}_${stdVal}`,
        };

        const backendConditions = [];
        const displayConditions = [];

        conditions.forEach(condStr => {
            if (presetMap[condStr]) {
                backendConditions.push(presetMap[condStr]);
                displayConditions.push(presetDisplayMap[condStr]);
            }
        });

        // 4.2 處理 Custom Conditions
        card.querySelectorAll('.condition-row').forEach(row => {
            const selects = row.querySelectorAll('select');
            const leftVal = selects[0].value;
            const opVal = selects[1].value;
            const rightSelect = selects[2].value; // 'upper', 'middle', 'lower', 'value', 'close'
            let rightVal;

            if (rightSelect === 'value') {
                const valInput = row.querySelector('input');
                rightVal = parseFloat(valInput.value);
            } else {
                const map = { upper: 'BB_UPPER', middle: 'BB_MIDDLE', lower: 'BB_LOWER', close: 'close' };
                rightVal = map[rightSelect] || rightSelect;
            }

            const leftMap = { upper: 'BB_UPPER', middle: 'BB_MIDDLE', lower: 'BB_LOWER', close: 'close' };
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

            // Format Logic: KEY -> KEY + P + _ + STD
            const appendParams = (str) => {
                if (['UPPER', 'MIDDLER', 'LOWER'].includes(str)) {
                    return `${str}${pVal}_${stdVal}`;
                }
                if (str === '最新價') {
                    return '最新價';
                }
                return str;
            };

            const leftText = selects[0].options[selects[0].selectedIndex].text;
            const opSymbol = opMap[opVal] || opVal;
            let rightText = selects[2].options[selects[2].selectedIndex].text;
            if (rightSelect === 'value') rightText = rightVal;

            const leftStr = appendParams(leftText);
            const rightStr = appendParams(rightText);

            displayConditions.push(`${leftStr} ${opSymbol} ${rightStr}`);
        });

        const conditionStr = displayConditions.length > 0 ? displayConditions.join(' + ') : '自訂條件';

        // 5. Create Config Object
        const config = {
            type: 'bollinger',
            timeframe: timeframe,
            period: period,
            range: card.querySelector('.config-row:nth-child(2) .config-pill-btn.active')?.textContent.trim() || '當前值',
            presets: conditions,
            parameters: { period: parseInt(pVal), std_dev: parseFloat(stdVal) },
            custom: customConfigs,
            conditions: backendConditions // ✅ 新增：供後端運算使用
        };
        const configJson = JSON.stringify(config).replace(/"/g, '&quot;');

        // 6. Render Summary
        const summaryHTML = `
            <div class="indicator-summary-item" 
                 data-config="${configJson}"
                 style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border-subtle);">
                <div class="summary-text" style="color: #60a5fa; font-size: 14px; font-weight: 500;">
                    BOLL-${period}: ${conditionStr}
                </div>
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

        // 1. Restore Period
        const periodBtns = container.querySelectorAll('.config-row:nth-child(1) .config-pill-btn');
        periodBtns.forEach(btn => {
            if (btn.textContent.trim() === config.period) {
                periodBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            }
        });

        // 2. Restore Range
        const rangeBtns = container.querySelectorAll('.config-row:nth-child(2) .config-pill-btn');
        if (config.range) {
            rangeBtns.forEach(btn => {
                if (btn.textContent.trim() === config.range) {
                    rangeBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                }
            });
        }

        // 3. Restore Params
        if (config.parameters || config.params) {
            const p = config.parameters ? config.parameters.period : config.params.p;
            const std = config.parameters ? config.parameters.std_dev : config.params.std;
            const pInput = container.querySelector('.param-p');
            const stdInput = container.querySelector('.param-std');
            if (pInput) pInput.value = p;
            if (stdInput) stdInput.value = std;
        }

        // 4. Restore Condition Pills (Presets)
        const conditionBtns = container.querySelectorAll('.config-row:nth-child(3) .config-pill-btn');
        conditionBtns.forEach(btn => btn.classList.remove('active'));

        if (config.presets && Array.isArray(config.presets)) {
            conditionBtns.forEach(btn => {
                if (config.presets.includes(btn.textContent.trim())) {
                    btn.classList.add('active');
                }
            });
        }

        // 5. Restore Custom Rows
        const list = container.querySelector('.conditions-list-container');
        if (list && config.custom && config.custom.length > 0) {
            // Remove the default row(s) except label
            while (list.children.length > 1) {
                list.removeChild(list.lastChild);
            }

            // Add rows
            config.custom.forEach(rowConfig => {
                this.addConditionRow(container);
                const lastRow = list.lastElementChild;
                const selects = lastRow.querySelectorAll('select');

                selects[0].value = rowConfig.left;
                selects[1].value = rowConfig.op;
                selects[2].value = rowConfig.right;

                if (rowConfig.right === 'value') {
                    const input = lastRow.querySelector('input');
                    input.style.display = 'block';
                    input.value = rowConfig.val;
                }
            });
        }
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
     * ✅ 獲取渲染配置（Phase 1 重構新增）
     * @param {Object} config - 指標配置 {period: 20, stdDev: 2, ...}
     * @returns {Object} 渲染配置
     */
    getRenderConfig: function (config) {
        return {
            renderType: 'bands',
            upperColor: '#ef5350',
            middleColor: '#ffa726',
            lowerColor: '#26a69a',
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
