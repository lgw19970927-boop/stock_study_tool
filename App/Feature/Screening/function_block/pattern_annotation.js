/**
 * Pattern Annotation - 型態辨識標註圖層
 *
 * 在 SVG overlay 上繪製型態框或折線：
 * - consolidation（盤整區）→ <rect> 白框
 * - 其他（W底、頭肩頂等）→ 局部極值算法找轉折點 → <polyline>
 *
 * 需要 HTML 中存在：<svg id="patternAnnotationSVG">
 * 所在容器需有 position: relative
 */
window.PatternAnnotation = {
    _patterns: [],
    _chartData: [],
    _enabled: true,
    _unsubscribe: null,

    /**
     * 設定型態資料並渲染
     * @param {Array} patternsFound - [{name, display_name, start_date, end_date, confidence}, ...]
     * @param {Array} chartData     - K 線資料陣列
     */
    setData(patternsFound, chartData) {
        this._patterns  = patternsFound || [];
        this._chartData = chartData     || [];
        this._subscribeRedraw();
        this.render();
    },

    /**
     * 清空標註
     */
    clear() {
        this._patterns  = [];
        this._chartData = [];
        const svg = document.getElementById('patternAnnotationSVG');
        if (svg) svg.innerHTML = '';
    },

    /**
     * 顯示/隱藏切換
     * @param {boolean} bool
     */
    setEnabled(bool) {
        this._enabled = bool;
        const svg = document.getElementById('patternAnnotationSVG');
        if (svg) svg.style.display = bool ? '' : 'none';
        if (bool) this.render();
    },

    // ──────────────── 訂閱重繪 ────────────────

    /**
     * 訂閱 visible range change，確保 pan/zoom 時重繪
     */
    _subscribeRedraw() {
        if (this._unsubscribe) {
            try { this._unsubscribe(); } catch (_) {}
            this._unsubscribe = null;
        }
        const chart = window.ChartController?.chart;
        if (!chart) return;

        const handler = () => this.render();
        chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
        this._unsubscribe = () => {
            try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler); } catch (_) {}
        };
    },

    // ──────────────── 主渲染 ────────────────

    /**
     * 重新渲染所有型態標註
     */
    render() {
        const svg = document.getElementById('patternAnnotationSVG');
        if (!svg || !this._enabled) return;

        const chart        = window.ChartController?.chart;
        const candleSeries = window.ChartController?.candleSeries;

        if (!chart || !candleSeries || this._patterns.length === 0) {
            svg.innerHTML = '';
            return;
        }

        // 同步 SVG 尺寸到容器
        const container = document.getElementById('chart');
        if (container) {
            svg.setAttribute('width',  container.clientWidth  || container.offsetWidth);
            svg.setAttribute('height', container.clientHeight || container.offsetHeight);
        }

        const timeScale = chart.timeScale();
        svg.innerHTML   = '';

        this._patterns.forEach(pattern => {
            if (!pattern.start_date || !pattern.end_date) return;

            // 轉換為 timestamp（秒）進行比較
            const startTs = new Date(pattern.start_date + 'T00:00:00').getTime() / 1000;
            const endTs   = new Date(pattern.end_date   + 'T00:00:00').getTime() / 1000;

            // 找到對應的 K 線 slice
            const slice = this._chartData.filter(bar => {
                const t = typeof bar.time === 'string'
                    ? new Date(bar.time + 'T00:00:00').getTime() / 1000
                    : bar.time;
                return t >= startTs && t <= endTs;
            });

            if (slice.length < 2) return;

            if ((pattern.name || '').toLowerCase() === 'consolidation') {
                this._drawRect(svg, pattern, slice, timeScale, candleSeries);
            } else {
                this._drawPolyline(svg, pattern, slice, timeScale, candleSeries);
            }
        });
    },

    // ──────────────── 繪圖方法 ────────────────

    /**
     * 繪製矩形框（盤整區）
     */
    _drawRect(svg, pattern, slice, timeScale, candleSeries) {
        const top    = Math.max(...slice.map(b => b.high));
        const bottom = Math.min(...slice.map(b => b.low));
        const x1 = timeScale.timeToCoordinate(slice[0].time);
        const x2 = timeScale.timeToCoordinate(slice[slice.length - 1].time);
        const y1 = candleSeries.priceToCoordinate(top);
        const y2 = candleSeries.priceToCoordinate(bottom);

        if (x1 == null || x2 == null || y1 == null || y2 == null) return;

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x',            Math.min(x1, x2));
        rect.setAttribute('y',            Math.min(y1, y2));
        rect.setAttribute('width',        Math.abs(x2 - x1));
        rect.setAttribute('height',       Math.abs(y2 - y1));
        rect.setAttribute('fill',         'rgba(255,255,255,0.05)');
        rect.setAttribute('stroke',       '#ffffff');
        rect.setAttribute('stroke-width', '1.5');
        rect.setAttribute('opacity',      '0.8');
        rect.appendChild(this._makeTitle(pattern));
        svg.appendChild(rect);

        // 左上角標籤
        this._drawLabel(svg, Math.min(x1, x2) + 3, Math.min(y1, y2) - 4, pattern, '#ffffff');
    },

    /**
     * 繪製折線（有型態的連線，如 W底、頭肩頂等）
     */
    _drawPolyline(svg, pattern, slice, timeScale, candleSeries) {
        const extrema = this._findLocalExtrema(slice);
        if (extrema.length < 2) {
            // 極值不足時 fallback 為 rect
            this._drawRect(svg, pattern, slice, timeScale, candleSeries);
            return;
        }

        const points = extrema.map(pt => {
            const x = timeScale.timeToCoordinate(pt.time);
            const y = candleSeries.priceToCoordinate(pt.price);
            if (x == null || y == null) return null;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).filter(Boolean);

        if (points.length < 2) return;

        const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        polyline.setAttribute('points',       points.join(' '));
        polyline.setAttribute('fill',         'none');
        polyline.setAttribute('stroke',       '#00d4aa');
        polyline.setAttribute('stroke-width', '1.5');
        polyline.setAttribute('opacity',      '0.85');
        polyline.appendChild(this._makeTitle(pattern));
        svg.appendChild(polyline);

        // 標籤放在第一個極值點附近
        const firstX = timeScale.timeToCoordinate(extrema[0].time);
        const firstY = candleSeries.priceToCoordinate(extrema[0].price);
        if (firstX != null && firstY != null) {
            this._drawLabel(svg, firstX + 3, firstY - 6, pattern, '#00d4aa');
        }
    },

    // ──────────────── 工具方法 ────────────────

    _makeTitle(pattern) {
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        const name  = pattern.display_name || pattern.name || '';
        const conf  = pattern.confidence != null ? ` (${Math.round(pattern.confidence)}%)` : '';
        title.textContent = name + conf;
        return title;
    },

    _drawLabel(svg, x, y, pattern, color) {
        const name = (pattern.display_name || pattern.name || '').substring(0, 12);
        if (!name) return;

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x',           x);
        text.setAttribute('y',           y);
        text.setAttribute('fill',        color);
        text.setAttribute('font-size',   '10');
        text.setAttribute('font-family', 'monospace');
        text.setAttribute('opacity',     '0.85');
        text.textContent = name;
        svg.appendChild(text);
    },

    /**
     * 局部極值尋找算法
     * 返回按時間排序的極值點（局部最高/最低交替出現）
     *
     * @param {Array}  slice      - K 線數據切片
     * @param {number} windowSize - 比較窗口半徑（預設 3）
     * @returns {Array} [{time, price}, ...]
     */
    _findLocalExtrema(slice, windowSize = 3) {
        if (slice.length < windowSize * 2 + 1) {
            // 資料太短：直接取首尾兩點
            return [
                { time: slice[0].time,                   price: slice[0].close },
                { time: slice[slice.length - 1].time,    price: slice[slice.length - 1].close }
            ];
        }

        const peaks   = [];
        const valleys = [];

        for (let i = windowSize; i < slice.length - windowSize; i++) {
            const seg = slice.slice(i - windowSize, i + windowSize + 1);
            const maxH = Math.max(...seg.map(b => b.high));
            const minL = Math.min(...seg.map(b => b.low));

            if (slice[i].high === maxH) {
                peaks.push({ time: slice[i].time, price: slice[i].high,  type: 'peak',   idx: i });
            }
            if (slice[i].low  === minL) {
                valleys.push({ time: slice[i].time, price: slice[i].low, type: 'valley', idx: i });
            }
        }

        // 合併、排序、去除相鄰同類（保留更極端的）
        const all    = [...peaks, ...valleys].sort((a, b) => a.idx - b.idx);
        const merged = [];
        for (const pt of all) {
            const last = merged[merged.length - 1];
            if (!last || last.type !== pt.type) {
                merged.push(pt);
            } else {
                if (pt.type === 'peak'   && pt.price > last.price) merged[merged.length - 1] = pt;
                if (pt.type === 'valley' && pt.price < last.price) merged[merged.length - 1] = pt;
            }
        }

        return merged.map(pt => ({ time: pt.time, price: pt.price }));
    }
};
