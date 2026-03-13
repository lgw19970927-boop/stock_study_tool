/**
 * Market & Frequency Selection Block
 * Handles interactions for Market Range and Screening Frequency sections.
 */
window.ScreeningBlockMarket = {
    init: function () {
        this.bindEvents();
        this.syncFromState();
    },

    syncFromState: function () {
        const f = window.state.filters;
        if (!f) return;

        // Market
        if (f.markets && f.markets.length > 0) {
            document.querySelectorAll('.market-select').forEach(cb => {
                cb.checked = f.markets.includes(cb.value);
            });
        }

        // Frequency
        if (f.frequency) {
            const radio = document.querySelector(`input[name="frequency"][value="${f.frequency}"]`);
            if (radio) radio.checked = true;
        }
    },

    bindEvents: function () {
        // Market Selection (Sync to state)
        document.querySelectorAll('.market-select').forEach(cb => {
            cb.addEventListener('change', () => {
                this.updateState();
            });
        });

        // Frequency Selection
        document.querySelectorAll('input[name="frequency"]').forEach(radio => {
            radio.addEventListener('change', () => {
                this.updateState();
            });
        });
    },

    /**
     * Updates the global window.state.filters with current Market and Frequency values
     */
    updateState: function () {
        // Market
        const markets = Array.from(document.querySelectorAll('.market-select:checked')).map(cb => cb.value);
        window.state.filters.markets = markets;

        // Frequency
        const freq = document.querySelector('input[name="frequency"]:checked');
        window.state.filters.frequency = freq ? freq.value : '';
    },

    /**
     * Validates if Market and Frequency are correctly selected
     * Returns { isValid: boolean, error: string | null }
     */
    validate: function () {
        this.updateState(); // Ensure state is fresh
        const f = window.state.filters;

        if (f.markets.length === 0) {
            return { isValid: false, error: '請至少選擇一個市場範圍（Listed Stocks / OTC Stocks / IPO Stocks）' };
        }

        if (!f.frequency) {
            return { isValid: false, error: '請選擇篩選頻率（每日 / 每周 / 每月）' };
        }

        return { isValid: true, error: null };
    }
};
