/**
 * Indicator Top Bar
 * 圖表左上角的指標控制列（類似 TradingView/富途牛牛）
 *
 * 功能：
 * - 顯示當前各 MA / BOLL 指標的即時數值（隨 crosshair 更新）
 * - 點選齒輪 → 開啟 Chart Setting 並切換到對應設定頁
 * - 點選叉叉 → 停用該指標（isGlobalEnabled = false）
 * - 點選指標參數文字 → 切換個別線條的啟用狀態（isEnabled）
 */
window.IndicatorTopBar = {

    /**
     * 初始化：掛載後呼叫
     */
    init() {
        this.render();
    },

    /**
     * 重新渲染整個控制列
     * 在 chartIndicators 狀態變化後必須呼叫
     */
    render() {
        const container = document.getElementById('indicatorTopBar');
        if (!container) return;

        const maState   = window.state?.chartIndicators?.MA;
        const bollState = window.state?.chartIndicators?.BOLL;

        let html = '';

        // MA Group
        if (maState && maState.isGlobalEnabled && maState.lines && maState.lines.length > 0) {
            html += this._buildMARow(maState);
        }

        // BOLL Group
        if (bollState && bollState.isGlobalEnabled) {
            html += this._buildBOLLRow(bollState);
        }

        container.innerHTML = html;
    },

    // ──────────────── HTML 建構 ────────────────

    _buildMARow(maState) {
        let linesHtml = '';
        maState.lines.forEach(ma => {
            const dimStyle  = ma.isEnabled ? '' : 'opacity:0.35;';
            const valSpan   = ma.isEnabled
                ? `<span id="iv-ma-${ma.period}" style="font-size:11px;color:${ma.color};font-family:monospace;">--</span>`
                : '';
            linesHtml += `
                <span class="itb-line-token"
                      style="pointer-events:auto;cursor:pointer;display:inline-flex;align-items:center;gap:2px;${dimStyle}"
                      onclick="window.IndicatorTopBar.onLineClick('MA',${ma.period})"
                      title="${ma.isEnabled ? '點選停用 MA' + ma.period : '點選啟用 MA' + ma.period}">
                    <span style="font-size:11px;color:${ma.color};">MA${ma.period}</span>
                    ${valSpan}
                </span>`;
        });

        return `
        <div class="itb-row">
            <span class="itb-ctrl" style="pointer-events:auto;cursor:pointer;"
                  onclick="window.IndicatorTopBar.onGearClick('MA')" title="MA 設定">&#9881;</span>
            <span class="itb-ctrl" style="pointer-events:auto;cursor:pointer;"
                  onclick="window.IndicatorTopBar.onXClick('MA')" title="隱藏 MA">&#x2715;</span>
            <span class="itb-label">MA</span>
            ${linesHtml}
        </div>`;
    },

    _buildBOLLRow(bollState) {
        const lines = bollState.lines || {};
        let linesHtml = '';

        [['upper', 'U'], ['middle', 'M'], ['lower', 'L']].forEach(([key, short]) => {
            const line = lines[key];
            if (!line) return;
            const dimStyle = line.isEnabled ? '' : 'opacity:0.35;';
            const valSpan  = line.isEnabled
                ? `<span id="iv-boll-${key}" style="font-size:11px;color:${line.color};font-family:monospace;">--</span>`
                : '';
            linesHtml += `
                <span class="itb-line-token"
                      style="pointer-events:auto;cursor:pointer;display:inline-flex;align-items:center;gap:2px;${dimStyle}"
                      onclick="window.IndicatorTopBar.onLineClick('BOLL','${key}')"
                      title="${line.isEnabled ? '點選停用 ' + key.toUpperCase() : '點選啟用 ' + key.toUpperCase()}">
                    <span style="font-size:11px;color:${line.color};">${short}</span>
                    ${valSpan}
                </span>`;
        });

        return `
        <div class="itb-row">
            <span class="itb-ctrl" style="pointer-events:auto;cursor:pointer;"
                  onclick="window.IndicatorTopBar.onGearClick('BOLL')" title="BOLL 設定">&#9881;</span>
            <span class="itb-ctrl" style="pointer-events:auto;cursor:pointer;"
                  onclick="window.IndicatorTopBar.onXClick('BOLL')" title="隱藏 BOLL">&#x2715;</span>
            <span class="itb-label">BOLL(${bollState.period},${bollState.stdDev})</span>
            ${linesHtml}
        </div>`;
    },

    // ──────────────── 即時數值更新 ────────────────

    /**
     * 更新 crosshair 數值（由 ChartController.subscribeCrosshairMove 呼叫）
     * @param {object} param - LightweightCharts crosshair param
     */
    updateValues(param) {
        if (!param || !param.time) return;

        const maState   = window.state?.chartIndicators?.MA;
        const bollState = window.state?.chartIndicators?.BOLL;

        // MA values
        if (maState && maState.lines) {
            maState.lines.forEach(ma => {
                if (!ma.isEnabled || !ma.series) return;
                const el = document.getElementById(`iv-ma-${ma.period}`);
                if (!el) return;
                try {
                    const d = param.seriesData.get(ma.series);
                    if (d && d.value != null) el.textContent = d.value.toFixed(2);
                } catch (_) {}
            });
        }

        // BOLL values
        if (bollState && bollState.isGlobalEnabled && bollState.lines) {
            ['upper', 'middle', 'lower'].forEach(key => {
                const line = bollState.lines[key];
                if (!line || !line.isEnabled || !line.series) return;
                const el = document.getElementById(`iv-boll-${key}`);
                if (!el) return;
                try {
                    const d = param.seriesData.get(line.series);
                    if (d && d.value != null) el.textContent = d.value.toFixed(2);
                } catch (_) {}
            });
        }
    },

    // ──────────────── 互動事件 ────────────────

    /**
     * 齒輪點擊：開啟 Chart Setting 並切換到對應面板
     */
    onGearClick(type) {
        if (window.ChartSettingsModal) {
            window.ChartSettingsModal.open(type);
        }
    },

    /**
     * 叉叉點擊：關閉整個指標群組
     */
    onXClick(type) {
        const state = window.state?.chartIndicators;
        if (!state) return;

        if (type === 'MA' && state.MA) {
            state.MA.isGlobalEnabled = false;
            // 同步 modal sidebar checkbox
            const toggle = document.getElementById('ma-toggle');
            if (toggle) toggle.checked = false;
        } else if (type === 'BOLL' && state.BOLL) {
            state.BOLL.isGlobalEnabled = false;
            const toggle = document.getElementById('boll-toggle');
            if (toggle) toggle.checked = false;
        }

        if (window.ChartController) {
            window.ChartController.renderIndicatorsFromState();
        }
        this.render();
    },

    /**
     * 線條文字點擊：切換個別線條啟用狀態
     */
    onLineClick(type, identifier) {
        const state = window.state?.chartIndicators;
        if (!state) return;

        if (type === 'MA' && state.MA && state.MA.lines) {
            const ma = state.MA.lines.find(m => m.period === identifier);
            if (ma) {
                ma.isEnabled = !ma.isEnabled;
                // 同步 modal checkbox
                const cb = document.querySelector(`.ma-line-item[data-period="${identifier}"] input[type="checkbox"]`);
                if (cb) cb.checked = ma.isEnabled;
            }
        } else if (type === 'BOLL' && state.BOLL && state.BOLL.lines) {
            const line = state.BOLL.lines[identifier];
            if (line) {
                line.isEnabled = !line.isEnabled;
                const cb = document.querySelector(`.boll-line-config[data-line="${identifier}"] input[type="checkbox"]`);
                if (cb) cb.checked = line.isEnabled;
            }
        }

        if (window.ChartController) {
            window.ChartController.renderIndicatorsFromState();
        }
        this.render();
    }
};
