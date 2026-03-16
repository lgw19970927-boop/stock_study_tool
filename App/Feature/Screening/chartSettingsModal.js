/**
 * 圖表設定彈窗模組
 * 負責處理圖表管理彈窗的所有邏輯
 */

window.ChartSettingsModal = {
    // 臨時設定（彈窗編輯中）
    tempSettings: null,

    // 指定要顯示的設定頁籍（由 open(target) 設置）
    _renderTarget: null,

    // 色板選擇器狀態
    colorPicker: {
        isOpen: false,
        callback: null,
        currentColor: '#ff0000',
        customColors: []
    },

    // 預設 MA 配置（匹配截圖：MA10/MA20 預設啟用）
    defaultMAConfig: [
        { period: 5,   color: '#ff0000', lineWidth: 1, opacity: 100, isEnabled: false },
        { period: 10,  color: '#ff8800', lineWidth: 1, opacity: 100, isEnabled: true  },
        { period: 20,  color: '#ffff00', lineWidth: 1, opacity: 100, isEnabled: true  },
        { period: 40,  color: '#0000ff', lineWidth: 1, opacity: 100, isEnabled: false },
        { period: 50,  color: '#00ff00', lineWidth: 1, opacity: 100, isEnabled: false },
        { period: 150, color: '#0088ff', lineWidth: 1, opacity: 100, isEnabled: false },
        { period: 200, color: '#8800ff', lineWidth: 1, opacity: 100, isEnabled: false },
    ],

    // 預設 BOLL 配置（SSOT 新結構）
    defaultBOLLConfig: {
        isGlobalEnabled: true,
        period: 20,
        stdDev: 2,
        lines: {
            middle: { color: '#ffb6c1', lineWidth: 1, opacity: 100, isEnabled: true },
            upper:  { color: '#808080', lineWidth: 1, opacity: 100, isEnabled: true },
            lower:  { color: '#00ffff', lineWidth: 1, opacity: 100, isEnabled: true }
        }
    },

    /**
     * 初始化彈窗事件
     */
    init() {
        console.log('[ChartSettingsModal] 初始化彈窗模組');

        // 綁定彈窗開關事件
        const btnClose = document.getElementById('btnCloseModalX');
        const btnCancel = document.getElementById('btnCancelSettings');
        const btnApply = document.getElementById('btnApplySettings');
        const overlay = document.getElementById('chartSettingsModal');

        if (btnClose) btnClose.addEventListener('click', () => this.close());
        if (btnCancel) btnCancel.addEventListener('click', () => this.close());
        if (btnApply) btnApply.addEventListener('click', () => this.apply());

        // 點擊彈窗外部關閉
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.close();
                }
            });
        }

        // ESC 鍵關閉
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.colorPicker.isOpen) {
                    this.closeColorPicker(false);
                } else {
                    const modal = document.getElementById('chartSettingsModal');
                    if (modal && modal.style.display !== 'none') {
                        this.close();
                    }
                }
            }
        });

        // 綁定左側指標切換事件（更新 tempSettings.isGlobalEnabled + 渲染設定面板）
        const maToggle = document.getElementById('ma-toggle');
        const bollToggle = document.getElementById('boll-toggle');

        if (maToggle) {
            maToggle.addEventListener('change', () => {
                if (this.tempSettings && this.tempSettings.MA) {
                    this.tempSettings.MA.isGlobalEnabled = maToggle.checked;
                }
                this._renderTarget = maToggle.checked ? 'MA' : null;
                this.renderSettings();
            });
        }
        if (bollToggle) {
            bollToggle.addEventListener('change', () => {
                if (this.tempSettings && this.tempSettings.BOLL) {
                    this.tempSettings.BOLL.isGlobalEnabled = bollToggle.checked;
                }
                this._renderTarget = bollToggle.checked ? 'BOLL' : null;
                this.renderSettings();
            });
        }

        // 初始化色板選擇器
        this.initColorPicker();
    },

    /**
     * 打開彈窗
     * @param {string|null} target - 'MA' | 'BOLL' | null，指定要顯示的設定頁籤
     */
    open(target = null) {
        console.log('[ChartSettingsModal] 打開彈窗', target ? `(target: ${target})` : '');

        // ✅ SSOT: 從新結構讀取到 tempSettings
        const maState   = window.state.chartIndicators.MA;
        const bollState = window.state.chartIndicators.BOLL;

        this.tempSettings = {
            MA: {
                isGlobalEnabled: maState ? maState.isGlobalEnabled : true,
                lines: (maState && maState.lines ? maState.lines : []).map(ma => ({
                    period:    ma.period,
                    color:     ma.color,
                    lineWidth: ma.lineWidth,
                    opacity:   ma.opacity,
                    isEnabled: ma.isEnabled !== undefined ? ma.isEnabled : (ma.visible !== undefined ? ma.visible : true)
                }))
            },
            BOLL: bollState ? {
                isGlobalEnabled: bollState.isGlobalEnabled,
                period:  bollState.period,
                stdDev:  bollState.stdDev,
                lines:   bollState.lines ? JSON.parse(JSON.stringify(
                    Object.fromEntries(Object.entries(bollState.lines).map(([k, v]) => [
                        k, { color: v.color, lineWidth: v.lineWidth, opacity: v.opacity, isEnabled: v.isEnabled }
                    ]))
                )) : null
            } : null
        };

        // 如果沒有任何設定，使用預設值
        if (!this.tempSettings.MA.lines || this.tempSettings.MA.lines.length === 0) {
            this.tempSettings.MA.lines = JSON.parse(JSON.stringify(this.defaultMAConfig));
        }
        if (!this.tempSettings.BOLL || !this.tempSettings.BOLL.lines) {
            this.tempSettings.BOLL = JSON.parse(JSON.stringify(this.defaultBOLLConfig));
        }

        // 設定左側勾選狀態
        const maToggle   = document.getElementById('ma-toggle');
        const bollToggle = document.getElementById('boll-toggle');

        if (maToggle)   maToggle.checked   = this.tempSettings.MA.isGlobalEnabled && this.tempSettings.MA.lines.length > 0;
        if (bollToggle) bollToggle.checked = !!(this.tempSettings.BOLL && this.tempSettings.BOLL.isGlobalEnabled);

        // ✅ Feature B: target 指定時，強制顯示對應設定頁
        if (target === 'BOLL') {
            if (bollToggle) bollToggle.checked = true;
            if (this.tempSettings.BOLL) this.tempSettings.BOLL.isGlobalEnabled = true;
            this._renderTarget = 'BOLL';
        } else if (target === 'MA') {
            if (maToggle) maToggle.checked = true;
            if (this.tempSettings.MA) this.tempSettings.MA.isGlobalEnabled = true;
            this._renderTarget = 'MA';
        } else {
            this._renderTarget = null;
        }

        // 渲染右側設定面板
        this.renderSettings();
        this._renderTarget = null; // 渲染完成後清除

        // 顯示彈窗
        const modal = document.getElementById('chartSettingsModal');
        if (modal) {
            modal.style.display = 'flex';
        }
    },

    /**
     * 關閉彈窗
     */
    close() {
        console.log('[ChartSettingsModal] 關閉彈窗');
        const modal = document.getElementById('chartSettingsModal');
        if (modal) {
            modal.style.display = 'none';
        }
        this.tempSettings = null;
    },

    /**
     * 渲染設定面板
     */
    renderSettings() {
        const maToggle   = document.getElementById('ma-toggle');
        const bollToggle = document.getElementById('boll-toggle');
        const container  = document.getElementById('settingsPanelContainer');

        if (!container) return;

        const showMA   = maToggle   && maToggle.checked;
        const showBOLL = bollToggle && bollToggle.checked;

        // ✅ Feature B: _renderTarget 指定時優先顯示對應頁籍
        const target = this._renderTarget;
        if (target === 'BOLL' && showBOLL) {
            container.innerHTML = this.renderBOLLSettings();
            this.bindBOLLEvents();
            return;
        }
        if (target === 'MA' && showMA) {
            container.innerHTML = this.renderMASettings();
            this.bindMAEvents();
            return;
        }

        if (showMA) {
            container.innerHTML = this.renderMASettings();
            this.bindMAEvents();
        } else if (showBOLL) {
            container.innerHTML = this.renderBOLLSettings();
            this.bindBOLLEvents();
        } else {
            container.innerHTML = `
                <div class="settings-placeholder">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                    </svg>
                    <p>請選擇左側的指標類型</p>
                </div>
            `;
        }
    },

    /**
     * 渲染 MA 設定面板
     */
    renderMASettings() {
        const maLines = (this.tempSettings.MA && this.tempSettings.MA.lines) ? this.tempSettings.MA.lines : [];

        let html = `
            <div class="settings-panel active">
                <h3 class="settings-title">MA: 移動平均線</h3>
                
                <div class="settings-tabs">
                    <button class="settings-tab-btn active">指標設定</button>
                    <button class="settings-tab-btn" disabled>指標介紹</button>
                </div>
                
                <div class="settings-actions">
                    <button class="btn btn-sm btn-ghost" id="btnResetMA">重置</button>
                    <button class="btn btn-sm btn-secondary" id="btnAddMA">新增MA線</button>
                </div>
                
                <div class="ma-list-header">
                    <span>參數名稱</span>
                    <span>參數值</span>
                    <span>指標線</span>
                    <span>線寬</span>
                    <span>顏色</span>
                    <span>不透明度(%)</span>
                    <span></span>
                </div>
                
                <div class="ma-list" id="maLinesList">
        `;

        maLines.forEach((ma, index) => {
            html += this.renderMALine(ma, index);
        });

        html += `
                </div>
            </div>
        `;

        return html;
    },

    /**
     * 渲染單條 MA 線
     */
    renderMALine(ma, index) {
        const opacity  = ma.opacity ?? 100;
        const isEnabled = ma.isEnabled !== undefined ? ma.isEnabled : (ma.visible !== undefined ? ma.visible : true);
        return `
            <div class="ma-line-item" data-index="${index}" data-period="${ma.period}">
                <label>
                    <input type="checkbox" ${isEnabled ? 'checked' : ''} onchange="window.ChartSettingsModal.toggleMAEnabled(${index})">
                    移動平均周期
                </label>
                <input type="number" value="${ma.period}" min="1" onchange="window.ChartSettingsModal.updateMAPeriod(${index}, this.value)">
                <span class="ma-label">MA${index + 1}</span>
                <input type="number" value="${ma.lineWidth || 1}" min="1" max="5" onchange="window.ChartSettingsModal.updateMALineWidth(${index}, this.value)">
                <button class="color-picker-btn" style="background: ${ma.color};" onclick="window.ChartSettingsModal.openColorPickerForMA(${index})"></button>
                <input type="range" value="${opacity}" min="0" max="100" oninput="window.ChartSettingsModal.updateMAOpacity(${index}, this.value)">
                <span class="opacity-value">${opacity}</span>
                <button class="btn-remove-ma" onclick="window.ChartSettingsModal.removeMALine(${index})" title="刪除">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `;
    },

    /**
     * 綁定 MA 事件
     */
    bindMAEvents() {
        const btnAdd   = document.getElementById('btnAddMA');
        const btnReset = document.getElementById('btnResetMA');

        if (btnAdd)   btnAdd.addEventListener('click',   () => this.addMALine());
        if (btnReset) btnReset.addEventListener('click', () => this.resetMA());
    },

    /**
     * 新增 MA 線
     */
    addMALine() {
        const lines = this.tempSettings.MA.lines;
        if (lines.length >= 10) {
            alert('最多只能添加 10 條 MA 線');
            return;
        }

        // 使用預設顏色序列
        const colors = ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#8800ff', '#ff00ff', '#00ffff', '#ffffff', '#808080'];
        const newMA = {
            period: 5,
            color: colors[lines.length % colors.length],
            lineWidth: 1,
            opacity: 100,
            isEnabled: true
        };

        lines.push(newMA);
        this.renderSettings();
    },

    /**
     * 刪除 MA 線
     */
    removeMALine(index) {
        this.tempSettings.MA.lines.splice(index, 1);
        this.renderSettings();
    },

    /**
     * 重置 MA 為預設值
     */
    resetMA() {
        if (confirm('確定要重置為預設 MA 配置嗎？')) {
            this.tempSettings.MA.lines = JSON.parse(JSON.stringify(this.defaultMAConfig));
            this.renderSettings();
        }
    },

    /**
     * 更新 MA 參數
     */
    toggleMAEnabled(index) {
        if (this.tempSettings.MA.lines[index]) {
            this.tempSettings.MA.lines[index].isEnabled = !this.tempSettings.MA.lines[index].isEnabled;
        }
    },

    // 向下相容旧名稱
    toggleMAVisible(index) { this.toggleMAEnabled(index); },

    updateMAPeriod(index, value) {
        if (this.tempSettings.MA.lines[index]) this.tempSettings.MA.lines[index].period = parseInt(value, 10);
    },

    updateMALineWidth(index, value) {
        if (this.tempSettings.MA.lines[index]) this.tempSettings.MA.lines[index].lineWidth = parseInt(value, 10);
    },

    updateMAOpacity(index, value) {
        if (this.tempSettings.MA.lines[index]) this.tempSettings.MA.lines[index].opacity = parseInt(value, 10);
        // 更新顯示值
        const item = document.querySelector(`.ma-line-item[data-index="${index}"] .opacity-value`);
        if (item) item.textContent = value;
    },

    /**
     * 打開色板選擇器（MA）
     */
    openColorPickerForMA(index) {
        const lines = this.tempSettings.MA.lines;
        if (!lines || !lines[index]) return;
        this.openColorPicker(lines[index].color, (color) => {
            lines[index].color = color;
            // 更新按鈕顏色
            const btn = document.querySelector(`.ma-line-item[data-index="${index}"] .color-picker-btn`);
            if (btn) btn.style.background = color;
        });
    },

    /**
     * 渲染 BOLL 設定面板（包含 MID/UPPER/LOWER 個別 checkbox）
     */
    renderBOLLSettings() {
        const boll = this.tempSettings.BOLL;
        if (!boll) return '';
        const lines = boll.lines || {};
        const buildLineRow = (key, label) => {
            const l = lines[key] || {};
            return `
            <div class="boll-line-config" data-line="${key}">
                <label style="display:flex;align-items:center;gap:4px;">
                    <input type="checkbox" ${l.isEnabled ? 'checked' : ''}
                           onchange="window.ChartSettingsModal.updateBOLLLineEnabled('${key}', this.checked)">
                    <span>${label}</span>
                </label>
                <input type="number" value="${l.lineWidth || 1}" min="1" max="5" onchange="window.ChartSettingsModal.updateBOLLLineWidth('${key}', this.value)">
                <button class="color-picker-btn" style="background: ${l.color || '#ffffff'};" onclick="window.ChartSettingsModal.openColorPickerForBOLL('${key}')"></button>
                <input type="range" value="${l.opacity !== undefined ? l.opacity : 100}" min="0" max="100" oninput="window.ChartSettingsModal.updateBOLLOpacity('${key}', this.value)">
                <span class="opacity-value">${l.opacity !== undefined ? l.opacity : 100}</span>
            </div>`;
        };

        return `
            <div class="settings-panel active">
                <h3 class="settings-title">BOLL: 布林線</h3>

                <div class="settings-tabs">
                    <button class="settings-tab-btn active">指標設定</button>
                    <button class="settings-tab-btn" disabled>指標介紹</button>
                </div>

                <div class="settings-actions">
                    <button class="btn btn-sm btn-ghost" id="btnResetBOLL">重置</button>
                </div>

                <div class="boll-params">
                    <div class="param-row">
                        <label>計算週期</label>
                        <input type="number" value="${boll.period}" min="1" id="bollPeriod">
                    </div>
                    <div class="param-row">
                        <label>股價特性參數</label>
                        <input type="number" value="${boll.stdDev}" step="0.1" min="0.1" id="bollStdDev">
                    </div>
                </div>

                <div class="boll-lines-header">
                    <span>參數名稱</span>
                    <span>線寬</span>
                    <span>顏色</span>
                    <span>不透明度(%)</span>
                </div>

                <div class="boll-lines">
                    ${buildLineRow('middle', 'MID')}
                    ${buildLineRow('upper',  'UPPER')}
                    ${buildLineRow('lower',  'LOWER')}
                </div>
            </div>
        `;
    },

    /**
     * 綁定 BOLL 事件
     */
    bindBOLLEvents() {
        const period = document.getElementById('bollPeriod');
        const stdDev = document.getElementById('bollStdDev');
        const btnReset = document.getElementById('btnResetBOLL');

        if (period) {
            period.addEventListener('change', (e) => {
                if (this.tempSettings.BOLL) this.tempSettings.BOLL.period = parseInt(e.target.value, 10);
            });
        }
        if (stdDev) {
            stdDev.addEventListener('change', (e) => {
                if (this.tempSettings.BOLL) this.tempSettings.BOLL.stdDev = parseFloat(e.target.value);
            });
        }
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                if (confirm('確定要重置 BOLL 配置嗎？')) {
                    this.tempSettings.BOLL = JSON.parse(JSON.stringify(this.defaultBOLLConfig));
                    this.renderSettings();
                }
            });
        }
    },

    /**
     * 更新 BOLL 參數
     */
    updateBOLLLineEnabled(line, value) {
        if (this.tempSettings.BOLL && this.tempSettings.BOLL.lines[line]) {
            this.tempSettings.BOLL.lines[line].isEnabled = value;
        }
    },

    updateBOLLLineWidth(line, value) {
        if (this.tempSettings.BOLL && this.tempSettings.BOLL.lines[line]) {
            this.tempSettings.BOLL.lines[line].lineWidth = parseInt(value, 10);
        }
    },

    updateBOLLOpacity(line, value) {
        if (this.tempSettings.BOLL && this.tempSettings.BOLL.lines[line]) {
            this.tempSettings.BOLL.lines[line].opacity = parseInt(value, 10);
        }
        const item = document.querySelector(`.boll-line-config[data-line="${line}"] .opacity-value`);
        if (item) item.textContent = value;
    },

    /**
     * 打開色板選擇器（BOLL）  
     */
    openColorPickerForBOLL(line) {
        this.openColorPicker(this.tempSettings.BOLL.lines[line].color, (color) => {
            this.tempSettings.BOLL.lines[line].color = color;
            const btn = document.querySelector(`.boll-line-config[data-line="${line}"] .color-picker-btn`);
            if (btn) btn.style.background = color;
        });
    },

    /**
     * ✅ Bug2 Fix: 套用設定（先清除舊 series，再寫入 SSOT，公用 currentChartData 重渲染）
     */
    apply() {
        console.log('[ChartSettingsModal] 套用設定');

        // ✅ Bug2 修復: 先清除所有舊 series，避免覆寫後找不到舊 series 導致重複渲染
        if (window.ChartController) {
            window.ChartController.clearIndicatorSeries();
        }

        // ✅ SSOT: 寫入新結構到 window.state.chartIndicators
        const maToggle   = document.getElementById('ma-toggle');
        const bollToggle = document.getElementById('boll-toggle');

        window.state.chartIndicators.MA = {
            isGlobalEnabled: !!(maToggle && maToggle.checked),
            lines: (this.tempSettings.MA.lines || []).map(ma => ({
                period:    ma.period,
                color:     ma.color,
                lineWidth: ma.lineWidth,
                opacity:   ma.opacity,
                isEnabled: ma.isEnabled !== undefined ? ma.isEnabled : true,
                series:    null
            }))
        };

        if (bollToggle && bollToggle.checked && this.tempSettings.BOLL) {
            const tBoll = this.tempSettings.BOLL;
            window.state.chartIndicators.BOLL = {
                isGlobalEnabled: true,
                period:  tBoll.period,
                stdDev:  tBoll.stdDev,
                lines: {
                    middle: { ...tBoll.lines.middle, series: null },
                    upper:  { ...tBoll.lines.upper,  series: null },
                    lower:  { ...tBoll.lines.lower,  series: null }
                }
            };
        } else {
            // 將 BOLL isGlobalEnabled 設為 false，但保留其他設定（下次開啟精砀）
            if (window.state.chartIndicators.BOLL) {
                window.state.chartIndicators.BOLL.isGlobalEnabled = false;
                // 清除 series 引用（已在上面 clearIndicatorSeries 處理）
                ['upper', 'middle', 'lower'].forEach(k => {
                    if (window.state.chartIndicators.BOLL.lines[k]) {
                        window.state.chartIndicators.BOLL.lines[k].series = null;
                    }
                });
            }
        }

        // ✅ 保存到 localStorage
        this.saveToLocalStorage();

        // ✅ Bug3 / Feature B: 使用現有 K 線資料重渲染（不重新 fetch API）
        if (window.ChartController) {
            window.ChartController.renderIndicatorsFromState();
        }

        // 關閉彈窗
        this.close();
    },

    /**
     * ✅ SSOT: 保存到 localStorage
     */
    saveToLocalStorage() {
        try {
            const settings = {
                MA:   window.state.chartIndicators.MA,
                BOLL: window.state.chartIndicators.BOLL
                    ? { isGlobalEnabled: window.state.chartIndicators.BOLL.isGlobalEnabled,
                        period: window.state.chartIndicators.BOLL.period,
                        stdDev: window.state.chartIndicators.BOLL.stdDev,
                        lines:  Object.fromEntries(
                            Object.entries(window.state.chartIndicators.BOLL.lines).map(
                                ([k, v]) => [k, { color: v.color, lineWidth: v.lineWidth, opacity: v.opacity, isEnabled: v.isEnabled }]
                            )
                        )}
                    : null
            };
            localStorage.setItem('chartIndicators', JSON.stringify(settings));
            console.log('[ChartSettingsModal] 設定已保存至 localStorage');
        } catch (error) {
            console.error('[ChartSettingsModal] 保存設定失敗:', error);
        }
    },

    /**
     * ✅ SSOT: 從 localStorage 載入（含舊格式 migration）
     */
    loadFromLocalStorage() {
        try {
            const saved = localStorage.getItem('chartIndicators');
            if (!saved) {
                // ✅ 首次載入（沒有 localStorage）：使用預設 MA 配置（MA10/MA20 預設啟用）
                window.state.chartIndicators.MA = {
                    isGlobalEnabled: true,
                    lines: JSON.parse(JSON.stringify(this.defaultMAConfig)).map(m => ({ ...m, series: null }))
                };
                console.log('[ChartSettingsModal] 首次載入，套用預設 MA 配置');
                return;
            }
            const settings = JSON.parse(saved);

            // Migration: 舊格式 MA 為陣列（非 SSOT 結構）
            if (Array.isArray(settings.MA)) {
                window.state.chartIndicators.MA = {
                    isGlobalEnabled: settings.MA.length > 0,
                    lines: settings.MA.map(ma => ({
                        period:    ma.period,
                        color:     ma.color,
                        lineWidth: ma.lineWidth || 1,
                        opacity:   ma.opacity   || 100,
                        isEnabled: ma.isEnabled !== undefined ? ma.isEnabled : (ma.visible !== undefined ? ma.visible : true),
                        series:    null
                    }))
                };
            } else if (settings.MA && settings.MA.lines) {
                window.state.chartIndicators.MA = {
                    ...settings.MA,
                    lines: (settings.MA.lines || []).map(ma => ({ ...ma, series: null }))
                };
            }

            // Migration: 舊格式 BOLL
            if (settings.BOLL) {
                const b = settings.BOLL;
                if (b.lines && b.lines.middle) {
                    window.state.chartIndicators.BOLL = {
                        isGlobalEnabled: b.isGlobalEnabled !== undefined ? b.isGlobalEnabled : (b.visible !== undefined ? b.visible : false),
                        period:  b.period  || 20,
                        stdDev:  b.stdDev  || 2,
                        lines: {
                            middle: { ...b.lines.middle, series: null },
                            upper:  { ...b.lines.upper,  series: null },
                            lower:  { ...b.lines.lower,  series: null }
                        }
                    };
                }
            }

            console.log('[ChartSettingsModal] 已從 localStorage 載入設定');
        } catch (error) {
            console.error('[ChartSettingsModal] 載入設定失敗:', error);
        }
    },

    // ========== 色板選擇器 ==========

    /**
     * 初始化色板選擇器
     */
    initColorPicker() {
        // 基本色彩色板（參考圖片）
        const basicColors = [
            '#ffffff', '#ffff00', '#00ff00', '#00ffff', '#00ffff', '#0000ff', '#ff00ff', '#ff00ff',
            '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0088ff', '#0000ff', '#8800ff', '#ff00ff',
            '#8b4513', '#ff8800', '#00ff00', '#008b8b', '#000080', '#8080ff', '#800000', '#ff0080',
            '#800000', '#ff8800', '#00ff00', '#008080', '#0000ff', '#000080', '#800080', '#8000ff',
            '#800000', '#808000', '#008000', '#008080', '#000080', '#000080', '#800080', '#800080',
            '#000000', '#808000', '#808000', '#808080', '#008080', '#c0c0c0', '#800080', '#ffffff'
        ];

        const container = document.getElementById('basicColors');
        if (container) {
            container.innerHTML = basicColors.map(color =>
                `<div class="color-cell" style="background: ${color};" data-color="${color}"></div>`
            ).join('');
        }

        // 自訂色彩槽位
        const customContainer = document.getElementById('customColors');
        if (customContainer) {
            customContainer.innerHTML = Array(8).fill(0).map((_, i) =>
                `<div class="color-cell" data-custom-index="${i}"></div>`
            ).join('');
        }

        // 綁定事件
        this.bindColorPickerEvents();
    },

    /**
     * 綁定色板選擇器事件
     */
    bindColorPickerEvents() {
        const btnClose = document.getElementById('btnCloseColorPicker');
        const btnCancel = document.getElementById('btnCancelColor');
        const btnConfirm = document.getElementById('btnConfirmColor');
        const btnDefine = document.getElementById('btnDefineCustomColor');
        const overlay = document.getElementById('colorPickerModal');

        if (btnClose) btnClose.addEventListener('click', () => this.closeColorPicker(false));
        if (btnCancel) btnCancel.addEventListener('click', () => this.closeColorPicker(false));
        if (btnConfirm) btnConfirm.addEventListener('click', () => this.closeColorPicker(true));

        // 點擊顏色選擇
        const container = document.getElementById('basicColors');
        if (container) {
            container.addEventListener('click', (e) => {
                if (e.target.classList.contains('color-cell')) {
                    this.selectColor(e.target.dataset.color);
                }
            });
        }

        // 定義自訂顏色
        if (btnDefine) {
            btnDefine.addEventListener('click', () => {
                const nativePicker = document.getElementById('nativeColorPicker');
                if (nativePicker) {
                    nativePicker.click();
                }
            });
        }

        // 原生顏色選擇器
        const nativePicker = document.getElementById('nativeColorPicker');
        if (nativePicker) {
            nativePicker.addEventListener('change', (e) => {
                const color = e.target.value;
                this.addCustomColor(color);
                this.selectColor(color);
            });
        }

        // 點擊外部關閉
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.closeColorPicker(false);
                }
            });
        }
    },

    /**
     * 打開色板選擇器
     */
    openColorPicker(currentColor, callback) {
        this.colorPicker.isOpen = true;
        this.colorPicker.currentColor = currentColor;
        this.colorPicker.callback = callback;

        // 標記當前選中的顏色
        this.selectColor(currentColor, false);

        const modal = document.getElementById('colorPickerModal');
        if (modal) {
            modal.style.display = 'flex';
        }
    },

    /**
     * 關閉色板選擇器
     */
    closeColorPicker(confirm) {
        if (confirm && this.colorPicker.callback) {
            this.colorPicker.callback(this.colorPicker.currentColor);
        }

        const modal = document.getElementById('colorPickerModal');
        if (modal) {
            modal.style.display = 'none';
        }

        this.colorPicker.isOpen = false;
        this.colorPicker.callback = null;
    },

    /**
     * 選擇顏色
     */
    selectColor(color, updateUI = true) {
        this.colorPicker.currentColor = color;

        if (updateUI) {
            // 移除所有 selected class
            document.querySelectorAll('.color-cell.selected').forEach(cell => {
                cell.classList.remove('selected');
            });

            // 添加 selected 到當前顏色
            document.querySelectorAll('.color-cell').forEach(cell => {
                if (cell.dataset.color === color) {
                    cell.classList.add('selected');
                }
            });
        }
    },

    /**
     * 添加自訂顏色
     */
    addCustomColor(color) {
        // 找到第一個空白槽位
        const customCells = document.querySelectorAll('#customColors .color-cell');
        for (let cell of customCells) {
            if (!cell.dataset.color) {
                cell.style.background = color;
                cell.dataset.color = color;
                cell.style.borderStyle = 'solid';

                // 添加點擊事件
                cell.addEventListener('click', () => {
                    this.selectColor(color);
                });
                break;
            }
        }
    }
};

// ====== HTMX 相容初始化邏輯（含防重複 flag）======
window._chartSettingsModalInit = false;

// ✅ Bug1: 當 HTMX 重新載入 screening 頁面內容時重設 flag
document.addEventListener('htmx:afterSwap', function (evt) {
    const path = evt.detail?.requestConfig?.path || '';
    if (path.includes('/screening')) {
        window._chartSettingsModalInit = false;
    }
});

window.initChartSettingsModal = function () {
    if (window._chartSettingsModalInit) return;
    if (!document.getElementById('chartSettingsModal')) return;
    window._chartSettingsModalInit = true;
    window.ChartSettingsModal.init();
    window.ChartSettingsModal.loadFromLocalStorage();
};

// 1. 正常全頁面載入
document.addEventListener('DOMContentLoaded', window.initChartSettingsModal);

// 2. HTMX 動態載入
document.addEventListener('htmx:afterSettle', window.initChartSettingsModal);

// 3. 若 JS 被動態載入且 DOMContentLoaded 已觸發過
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    window.initChartSettingsModal();
}

console.log('✅ 圖表設定彈窗模組已載入');
