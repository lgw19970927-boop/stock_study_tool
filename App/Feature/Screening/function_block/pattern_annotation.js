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
     * Bug10: 訂閱 visible range change，確保 pan/zoom 時重繪（雙保險）
     * Bug5 Fix: 加入 requestAnimationFrame wrapping，確保 LW 完成 layout 更新後再取座標
     */
    _subscribeRedraw() {
        if (this._unsubscribe) {
            try { this._unsubscribe(); } catch (_) {}
            this._unsubscribe = null;
        }
        const chart = window.ChartController?.chart;
        if (!chart) return;

        // 用 requestAnimationFrame 包裝確保在下一局棟取回正確座標
        let _rafId = null;
        const handler = () => {
            if (_rafId !== null) cancelAnimationFrame(_rafId);
            _rafId = requestAnimationFrame(() => {
                _rafId = null;
                this.render();
            });
        };
        chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
        // 雙保險：同時訂閱 time range change
        try { chart.timeScale().subscribeVisibleTimeRangeChange(handler); } catch (_) {}
        this._unsubscribe = () => {
            if (_rafId !== null) cancelAnimationFrame(_rafId);
            try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler); } catch (_) {}
            try { chart.timeScale().unsubscribeVisibleTimeRangeChange(handler); } catch (_) {}
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

        // Bug4 Fix: 改從 #chartWrapper 取容器尺寸
        // Bug5 Fix: 移除顯式 width/height attribute，避免 SVG viewport 跟 CSS 廣座充突
        // CSS 已設定 width:100%;height:100%，同時設屬性用 px 會造成座標系縮放分岐導致偏移
        // 使用 setAttribute('width','100%') 讓 SVG 內部 1 unit = 1 CSS pixel
        const container = document.getElementById('chartWrapper') || document.getElementById('chart');
        if (container) {
            const w = container.clientWidth  || container.offsetWidth  || 800;
            const h = container.clientHeight || container.offsetHeight || 500;
            // 等效於用 CSS 控制大小；viewBox 確保內部座標與番幕像素直接對應
            svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
            svg.removeAttribute('width');
            svg.removeAttribute('height');
        }

        const timeScale = chart.timeScale();
        svg.innerHTML   = '';

        this._patterns.forEach(pattern => {
            if (!pattern.start_date || !pattern.end_date) return;

            // Bug9e: 總開關判斷，若 masterVisible === false 则此型態全部跳過
            // ✅ Bug2 Fix: 先查 _patternConfig，再 fallback 至 defaultPatternConfig，確保初始渲染與設定額色一致
            const patCfg = window.ChartSettingsModal?._patternConfig?.[pattern.name]
                ?? window.ChartSettingsModal?.defaultPatternConfig?.[pattern.name];
            if (patCfg && patCfg.masterVisible === false) return;

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

            const patternType = (pattern.name || '').toLowerCase();
            if (patternType === 'consolidation') {
                this._drawRect(svg, pattern, slice, timeScale, candleSeries, patCfg);
            } else if (patternType === 'triangle') {
                this._drawTriangle(svg, pattern, slice, timeScale, candleSeries, patCfg);
            } else {
                this._drawPolyline(svg, pattern, slice, timeScale, candleSeries, patCfg);
            }
        });
    },

    // ──────────────── 繪圖方法 ────────────────

    /**
     * 繪製矩形框（盤整區）
     */
    _drawRect(svg, pattern, slice, timeScale, candleSeries, patCfg) {
        const top    = Math.max(...slice.map(b => b.high));
        const bottom = Math.min(...slice.map(b => b.low));
        const x1 = timeScale.timeToCoordinate(slice[0].time);
        const x2 = timeScale.timeToCoordinate(slice[slice.length - 1].time);
        const y1 = candleSeries.priceToCoordinate(top);
        const y2 = candleSeries.priceToCoordinate(bottom);

        if (x1 == null || x2 == null || y1 == null || y2 == null) return;

        // Bug8b: 從 patCfg 讀取設定，沒有則用預設灰白色
        const shapeVisible = !patCfg || patCfg.shapeVisible !== false;
        const textVisible  = !patCfg || patCfg.textVisible  !== false;
        const color      = patCfg?.color      || '#a0a8b8';
        const labelColor = patCfg?.labelColor || '#c8cdd8';
        const lineWidth  = patCfg?.lineWidth  || 1;
        const opacity    = (patCfg?.opacity   ?? 70) / 100;

        if (shapeVisible) {
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x',            Math.min(x1, x2));
            rect.setAttribute('y',            Math.min(y1, y2));
            rect.setAttribute('width',        Math.abs(x2 - x1));
            rect.setAttribute('height',       Math.abs(y2 - y1));
            rect.setAttribute('fill',         `rgba(${this._hexToRgb(color)},${opacity * 0.1})`);
            rect.setAttribute('stroke',       color);
            rect.setAttribute('stroke-width', String(lineWidth));
            rect.setAttribute('opacity',      String(opacity));
            rect.appendChild(this._makeTitle(pattern));
            svg.appendChild(rect);
        }

        if (textVisible) {
            const labelY = Math.min(y1, y2) - 4;
            if (labelY != null) this._drawLabel(svg, Math.min(x1, x2) + 3, labelY, pattern, labelColor);
        }
    },

    /**
     * 繪製折線（有型態的連線，如 W底、頭肩頂等）
     */
    _drawPolyline(svg, pattern, slice, timeScale, candleSeries, patCfg) {
        const extrema = this._findLocalExtrema(slice);
        if (extrema.length < 2) {
            this._drawRect(svg, pattern, slice, timeScale, candleSeries, patCfg);
            return;
        }

        const points = extrema.map(pt => {
            const x = timeScale.timeToCoordinate(pt.time);
            const y = candleSeries.priceToCoordinate(pt.price);
            if (x == null || y == null) return null;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).filter(Boolean);

        if (points.length < 2) return;

        // Bug8b: 從 patCfg 讀取設定
        const shapeVisible = !patCfg || patCfg.shapeVisible !== false;
        const textVisible  = !patCfg || patCfg.textVisible  !== false;
        const color      = patCfg?.color      || '#a0a8b8';
        const labelColor = patCfg?.labelColor || '#c8cdd8';
        const lineWidth  = patCfg?.lineWidth  || 1.5;
        const opacity    = (patCfg?.opacity   ?? 85) / 100;

        if (shapeVisible) {
            const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            polyline.setAttribute('points',       points.join(' '));
            polyline.setAttribute('fill',         'none');
            polyline.setAttribute('stroke',       color);
            polyline.setAttribute('stroke-width', String(lineWidth));
            polyline.setAttribute('opacity',      String(opacity));
            polyline.appendChild(this._makeTitle(pattern));
            svg.appendChild(polyline);
        }

        if (textVisible) {
            // Bug10: null 保護
            const firstX = timeScale.timeToCoordinate(extrema[0].time);
            const firstY = candleSeries.priceToCoordinate(extrema[0].price);
            if (firstX == null || firstY == null) return;

            const pName = (pattern.name || '').toLowerCase();
            let labelY;
            if (pName === 'head_shoulders_top') {
                const topPrice = Math.max(...slice.map(b => b.high));
                const topY = candleSeries.priceToCoordinate(topPrice);
                labelY = topY != null ? topY - 14 : firstY - 14;
            } else if (pName === 'w_bottom' || pName === 'head_shoulders_bottom') {
                const bottomPrice = Math.min(...slice.map(b => b.low));
                const bottomY = candleSeries.priceToCoordinate(bottomPrice);
                labelY = bottomY != null ? bottomY + 14 : firstY + 14;
            } else {
                labelY = firstY - 6;
            }
            if (labelY != null) this._drawLabel(svg, firstX + 3, labelY, pattern, labelColor);
        }
    },

    // ──────────────── 三角收斂專用繪圖（Bug 1）────────────────

    /**
     * 繪製三角收斂：上方下降阻力線 + 下方上升支撐線
     * Fallback 策略：
     *   - 兩邊皆不足 2 點 → 矩形框
     *   - 只有一邊不足 → 畫單線
     */
    _drawTriangle(svg, pattern, slice, timeScale, candleSeries, patCfg) {
        const windowSize = Math.max(2, Math.floor(slice.length / 10));
        const peaks   = this._findPeaks(slice, windowSize);
        const valleys = this._findValleys(slice, windowSize);

        const hasPeaks   = peaks.length   >= 2;
        const hasValleys = valleys.length >= 2;

        if (!hasPeaks && !hasValleys) {
            this._drawRect(svg, pattern, slice, timeScale, candleSeries, patCfg);
            return;
        }

        // Bug8b: 從 patCfg 讀取設定
        const shapeVisible = !patCfg || patCfg.shapeVisible !== false;
        const textVisible  = !patCfg || patCfg.textVisible  !== false;
        const color      = patCfg?.color      || '#a0a8b8';
        const labelColor = patCfg?.labelColor || '#c8cdd8';
        const lineWidth  = patCfg?.lineWidth  || 1;
        const opacity    = (patCfg?.opacity   ?? 85) / 100;

        const drawTrendLine = (p1, p2) => {
            const x1 = timeScale.timeToCoordinate(p1.time);
            const y1 = candleSeries.priceToCoordinate(p1.price);
            const x2 = timeScale.timeToCoordinate(p2.time);
            const y2 = candleSeries.priceToCoordinate(p2.price);
            if (x1 == null || y1 == null || x2 == null || y2 == null) return null;

            if (shapeVisible) {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1',           x1.toFixed(1));
                line.setAttribute('y1',           y1.toFixed(1));
                line.setAttribute('x2',           x2.toFixed(1));
                line.setAttribute('y2',           y2.toFixed(1));
                line.setAttribute('stroke',       color);
                line.setAttribute('stroke-width', String(lineWidth));
                line.setAttribute('opacity',      String(opacity));
                line.appendChild(this._makeTitle(pattern));
                svg.appendChild(line);
            }
            return { x1, y1 };
        };

        let labelX = null, labelY = null;

        if (hasPeaks) {
            const r = drawTrendLine(peaks[0], peaks[peaks.length - 1]);
            if (r) { labelX = r.x1 + 3; labelY = r.y1 - 10; }
        }

        if (hasValleys) {
            const r = drawTrendLine(valleys[0], valleys[valleys.length - 1]);
            if (r && labelX == null) { labelX = r.x1 + 3; labelY = r.y1 - 10; }
        }

        // Bug10: null 保護
        if (textVisible && labelX != null && labelY != null) {
            this._drawLabel(svg, labelX, labelY, pattern, labelColor);
        }
    },

    /**
     * 尋找局部峰值，按索引排序，相鄰窗口內保留較高者
     */
    _findPeaks(slice, windowSize = 3) {
        const peaks = [];
        for (let i = windowSize; i < slice.length - windowSize; i++) {
            const seg  = slice.slice(i - windowSize, i + windowSize + 1);
            const maxH = Math.max(...seg.map(b => b.high));
            if (slice[i].high === maxH) {
                const last = peaks[peaks.length - 1];
                if (last && last.idx > i - windowSize * 2) {
                    if (slice[i].high > last.price)
                        peaks[peaks.length - 1] = { time: slice[i].time, price: slice[i].high, idx: i };
                } else {
                    peaks.push({ time: slice[i].time, price: slice[i].high, idx: i });
                }
            }
        }
        return peaks;
    },

    /**
     * 尋找局部谷值，按索引排序，相鄰窗口內保留較低者
     */
    _findValleys(slice, windowSize = 3) {
        const valleys = [];
        for (let i = windowSize; i < slice.length - windowSize; i++) {
            const seg  = slice.slice(i - windowSize, i + windowSize + 1);
            const minL = Math.min(...seg.map(b => b.low));
            if (slice[i].low === minL) {
                const last = valleys[valleys.length - 1];
                if (last && last.idx > i - windowSize * 2) {
                    if (slice[i].low < last.price)
                        valleys[valleys.length - 1] = { time: slice[i].time, price: slice[i].low, idx: i };
                } else {
                    valleys.push({ time: slice[i].time, price: slice[i].low, idx: i });
                }
            }
        }
        return valleys;
    },


    // ──────────────── 工具方法 ────────────────

    _hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `${r},${g},${b}`;
    },

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

