/**
 * SMA Indicator Logic
 * Encapsulates all SMA-related functionality
 */
window.SMAIndicator = {
    getConfigHTML: function () {
        return `
            <div class="sma-config-container" style="padding: 12px 0; border-top: 1px solid var(--border-subtle); margin-top: 8px;">
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

                <!-- 3. Predefined Conditions -->
                <div class="config-row" style="margin-bottom: 12px;">
                    <div class="config-label" style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">條件 (最多10個)</div>
                    <div class="pill-group" style="display: flex; gap: 8px;">
                        <button type="button" class="config-pill-btn" style="flex: 1;">多頭排列</button>
                        <button type="button" class="config-pill-btn" style="flex: 1;">空頭排列</button>
                        <button type="button" class="config-pill-btn active" style="flex: 1; border-color: var(--color-warning); color: var(--color-warning);">自訂</button>
                    </div>
                </div>

                <!-- 4. Dynamic Conditions List -->
                <div class="conditions-list-container" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
                     <!-- Default Row -->
                     ${this.getConditionRowHTML()}
                </div>

                <!-- 5. Add Condition Link -->
                <div style="margin-bottom: 16px;">
                    <span class="btn-add-condition" style="font-size: 12px; color: var(--accent-primary); cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        添加條件
                    </span>
                </div>

                <!-- 6. Footer -->
                <div class="config-footer" style="display: flex; justify-content: flex-end; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 12px;">
                     <div style="display: flex; gap: 8px;">
                        <button type="button" class="btn btn-sm btn-ghost btn-cancel-sma" style="padding: 4px 12px;">取消</button>
                        <button type="button" class="btn btn-sm btn-secondary btn-confirm-sma" style="padding: 4px 12px;">確定</button>
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

                <span class="btn-delete-row" style="color: var(--text-muted); cursor: pointer; font-size: 11px; text-decoration: underline;">
                    刪除
                </span>
            </div>
        `;
    },

    addConditionRow: function (configArea) {
        const list = configArea.querySelector('.conditions-list-container');
        if (list) {
            list.insertAdjacentHTML('beforeend', this.getConditionRowHTML());
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

        // 2. Get Presets & Custom Conditions
        const presets = [];
        const customConfigs = [];
        const displayConditions = [];

        // Check active pill buttons in Predefined Conditions
        const presetBtns = card.querySelectorAll('.config-row:nth-child(3) .config-pill-btn.active');
        presetBtns.forEach(btn => {
            const text = btn.textContent.trim();
            if (text !== '自訂') {
                presets.push(text);
                displayConditions.push(text);
            }
        });

        // Get Custom Rows
        card.querySelectorAll('.condition-row').forEach(row => {
            const selects = row.querySelectorAll('select');
            const inputs = row.querySelectorAll('input');

            if (selects.length >= 3) {
                const t1 = selects[0].value;
                const v1 = inputs[0].value;
                const op = selects[1].value;
                const t2 = selects[2].value;
                const v2 = inputs[1] ? inputs[1].value : '';

                customConfigs.push({ t1, v1, op, t2, v2 });

                // Display String construction
                const leftStr = t1 === 'Price' ? '價格' : `MA${v1}`;
                const opMap = { gt: '>', lt: '<', gte: '>=', lte: '<=', cross_up: '升穿', cross_down: '跌破' };
                const opStr = opMap[op] || op;

                let rightStr = '';
                if (t2 === 'Value') rightStr = v2;
                else if (t2 === 'Price') rightStr = '價格';
                else rightStr = `MA${v2}`;

                displayConditions.push(`${leftStr} ${opStr} ${rightStr}`);
            }
        });

        // 2.3 生成後端 Conditions 格式
        const backendConditions = [];

        // 處理 Custom Conditions
        customConfigs.forEach(cfg => {
            const { t1, v1, op, t2, v2 } = cfg;

            // 映射運算符
            const opMap = { gt: '>', lt: '<', gte: '>=', lte: '<=', cross_up: '>', cross_down: '<' }; // cross 暫時簡化為 > / <
            const operator = opMap[op] || op;

            // 映射左右值
            let left = t1 === 'Price' ? 'close' : `MA${v1}`;
            let right;

            if (t2 === 'Value') {
                right = parseFloat(v2);
            } else if (t2 === 'Price') {
                right = 'close';
            } else {
                right = `MA${v2}`;
            }

            backendConditions.push({
                left: left,
                operator: operator,
                right: right
            });
        });

        const conditionStr = displayConditions.length > 0 ? displayConditions.join(' + ') : '自訂條件';

        const config = {
            type: 'sma',
            timeframe: timeframe,
            period: period,
            range: card.querySelector('.config-row:nth-child(2) .config-pill-btn.active')?.textContent.trim() || '當前值',
            presets: presets,
            custom: customConfigs,
            conditions: backendConditions  // ✅ 新增：供後端運算使用
        };

        const configJson = JSON.stringify(config).replace(/"/g, '&quot;');

        // 3. Render Summary
        const summaryHTML = `
            <div class="indicator-summary-item" data-config="${configJson}" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border-subtle);">
                <div class="summary-text" style="color: #60a5fa; font-size: 14px; font-weight: 500;">
                    MA-${period}: ${conditionStr}
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

        // 1. Period
        const periodBtns = container.querySelectorAll('.config-row:nth-child(1) .config-pill-btn');
        periodBtns.forEach(btn => {
            if (btn.textContent.trim() === config.period) {
                periodBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            }
        });

        // 2. Range
        const rangeBtns = container.querySelectorAll('.config-row:nth-child(2) .config-pill-btn');
        if (config.range) {
            rangeBtns.forEach(btn => {
                if (btn.textContent.trim() === config.range) {
                    rangeBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                }
            });
        }

        // 3. Presets
        const presetBtns = container.querySelectorAll('.config-row:nth-child(3) .config-pill-btn');
        const savedPresets = config.presets || [];
        presetBtns.forEach(btn => {
            const text = btn.textContent.trim();
            if (text === '自訂') {
                if (config.custom && config.custom.length > 0) btn.classList.add('active');
                else btn.classList.remove('active');
            } else {
                if (savedPresets.includes(text)) btn.classList.add('active');
                else btn.classList.remove('active');
            }
        });

        // 4. Custom Rows
        const list = container.querySelector('.conditions-list-container');
        if (list && config.custom && config.custom.length > 0) {
            list.innerHTML = ''; // Clear default

            config.custom.forEach(c => {
                this.addConditionRow(container);
                const lastRow = list.lastElementChild;
                const selects = lastRow.querySelectorAll('select');
                const inputs = lastRow.querySelectorAll('input');

                selects[0].value = c.t1;
                inputs[0].value = c.v1;
                selects[1].value = c.op;
                selects[2].value = c.t2;
                if (inputs[1]) inputs[1].value = c.v2;
            });
        }
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
            lineWidth: 2,
            title: `MA${config.period || 20}`,
            priceScaleId: 'right'
        };
    }
};

// ========== ✅ 自動註冊到指標註冊中心 ==========
if (window.IndicatorRegistry) {
    window.IndicatorRegistry.register('sma', window.SMAIndicator);
}
