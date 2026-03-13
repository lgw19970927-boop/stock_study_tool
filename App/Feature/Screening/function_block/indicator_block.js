/**
 * Indicator Screening Block
 * Handles adding, removing, editing, and checking validation for Technical Indicators.
 * Delegates actual configuration logic to specific Indicator Modules (SMAIndicator, BollingerIndicator, etc.)
 */
window.ScreeningBlockIndicator = {
    init: function () {
        this.bindEvents();
        this.syncFromState();
    },

    syncFromState: function () {
        const indicators = window.state.filters.indicators;
        if (!indicators || indicators.length === 0) return;

        const container = document.getElementById('indicatorList');
        if (!container) return;

        container.innerHTML = ''; // 清空以確保重新渲染

        indicators.forEach(config => {
            const id = 'ind-' + Date.now() + Math.random().toString(36).substr(2, 5);
            const card = document.createElement('div');
            card.className = 'indicator-card';
            card.id = id;
            container.appendChild(card);

            const module = this.getIndicatorModule(config.type || 'sma');
            if (module && typeof module.restoreState === 'function' && typeof module.confirmConfig === 'function') {
                // 1. 建立空殼與預設選項
                card.innerHTML = `
                    <div class="indicator-header">
                        <select class="select-input indicator-type-select"><option value="${config.type}">${config.type}</option></select>
                    </div>
                    <div class="indicator-config-area"></div>
                `;
                // 2. 渲染 UI
                this.updateIndicatorConfig(card, config.type);
                // 3. 還原 State 至 Inputs
                const containerNode = card.querySelector('.indicator-config-area').firstElementChild;
                if (containerNode) {
                    module.restoreState(containerNode, config);
                }
                // 4. 確認設定以生成 Summary
                module.confirmConfig(card);
            }
        });
    },

    bindEvents: function () {
        const list = document.getElementById('indicatorList');
        if (list) {
            list.addEventListener('change', (e) => {
                // Type Change
                if (e.target.classList.contains('indicator-type-select')) {
                    this.updateIndicatorConfig(e.target.closest('.indicator-card'), e.target.value);
                }
            });

            list.addEventListener('click', (e) => {
                const card = e.target.closest('.indicator-card');
                if (!card) return;

                // Handle "Add Condition" button
                if (e.target.closest('.btn-add-condition')) {
                    // Start: Logic previously in unified handler
                    // We need to know the type to call the right module
                    // The select might be gone if we are in summary mode? 
                    // No, Add Condition is only visible in Config Mode (Edit Mode)
                    const select = card.querySelector('.indicator-type-select');
                    const type = select ? select.value : 'sma'; // Default fallback

                    this.addConditionRow(card, type);
                }

                // Handle "Delete" row
                if (e.target.closest('.btn-delete-row')) {
                    e.target.closest('.condition-row').remove();
                }

                // Handle Pill Buttons in Config
                if (e.target.classList.contains('config-pill-btn')) {
                    e.target.classList.toggle('active');
                    // Enforce single select for Period/Range
                    const row = e.target.closest('.config-row');
                    if (row) {
                        const label = row.querySelector('.config-label').textContent;
                        if (label.includes('週期') || label.includes('範圍')) {
                            if (e.target.classList.contains('active')) {
                                row.querySelectorAll('.config-pill-btn').forEach(btn => {
                                    if (btn !== e.target) btn.classList.remove('active');
                                });
                            } else {
                                // Enforce at least one? Or allow toggle off?
                                // Previous logic was simple toggle. 
                                // But let's re-add the UX improvement: "Always one active" if it is a radio-like behavior
                                e.target.classList.add('active');
                            }
                        }
                    }
                }

                // Handle Confirm - Unified
                if (e.target.classList.contains('btn-confirm-sma')) this.confirmIndicatorConfig(card, 'sma');
                if (e.target.classList.contains('btn-confirm-boll')) this.confirmIndicatorConfig(card, 'bollinger');
                if (e.target.classList.contains('btn-confirm-volume')) this.confirmIndicatorConfig(card, 'volume');
                if (e.target.classList.contains('btn-confirm-amount')) this.confirmIndicatorConfig(card, 'amount');

                // Handle Cancel - Unified
                if (e.target.classList.contains('btn-cancel-sma') ||
                    e.target.classList.contains('btn-cancel-boll') ||
                    e.target.classList.contains('btn-cancel-volume') ||
                    e.target.classList.contains('btn-cancel-amount')) {
                    card.remove();
                }

                // Handle Edit (From Summary)
                if (e.target.closest('.btn-edit-summary')) {
                    this.editIndicatorConfig(card);
                }
            });
        }

        // Add Indicator Button (Global button outside the list)
        const addBtn = document.getElementById('addIndicator');
        if (addBtn) {
            // Remove old listeners? No, we will remove them in screening.js
            addBtn.addEventListener('click', () => {
                this.addIndicatorCard();
            });
        }
    },

    // --- Core Actions ---

    getIndicatorModule: function (type) {
        if (!type) return null;
        let className = '';
        if (['sma', 'rsi', 'macd'].includes(type.toLowerCase())) {
            className = type.toUpperCase();
        } else {
            className = type.charAt(0).toUpperCase() + type.slice(1);
        }
        const moduleName = className + 'Indicator';
        return window[moduleName];
    },

    addIndicatorCard: function () {
        const container = document.getElementById('indicatorList');
        if (!container) return;

        const id = 'ind-' + Date.now();
        const html = `
            <div class="indicator-card" id="${id}">
                <div class="indicator-header">
                    <select class="select-input indicator-type-select">
                        <option value="sma">簡單移動平均線 (SMA)</option>
                        <option value="bollinger">布林通道 (Bollinger Bands)</option>
                        <option value="volume">成交量 (Trading Volume)</option>
                        <option value="amount">成交金額 (Trading Amount)</option>
                    </select>
                    <button type="button" class="btn-icon btn-remove-indicator" onclick="document.getElementById('${id}').remove()">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                <div class="indicator-config-area">
                    <!-- Dynamic Config Loaded Here -->
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);

        // Initialize the new card with SMA template immediately
        const newCard = document.getElementById(id);
        this.updateIndicatorConfig(newCard, 'sma');
    },

    updateIndicatorConfig: function (card, type) {
        const configArea = card.querySelector('.indicator-config-area');
        if (!configArea) return;

        const module = this.getIndicatorModule(type);
        if (module && typeof module.getConfigHTML === 'function') {
            configArea.innerHTML = module.getConfigHTML();
        } else {
            console.warn(`Indicator module for '${type}' not found or invalid.`);
            configArea.innerHTML = `<div style="padding:10px; color:var(--text-muted); font-size:12px;">模組尚未載入: ${type}</div>`;
        }
    },

    confirmIndicatorConfig: function (card, type) {
        const module = this.getIndicatorModule(type);
        if (module && typeof module.confirmConfig === 'function') {
            module.confirmConfig(card);
        }
    },

    addConditionRow: function (card, type) {
        // Find container: .sma-config-container, .boll-config-container etc.
        // Usually it's the first child of indicator-config-area
        const container = card.querySelector('.indicator-config-area').firstElementChild;
        const module = this.getIndicatorModule(type);
        if (module && typeof module.addConditionRow === 'function') {
            module.addConditionRow(container);
        }
    },

    // --- Edit & Restore ---

    editIndicatorConfig: function (card, providedConfig) {
        let config;

        if (providedConfig) {
            config = providedConfig;
        } else {
            const summaryItem = card.querySelector('.indicator-summary-item');
            if (!summaryItem) return;

            const configStr = summaryItem.getAttribute('data-config');
            if (!configStr) return;

            config = JSON.parse(configStr.replace(/&quot;/g, '"'));
        }

        const type = config.type || 'sma';

        // 1. Restore Card Structure
        card.style.padding = '';
        card.style.border = '';
        card.style.background = '';

        // Re-inject Header + Config Area
        card.innerHTML = `
            <div class="indicator-header">
                <select class="select-input indicator-type-select">
                    <option value="sma">簡單移動平均線 (SMA)</option>
                    <option value="bollinger">布林通道 (Bollinger Bands)</option>
                    <option value="volume">成交量 (Trading Volume)</option>
                    <option value="amount">成交金額 (Trading Amount)</option>
                </select>
                <button type="button" class="btn-icon btn-remove-indicator" onclick="this.closest('.indicator-card').remove()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
            <div class="indicator-config-area"></div>
        `;

        // 2. Set Select
        const select = card.querySelector('.indicator-type-select');
        select.value = type;

        // 3. Render HTML
        this.updateIndicatorConfig(card, type);

        // 4. Restore State
        const container = card.querySelector('.indicator-config-area').firstElementChild; // .sma-config-container
        const module = this.getIndicatorModule(type);

        if (module && typeof module.restoreState === 'function') {
            module.restoreState(container, config);
        }
    },


    /**
     * Updates the global window.state.filters.indicators
     */
    updateState: function () {
        const indicators = [];
        document.querySelectorAll('.indicator-summary-item').forEach(item => {
            const configStr = item.getAttribute('data-config');
            if (configStr) {
                try {
                    indicators.push(JSON.parse(configStr.replace(/&quot;/g, '"')));
                } catch (e) {
                    console.error('Failed to parse indicator config', e);
                }
            }
        });
        window.state.filters.indicators = indicators;
    },

    /**
     * Check if there are any unconfirmed indicators
     */
    hasUnconfirmed: function () {
        return document.querySelectorAll('.indicator-config-area').length > 0;
    }
};
