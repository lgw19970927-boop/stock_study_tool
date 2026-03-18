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

    // Bug 4: 自訂 Canvas 色板狀態
    _cpState: { h: 0, s: 1, v: 1, color: '#ff0000' },
    _colorPanelInited: false,

    // 預設 MA 配置（匹配截圖：MA10/MA20 預設啟用）
    defaultMAConfig: [
        { period: 5,   color: '#ff0000', lineWidth: 1, opacity: 100, isEnabled: false },
        { period: 10,  color: '#ff8800', lineWidth: 1, opacity: 100, isEnabled: true  },
        { period: 20,  color: '#ffff00', lineWidth: 1, opacity: 100, isEnabled: true  },
        { period: 40,  color: '#0088ff', lineWidth: 1, opacity: 100, isEnabled: false },
        { period: 50,  color: '#00ff00', lineWidth: 1, opacity: 100, isEnabled: false },
        { period: 150, color: '#0000ff', lineWidth: 1, opacity: 100, isEnabled: false },
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

    // 當前 top-level Tab
    _activeTab: 'indicators',

    // Feature 2: 預設型態顯示設定（shapeVisible/textVisible 分別控制型態與文字標示）
    defaultPatternConfig: {
        head_shoulders_top:    { masterVisible: true, shapeVisible: true, textVisible: true, color: '#00d4aa', labelColor: '#ffffff', lineWidth: 1.5, opacity: 85 },
        w_bottom:              { masterVisible: true, shapeVisible: true, textVisible: true, color: '#00d4aa', labelColor: '#ffffff', lineWidth: 1.5, opacity: 85 },
        head_shoulders_bottom: { masterVisible: true, shapeVisible: true, textVisible: true, color: '#00d4aa', labelColor: '#ffffff', lineWidth: 1.5, opacity: 85 },
        triangle:              { masterVisible: true, shapeVisible: true, textVisible: true, color: '#e8d5a3', labelColor: '#ffffff', lineWidth: 1.5, opacity: 85 },
        consolidation:         { masterVisible: true, shapeVisible: true, textVisible: true, color: '#6090c8', labelColor: '#ffffff', lineWidth: 1,   opacity: 70 }
    },

    // Feature 3: 預設常規設定
    defaultGeneralConfig: {
        showPriceLine:  true,
        tooltipMode:    'floating',   // 'floating' | 'crosshair' | 'hidden'
        chartType:      'candlestick',
        bullStyle:      'hollow',     // 'hollow' | 'solid'
        bullColor:      '#26a69a',
        bearColor:      '#ef5350',
        bgTheme:        'dark'        // BUG1: 'dark' = 時尚暗黑, 'silver' = 淡雅銀灰
    },

    // Feature 4: 預設坐標軸設定
    defaultAxisConfig: {
        priceScaleMode:  'normal',     // 'normal' | 'logarithmic' | 'percentage' | 'indexed'
        scalePlacement:  'right',      // 'left' | 'right' | 'dual'
        leftScaleType:   'price',      // 'price' | 'change'
        rightScaleType:  'price',
        indexedBase:     5             // 等比坐標基準值（TODO：LW API 固定以首點為基準）
    },

    // 當前各 Tab 工作設定（tempSettings 用於 indicators；下面三個用於其他 tab）
    _generalConfig: null,
    _axisConfig:    null,
    _patternConfig: null,
    _colorBackup:   null, // 切換至收盤價線時的顏色備份

    /**
     * 初始化彈窗事件
     */
    init() {
        console.log('[ChartSettingsModal] 初始化彈窗模組');
        // 模板強制重注入後需重新初始化 canvas
        this._colorPanelInited = false;

        // 綁定彈窗開關事件
        const btnClose = document.getElementById('btnCloseModalX');
        const btnCancel = document.getElementById('btnCancelSettings');
        const btnApply = document.getElementById('btnApplySettings');
        const overlay = document.getElementById('chartSettingsModal');

        if (btnClose) btnClose.addEventListener('click', () => this.close());
        if (btnCancel) btnCancel.addEventListener('click', () => this.close());
        if (btnApply) btnApply.addEventListener('click', () => this.apply());

        // Bug 5: 彈窗可拖移（移除點外關閉行為）
        const container = document.querySelector('#chartSettingsModal .chart-modal-container');
        const header    = document.querySelector('#chartSettingsModal .chart-modal-header');
        if (container && header) {
            this._makeDraggable(container, header);
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

        // Bug 6：使用事件委派處理側邊欄指標切換與點擊導覽
        // 使用 e.target.matches() 代替 closest()，确保只有直接點擊 checkbox 才觸發切換
        const sidebar = document.querySelector('.chart-modal-sidebar');
        if (sidebar) {
            sidebar.addEventListener('click', (e) => {
                const item = e.target.closest('.indicator-item[data-indicator]');

                if (e.target.matches('input[type="checkbox"]:not([disabled])')) {
                    // 準確點擊 checkbox：更新 isGlobalEnabled 並重繪設定面板
                    const ind = e.target.id === 'ma-toggle'   ? 'MA'
                              : e.target.id === 'boll-toggle' ? 'BOLL'
                              : null;
                    if (ind && this.tempSettings && this.tempSettings[ind]) {
                        this.tempSettings[ind].isGlobalEnabled = e.target.checked;
                    }
                    this._renderTarget = ind; // 不論是否勾選都導覽到該指標設定
                    this.renderSettings();
                } else if (item) {
                    // 點擊指標列（非 checkbox 本身）：預覽模式，導覽至設定但不更動勾選
                    const ind = (item.dataset.indicator || '').toUpperCase();
                    if (ind === 'MA' || ind === 'BOLL') {
                        this._renderTarget = ind;
                        this.renderSettings();
                    }
                }
            });
        }

        // 初始化色板選擇器
        // Features 1-4: 綁定頂層 Tab 切換
        document.querySelectorAll('.chart-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!btn.disabled) {
                    this._switchModalTab(btn.dataset.tab);
                }
            });
        });

        this.initColorPicker();
    },

    /**
     * 打開彈窗
     * @param {string|null} target - 'MA' | 'BOLL' | null，指定要顯示的設定頁籤
     */
    open(target = null) {
        console.log('[ChartSettingsModal] 打開彈窗', target ? `(target: ${target})` : '');
        // BUG5 Fix: 確保 _generalConfig 以 defaultGeneralConfig 為基礎初始化（顏色預設正確）
        if (!this._generalConfig) {
            this._generalConfig = JSON.parse(JSON.stringify(this.defaultGeneralConfig));
        }

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

        // 初始化其他 Tab 設定（從 localStorage 或預設值）
        this._generalConfig = this._generalConfig || JSON.parse(JSON.stringify(this.defaultGeneralConfig));
        this._axisConfig    = this._axisConfig    || JSON.parse(JSON.stringify(this.defaultAxisConfig));
        this._patternConfig = this._patternConfig || JSON.parse(JSON.stringify(this.defaultPatternConfig));

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
        // 有 MA/BOLL target 時顯示指標管理；一般開啟預設顯示「常規設定」Tab
        if (target === 'MA' || target === 'BOLL') {
            this._switchModalTab('indicators');
        } else {
            this._switchModalTab('general');
        }
        this._renderTarget = null; // 清除

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

        // ✅ Feature B: _renderTarget 指定時優先顯示對應頁籍（不論勾選狀態，支持預覽模式）
        const target = this._renderTarget;
        if (target === 'BOLL') {
            container.innerHTML = this.renderBOLLSettings();
            this.bindBOLLEvents();
            return;
        }
        if (target === 'MA') {
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
                    <button class="settings-tab-btn active" data-subtab="config" onclick="window.ChartSettingsModal._switchIndicatorSubTab('MA','config')">指標設定</button>
                    <button class="settings-tab-btn" data-subtab="intro" onclick="window.ChartSettingsModal._switchIndicatorSubTab('MA','intro')">指標介紹</button>
                </div>

                <div id="maSubTabContent">
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
                </div><!-- #maSubTabContent -->
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
                    <button class="settings-tab-btn active" data-subtab="config" onclick="window.ChartSettingsModal._switchIndicatorSubTab('BOLL','config')">指標設定</button>
                    <button class="settings-tab-btn" data-subtab="intro" onclick="window.ChartSettingsModal._switchIndicatorSubTab('BOLL','intro')">指標介紹</button>
                </div>

                <div id="bollSubTabContent">
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
                </div><!-- #bollSubTabContent -->
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

    // ========== Feature 1: 指標介紹 sub-tab ==========

    /**
     * 切換指標設定 / 指標介紹 sub-tab
     */
    _switchIndicatorSubTab(indicator, subtab) {
        const contentId = indicator === 'MA' ? 'maSubTabContent' : 'bollSubTabContent';
        const panel = document.querySelector('.settings-panel.active');
        if (!panel) return;

        // 更新 sub-tab active 狀態
        panel.querySelectorAll('.settings-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.subtab === subtab);
        });

        const contentEl = document.getElementById(contentId);
        if (!contentEl) return;

        if (subtab === 'intro') {
            contentEl.innerHTML = indicator === 'MA' ? this.renderMAIntro() : this.renderBOLLIntro();
        } else {
            // 重新渲染設定面板（恢復原始內容）
            this._renderTarget = indicator;
            this.renderSettings();
        }
    },

    /** MA 葛氏八法則介紹 */
    renderMAIntro() {
        return `
        <div class="intro-panel">
            <h4>移動平均線（MA）— 葛氏八大法則</h4>
            <ol class="intro-list">
                <li><strong>法則一（買進）</strong>均線排列由下往上（多頭排列），且股價在均線之上，不宜放空。</li>
                <li><strong>法則二（買進）</strong>均線雖向下，但股價短暫跌破後迅速回升，此為短暫修正。</li>
                <li><strong>法則三（買進）</strong>股價跌落均線之下，但隨即反彈，是加碼買進訊號。</li>
                <li><strong>法則四（買進）</strong>股價急速下滑遠離均線，有迅速反彈回均線之傾向。</li>
                <li><strong>法則五（賣出）</strong>均線從上升轉為走平，股價由上方跌破均線。</li>
                <li><strong>法則六（賣出）</strong>均線仍上升但股價無力繼續上行，跌破均線。</li>
                <li><strong>法則七（賣出）</strong>股價在均線之上，但短暫反彈後又向下。</li>
                <li><strong>法則八（賣出）</strong>股價急速上漲遠離均線，有回落至均線之傾向。</li>
            </ol>
            <p class="intro-note">MA 公式：SMA(n) = (P₁ + P₂ + … + Pₙ) / n</p>
        </div>`;
    },

    /** BOLL 布林線介紹 */
    renderBOLLIntro() {
        return `
        <div class="intro-panel">
            <h4>布林線（BOLL）</h4>
            <p>布林線由三條線組成，用於衡量股價的波動幅度：</p>
            <ul class="intro-list">
                <li><strong>中軌（MID）</strong> = SMA(n)　—　n 期簡單移動平均線</li>
                <li><strong>上軌（UPPER）</strong> = MID + k × σ(n)</li>
                <li><strong>下軌（LOWER）</strong> = MID − k × σ(n)</li>
            </ul>
            <p>其中 σ(n) 為 n 期標準差，k 為股價特性參數（預設 2）。</p>
            <p>當價格觸及上軌，可能超買；觸及下軌，可能超賣。帶寬縮窄時往往預示大幅波動即將發生。</p>
        </div>`;
    },

    // ========== Feature 2: 型態管理 Tab ==========

    /** 型態名稱對照表 */
    _patternNameMap: {
        head_shoulders_top:    '頭肩頂',
        w_bottom:              'W底',
        head_shoulders_bottom: '頭肩底',
        triangle:              '三角收斂',
        consolidation:         '盤整區'  // BUG3 Fix: 改為「盤整區」（對應算法：振幅+斜率+上下軌觸碰）
    },

    /** 渲染型態側邊欄列表（附 checkbox + indeterminate 支援）*/
    renderPatternSidebar() {
        const cfg   = this._patternConfig || this.defaultPatternConfig;
        const items = document.getElementById('patternSidebarItems');
        if (!items) return;

        items.innerHTML = Object.keys(this._patternNameMap).map(key => {
            const p = cfg[key] || {};
            // Bug9: 左側 checkbox 為「總開關」，代表 masterVisible
            const masterOn = p.masterVisible !== false;
            return `
            <div class="indicator-item" data-pattern="${key}">
                <input type="checkbox" class="pattern-sidebar-cb" data-pattern-key="${key}"
                       ${masterOn ? 'checked' : ''}
                       onclick="event.stopPropagation(); window.ChartSettingsModal._toggleMasterVisible('${key}', this.checked)">
                <span style="cursor:pointer;flex:1;"
                      onclick="window.ChartSettingsModal._selectPattern('${key}')">${this._patternNameMap[key]}</span>
            </div>`;
        }).join('');

        // Bug9: indeterminate 根據 master + shape + text 組合設定
        Object.keys(this._patternNameMap).forEach(key => {
            const cb = items.querySelector(`[data-pattern-key="${key}"]`);
            if (cb) {
                const p = cfg[key] || {};
                const masterOn = p.masterVisible !== false;
                cb.indeterminate = masterOn && (p.shapeVisible !== p.textVisible);
            }
        });
    },

    /** Bug9: 總開關 — 只動 masterVisible，不動 shapeVisible/textVisible */
    _toggleMasterVisible(patternKey, checked) {
        this.updatePatternField(patternKey, 'masterVisible', checked);
        // 點擊時同時切換右側面板
        this._selectPattern(patternKey);
    },

    /** 從右側面板同步側邊欄 checkbox 狀態（indeterminate）*/
    _syncPatternSidebarItem(patternKey) {
        const cfg = (this._patternConfig || this.defaultPatternConfig)[patternKey] || {};
        const cb  = document.querySelector(`#patternSidebarItems [data-pattern-key="${patternKey}"]`);
        if (!cb) return;
        const masterOn = cfg.masterVisible !== false;
        if (!masterOn) {
            cb.checked = false;
            cb.indeterminate = false;
        } else if (cfg.shapeVisible && cfg.textVisible) {
            cb.checked = true;
            cb.indeterminate = false;
        } else if (!cfg.shapeVisible && !cfg.textVisible) {
            cb.checked = true; // masterOn=true 但內容全關，保持勾選顯示 indeterminate
            cb.indeterminate = true;
        } else {
            cb.checked = true;
            cb.indeterminate = true;
        }
    },

    _selectPattern(patternKey) {
        document.querySelectorAll('.indicator-item[data-pattern]').forEach(el => {
            el.classList.toggle('selected', el.dataset.pattern === patternKey);
        });
        const container = document.getElementById('settingsPanelContainer');
        if (container) {
            container.innerHTML = this.renderPatternSettings(patternKey);
        }
    },

    /** 渲染單一型態設定面板（table layout：顯示/顏色/不透明度/標註文字/文字色）*/
    renderPatternSettings(patternKey) {
        if (!patternKey) {
            return `<div class="settings-placeholder"><p>請選擇左側的型態</p></div>`;
        }
        const cfg = (this._patternConfig || this.defaultPatternConfig)[patternKey] || {};
        const name = this._patternNameMap[patternKey] || patternKey;
        const opacity = cfg.opacity ?? 85;
        return `
        <div class="settings-panel active">
            <h3 class="settings-title">${name}</h3>
            <div class="pattern-table-header">
                <span>顯示</span>
                <span>顏色</span>
                <span>不透明度 (%)</span>
                <span>標註文字</span>
                <span>文字色</span>
            </div>
            <div class="pattern-table-row">
                <div class="pattern-cell-center">
                    <input type="checkbox" id="patternShape_${patternKey}" class="pattern-cb" ${cfg.shapeVisible ? 'checked':''}
                           onchange="window.ChartSettingsModal.updatePatternField('${patternKey}','shapeVisible',this.checked);window.ChartSettingsModal._syncPatternSidebarItem('${patternKey}')">
                </div>
                <div class="pattern-cell-center">
                    <button class="color-picker-btn pattern-color-btn" id="patternColorBtn_${patternKey}"
                            style="background:${cfg.color || '#00d4aa'};"
                            onclick="window.ChartSettingsModal.openColorPickerForPattern('${patternKey}','shape')"></button>
                </div>
                <div class="pattern-opacity-cell">
                    <input type="range" value="${opacity}" min="0" max="100" style="flex:1;"
                           oninput="window.ChartSettingsModal.updatePatternField('${patternKey}','opacity',+this.value);document.getElementById('patternOpacityVal_${patternKey}').textContent=this.value">
                    <span id="patternOpacityVal_${patternKey}" class="opacity-value">${opacity}</span>
                </div>
                <div class="pattern-cell-center">
                    <input type="checkbox" id="patternText_${patternKey}" class="pattern-cb" ${cfg.textVisible ? 'checked':''}
                           onchange="window.ChartSettingsModal.updatePatternField('${patternKey}','textVisible',this.checked);window.ChartSettingsModal._syncPatternSidebarItem('${patternKey}')">
                </div>
                <div class="pattern-cell-center">
                    <button class="color-picker-btn pattern-color-btn" id="patternLabelColorBtn_${patternKey}"
                            style="background:${cfg.labelColor || '#ffffff'};"
                            onclick="window.ChartSettingsModal.openColorPickerForPattern('${patternKey}','label')"></button>
                </div>
            </div>
        </div>`;
    },

    updatePatternField(patternKey, field, value) {
        if (!this._patternConfig) this._patternConfig = JSON.parse(JSON.stringify(this.defaultPatternConfig));
        if (!this._patternConfig[patternKey]) this._patternConfig[patternKey] = {};
        this._patternConfig[patternKey][field] = value;
    },

    openColorPickerForPattern(patternKey, target) {
        const cfg = (this._patternConfig || this.defaultPatternConfig)[patternKey] || {};
        const currentColor = target === 'label' ? (cfg.labelColor || '#ffffff') : (cfg.color || '#00d4aa');
        this.openColorPicker(currentColor, (color) => {
            const field = target === 'label' ? 'labelColor' : 'color';
            this.updatePatternField(patternKey, field, color);
            const btnId = target === 'label' ? `patternLabelColorBtn_${patternKey}` : `patternColorBtn_${patternKey}`;
            const btn = document.getElementById(btnId);
            if (btn) btn.style.background = color;
        });
    },

    // ========== Feature 3: 常規設定 Tab ==========

    renderGeneralSettings() {
        const cfg       = this._generalConfig || this.defaultGeneralConfig;
        const tt        = cfg.tooltipMode || 'floating';
        const bs        = cfg.bullStyle   || 'hollow';
        const bg        = cfg.bgTheme     || 'dark';
        const isCandle  = cfg.chartType === 'candlestick' || cfg.chartType === 'monochrome_candle';
        const isLine    = cfg.chartType === 'line';
        const isMono    = cfg.chartType === 'monochrome_candle'; // BUG3
        const hideColor = isLine || isMono;                     // BUG3: monochrome_candle 隐藏顏色行
        return `
        <div class="settings-panel active">
            <h3 class="settings-title">常規設定</h3>
            <div class="general-section">
                <div class="general-row">
                    <label>背景顏色</label>
                    <select id="generalBgTheme" onchange="window.ChartSettingsModal.updateGeneralField('bgTheme',this.value)">
                        <option value="dark"   ${bg === 'dark'   ? 'selected' : ''}>時尚暗黑</option>
                        <option value="silver" ${bg === 'silver' ? 'selected' : ''}>淡雅銀灰</option>
                    </select>
                </div>
                <div class="general-row">
                    <label>現價線</label>
                    <div class="btn-toggle-group">
                        <button class="btn-toggle-opt ${cfg.showPriceLine  ? 'active' : ''}"
                                onclick="window.ChartSettingsModal.updateGeneralField('showPriceLine',true);this.parentNode.querySelectorAll('.btn-toggle-opt').forEach((b,i)=>b.classList.toggle('active',i===0))">開</button>
                        <button class="btn-toggle-opt ${!cfg.showPriceLine ? 'active' : ''}"
                                onclick="window.ChartSettingsModal.updateGeneralField('showPriceLine',false);this.parentNode.querySelectorAll('.btn-toggle-opt').forEach((b,i)=>b.classList.toggle('active',i===1))">關</button>
                    </div>
                </div>
                <div class="general-row">
                    <label>十字線</label>
                    <select id="generalTooltipMode" onchange="window.ChartSettingsModal.updateGeneralField('tooltipMode',this.value)">
                        <option value="floating"   ${tt === 'floating'   ? 'selected' : ''}>懸浮窗</option>
                        <option value="crosshair"  ${tt === 'crosshair'  ? 'selected' : ''}>跟隨懸浮窗</option>
                        <option value="hidden"     ${tt === 'hidden'     ? 'selected' : ''}>關閉</option>
                    </select>
                </div>
                <div class="general-row">
                    <label>主圖類型</label>
                    <select id="generalChartType" onchange="window.ChartSettingsModal.updateGeneralField('chartType',this.value);window.ChartSettingsModal._onGeneralChartTypeChange(this.value)">
                        <option value="candlestick"      ${cfg.chartType === 'candlestick'      ? 'selected' : ''}>普通K線</option>
                        <option value="bar"              ${cfg.chartType === 'bar'              ? 'selected' : ''}>美國線</option>
                        <option value="line"             ${cfg.chartType === 'line'             ? 'selected' : ''}>收盤價線</option>
                        <option value="monochrome_candle"${cfg.chartType === 'monochrome_candle'? 'selected' : ''}>四式陰陽燭</option>
                        <option value="heikin_ashi"      ${cfg.chartType === 'heikin_ashi'      ? 'selected' : ''}>平均K線</option>
                    </select>
                </div>
                <div class="general-row" id="generalBullStyleRow" style="${isCandle ? '' : 'display:none'}">
                    <label>陽線設定</label>
                    <select id="generalBullStyle" onchange="window.ChartSettingsModal.updateGeneralField('bullStyle',this.value)">
                        <option value="hollow" ${bs === 'hollow' ? 'selected' : ''}>空心陽線</option>
                        <option value="solid"  ${bs === 'solid'  ? 'selected' : ''}>實心陽線</option>
                    </select>
                </div>
                <div class="general-row" id="generalBullColorRow" style="${hideColor ? 'display:none' : ''}">
                    <label>陽線顏色</label>
                    <button class="color-picker-btn" id="generalBullColorBtn" style="background:${cfg.bullColor};"
                            onclick="window.ChartSettingsModal.openColorPickerForGeneral('bull')"></button>
                </div>
                <div class="general-row" id="generalBearColorRow" style="${hideColor ? 'display:none' : ''}">
                    <label>陰線顏色</label>
                    <button class="color-picker-btn" id="generalBearColorBtn" style="background:${cfg.bearColor};"
                            onclick="window.ChartSettingsModal.openColorPickerForGeneral('bear')"></button>
                </div>
            </div>
        </div>`;
    },

    /**
     * 切換主圖類型時動態 show/hide 相關欄位，並處理收盤價線的強制顏色備份/還原
     * @param {string} type - 新的 chartType 值
     */
    _onGeneralChartTypeChange(type) {
        const bullStyleRow = document.getElementById('generalBullStyleRow');
        const bullColorRow = document.getElementById('generalBullColorRow');
        const bearColorRow = document.getElementById('generalBearColorRow');
        const isCandle     = type === 'candlestick' || type === 'monochrome_candle';
        const isLine       = type === 'line';

        if (bullStyleRow) bullStyleRow.style.display = isCandle ? '' : 'none';
        if (bullColorRow) bullColorRow.style.display = isLine   ? 'none' : '';
        if (bearColorRow) bearColorRow.style.display = isLine   ? 'none' : '';

        if (!this._generalConfig) return;

        if (isLine) {
            // 備份目前顏色，強制套用收盤價線淺藍色
            if (!this._colorBackup) {
                this._colorBackup = {
                    bullColor: this._generalConfig.bullColor,
                    bearColor: this._generalConfig.bearColor
                };
            }
            this._generalConfig.bullColor = '#5b9bd5';
            this._generalConfig.bearColor = '#5b9bd5';
        } else if (this._colorBackup) {
            // 切離收盤價線時還原備份顏色
            this._generalConfig.bullColor = this._colorBackup.bullColor;
            this._generalConfig.bearColor = this._colorBackup.bearColor;
            this._colorBackup = null;
            // 更新顏色按鈕背景
            const bullBtn = document.getElementById('generalBullColorBtn');
            const bearBtn = document.getElementById('generalBearColorBtn');
            if (bullBtn) bullBtn.style.background = this._generalConfig.bullColor;
            if (bearBtn) bearBtn.style.background = this._generalConfig.bearColor;
        }
    },

    updateGeneralField(field, value) {
        if (!this._generalConfig) this._generalConfig = JSON.parse(JSON.stringify(this.defaultGeneralConfig));
        this._generalConfig[field] = value;
    },

    openColorPickerForGeneral(side) {
        const cfg = this._generalConfig || this.defaultGeneralConfig;
        const currentColor = side === 'bull' ? cfg.bullColor : cfg.bearColor;
        this.openColorPicker(currentColor, (color) => {
            this.updateGeneralField(side === 'bull' ? 'bullColor' : 'bearColor', color);
            const btn = document.getElementById(side === 'bull' ? 'generalBullColorBtn' : 'generalBearColorBtn');
            if (btn) btn.style.background = color;
        });
    },

    // ========== Feature 4: 坐標軸 Tab ==========

    renderAxisSettings() {
        const cfg  = this._axisConfig || this.defaultAxisConfig;
        const mode = cfg.priceScaleMode || 'normal';
        const sp   = cfg.scalePlacement  || 'right';
        const lt   = cfg.leftScaleType   || 'price';
        const rt   = cfg.rightScaleType  || 'price';

        // 是否顯示 Radio 區塊（只有普通坐標才顯示）
        const showRadios = mode === 'normal';
        // 是否顯示等比坐標數值輸入框
        const showIndexed = mode === 'indexed';
        // 依坐標設定決定顯示哪些 Radio 行
        const showLeft  = showRadios && (sp === 'left'  || sp === 'dual');
        const showRight = showRadios && (sp === 'right' || sp === 'dual');

        return `
        <div class="settings-panel active">
            <h3 class="settings-title">坐標軸設定</h3>
            <div class="general-section">
                <div class="general-row">
                    <label>坐標切換</label>
                    <select id="axisScaleMode" onchange="window.ChartSettingsModal._onAxisModeChange(this.value)">
                        <option value="normal"      ${mode === 'normal'      ? 'selected':''}>一般</option>
                        <option value="logarithmic" ${mode === 'logarithmic' ? 'selected':''}>對數</option>
                        <option value="percentage"  ${mode === 'percentage'  ? 'selected':''}>百分比</option>
                        <option value="indexed"     ${mode === 'indexed'     ? 'selected':''}>指數 (Indexed to 100)</option>
                    </select>
                </div>
                <div class="general-row">
                    <label>坐標設定</label>
                    <select id="axisPlacement" onchange="window.ChartSettingsModal._onAxisPlacementChange(this.value)">
                        <option value="right" ${sp === 'right' ? 'selected':''}>右坐標</option>
                        <option value="left"  ${sp === 'left'  ? 'selected':''}>左坐標</option>
                        <option value="dual"  ${sp === 'dual'  ? 'selected':''}>雙邊坐標</option>
                    </select>
                </div>

                <div id="axisLeftRadioSection" style="display:${showLeft ? '' : 'none'};">
                    <div class="axis-radio-section">
                        <span class="axis-radio-label">左坐標</span>
                        <label class="axis-radio-item">
                            <input type="radio" name="leftScaleType" value="price"  ${lt === 'price'  ? 'checked':''} onchange="window.ChartSettingsModal.updateAxisField('leftScaleType','price')"> 價格
                        </label>
                        <label class="axis-radio-item">
                            <input type="radio" name="leftScaleType" value="change" ${lt === 'change' ? 'checked':''} onchange="window.ChartSettingsModal.updateAxisField('leftScaleType','change')"> 漲跌幅
                        </label>
                    </div>
                </div>

                <div id="axisRightRadioSection" style="display:${showRight ? '' : 'none'};">
                    <div class="axis-radio-section">
                        <span class="axis-radio-label">右坐標</span>
                        <label class="axis-radio-item">
                            <input type="radio" name="rightScaleType" value="price"  ${rt === 'price'  ? 'checked':''} onchange="window.ChartSettingsModal.updateAxisField('rightScaleType','price')"> 價格
                        </label>
                        <label class="axis-radio-item">
                            <input type="radio" name="rightScaleType" value="change" ${rt === 'change' ? 'checked':''} onchange="window.ChartSettingsModal.updateAxisField('rightScaleType','change')"> 漲跌幅
                        </label>
                    </div>
                </div>
            </div>
        </div>`;
    },

    /** 坐標切換下拉 onchange：更新 mode 及條件式 UI */
    _onAxisModeChange(value) {
        this.updateAxisField('priceScaleMode', value);
        const showRadios  = value === 'normal';
        const sp = (this._axisConfig || this.defaultAxisConfig).scalePlacement || 'right';
        const leftSec  = document.getElementById('axisLeftRadioSection');
        const rightSec = document.getElementById('axisRightRadioSection');
        if (leftSec)  leftSec.style.display  = showRadios && (sp === 'left'  || sp === 'dual') ? '' : 'none';
        if (rightSec) rightSec.style.display = showRadios && (sp === 'right' || sp === 'dual') ? '' : 'none';
    },

    /** 坐標設定下拉 onchange：更新 placement 及條件式 UI */
    _onAxisPlacementChange(value) {
        this.updateAxisField('scalePlacement', value);
        const mode = (this._axisConfig || this.defaultAxisConfig).priceScaleMode || 'normal';
        const showRadios  = mode === 'normal';
        const leftSec  = document.getElementById('axisLeftRadioSection');
        const rightSec = document.getElementById('axisRightRadioSection');
        if (leftSec)  leftSec.style.display  = showRadios && (value === 'left'  || value === 'dual') ? '' : 'none';
        if (rightSec) rightSec.style.display = showRadios && (value === 'right' || value === 'dual') ? '' : 'none';
    },

    updateAxisField(field, value) {
        if (!this._axisConfig) this._axisConfig = JSON.parse(JSON.stringify(this.defaultAxisConfig));
        this._axisConfig[field] = value;
    },

    // ========== Tab 切換 ==========

    /**
     * 切換頂層 Tab
     * @param {string} tabName - 'indicators' | 'general' | 'axis' | 'patterns'
     */
    _switchModalTab(tabName) {
        this._activeTab = tabName;

        // 更新 tab button 狀態
        document.querySelectorAll('.chart-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        const body    = document.querySelector('.chart-modal-body');
        const sidebar = document.querySelector('.chart-modal-sidebar');
        if (!body || !sidebar) return;

        const indicatorCategories = sidebar.querySelectorAll('.indicator-category:not(.pattern-sidebar-section)');
        const patternSection      = sidebar.querySelector('.pattern-sidebar-section');
        const container           = document.getElementById('settingsPanelContainer');
        if (!container) return;

        switch (tabName) {
            case 'indicators':
                body.classList.remove('no-sidebar');
                indicatorCategories.forEach(c => c.style.display = '');
                if (patternSection) patternSection.style.display = 'none';
                this.renderSettings();
                break;

            case 'patterns':
                body.classList.remove('no-sidebar');
                indicatorCategories.forEach(c => c.style.display = 'none');
                if (patternSection) patternSection.style.display = '';
                this.renderPatternSidebar();
                container.innerHTML = `<div class="settings-placeholder"><p>請選擇左側的型態</p></div>`;
                break;

            case 'general':
                body.classList.add('no-sidebar');
                container.innerHTML = this.renderGeneralSettings();
                break;

            case 'axis':
                body.classList.add('no-sidebar');
                container.innerHTML = this.renderAxisSettings();
                break;
        }
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

        // ✅ Feature 3: 套用常規設定
        if (window.ChartController && this._generalConfig) {
            window.ChartController.applyGeneralSettings(this._generalConfig);
        }
        // ✅ Feature 4: 套用坐標軸設定
        if (window.ChartController && this._axisConfig) {
            window.ChartController.applyAxisSettings(this._axisConfig);
        }
        // ✅ Feature 2: 套用型態設定（更新 patternAnnotation 的視覺設定）
        if (window.ChartController && this._patternConfig) {
            window.ChartController.applyPatternConfig(this._patternConfig);
        }

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
                    : null,
                // Features 2-4: 保存新設定
                generalConfig: this._generalConfig || null,
                axisConfig:    this._axisConfig    || null,
                patternConfig: this._patternConfig || null
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

            // Features 2-4: 載入新設定
            if (settings.generalConfig) this._generalConfig = settings.generalConfig;
            if (settings.axisConfig)    this._axisConfig    = settings.axisConfig;
            if (settings.patternConfig) this._patternConfig = settings.patternConfig;
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

        // Bug 4: 定義自訂色彩 → 展開/收起 canvas 面板
        if (btnDefine) {
            btnDefine.addEventListener('click', () => {
                const panel = document.getElementById('customColorPanel');
                if (!panel) return;
                const isVisible = panel.style.display !== 'none';
                panel.style.display = isVisible ? 'none' : 'block';
                if (!isVisible) {
                    // 同步當前選中色彩到面板狀態
                    const hex = this.colorPicker.currentColor || '#ff0000';
                    const [h, s, v] = this._hexToHsv(hex);
                    this._cpState = { h, s, v, color: hex };
                    this.initCustomColorPanel();
                    this._updateCpUi();
                }
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

        // 色板視窗可拖曳
        const cpContainer = document.querySelector('#colorPickerModal .color-picker-container');
        const cpHeader    = document.querySelector('#colorPickerModal .color-picker-header');
        if (cpContainer && cpHeader) {
            this._makeDraggable(cpContainer, cpHeader);
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
    },

    // ========== Bug 4: 自訂 Canvas 色板 ==========

    /**
     * 初始化自訂 Canvas 色板（懶初始化，只執行一次）
     */
    initCustomColorPanel() {
        if (this._colorPanelInited) return;
        this._colorPanelInited = true;

        const specCanvas = document.getElementById('colorSpectrumCanvas');
        const hueCanvas  = document.getElementById('hueSliderCanvas');
        if (!specCanvas || !hueCanvas) return;

        this._drawHueBar(hueCanvas);
        this._drawSpectrum(specCanvas, this._cpState.h);

        // 色相滑桿事件
        let hueDown = false;
        const onHuePick = (e) => {
            const rect = hueCanvas.getBoundingClientRect();
            const x = Math.max(0, Math.min(hueCanvas.width - 1,
                (e.clientX - rect.left) * (hueCanvas.width / rect.width)));
            this._cpState.h = Math.round(x / (hueCanvas.width - 1) * 360);
            this._drawSpectrum(specCanvas, this._cpState.h);
            this._cpState.color = this._hsvToHex(this._cpState.h, this._cpState.s, this._cpState.v);
            this._updateCpUi();
        };
        hueCanvas.addEventListener('mousedown', (e) => { hueDown = true; onHuePick(e); e.preventDefault(); });
        document.addEventListener('mousemove', (e) => { if (hueDown) onHuePick(e); });
        document.addEventListener('mouseup',   ()  => { hueDown = false; });

        // 光譜 canvas 事件
        let specDown = false;
        const onSpecPick = (e) => {
            const rect = specCanvas.getBoundingClientRect();
            const x = Math.max(0, Math.min(specCanvas.width  - 1,
                (e.clientX - rect.left) * (specCanvas.width  / rect.width)));
            const y = Math.max(0, Math.min(specCanvas.height - 1,
                (e.clientY - rect.top)  * (specCanvas.height / rect.height)));
            this._cpState.s = x / (specCanvas.width  - 1);
            this._cpState.v = 1 - y / (specCanvas.height - 1);
            this._cpState.color = this._hsvToHex(this._cpState.h, this._cpState.s, this._cpState.v);
            this._updateCpUi();
            this._drawSpectrumCursor(specCanvas, x, y);
        };
        specCanvas.addEventListener('mousedown', (e) => { specDown = true; onSpecPick(e); e.preventDefault(); });
        document.addEventListener('mousemove', (e) => { if (specDown) onSpecPick(e); });
        document.addEventListener('mouseup',   ()  => { specDown = false; });

        // RGB 文字輸入事件
        const rInput   = document.getElementById('cpInputR');
        const gInput   = document.getElementById('cpInputG');
        const bInput   = document.getElementById('cpInputB');
        const hexInput = document.getElementById('cpInputHex');

        const onRGBInput = () => {
            const r = Math.max(0, Math.min(255, parseInt(rInput?.value)   || 0));
            const g = Math.max(0, Math.min(255, parseInt(gInput?.value)   || 0));
            const b = Math.max(0, Math.min(255, parseInt(bInput?.value)   || 0));
            const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
            this._cpState.color = hex;
            const [h, s, v] = this._hexToHsv(hex);
            this._cpState.h = h; this._cpState.s = s; this._cpState.v = v;
            if (hexInput) hexInput.value = hex;
            this._drawSpectrum(specCanvas, h);
            this._updateCpUi();
        };
        if (rInput)   rInput.addEventListener('input',  onRGBInput);
        if (gInput)   gInput.addEventListener('input',  onRGBInput);
        if (bInput)   bInput.addEventListener('input',  onRGBInput);
        if (hexInput) hexInput.addEventListener('change', () => {
            let hex = hexInput.value.trim();
            if (!hex.startsWith('#')) hex = '#' + hex;
            if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
                hex = hex.toLowerCase();
                this._cpState.color = hex;
                const [h, s, v] = this._hexToHsv(hex);
                this._cpState.h = h; this._cpState.s = s; this._cpState.v = v;
                this._drawSpectrum(specCanvas, h);
                this._updateCpUi();
            }
        });

        // 加入自訂色彩
        const btnAdd = document.getElementById('btnAddCustomColor');
        if (btnAdd) {
            btnAdd.addEventListener('click', () => {
                this.addCustomColor(this._cpState.color);
                this.selectColor(this._cpState.color);
            });
        }
    },

    /** 繪製橫向色相滑桿 */
    _drawHueBar(canvas) {
        const ctx  = canvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
        for (let i = 0; i <= 360; i += 30) {
            grad.addColorStop(i / 360, `hsl(${i},100%,50%)`);
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    },

    /** 繪製 HSV 飽和/明度光譜，依當前色相著色 */
    _drawSpectrum(canvas, hue) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // 白 → 純色（飽和度軸）
        const hGrad = ctx.createLinearGradient(0, 0, canvas.width, 0);
        hGrad.addColorStop(0, '#ffffff');
        hGrad.addColorStop(1, `hsl(${hue},100%,50%)`);
        ctx.fillStyle = hGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // 透明 → 黑（明度軸）
        const vGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        vGrad.addColorStop(0, 'rgba(0,0,0,0)');
        vGrad.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.fillStyle = vGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    },

    /** 在光譜上繪製選取游標圓圈 */
    _drawSpectrumCursor(canvas, cx, cy) {
        this._drawSpectrum(canvas, this._cpState.h);
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = 'white';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.stroke();
    },

    /** HSV → #rrggbb (H:0-360, S:0-1, V:0-1) */
    _hsvToHex(h, s, v) {
        const c = v * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = v - c;
        let r, g, b;
        if      (h < 60)  { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else              { r = c; g = 0; b = x; }
        const toHex = n => Math.round((n + m) * 255).toString(16).padStart(2, '0');
        return '#' + toHex(r) + toHex(g) + toHex(b);
    },

    /** #rrggbb → [H:0-360, S:0-1, V:0-1] */
    _hexToHsv(hex) {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const d = max - min;
        let h = 0;
        const s = max === 0 ? 0 : d / max;
        const v = max;
        if (d !== 0) {
            if      (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            else if (max === g) h = ((b - r) / d + 2) / 6;
            else                h = ((r - g) / d + 4) / 6;
        }
        return [Math.round(h * 360), s, v];
    },

    /** 同步更新 canvas 面板的所有 UI 元素 */
    _updateCpUi() {
        const color = this._cpState.color;
        const preview = document.getElementById('colorPreview');
        if (preview) preview.style.background = color;

        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        const rInput   = document.getElementById('cpInputR');
        const gInput   = document.getElementById('cpInputG');
        const bInput   = document.getElementById('cpInputB');
        const hexInput = document.getElementById('cpInputHex');
        if (rInput)   rInput.value   = r;
        if (gInput)   gInput.value   = g;
        if (bInput)   bInput.value   = b;
        if (hexInput) hexInput.value = color;
        // 同步到色板選取狀態
        this.selectColor(color, false);
    },

    /**
     * Bug 5: 拖移彈窗
     * @param {HTMLElement} containerEl - 彈窗外框
     * @param {HTMLElement} handleEl    - 拖移把手（header）
     */
    _makeDraggable(containerEl, handleEl) {
        let isDragging = false;
        let startX = 0, startY = 0, startLeft = 0, startTop = 0;

        handleEl.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            // 對標題內的按鈕不啟動拖移
            if (e.target.closest('button')) return;

            isDragging = true;
            containerEl.classList.add('is-dragging');

            const rect = containerEl.getBoundingClientRect();
            // 切換為 fixed 定位，啮住當前素數坐標
            containerEl.style.position = 'fixed';
            containerEl.style.margin   = '0';
            containerEl.style.left     = rect.left + 'px';
            containerEl.style.top      = rect.top  + 'px';

            startX    = e.clientX;
            startY    = e.clientY;
            startLeft = rect.left;
            startTop  = rect.top;
            e.preventDefault();
        });

        const onMouseMove = (e) => {
            if (!isDragging) return;
            const dx      = e.clientX - startX;
            const dy      = e.clientY - startY;
            const newLeft = Math.max(0, Math.min(window.innerWidth  - containerEl.offsetWidth,  startLeft + dx));
            const newTop  = Math.max(0, Math.min(window.innerHeight - containerEl.offsetHeight, startTop  + dy));
            containerEl.style.left = newLeft + 'px';
            containerEl.style.top  = newTop  + 'px';
        };

        const onMouseUp = () => {
            if (!isDragging) return;
            isDragging = false;
            containerEl.classList.remove('is-dragging');
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup',   onMouseUp);
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
