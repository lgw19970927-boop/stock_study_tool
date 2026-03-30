/**
 * chart_tooltip.js - K線圖懸浮窗顯示模組
 * 從 chart_controller.js 拆分；透過 Object.assign 掛載至 window.ChartController
 * 必須在 chart_controller.js 之後載入
 */
Object.assign(window.ChartController, {
    // ========== BUG2: 懸浮窗完整實作 ==========

    /**
     * BUG2: 綁定 DOM mousemove / mouseleave 事件
     * 第一層部式定絍由此處處理，_updateCrosshairTooltip 则用於指標控制列更新
     */
    _bindTooltipMouseEvents(chartContainer) {
        // 移除舊的事件避免重複綁定
        const old      = chartContainer._tooltipMouseMove;
        const oldLeave = chartContainer._tooltipMouseLeave;
        const oldEnter = chartContainer._tooltipMouseEnter;
        if (old)      chartContainer.removeEventListener('mousemove',  old);
        if (oldLeave) chartContainer.removeEventListener('mouseleave', oldLeave);
        if (oldEnter) chartContainer.removeEventListener('mouseenter', oldEnter);

        const BOUNDARY_RATIO = 0.18; // 左右邊界識別區比例

        // Bug1 Fix: mouseenter 判斷初次移入側
        // 滑鼠從左側進入 → tooltip 初始在右上角（side='left'）
        // 滑鼠從右側進入 → tooltip 初始在左上角（side='right'）
        const onEnter = (e) => {
            const rect  = chartContainer.getBoundingClientRect();
            const chartW = rect.width;
            const ox = e.clientX - rect.left;
            const leftEdge  = chartW * BOUNDARY_RATIO;
            const rightEdge = chartW * (1 - BOUNDARY_RATIO);
            if (ox <= leftEdge)       this._tooltipSide = 'left';   // 從左進 → 右上角
            else if (ox >= rightEdge) this._tooltipSide = 'right';  // 從右進 → 左上角
            // 中間進入不改變 side（維持預設 'right' = 左上角）
        };

        const onMove = (e) => {
            if (this._tooltipMode === 'hidden') return;
            const tooltip = document.getElementById('chartTooltip');
            if (!tooltip) return;

            const rect  = chartContainer.getBoundingClientRect();
            const chartW = rect.width;
            const chartH = rect.height;
            const ox     = e.clientX - rect.left;
            const oy     = e.clientY - rect.top;

            // 吸附至最近一筆 bar
            const bar = this._snapToNearestBar(ox);
            if (!bar) {
                tooltip.classList.add('is-hidden');
                return;
            }

            // 渲染內容
            tooltip.innerHTML = this._buildTooltipHTML(bar);
            tooltip.classList.remove('is-hidden');

            // 邊界判斷（防抖鎖定：只在觸碰邊界識別區才切換）
            const leftEdge  = chartW * BOUNDARY_RATIO;
            const rightEdge = chartW * (1 - BOUNDARY_RATIO);
            // side='left'  → 滑鼠在左邊界 → tooltip 顯示於右上角（或游標右側）
            // side='right' → 滑鼠在右邊界 → tooltip 顯示於左上角（或游標左側）
            if (ox <= leftEdge)  this._tooltipSide = 'left';
            if (ox >= rightEdge) this._tooltipSide = 'right';

            const tooltipW = tooltip.offsetWidth  || 160;
            const tooltipH = tooltip.offsetHeight || 220;

            if (this._tooltipMode === 'floating') {
                // 模式A：固定懸浮窗（居左上角或右上角，避免遮擋游標所在側）
                tooltip.classList.remove('is-following');
                tooltip.style.removeProperty('--tt-left');
                tooltip.style.removeProperty('--tt-top');
                if (this._tooltipSide === 'left') {
                    // 滑鼠在左邊界 → tooltip 顯示於「右上角」
                    tooltip.style.left   = 'auto';
                    tooltip.style.right  = '8px';
                    tooltip.style.top    = '8px';
                    tooltip.style.bottom = 'auto';
                } else {
                    // 滑鼠在右邊界 → tooltip 顯示於「左上角」
                    tooltip.style.right  = 'auto';
                    tooltip.style.left   = '8px';
                    tooltip.style.top    = '8px';
                    tooltip.style.bottom = 'auto';
                }
            } else if (this._tooltipMode === 'crosshair') {
                // 模式B：跟隨懸浮窗
                // Bug1 Fix: 直接寫入 inline style，避免 CSS class 的 var() 被同層 inline 'auto' 覆蓋
                tooltip.classList.add('is-following');
                const offset = 16;
                let   tx, ty;

                // X軸左右避讓邏輯
                if (this._tooltipSide === 'left') {
                    tx = ox + offset; // 在游標右側
                } else {
                    tx = ox - tooltipW - offset; // 在游標左側
                }

                // Y軸碰撞偵測：靠近頂部則居底部
                if (oy - tooltipH - offset < 0) {
                    ty = oy + offset; // 居底
                } else {
                    ty = oy - tooltipH - offset; // 居頂
                }

                // 邊界安全防護
                tx = Math.max(0, Math.min(tx, chartW - tooltipW - 4));
                ty = Math.max(0, Math.min(ty, chartH - tooltipH - 4));

                // 直接設定 inline left/top，確保優先於任何 CSS class
                tooltip.style.left   = tx + 'px';
                tooltip.style.top    = ty + 'px';
                tooltip.style.right  = 'auto';
                tooltip.style.bottom = 'auto';
            }
        };

        const onLeave = () => {
            const tooltip = document.getElementById('chartTooltip');
            if (tooltip) tooltip.classList.add('is-hidden');
        };

        chartContainer._tooltipMouseMove  = onMove;
        chartContainer._tooltipMouseLeave = onLeave;
        chartContainer._tooltipMouseEnter = onEnter;
        chartContainer.addEventListener('mousemove',  onMove);
        chartContainer.addEventListener('mouseleave', onLeave);
        chartContainer.addEventListener('mouseenter', onEnter);
    },

    /**
     * BUG2: 吸附至最近一筆 K 線 bar
     * @param {number} offsetX - 在圖表容器內的 x 座標
     * @returns {Object|null} bar資料
     */
    _snapToNearestBar(offsetX) {
        if (!this.chart || !this.currentChartData || this.currentChartData.length === 0) return null;
        try {
            // Bug6 Fix: coordinateToLogical 期待的是相對於繪圖區域（drawing area）左邊的座標，
            // 而 offsetX = e.clientX - containerRect.left 包含了左側座標軸的寬度。
            // 有左軸時必須先減去左軸寬度，才能得到正確的 bar index
            let adjustedX = offsetX;
            try { adjustedX = offsetX - (this.chart.priceScale('left').width() || 0); } catch (_) {}
            const logical = this.chart.timeScale().coordinateToLogical(adjustedX);
            if (logical === null || logical === undefined) return null;
            const idx = Math.max(0, Math.min(Math.round(logical), this.currentChartData.length - 1));
            return this.currentChartData[idx] || null;
        } catch (e) {
            return null;
        }
    },

    /**
     * BUG2: 建立懸浮窗 HTML（依照截圖格式）
     * @param {Object} bar - K 線資料
     * @returns {string} HTML 字串
     */
    _buildTooltipHTML(bar) {
        const data = this.currentChartData;
        const idx  = data.findIndex(b => String(b.time) === String(bar.time));

        // 日期 + 星期
        let dateLabel = bar.time || '';
        try {
            const d = new Date(bar.time + 'T00:00:00');
            const weekdays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
            const dateStr = bar.time.replace(/-/g, '/'); // YYYY/MM/DD
            dateLabel = `${dateStr} ${weekdays[d.getDay()]}`;
        } catch (_) {}

        // 漲跌額 / 漲跌幅
        const prevBar   = idx > 0 ? data[idx - 1] : null;
        const rawChange = prevBar ? (bar.close - prevBar.close) : null;
        const change    = rawChange !== null ? rawChange.toFixed(2) : '—';
        const changePct = rawChange !== null && prevBar.close ? ((rawChange / prevBar.close) * 100).toFixed(2) + '%' : '—';
        const isUp      = rawChange !== null ? rawChange >= 0 : true;
        const upCls     = isUp ? 'up' : 'down';
        const changeSign = rawChange !== null && rawChange >= 0 ? '+' : '';

        // 成交量（若有）
        const volume = bar.volume != null ? bar.volume.toLocaleString() : 'To Do';

        return `
            <div class="chart-tooltip-date">${dateLabel}</div>
            <div class="chart-tooltip-row"><span class="chart-tooltip-label">開盤</span><span class="chart-tooltip-value">${bar.open.toFixed(3)}</span></div>
            <div class="chart-tooltip-row"><span class="chart-tooltip-label">最高</span><span class="chart-tooltip-value">${bar.high.toFixed(3)}</span></div>
            <div class="chart-tooltip-row"><span class="chart-tooltip-label">最低</span><span class="chart-tooltip-value">${bar.low.toFixed(3)}</span></div>
            <div class="chart-tooltip-row"><span class="chart-tooltip-label">收盤</span><span class="chart-tooltip-value">${bar.close.toFixed(3)}</span></div>
            <div class="chart-tooltip-row"><span class="chart-tooltip-label">漲跌額</span><span class="chart-tooltip-value ${upCls}">${changeSign}${change}</span></div>
            <div class="chart-tooltip-row"><span class="chart-tooltip-label">漲跌幅</span><span class="chart-tooltip-value ${upCls}">${changeSign}${changePct}</span></div>
            <div class="chart-tooltip-row"><span class="chart-tooltip-label">成交量</span><span class="chart-tooltip-value">${volume}</span></div>
            <div class="chart-tooltip-row"><span class="chart-tooltip-label">成交額</span><span class="chart-tooltip-value to-do">To Do</span></div>
            <div class="chart-tooltip-row"><span class="chart-tooltip-label">換手率</span><span class="chart-tooltip-value to-do">To Do</span></div>
            <div class="chart-tooltip-row"><span class="chart-tooltip-label">市盈率</span><span class="chart-tooltip-value to-do">To Do</span></div>
        `;
    },

    /**
     * 套用懸浮窗模式
     */
    _applyTooltipMode(mode) {
        this._tooltipMode = mode;
        const tooltip = document.getElementById('chartTooltip');
        if (tooltip && mode === 'hidden') {
            tooltip.classList.add('is-hidden');
        }

        // Bug4 Fix: CrosshairMode.Hidden 不在 LW v4 中，改用
        // vertLine/horzLine visible 控制十字線顯示以避免驱動 LW 進入異常狀態。
        if (this.chart) {
            if (mode === 'hidden') {
                try {
                    this.chart.applyOptions({
                        crosshair: {
                            // Bug2 Fix: labelVisible: false 確保完全阻斷座標軸標籤干擾
                            vertLine: { visible: false, labelVisible: false },
                            horzLine: { visible: false, labelVisible: false }
                        }
                    });
                } catch (_) {}
            } else {
                const LW = window.LightweightCharts;
                try {
                    this.chart.applyOptions({
                        crosshair: {
                            mode: LW?.CrosshairMode?.Normal ?? 0,
                            // 從 hidden 切回時需顯式恢復 labelVisible，避免標籤持續遺失
                            vertLine: { visible: true, labelVisible: true },
                            horzLine: { visible: true, labelVisible: true }
                        }
                    });
                } catch (_) {}
            }
        }
    },

    /**
     * LW crosshair 移動事件 — 僅更新指標控制列（tooltip 改由 DOM mousemove 控制）
     */
    _updateCrosshairTooltip(param) {
        // 指標控制列更新已在 subscribeCrosshairMove callback 裡處理
        // 此函式預留給未來擴展用
    },
});
