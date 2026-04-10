/**
 * sub_chart_control_bar.js - 副圖控制列 Overlay
 */
window.SubChartControlBar = {
    _inited: false,

    init() {
        if (this._inited) return;
        const wrapper = document.getElementById('chartWrapper');
        if (wrapper) {
            wrapper.addEventListener('mousemove', () => this.updateLayout());
        }
        window.addEventListener('resize', () => this.updateLayout());
        this._inited = true;
    },

    clear() {
        const container = document.getElementById('subChartControlBars');
        if (container) container.innerHTML = '';
    },

    render() {
        const container = document.getElementById('subChartControlBars');
        if (!container) return;

        const state = window.state?.chartIndicators;
        if (!state) {
            container.innerHTML = '';
            return;
        }

        const enabledOrder = this._getEnabledOrder();
        if (enabledOrder.length === 0) {
            container.innerHTML = '';
            return;
        }

        const expanded = window.state?.expandedSubChart;
        const visibleOrder = (expanded && enabledOrder.includes(expanded)) ? [expanded] : enabledOrder;
        const canExpand = enabledOrder.length >= 2;

        container.innerHTML = visibleOrder.map((name) => {
            const paneIndex = state[name]?.paneIndex;
            if (paneIndex === null || paneIndex === undefined) return '';

            const isExpanded = expanded === name;
            return `
                <div class="sub-chart-ctrl-bar" data-indicator="${name}" data-pane-index="${paneIndex}">
                    <button type="button" class="sub-ctrl-btn" title="${name} 設定"
                            onclick="window.SubChartControlBar.onGearClick('${name}')">⚙</button>
                    <button type="button" class="sub-ctrl-btn" title="關閉 ${name}"
                            onclick="window.SubChartControlBar.onCloseClick('${name}')">✕</button>
                    <span class="sub-ctrl-label">${name}</span>
                        <span class="sub-ctrl-values" id="sub-val-${name.toLowerCase()}">${this._buildValueHtml(name)}</span>
                    ${canExpand ? `
                    <button type="button" class="sub-ctrl-btn sub-ctrl-expand" title="${isExpanded ? '收合此副圖' : '展開此副圖'}"
                            onclick="window.SubChartControlBar.onExpandClick('${name}')">
                        <svg class="sub-icon-expand ${isExpanded ? 'is-hidden' : ''}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="14 3 21 3 21 10"></polyline>
                            <line x1="21" y1="3" x2="13" y2="11"></line>
                            <polyline points="10 21 3 21 3 14"></polyline>
                            <line x1="3" y1="21" x2="11" y2="13"></line>
                        </svg>
                        <svg class="sub-icon-collapse ${isExpanded ? '' : 'is-hidden'}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="4 14 10 14 10 20"></polyline>
                            <polyline points="20 10 14 10 14 4"></polyline>
                            <line x1="10" y1="14" x2="3" y2="21"></line>
                            <line x1="21" y1="3" x2="14" y2="10"></line>
                        </svg>
                    </button>
                    ` : ''}
                </div>
            `;
        }).join('');

        this.updateLayout();
    },

    updateLayout() {
        const chart = window.ChartController?.chart;
        const container = document.getElementById('subChartControlBars');
        if (!chart || !container || typeof chart.panes !== 'function') return;

        const panes = chart.panes();
        if (!Array.isArray(panes) || panes.length <= 1) return;

        let offsetTop = 0;
        panes.forEach((pane, idx) => {
            const paneHeight = this._paneHeight(pane);
            if (idx === 0) {
                offsetTop += paneHeight;
                return;
            }

            const bar = container.querySelector(`.sub-chart-ctrl-bar[data-pane-index="${idx}"]`);
            if (bar) bar.style.top = `${Math.max(0, Math.round(offsetTop + 2))}px`;
            offsetTop += paneHeight;
        });
    },

    updateValues(param) {
        const state = window.state?.chartIndicators;
        if (!state || !param || !param.seriesData) return;

        const volLine = state.VOL?.lines?.VOL1;
        if (volLine?.series) {
            const volData = param.seriesData.get(volLine.series);
            if (volData && volData.value !== null && volData.value !== undefined) {
                volLine.lastValue = Number(volData.value);
            }
        }

        const rsiLines = state.RSI?.lines || {};
        Object.values(rsiLines).forEach((lineCfg) => {
            if (!lineCfg?.series) return;
            const lineData = param.seriesData.get(lineCfg.series);
            if (lineData && lineData.value !== null && lineData.value !== undefined) {
                lineCfg.lastValue = Number(lineData.value);
            }
        });

        this._refreshValueTexts();
        this.updateLayout();
    },

    onGearClick(indicator) {
        if (window.ChartSettingsModal) {
            window.ChartSettingsModal.open(indicator);
        }
    },

    onCloseClick(indicator) {
        const state = window.state?.chartIndicators;
        if (!state || !state[indicator]) return;

        state[indicator].isGlobalEnabled = false;
        state.subChartOrder = (state.subChartOrder || []).filter((name) => name !== indicator);

        if (window.state.expandedSubChart === indicator) {
            window.state.expandedSubChart = null;
        }

        const toggleId = indicator === 'VOL' ? 'vol-toggle' : 'rsi-toggle';
        const toggle = document.getElementById(toggleId);
        if (toggle) toggle.checked = false;

        if (window.ChartSettingsModal) {
            window.ChartSettingsModal.saveToLocalStorage();
        }

        if (window.ChartController) {
            window.ChartController.renderIndicatorsFromState();
            if (indicator === 'RSI' && window.ChartSettingsModal?._axisConfig) {
                window.ChartController.applyAxisSettings(window.ChartSettingsModal._axisConfig);
            }
        }
    },

    onExpandClick(indicator) {
        if (window.ChartController) {
            window.ChartController.toggleSubChartExpand(indicator);
        }
    },

    onLineClick(indicator, lineKey) {
        const state = window.state?.chartIndicators;
        if (!state || !state[indicator]) return;

        if (indicator === 'RSI') {
            const line = state.RSI?.lines?.[lineKey];
            if (!line) return;
            line.isEnabled = !(line.isEnabled !== false);
            this._syncSettingsPanelLineToggle(lineKey, line.isEnabled);
        } else if (indicator === 'VOL') {
            const line = state.VOL?.lines?.VOL1;
            if (!line) return;
            line.isEnabled = !(line.isEnabled !== false);
            this._syncSettingsPanelLineToggle('VOL1', line.isEnabled);
        } else {
            return;
        }

        if (window.ChartSettingsModal) {
            window.ChartSettingsModal.saveToLocalStorage();
        }

        if (window.ChartController) {
            window.ChartController.toggleSubChartLineVisibility(indicator, lineKey);
        }

        this._refreshValueTexts();
        this.updateLayout();
    },

    _refreshValueTexts() {
        ['VOL', 'RSI'].forEach((name) => {
            const el = document.getElementById(`sub-val-${name.toLowerCase()}`);
            if (el) el.innerHTML = this._buildValueHtml(name);
        });
    },

    _buildValueHtml(indicator) {
        const state = window.state?.chartIndicators;
        if (!state) return '--';

        const withOpacity = (color, opacity) => {
            if (window.ChartController && typeof window.ChartController._withOpacity === 'function') {
                return window.ChartController._withOpacity(color, opacity);
            }
            return color || '#dce2f0';
        };

        if (indicator === 'VOL') {
            const volLine = state.VOL?.lines?.VOL1;
            const isEnabled = volLine?.isEnabled !== false;
            const value = isEnabled ? this._formatNumber(volLine?.lastValue, 0) : '--';
            const volColor = withOpacity(volLine?.color, volLine?.opacity);
            return `<span class="sub-line-token ${isEnabled ? '' : 'is-disabled'}" style="color:${volColor};" onclick="window.SubChartControlBar.onLineClick('VOL','VOL1')">VOL1: ${value}</span>`;
        }

        if (indicator === 'RSI') {
            const rsi = state.RSI?.lines || {};
            return ['RSI1', 'RSI2', 'RSI3'].map((key) => {
                const line = rsi[key];
                const isEnabled = line?.isEnabled !== false;
                const value = isEnabled ? this._formatNumber(line?.lastValue, 2) : '--';
                const label = Number.isFinite(Number(line?.period)) ? `RSI${Number(line.period)}` : key;
                const lineColor = withOpacity(line?.color, line?.opacity);
                return `<span class="sub-line-token ${isEnabled ? '' : 'is-disabled'}" style="color:${lineColor};" onclick="window.SubChartControlBar.onLineClick('RSI','${key}')">${label}: ${value}</span>`;
            }).join('');
        }

        return '--';
    },

    _syncSettingsPanelLineToggle(lineKey, checked) {
        const rsiInput = document.querySelector(`.rsi-line-row[data-line="${lineKey}"] input[type="checkbox"]`);
        if (rsiInput) rsiInput.checked = checked;

        if (lineKey === 'VOL1') {
            const volInput = document.querySelector('.sub-line-row[data-line="VOL1"] input[type="checkbox"]');
            if (volInput) volInput.checked = checked;
        }
    },

    _formatNumber(value, digits) {
        if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
        const num = Number(value);
        if (digits === 0) return Math.round(num).toLocaleString();
        return num.toFixed(digits);
    },

    _paneHeight(paneApi) {
        if (!paneApi) return 0;
        if (typeof paneApi.getHeight === 'function') return paneApi.getHeight();
        if (typeof paneApi.height === 'function') return paneApi.height();
        return 0;
    },

    _getEnabledOrder() {
        const state = window.state?.chartIndicators;
        if (!state) return [];

        const preferred = Array.isArray(state.subChartOrder) ? state.subChartOrder.slice() : [];
        const result = preferred.filter((name) => {
            if (name !== 'VOL' && name !== 'RSI') return false;
            return !!state[name]?.isGlobalEnabled;
        });

        ['VOL', 'RSI'].forEach((name) => {
            if (state[name]?.isGlobalEnabled && !result.includes(name)) {
                result.push(name);
            }
        });

        return result;
    },
};
