/**
 * Pattern Screening Block
 * Handles Pattern Checkboxes, Sensitivity Slider, and Timeframe settings.
 */
window.ScreeningBlockPattern = {
    init: function () {
        this.bindEvents();
        this.setupSliders();
        this.syncFromState();
    },

    syncFromState: function () {
        const f = window.state.filters;
        if (!f) return;

        // Patterns checkboxes
        if (f.patterns) {
            document.querySelectorAll('input[name="pattern"]').forEach(cb => {
                cb.checked = f.patterns.includes(cb.value);
            });
        }

        // Sensitivity
        if (f.sensitivity !== undefined) {
            const sense = document.getElementById('sensitivityRange');
            const val = document.getElementById('sensitivityValue');
            if (sense) sense.value = f.sensitivity;
            if (val) val.textContent = f.sensitivity + '%';
        }

        // Timeframe
        if (f.patternTimeframe) {
            const pMin = document.getElementById('patternBarsMin');
            const pMax = document.getElementById('patternBarsMax');
            const pInterval = document.getElementById('patternTimeInterval');

            const pMinPreview = document.getElementById('barsMinPreview');
            const pMaxPreview = document.getElementById('barsMaxPreview');
            const pIntervalPreview = document.getElementById('intervalPreview');

            if (pMin) {
                pMin.value = f.patternTimeframe.min;
                if (pMinPreview) pMinPreview.textContent = pMin.value;
            }
            if (pMax) {
                pMax.value = f.patternTimeframe.max;
                if (pMaxPreview) pMaxPreview.textContent = pMax.value;
            }
            if (pInterval) {
                pInterval.value = f.patternTimeframe.interval;
                if (pIntervalPreview) pIntervalPreview.textContent = pInterval.options[pInterval.selectedIndex] ? pInterval.options[pInterval.selectedIndex].text : f.patternTimeframe.interval;
            }
        }
    },

    bindEvents: function () {
        // Pattern Checkboxes
        document.querySelectorAll('input[name="pattern"]').forEach(cb => {
            cb.addEventListener('change', () => {
                this.updateState();
            });
        });
    },

    setupSliders: function () {
        // Sensitivity Slider
        const range = document.getElementById('sensitivityRange');
        const val = document.getElementById('sensitivityValue');
        if (range && val) {
            range.addEventListener('input', (e) => {
                val.textContent = e.target.value + '%';
                this.updateState();
            });
        }

        // Pattern Timeframe Listeners (Range: Min ~ Max)
        const pMin = document.getElementById('patternBarsMin');
        const pMax = document.getElementById('patternBarsMax');
        const pInterval = document.getElementById('patternTimeInterval');
        const pMinPreview = document.getElementById('barsMinPreview');
        const pMaxPreview = document.getElementById('barsMaxPreview');
        const pIntervalPreview = document.getElementById('intervalPreview');

        const updatePreview = () => {
            if (pMin && pMinPreview) pMinPreview.textContent = pMin.value;
            if (pMax && pMaxPreview) pMaxPreview.textContent = pMax.value;
            if (pInterval && pIntervalPreview) pIntervalPreview.textContent = pInterval.options[pInterval.selectedIndex].text;
            this.updateState();
        };

        if (pMin) pMin.addEventListener('input', updatePreview);
        if (pMax) pMax.addEventListener('input', updatePreview);
        if (pInterval) pInterval.addEventListener('change', updatePreview);
    },

    /**
     * Updates the global window.state.filters with current Pattern settings
     */
    updateState: function () {
        // Patterns
        window.state.filters.patterns = Array.from(document.querySelectorAll('input[name="pattern"]:checked')).map(cb => cb.value);

        // Sensitivity
        const sense = document.getElementById('sensitivityRange');
        window.state.filters.sensitivity = sense ? parseInt(sense.value) : 75;

        // Pattern Timeframe (Range)
        const pMin = document.getElementById('patternBarsMin');
        const pMax = document.getElementById('patternBarsMax');
        const pInterval = document.getElementById('patternTimeInterval');

        if (pMin && pMax && pInterval) {
            window.state.filters.patternTimeframe = {
                min: parseInt(pMin.value) || 20,
                max: parseInt(pMax.value) || 60,
                interval: pInterval.value
            };
        }
    },

    /**
     * Visualizes detected patterns on a Lightweight Chart.標註右側圖表型態
     * 
     * @param {Object} chart - LightweightCharts.createChart instance
     * @param {Object} series - The candlestick series instance
     * @param {Array} patterns - Array of PatternFound objects from backend
     */
    drawPatterns: function (chart, series, patterns) {
        if (!series || !patterns || patterns.length === 0) return;

        const markers = [];
        patterns.forEach(p => {
            // Start Marker
            markers.push({
                time: p.startTime,
                position: 'belowBar',
                color: '#2196F3', // Blue for info
                shape: 'arrowUp',
                text: `Start: ${p.name}`
            });

            // End Marker
            markers.push({
                time: p.endTime,
                position: 'aboveBar',
                color: '#2196F3',
                shape: 'arrowDown',
                text: `End (${p.confidence}%)`
            });
        });

        console.log('Setting Markers:', markers);
        series.setMarkers(markers);
    },

    /**
     * 取得目前型態篩選條件的狀態
     * 供 screening.js 呼叫，用於組建 API 請求參數
     * @returns {{patterns: string[], sensitivity: number, patternTimeframe: {min: number, max: number, interval: string}}}
     */
    getState: function () {
        const checkedPatterns = [...document.querySelectorAll('input[name="pattern"]:checked')]
            .map(cb => cb.value);

        const sensitivity = parseInt(
            document.getElementById('sensitivityRange')?.value ?? '75', 10
        );

        const patternTimeframe = {
            min: parseInt(document.getElementById('patternBarsMin')?.value ?? '20', 10),
            max: parseInt(document.getElementById('patternBarsMax')?.value ?? '60', 10),
            interval: document.getElementById('patternTimeInterval')?.value ?? '1D',
        };

        return {
            patterns: checkedPatterns,
            sensitivity: sensitivity,
            patternTimeframe: patternTimeframe,
        };
    },
};
