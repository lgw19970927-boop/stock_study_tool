/**
 * indicator_settings_tab.js - 指標參數設定分頁
 * 從 chart_settings_modal.js 拆分；透過 Object.assign 掛載至 window.ChartSettingsModal
 * 必須在 chart_settings_modal.js 之後載入
 */
Object.assign(window.ChartSettingsModal, {
    /**
     * 渲染設定面板
     */
    renderSettings() {
        const maToggle   = document.getElementById('ma-toggle');
        const bollToggle = document.getElementById('boll-toggle');
        const volToggle  = document.getElementById('vol-toggle');
        const rsiToggle  = document.getElementById('rsi-toggle');
        const container  = document.getElementById('settingsPanelContainer');

        if (!container) return;

        const showMA   = maToggle   && maToggle.checked;
        const showBOLL = bollToggle && bollToggle.checked;
        const showVOL  = volToggle  && volToggle.checked;
        const showRSI  = rsiToggle  && rsiToggle.checked;

        // ✅ Feature B: _renderTarget 指定時優先顯示對應頁籍（不論勾選狀態，支持預覽模式）
        const target = this._renderTarget;
        if (target === 'MA') {
            container.innerHTML = this.renderMASettings();
            this.bindMAEvents();
            return;
        }
        if (target === 'BOLL') {
            container.innerHTML = this.renderBOLLSettings();
            this.bindBOLLEvents();
            return;
        }
        if (target === 'VOL') {
            container.innerHTML = this.renderVOLSettings();
            this.bindVOLEvents();
            return;
        }
        if (target === 'RSI') {
            container.innerHTML = this.renderRSISettings();
            this.bindRSIEvents();
            return;
        }

        if (showMA) {
            container.innerHTML = this.renderMASettings();
            this.bindMAEvents();
        } else if (showBOLL) {
            container.innerHTML = this.renderBOLLSettings();
            this.bindBOLLEvents();
        } else if (showVOL) {
            container.innerHTML = this.renderVOLSettings();
            this.bindVOLEvents();
        } else if (showRSI) {
            container.innerHTML = this.renderRSISettings();
            this.bindRSIEvents();
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
                <label class="boll-line-label">
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

    // ========== VOL 設定 ==========

    renderVOLSettings() {
        const vol = this.tempSettings.VOL || this.defaultVOLConfig;
        const line = vol.lines?.VOL1 || this.defaultVOLConfig.lines.VOL1;
        const opacity = line.opacity ?? 100;

        return `
            <div class="settings-panel active">
                <h3 class="settings-title">VOL: 成交量</h3>

                <div class="settings-tabs">
                    <button class="settings-tab-btn active" data-subtab="config" onclick="window.ChartSettingsModal._switchIndicatorSubTab('VOL','config')">指標設定</button>
                    <button class="settings-tab-btn" data-subtab="intro" onclick="window.ChartSettingsModal._switchIndicatorSubTab('VOL','intro')">指標介紹</button>
                </div>

                <div id="volSubTabContent">
                    <div class="settings-actions">
                        <button class="btn btn-sm btn-ghost" id="btnResetVOL">重置</button>
                    </div>

                    <div class="sub-line-header sub-line-header--vol">
                        <span>參數名稱</span>
                        <span>線寬</span>
                        <span>顏色</span>
                        <span>不透明度(%)</span>
                    </div>

                    <div class="sub-line-row" data-line="VOL1">
                        <label class="sub-line-label">
                            <input type="checkbox" ${line.isEnabled !== false ? 'checked' : ''}
                                   onchange="window.ChartSettingsModal.updateVOLLineEnabled(this.checked)">
                            <span>VOL1</span>
                        </label>
                        <input type="number" value="${line.lineWidth || 9}" min="1" max="20"
                               onchange="window.ChartSettingsModal.updateVOLLineWidth(this.value)">
                        <button class="color-picker-btn" style="background: ${line.color || '#ef5350'};"
                                onclick="window.ChartSettingsModal.openColorPickerForVOL()"></button>
                        <div class="sub-opacity-wrap">
                            <input type="range" value="${opacity}" min="0" max="100"
                                   oninput="window.ChartSettingsModal.updateVOLOpacity(this.value)">
                            <span class="opacity-value" id="volOpacityValue">${opacity}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    bindVOLEvents() {
        const btnReset = document.getElementById('btnResetVOL');
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                if (confirm('確定要重置 VOL 配置嗎？')) {
                    this.tempSettings.VOL = JSON.parse(JSON.stringify(this.defaultVOLConfig));
                    this.renderSettings();
                }
            });
        }
    },

    updateVOLLineEnabled(checked) {
        if (this.tempSettings?.VOL?.lines?.VOL1) {
            this.tempSettings.VOL.lines.VOL1.isEnabled = checked;
        }
    },

    updateVOLLineWidth(value) {
        if (this.tempSettings?.VOL?.lines?.VOL1) {
            this.tempSettings.VOL.lines.VOL1.lineWidth = parseInt(value, 10) || 1;
        }
    },

    updateVOLOpacity(value) {
        if (this.tempSettings?.VOL?.lines?.VOL1) {
            this.tempSettings.VOL.lines.VOL1.opacity = parseInt(value, 10) || 0;
        }
        const el = document.getElementById('volOpacityValue');
        if (el) el.textContent = value;
    },

    openColorPickerForVOL() {
        const line = this.tempSettings?.VOL?.lines?.VOL1;
        if (!line) return;
        this.openColorPicker(line.color || '#ef5350', (color) => {
            line.color = color;
            const btn = document.querySelector('.sub-line-row[data-line="VOL1"] .color-picker-btn');
            if (btn) btn.style.background = color;
        });
    },

    // ========== RSI 設定 ==========

    renderRSISettings() {
        const rsi = this.tempSettings.RSI || this.defaultRSIConfig;
        const lineOrder = ['RSI1', 'RSI2', 'RSI3'];

        const rows = lineOrder.map((key) => {
            const line = rsi.lines?.[key] || this.defaultRSIConfig.lines[key];
            const opacity = line.opacity ?? 100;
            return `
                <div class="rsi-line-row" data-line="${key}">
                    <label class="rsi-period-label">移動平均周期</label>
                    <input type="number" value="${line.period}" min="1" max="200"
                           onchange="window.ChartSettingsModal.updateRSIPeriod('${key}', this.value)">
                    <label class="sub-line-label">
                        <input type="checkbox" ${line.isEnabled !== false ? 'checked' : ''}
                               onchange="window.ChartSettingsModal.updateRSILineEnabled('${key}', this.checked)">
                        <span>${key}</span>
                    </label>
                    <input type="number" value="${line.lineWidth || 1}" min="1" max="8"
                           onchange="window.ChartSettingsModal.updateRSILineWidth('${key}', this.value)">
                    <button class="color-picker-btn" style="background: ${line.color};"
                            onclick="window.ChartSettingsModal.openColorPickerForRSI('${key}')"></button>
                    <div class="sub-opacity-wrap">
                        <input type="range" value="${opacity}" min="0" max="100"
                               oninput="window.ChartSettingsModal.updateRSIOpacity('${key}', this.value)">
                        <span class="opacity-value" id="rsiOpacityValue-${key}">${opacity}</span>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="settings-panel active">
                <h3 class="settings-title">RSI: 相對強弱指標</h3>

                <div class="settings-tabs">
                    <button class="settings-tab-btn active" data-subtab="config" onclick="window.ChartSettingsModal._switchIndicatorSubTab('RSI','config')">指標設定</button>
                    <button class="settings-tab-btn" data-subtab="intro" onclick="window.ChartSettingsModal._switchIndicatorSubTab('RSI','intro')">指標介紹</button>
                </div>

                <div id="rsiSubTabContent">
                    <div class="settings-actions">
                        <button class="btn btn-sm btn-ghost" id="btnResetRSI">重置</button>
                    </div>

                    <div class="rsi-line-header">
                        <span>參數名稱</span>
                        <span>參數值</span>
                        <span>指標線</span>
                        <span>線寬</span>
                        <span>顏色</span>
                        <span>不透明度(%)</span>
                    </div>

                    <div class="rsi-line-list">
                        ${rows}
                    </div>
                </div>
            </div>
        `;
    },

    bindRSIEvents() {
        const btnReset = document.getElementById('btnResetRSI');
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                if (confirm('確定要重置 RSI 配置嗎？')) {
                    this.tempSettings.RSI = JSON.parse(JSON.stringify(this.defaultRSIConfig));
                    this.renderSettings();
                }
            });
        }
    },

    updateRSIPeriod(lineKey, value) {
        const line = this.tempSettings?.RSI?.lines?.[lineKey];
        if (!line) return;
        line.period = Math.max(1, parseInt(value, 10) || 1);
    },

    updateRSILineEnabled(lineKey, checked) {
        const line = this.tempSettings?.RSI?.lines?.[lineKey];
        if (!line) return;
        line.isEnabled = checked;
    },

    updateRSILineWidth(lineKey, value) {
        const line = this.tempSettings?.RSI?.lines?.[lineKey];
        if (!line) return;
        line.lineWidth = Math.max(1, parseInt(value, 10) || 1);
    },

    updateRSIOpacity(lineKey, value) {
        const line = this.tempSettings?.RSI?.lines?.[lineKey];
        if (!line) return;
        line.opacity = parseInt(value, 10) || 0;
        const el = document.getElementById(`rsiOpacityValue-${lineKey}`);
        if (el) el.textContent = value;
    },

    openColorPickerForRSI(lineKey) {
        const line = this.tempSettings?.RSI?.lines?.[lineKey];
        if (!line) return;
        this.openColorPicker(line.color, (color) => {
            line.color = color;
            const btn = document.querySelector(`.rsi-line-row[data-line="${lineKey}"] .color-picker-btn`);
            if (btn) btn.style.background = color;
        });
    },

    // ========== Feature 1: 指標介紹 sub-tab ==========

    /**
     * 切換指標設定 / 指標介紹 sub-tab
     */
    _switchIndicatorSubTab(indicator, subtab) {
        const contentIdMap = {
            MA: 'maSubTabContent',
            BOLL: 'bollSubTabContent',
            VOL: 'volSubTabContent',
            RSI: 'rsiSubTabContent',
        };
        const contentId = contentIdMap[indicator];
        if (!contentId) return;

        const panel = document.querySelector('.settings-panel.active');
        if (!panel) return;

        // 更新 sub-tab active 狀態
        panel.querySelectorAll('.settings-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.subtab === subtab);
        });

        const contentEl = document.getElementById(contentId);
        if (!contentEl) return;

        if (subtab === 'intro') {
            const introMap = {
                MA: this.renderMAIntro,
                BOLL: this.renderBOLLIntro,
                VOL: this.renderVOLIntro,
                RSI: this.renderRSIIntro,
            };
            const introRenderer = introMap[indicator];
            if (typeof introRenderer === 'function') {
                contentEl.innerHTML = introRenderer.call(this);
            }
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

    /** VOL 指標介紹（依 volandrsi.md） */
    renderVOLIntro() {
        return `
        <div class="intro-panel">
            <h4>VOL（成交量）</h4>
            <p>VOL（成交量）是最重要的指標之一。成交量指的是在一定時間內，某一證券或商品交易的數量或合約數，是市場活躍度的直接體現。</p>
            <p>VOLUME 線畫法：</p>
            <ul class="intro-list">
                <li>若收盤價高過開盤價，成交量畫紅色空心實體。</li>
                <li>否則畫綠色實心。</li>
            </ul>
        </div>`;
    },

    /** RSI 指標介紹（依 volandrsi.md） */
    renderRSIIntro() {
        return `
        <div class="intro-panel">
            <h4>RSI（相對強弱指標）</h4>
            <p>RSI（Relative Strength Index）是相當常用的技術指標。它衡量多空力量的消長，反映股價變動中的上漲天數、下跌天數、上漲幅度與下跌幅度。</p>
            <p>在長期市場中，RSI 多數時間落在 30 到 70 區間，40 到 60 最常見；高於 80 或低於 20 的機會較少，高於 90 或低於 10 更少見。</p>
            <p>應用法則：</p>
            <ul class="intro-list">
                <li>RSI 比 K 線、美國線更容易觀察型態，可配合支撐線與阻力線判讀走勢。</li>
                <li>RSI 可依頭肩頂、頭肩底、三角形等型態作為買賣訊號。</li>
                <li>RSI 在 50 以下偏弱勢，50 以上偏強勢；在 50 以下的準確性通常較高。</li>
                <li>6 日 RSI 值 85 以上視為超買，15 以下視為超賣；85 附近形成 W 底可視為買點參考。</li>
                <li>盤整時 RSI 一底比一底高，代表多頭勢強；反之一底比一底低則為賣出時機。</li>
                <li>股價創新高且 RSI 同步創高，後市偏強；若 RSI 未創高，反轉機率提高。</li>
                <li>股價創新低且 RSI 同步創低，後市偏弱；若 RSI 未創低，反轉機率提高。</li>
                <li>股價三度創高但 RSI 峰值轉弱，可能接近天價；股價創新低但 RSI 底值轉強，可能接近底價。</li>
                <li>虛弱回轉若出現在 70 以上或 30 以下，常是較強烈的反轉訊號。</li>
            </ul>
            <p>提醒：在強勢上漲或急跌市場，RSI 進入超買/超賣區後仍可能持續鈍化，建議搭配其他技術分析工具一起判讀。</p>
        </div>`;
    }
});