/**
 * pattern_settings_tab.js - 型態顯示設定分頁
 * 從 chart_settings_modal.js 拆分；透過 Object.assign 掛載至 window.ChartSettingsModal
 * 必須在 chart_settings_modal.js 之後載入
 */
Object.assign(window.ChartSettingsModal, {
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
            <div class="indicator-item flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1 text-[0.875rem] text-text-primary transition-all duration-fast hover:bg-bg-hover" data-pattern="${key}">
                <input type="checkbox" class="pattern-sidebar-cb" data-pattern-key="${key}"
                       ${masterOn ? 'checked' : ''}
                       onclick="event.stopPropagation(); window.ChartSettingsModal._toggleMasterVisible('${key}', this.checked)">
                <span class="flex-1 cursor-pointer"
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
        // ✅ Bug2 Fix: 使用可選鏈避免 _patternConfig 存在但缺少該 key 時回傳 {} 並使用錯誤 fallback 顏色
        const cfg = this._patternConfig?.[patternKey] ?? this.defaultPatternConfig[patternKey] ?? {};
        const name = this._patternNameMap[patternKey] || patternKey;
        const opacity = cfg.opacity ?? 85;
        const lineWidth = cfg.lineWidth ?? 1;
        return `
        <div class="settings-panel active">
            <h3 class="settings-title">${name}</h3>
            <div class="pattern-table-header">
                <span>顯示</span>
                <span>顏色</span>
                <span>邊框粗細</span>
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
                            style="background:${cfg.color ?? '#a0a8b8'};"
                            onclick="window.ChartSettingsModal.openColorPickerForPattern('${patternKey}','shape')"></button>
                </div>
                <div class="pattern-opacity-cell">
                    <input type="range" value="${lineWidth}" min="1" max="5" step="0.5" style="flex:1;"
                           oninput="window.ChartSettingsModal.updatePatternField('${patternKey}','lineWidth',+this.value);document.getElementById('patternLwVal_${patternKey}').textContent=this.value">
                    <span id="patternLwVal_${patternKey}" class="opacity-value">${lineWidth}</span>
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
                            style="background:${cfg.labelColor ?? '#c8cdd8'};"
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
        // ✅ Bug2 Fix: 同步修正 fallback 顏色為亮灰，與 pattern_annotation.js 端一致
        const cfg = this._patternConfig?.[patternKey] ?? this.defaultPatternConfig[patternKey] ?? {};
        const currentColor = target === 'label' ? (cfg.labelColor ?? '#c8cdd8') : (cfg.color ?? '#a0a8b8');
        this.openColorPicker(currentColor, (color) => {
            const field = target === 'label' ? 'labelColor' : 'color';
            this.updatePatternField(patternKey, field, color);
            const btnId = target === 'label' ? `patternLabelColorBtn_${patternKey}` : `patternColorBtn_${patternKey}`;
            const btn = document.getElementById(btnId);
            if (btn) btn.style.background = color;
        });
    }
});