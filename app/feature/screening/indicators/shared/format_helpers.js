/**
 * Shared UI text builders for indicator summary/tag labels.
 */
(function initIndicatorFormatHelpers() {
    const PERIOD_ABBR = {
        '日K': 'D',
        '周K': 'W',
        '月K': 'M',
        '60分K': 'H',
        '1d': 'D',
        '1w': 'W',
        '1M': 'M',
        '1h': 'H'
    };

    const DB_TIMEFRAME_TO_TEXT = {
        '1d': '日K',
        '1w': '周K',
        '1M': '月K',
        '1h': '60分K'
    };

    function toPeriodText(periodValue) {
        if (!periodValue) return '日K';
        return DB_TIMEFRAME_TO_TEXT[periodValue] || periodValue;
    }

    function toPeriodAbbr(periodValue) {
        const periodText = toPeriodText(periodValue);
        return PERIOD_ABBR[periodText] || PERIOD_ABBR[periodValue] || 'D';
    }

    function buildSummaryText(indicator, periodText, condition, n = 1) {
        const prefix = n > 1 ? `連續${n}次` : '';
        return `${indicator}-${prefix}${periodText}: ${condition}`;
    }

    function buildSummaryLines(indicator, periodText, conditions, n = 1) {
        const conditionList = Array.isArray(conditions) ? conditions : [conditions];
        return conditionList
            .filter(Boolean)
            .map((condition) => buildSummaryText(indicator, periodText, condition, n));
    }

    function buildTag(indicator, periodAbbr, condition, n = 1) {
        const cond = String(condition || '').trim();
        const hasIndicator = cond.includes(indicator) || cond.startsWith('價格');
        const indicatorPrefix = hasIndicator ? '' : `${indicator} `;
        return `${n}${periodAbbr}: ${indicatorPrefix}${cond}`;
    }

    function buildInsufficientTag(missingLine, periodAbbr) {
        return `${missingLine} (${periodAbbr})資料不足`;
    }

    window.IndicatorFormatHelpers = {
        PERIOD_ABBR,
        DB_TIMEFRAME_TO_TEXT,
        toPeriodText,
        toPeriodAbbr,
        buildSummaryText,
        buildSummaryLines,
        buildTag,
        buildInsufficientTag
    };
})();
