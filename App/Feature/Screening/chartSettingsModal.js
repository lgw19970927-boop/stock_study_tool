/**
 * 圖表設定彈窗模組
 * 負責處理圖表管理彈窗的所有邏輯
 */

window.ChartSettingsModal = {
    // 臨時設定（彈窗編輯中）
    tempSettings: null,

    // 色板選擇器狀態
    colorPicker: {
        isOpen: false,
        callback: null,
        currentColor: '#ff0000',
        customColors: []
    },

    // 預設 MA 配置
    defaultMAConfig: [
        { period: 5, color: '#ff0000', lineWidth: 1, opacity: 100, visible: true },   // 紅
        { period: 10, color: '#ff8800', lineWidth: 1, opacity: 100, visible: true },  // 橙
        { period: 20, color: '#ffff00', lineWidth: 1, opacity: 100, visible: true },  // 黃
        { period: 50, color: '#00ff00', lineWidth: 1, opacity: 100, visible: true },  // 綠
        { period: 150, color: '#0088ff', lineWidth: 1, opacity: 100, visible: true }, // 藍
        { period: 200, color: '#8800ff', lineWidth: 1, opacity: 100, visible: true }  // 紫
    ],

    // 預設 BOLL 配置
    defaultBOLLConfig: {
        period: 50,
        stdDev: 2,
        visible: false,
        lines: {
            middle: { color: '#ffb6c1', lineWidth: 1, opacity: 100 },  // 粉紅
            upper: { color: '#c0c0c0', lineWidth: 1, opacity: 100 },   // 灰
            lower: { color: '#00ffff', lineWidth: 1, opacity: 100 }    // 青
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

        // 綁定左側指標切換事件
        const maToggle = document.getElementById('ma-toggle');
        const bollToggle = document.getElementById('boll-toggle');

        if (maToggle) {
            maToggle.addEventListener('change', () => this.renderSettings());
        }
        if (bollToggle) {
            bollToggle.addEventListener('change', () => this.renderSettings());
        }

        // 初始化色板選擇器
        this.initColorPicker();
    },

    /**
     * 打開彈窗
     */
    open() {
        console.log('[ChartSettingsModal] 打開彈窗');

        // 複製當前設定到臨時設定 (過濾掉帶有循環參考的 series 物件)
        this.tempSettings = {
            MA: (window.state.chartIndicators.MA || []).map(ma => ({
                period: ma.period,
                color: ma.color,
                lineWidth: ma.lineWidth,
                opacity: ma.opacity,
                visible: ma.visible
            })),
            BOLL: window.state.chartIndicators.BOLL ? {
                period: window.state.chartIndicators.BOLL.period,
                stdDev: window.state.chartIndicators.BOLL.stdDev,
                visible: window.state.chartIndicators.BOLL.visible,
                lines: window.state.chartIndicators.BOLL.lines ? JSON.parse(JSON.stringify(window.state.chartIndicators.BOLL.lines)) : undefined
            } : null
        };

        // 如果沒有任何設定，使用預設值
        if (this.tempSettings.MA.length === 0) {
            this.tempSettings.MA = JSON.parse(JSON.stringify(this.defaultMAConfig));
        }
        if (!this.tempSettings.BOLL) {
            this.tempSettings.BOLL = JSON.parse(JSON.stringify(this.defaultBOLLConfig));
        }

        // 設定左側勾選狀態
        const maToggle = document.getElementById('ma-toggle');
        const bollToggle = document.getElementById('boll-toggle');

        if (maToggle) maToggle.checked = this.tempSettings.MA.length > 0;
        if (bollToggle) bollToggle.checked = this.tempSettings.BOLL && this.tempSettings.BOLL.visible;

        // 渲染右側設定面板
        this.renderSettings();

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
        const maToggle = document.getElementById('ma-toggle');
        const bollToggle = document.getElementById('boll-toggle');
        const container = document.getElementById('settingsPanelContainer');

        if (!container) return;

        // 確定要顯示哪個面板
        const showMA = maToggle && maToggle.checked;
        const showBOLL = bollToggle && bollToggle.checked;

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
        const maLines = this.tempSettings.MA || [];

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
        const opacity = ma.opacity ?? 100;
        return `
            <div class="ma-line-item" data-index="${index}">
                <label>
                    <input type="checkbox" ${ma.visible ? 'checked' : ''} onchange="window.ChartSettingsModal.toggleMAVisible(${index})">
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
        const btnAdd = document.getElementById('btnAddMA');
        const btnReset = document.getElementById('btnResetMA');

        if (btnAdd) {
            btnAdd.addEventListener('click', () => this.addMALine());
        }
        if (btnReset) {
            btnReset.addEventListener('click', () => this.resetMA());
        }
    },

    /**
     * 新增 MA 線
     */
    addMALine() {
        if (this.tempSettings.MA.length >= 10) {
            alert('最多只能添加 10 條 MA 線');
            return;
        }

        // 使用預設顏色序列
        const colors = ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#8800ff', '#ff00ff', '#00ffff', '#ffffff', '#808080'];
        const newMA = {
            period: 5,
            color: colors[this.tempSettings.MA.length % colors.length],
            lineWidth: 1,
            opacity: 100,
            visible: true
        };

        this.tempSettings.MA.push(newMA);
        this.renderSettings();
    },

    /**
     * 刪除 MA 線
     */
    removeMALine(index) {
        this.tempSettings.MA.splice(index, 1);
        this.renderSettings();
    },

    /**
     * 重置 MA 為預設值
     */
    resetMA() {
        if (confirm('確定要重置為預設 MA 配置嗎？')) {
            this.tempSettings.MA = JSON.parse(JSON.stringify(this.defaultMAConfig));
            this.renderSettings();
        }
    },

    /**
     * 更新 MA 參數
     */
    toggleMAVisible(index) {
        this.tempSettings.MA[index].visible = !this.tempSettings.MA[index].visible;
    },

    updateMAPeriod(index, value) {
        this.tempSettings.MA[index].period = parseInt(value, 10);
    },

    updateMALineWidth(index, value) {
        this.tempSettings.MA[index].lineWidth = parseInt(value, 10);
    },

    updateMAOpacity(index, value) {
        this.tempSettings.MA[index].opacity = parseInt(value, 10);
        // 更新顯示值
        const item = document.querySelector(`.ma-line-item[data-index="${index}"] .opacity-value`);
        if (item) item.textContent = value;
    },

    /**
     * 打開色板選擇器（MA）
     */
    openColorPickerForMA(index) {
        this.openColorPicker(this.tempSettings.MA[index].color, (color) => {
            this.tempSettings.MA[index].color = color;
            // 更新按鈕顏色
            const btn = document.querySelector(`.ma-line-item[data-index="${index}"] .color-picker-btn`);
            if (btn) btn.style.background = color;
        });
    },

    /**
     * 渲染 BOLL 設定面板
     */
    renderBOLLSettings() {
        const boll = this.tempSettings.BOLL;
        if (!boll) return '';

        return `
            <div class="settings-panel active">
                <h3 class="settings-title">BOLL: 布林線</h3>
                
                <div class="settings-tabs">
                    <button class="settings-tab-btn active">指標設定</button>
                    <button class="settings-tab-btn" disabled>指標介紹</button>
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
                
                <div class="boll-lines">
                    <div class="boll-line-config" data-line="middle">
                        <span>MID</span>
                        <input type="number" value="${boll.lines.middle.lineWidth}" min="1" max="5" onchange="window.ChartSettingsModal.updateBOLLLineWidth('middle', this.value)">
                        <button class="color-picker-btn" style="background: ${boll.lines.middle.color};" onclick="window.ChartSettingsModal.openColorPickerForBOLL('middle')"></button>
                        <input type="range" value="${boll.lines.middle.opacity}" min="0" max="100" oninput="window.ChartSettingsModal.updateBOLLOpacity('middle', this.value)">
                        <span class="opacity-value">${boll.lines.middle.opacity}</span>
                    </div>
                    <div class="boll-line-config" data-line="upper">
                        <span>UPPER</span>
                        <input type="number" value="${boll.lines.upper.lineWidth}" min="1" max="5" onchange="window.ChartSettingsModal.updateBOLLLineWidth('upper', this.value)">
                        <button class="color-picker-btn" style="background: ${boll.lines.upper.color};" onclick="window.ChartSettingsModal.openColorPickerForBOLL('upper')"></button>
                        <input type="range" value="${boll.lines.upper.opacity}" min="0" max="100" oninput="window.ChartSettingsModal.updateBOLLOpacity('upper', this.value)">
                        <span class="opacity-value">${boll.lines.upper.opacity}</span>
                    </div>
                    <div class="boll-line-config" data-line="lower">
                        <span>LOWER</span>
                        <input type="number" value="${boll.lines.lower.lineWidth}" min="1" max="5" onchange="window.ChartSettingsModal.updateBOLLLineWidth('lower', this.value)">
                        <button class="color-picker-btn" style="background: ${boll.lines.lower.color};" onclick="window.ChartSettingsModal.openColorPickerForBOLL('lower')"></button>
                        <input type="range" value="${boll.lines.lower.opacity}" min="0" max="100" oninput="window.ChartSettingsModal.updateBOLLOpacity('lower', this.value)">
                        <span class="opacity-value">${boll.lines.lower.opacity}</span>
                    </div>
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

        if (period) {
            period.addEventListener('change', (e) => {
                this.tempSettings.BOLL.period = parseInt(e.target.value, 10);
            });
        }
        if (stdDev) {
            stdDev.addEventListener('change', (e) => {
                this.tempSettings.BOLL.stdDev = parseFloat(e.target.value);
            });
        }
    },

    /**
     * 更新 BOLL 參數
     */
    updateBOLLLineWidth(line, value) {
        this.tempSettings.BOLL.lines[line].lineWidth = parseInt(value, 10);
    },

    updateBOLLOpacity(line, value) {
        this.tempSettings.BOLL.lines[line].opacity = parseInt(value, 10);
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
     * 套用設定
     */
    apply() {
        console.log('[ChartSettingsModal] 套用設定');

        // 更新全域狀態
        const maToggle = document.getElementById('ma-toggle');
        const bollToggle = document.getElementById('boll-toggle');

        if (maToggle && maToggle.checked) {
            window.state.chartIndicators.MA = this.tempSettings.MA.filter(ma => ma.visible);
        } else {
            window.state.chartIndicators.MA = [];
        }

        if (bollToggle && bollToggle.checked) {
            window.state.chartIndicators.BOLL = {
                ...this.tempSettings.BOLL,
                visible: true
            };
        } else {
            window.state.chartIndicators.BOLL = null;
        }

        // 保存到 localStorage
        this.saveToLocalStorage();

        // 重新渲染圖表
        const currentSymbol = document.getElementById('chartSymbol').textContent;
        if (currentSymbol && currentSymbol !== '--' && window.ChartController) {
            window.ChartController.loadStock(currentSymbol);
        }

        // 關閉彈窗
        this.close();
    },

    /**
     * 保存到 localStorage
     */
    saveToLocalStorage() {
        try {
            const settings = {
                MA: window.state.chartIndicators.MA,
                BOLL: window.state.chartIndicators.BOLL
            };
            localStorage.setItem('chartIndicators', JSON.stringify(settings));
            console.log('[ChartSettingsModal] 設定已保存至 localStorage');
        } catch (error) {
            console.error('[ChartSettingsModal] 保存設定失敗:', error);
        }
    },

    /**
     * 從 localStorage 載入
     */
    loadFromLocalStorage() {
        try {
            const saved = localStorage.getItem('chartIndicators');
            if (saved) {
                const settings = JSON.parse(saved);
                window.state.chartIndicators.MA = settings.MA || [];
                window.state.chartIndicators.BOLL = settings.BOLL || null;
                console.log('[ChartSettingsModal] 已從 localStorage 載入設定');
            }
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

// ====== HTMX 相容初始化邏輯 ======
window.initChartSettingsModal = function () {
    if (document.getElementById('chartSettingsModal')) {
        window.ChartSettingsModal.init();
        window.ChartSettingsModal.loadFromLocalStorage();
    }
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
