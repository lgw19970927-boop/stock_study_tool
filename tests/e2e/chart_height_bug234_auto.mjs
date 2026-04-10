import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const BASE_URL = process.env.CHART_TEST_BASE_URL || 'http://localhost/screening';
const HEADLESS = process.env.CHART_TEST_HEADLESS !== 'false';
const TIMEOUT_MS = Number(process.env.CHART_TEST_TIMEOUT_MS || 45000);
const PX_TOLERANCE = Number(process.env.CHART_TEST_PX_TOL || 2);
const RATIO_TOLERANCE = Number(process.env.CHART_TEST_RATIO_TOL || 0.01);
const REPORT_PATH = process.env.CHART_TEST_REPORT || 'tests/e2e/chart_height_bug234_report.json';
const CAPTURE_SCREENSHOTS = process.env.CHART_TEST_SCREENSHOTS === '1';
const SCREENSHOT_DIR = process.env.CHART_TEST_SCREENSHOT_DIR || 'tests/e2e/screenshots';

const report = {
    meta: {
        startedAt: new Date().toISOString(),
        baseUrl: BASE_URL,
        headless: HEADLESS,
        pxTolerance: PX_TOLERANCE,
        ratioTolerance: RATIO_TOLERANCE,
    },
    symbols: [],
    cases: [],
    summary: null,
};

function toNumberOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function panePxAt(snapshot, paneIndex) {
    if (!snapshot || !Array.isArray(snapshot.panePx) || !Number.isFinite(Number(paneIndex))) return null;
    const found = snapshot.panePx.find((p) => p.i === Number(paneIndex));
    return found ? toNumberOrNull(found.px) : null;
}

function mainPx(snapshot) {
    return panePxAt(snapshot, 0);
}

function volPx(snapshot) {
    return panePxAt(snapshot, snapshot?.VOL?.paneIdx);
}

function rsiPx(snapshot) {
    return panePxAt(snapshot, snapshot?.RSI?.paneIdx);
}

function controlBarTop(snapshot, indicator) {
    return toNumberOrNull(snapshot?.controlBars?.[indicator]?.actualTop);
}

function controlBarExpectedTop(snapshot, indicator) {
    return toNumberOrNull(snapshot?.controlBars?.[indicator]?.expectedTop);
}

function ratio(value, total) {
    if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return null;
    return value / total;
}

function addNumericCheck(testCase, name, actual, expected, tolerance) {
    const a = toNumberOrNull(actual);
    const e = toNumberOrNull(expected);
    const pass = a !== null && e !== null && Math.abs(a - e) <= tolerance;
    testCase.checks.push({
        name,
        pass,
        actual: a,
        expected: e,
        diff: a !== null && e !== null ? Number((a - e).toFixed(4)) : null,
        tolerance,
    });
}

function addRatioCheck(testCase, name, actualRatio, expectedRatio, tolerance) {
    const a = toNumberOrNull(actualRatio);
    const e = toNumberOrNull(expectedRatio);
    const pass = a !== null && e !== null && Math.abs(a - e) <= tolerance;
    testCase.checks.push({
        name,
        pass,
        actual: a,
        expected: e,
        diff: a !== null && e !== null ? Number((a - e).toFixed(6)) : null,
        tolerance,
    });
}

async function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
}

async function settle(page) {
    await page.evaluate(async () => {
        const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
        for (let i = 0; i < 6; i += 1) {
            await nextFrame();
        }
    });
    await page.waitForTimeout(80);
}

async function waitForScreeningReady(page) {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
        () => !!window.ChartController && !!window.ScreeningPage && !!window.state?.chartIndicators,
        null,
        { timeout: TIMEOUT_MS },
    );
    await page.waitForFunction(() => !!window.ChartController?.chart, null, { timeout: TIMEOUT_MS });
    await settle(page);
}

async function captureSnapshot(page, label, testCaseName) {
    const snap = await page.evaluate((captureLabel) => {
        const cc = window.ChartController;
        const panes = cc?.chart && typeof cc.chart.panes === 'function' ? cc.chart.panes() : [];
        const panePx = Array.isArray(panes)
            ? panes.map((pane, i) => ({ i, px: cc._paneHeight(pane) }))
            : [];
        const state = window.state?.chartIndicators || {};
        const wrapper = document.getElementById('chartWrapper');
        const wrapperRect = wrapper ? wrapper.getBoundingClientRect() : null;
        const toFinite = (v) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
        };

        const controlBars = {};
        if (wrapperRect && Array.isArray(panes) && panes.length > 1) {
            ['VOL', 'RSI'].forEach((name) => {
                const paneIdxRaw = state?.[name]?.paneIndex;
                const paneIdx = Number(paneIdxRaw);
                if (!Number.isFinite(paneIdx) || paneIdx < 1 || paneIdx >= panes.length) return;

                let expectedTop = 0;
                for (let i = 0; i < paneIdx; i += 1) {
                    expectedTop += cc._paneHeight(panes[i]) || 0;
                }
                expectedTop = Math.round(expectedTop + 2);

                const barEl = document.querySelector(`.sub-chart-ctrl-bar[data-indicator="${name}"]`);
                if (!barEl) {
                    controlBars[name] = {
                        actualTop: null,
                        expectedTop,
                        diff: null,
                    };
                    return;
                }

                const barRect = barEl.getBoundingClientRect();
                const actualTop = Math.round(barRect.top - wrapperRect.top);
                controlBars[name] = {
                    actualTop,
                    expectedTop,
                    diff: actualTop - expectedTop,
                };
            });
        }

        return {
            label: captureLabel,
            symbol: cc?.currentSymbol || null,
            panePx,
            panePxSum: panePx.reduce((sum, p) => sum + (Number.isFinite(p.px) ? p.px : 0), 0),
            wrapperPx: wrapper ? Math.round(wrapper.getBoundingClientRect().height) : null,
            totalContH: toFinite(cc?._totalContainerHeight),
            baseMH: toFinite(cc?._baseMainPaneHeight),
            VOL: {
                saved: toFinite(state.VOL?.savedHeight),
                paneIdx: toFinite(state.VOL?.paneIndex),
                enabled: !!state.VOL?.isGlobalEnabled,
            },
            RSI: {
                saved: toFinite(state.RSI?.savedHeight),
                paneIdx: toFinite(state.RSI?.paneIndex),
                enabled: !!state.RSI?.isGlobalEnabled,
            },
            controlBars,
            expanded: window.state?.expandedSubChart || null,
            rendering: !!cc?._isRenderingSubCharts,
            capturedAt: new Date().toISOString(),
        };
    }, label);

    if (CAPTURE_SCREENSHOTS) {
        const safeCase = String(testCaseName).replace(/[^a-zA-Z0-9_-]/g, '_');
        const safeLabel = String(label).replace(/[^a-zA-Z0-9_-]/g, '_');
        const shotPath = path.join(SCREENSHOT_DIR, `${safeCase}__${safeLabel}.png`);
        await ensureDir(shotPath);
        await page.screenshot({ path: shotPath, fullPage: true });
        snap.screenshot = shotPath;
    }

    return snap;
}

async function setSubChartState(page, { volEnabled, rsiEnabled, clearSaved = false }) {
    await page.evaluate(({ volEnabled: vol, rsiEnabled: rsi, clearSaved: clear }) => {
        const state = window.state?.chartIndicators;
        if (!state) return;

        state.VOL.isGlobalEnabled = !!vol;
        state.RSI.isGlobalEnabled = !!rsi;
        state.subChartOrder = [];
        if (vol) state.subChartOrder.push('VOL');
        if (rsi) state.subChartOrder.push('RSI');

        if (clear) {
            delete state.VOL.savedHeight;
            delete state.RSI.savedHeight;
        }

        if (!vol) state.VOL.paneIndex = null;
        if (!rsi) state.RSI.paneIndex = null;

        if (window.state.expandedSubChart && !state.subChartOrder.includes(window.state.expandedSubChart)) {
            window.state.expandedSubChart = null;
        }

        window.ChartController.renderIndicatorsFromState();
    }, { volEnabled, rsiEnabled, clearSaved });

    await page.waitForFunction(() => !window.ChartController?._isRenderingSubCharts, null, { timeout: TIMEOUT_MS });
    await settle(page);
}

async function setExpanded(page, targetExpanded) {
    await page.evaluate((target) => {
        const current = window.state?.expandedSubChart || null;
        if (current === target) return;

        if (target === null) {
            if (current) window.ChartController.toggleSubChartExpand(current);
            return;
        }

        window.ChartController.toggleSubChartExpand(target);
    }, targetExpanded);

    await page.waitForFunction(
        (target) => (window.state?.expandedSubChart || null) === target && !window.ChartController?._isRenderingSubCharts,
        targetExpanded,
        { timeout: TIMEOUT_MS },
    );
    await settle(page);
}

async function applySyntheticSubchartDrag(page, volPaneTargetPx = 190, rsiPaneTargetPx = 80) {
    await page.evaluate(({ volTarget, rsiTarget }) => {
        const cc = window.ChartController;
        const panes = cc?.chart && typeof cc.chart.panes === 'function' ? cc.chart.panes() : [];
        if (!Array.isArray(panes) || panes.length < 3) {
            throw new Error('Cannot apply synthetic drag: expected 3 panes (main, VOL, RSI).');
        }

        if (panes[1] && typeof panes[1].setHeight === 'function') panes[1].setHeight(volTarget);
        if (panes[2] && typeof panes[2].setHeight === 'function') panes[2].setHeight(rsiTarget);
    }, { volTarget: volPaneTargetPx, rsiTarget: rsiPaneTargetPx });

    await settle(page);
    await page.evaluate(() => {
        if (window.ChartController && typeof window.ChartController._captureCurrentPaneHeights === 'function') {
            window.ChartController._captureCurrentPaneHeights();
        }
    });
    await settle(page);
}

async function applySyntheticSingleSubchartDrag(page, subPaneTargetPx = 190) {
    await page.evaluate(({ subTarget }) => {
        const cc = window.ChartController;
        const panes = cc?.chart && typeof cc.chart.panes === 'function' ? cc.chart.panes() : [];
        if (!Array.isArray(panes) || panes.length < 2) {
            throw new Error('Cannot apply synthetic drag: expected 2 panes (main, sub).');
        }

        if (panes[1] && typeof panes[1].setHeight === 'function') panes[1].setHeight(subTarget);
    }, { subTarget: subPaneTargetPx });

    await settle(page);
    await page.evaluate(() => {
        if (window.ChartController && typeof window.ChartController._captureCurrentPaneHeights === 'function') {
            window.ChartController._captureCurrentPaneHeights();
        }
    });
    await settle(page);
}

async function loadStock(page, symbol) {
    await page.evaluate(async (targetSymbol) => {
        await window.ChartController.loadStock(targetSymbol, { fromFilterClick: false });
    }, symbol);

    await page.waitForFunction(
        (targetSymbol) => {
            const cc = window.ChartController;
            return (
                cc &&
                cc.currentSymbol === targetSymbol &&
                Array.isArray(cc.currentChartData) &&
                cc.currentChartData.length > 0 &&
                !cc._isRenderingSubCharts
            );
        },
        symbol,
        { timeout: TIMEOUT_MS },
    );

    await settle(page);
}

async function fetchUsableSymbols(origin) {
    const preferred = ['AA', 'AAA', 'AAAA', 'AAAU', 'AACB', 'AADR', 'AAL', 'AAME'];
    const symbols = [];

    try {
        const stocksResp = await fetch(`${origin}/api/stocks`);
        if (stocksResp.ok) {
            const stocksJson = await stocksResp.json();
            const list = Array.isArray(stocksJson?.stocks) ? stocksJson.stocks : [];
            list.slice(0, 300).forEach((item) => {
                if (item?.symbol) symbols.push(String(item.symbol));
            });
        }
    } catch {
        // Keep going with preferred symbols.
    }

    const candidates = [...new Set([...preferred, ...symbols])];
    const usable = [];

    for (const symbol of candidates) {
        try {
            const dataResp = await fetch(`${origin}/api/market-data/${encodeURIComponent(symbol)}?interval=1d&period=max`);
            if (!dataResp.ok) continue;
            const dataJson = await dataResp.json();
            const bars = Array.isArray(dataJson?.data) ? dataJson.data.length : 0;
            if (bars >= 120) {
                usable.push(symbol);
                if (usable.length >= 3) break;
            }
        } catch {
            // Ignore candidate failures.
        }
    }

    if (usable.length < 3) {
        throw new Error(`Unable to find 3 usable symbols with market data. Found: ${usable.join(', ') || 'none'}`);
    }

    return usable.slice(0, 3);
}

function comparePaneSet(testCase, baseline, candidate, labelPrefix) {
    addNumericCheck(testCase, `${labelPrefix} main panePx`, mainPx(candidate), mainPx(baseline), PX_TOLERANCE);
    addNumericCheck(testCase, `${labelPrefix} VOL panePx`, volPx(candidate), volPx(baseline), PX_TOLERANCE);
    addNumericCheck(testCase, `${labelPrefix} RSI panePx`, rsiPx(candidate), rsiPx(baseline), PX_TOLERANCE);
}

function compareSavedHeights(testCase, baseline, candidate, labelPrefix) {
    addNumericCheck(testCase, `${labelPrefix} VOL.saved`, candidate?.VOL?.saved, baseline?.VOL?.saved, PX_TOLERANCE);
    addNumericCheck(testCase, `${labelPrefix} RSI.saved`, candidate?.RSI?.saved, baseline?.RSI?.saved, PX_TOLERANCE);
}

function comparePaneRatios(testCase, baseline, candidate, labelPrefix) {
    const mainRatioBase = ratio(mainPx(baseline), baseline?.panePxSum);
    const volRatioBase = ratio(volPx(baseline), baseline?.panePxSum);
    const rsiRatioBase = ratio(rsiPx(baseline), baseline?.panePxSum);

    const mainRatioNow = ratio(mainPx(candidate), candidate?.panePxSum);
    const volRatioNow = ratio(volPx(candidate), candidate?.panePxSum);
    const rsiRatioNow = ratio(rsiPx(candidate), candidate?.panePxSum);

    addRatioCheck(testCase, `${labelPrefix} main ratio`, mainRatioNow, mainRatioBase, RATIO_TOLERANCE);
    addRatioCheck(testCase, `${labelPrefix} VOL ratio`, volRatioNow, volRatioBase, RATIO_TOLERANCE);
    addRatioCheck(testCase, `${labelPrefix} RSI ratio`, rsiRatioNow, rsiRatioBase, RATIO_TOLERANCE);
}

function addControlBarAlignmentCheck(testCase, labelPrefix, snapshot, indicator, tolerance = 4) {
    addNumericCheck(
        testCase,
        `${labelPrefix} ${indicator} control bar aligned`,
        controlBarTop(snapshot, indicator),
        controlBarExpectedTop(snapshot, indicator),
        tolerance,
    );
}

async function runBug2Case(page, preDrag) {
    const testCase = {
        name: preDrag ? 'Bug2_pre_drag' : 'Bug2_no_drag',
        checks: [],
        snapshots: [],
    };

    await setExpanded(page, null);
    await setSubChartState(page, { volEnabled: true, rsiEnabled: true, clearSaved: true });

    if (preDrag) {
        await applySyntheticSubchartDrag(page);
    }

    const step0 = await captureSnapshot(page, `${testCase.name} step0 baseline`, testCase.name);
    testCase.snapshots.push(step0);

    await setSubChartState(page, { volEnabled: false, rsiEnabled: true });
    const step1 = await captureSnapshot(page, `${testCase.name} step1 close_VOL`, testCase.name);
    testCase.snapshots.push(step1);

    await setSubChartState(page, { volEnabled: true, rsiEnabled: true });
    const step2 = await captureSnapshot(page, `${testCase.name} step2 reopen_VOL`, testCase.name);
    testCase.snapshots.push(step2);

    await setSubChartState(page, { volEnabled: false, rsiEnabled: true });
    const step3 = await captureSnapshot(page, `${testCase.name} step3 close_VOL_again`, testCase.name);
    testCase.snapshots.push(step3);

    addNumericCheck(testCase, 'step1 vs step3 RSI panePx stable', rsiPx(step3), rsiPx(step1), PX_TOLERANCE);
    addNumericCheck(testCase, 'step1 vs step3 RSI.saved stable', step3?.RSI?.saved, step1?.RSI?.saved, PX_TOLERANCE);

    addNumericCheck(testCase, 'step2 vs step0 VOL panePx stable', volPx(step2), volPx(step0), PX_TOLERANCE);
    addNumericCheck(testCase, 'step2 vs step0 RSI panePx stable', rsiPx(step2), rsiPx(step0), PX_TOLERANCE);

    return testCase;
}

async function runBug3Case(page, preDrag) {
    const testCase = {
        name: preDrag ? 'Bug3_pre_drag' : 'Bug3_no_drag',
        checks: [],
        snapshots: [],
    };

    await setExpanded(page, null);
    await setSubChartState(page, { volEnabled: true, rsiEnabled: true, clearSaved: true });

    if (preDrag) {
        await applySyntheticSubchartDrag(page);
    }

    const step0 = await captureSnapshot(page, `${testCase.name} step0 baseline`, testCase.name);
    testCase.snapshots.push(step0);

    await setExpanded(page, 'RSI');
    const step1 = await captureSnapshot(page, `${testCase.name} step1 expand_RSI`, testCase.name);
    testCase.snapshots.push(step1);

    await setExpanded(page, null);
    const step2 = await captureSnapshot(page, `${testCase.name} step2 collapse_RSI`, testCase.name);
    testCase.snapshots.push(step2);

    await setExpanded(page, 'VOL');
    const step3 = await captureSnapshot(page, `${testCase.name} step3 expand_VOL`, testCase.name);
    testCase.snapshots.push(step3);

    await setExpanded(page, null);
    const step4 = await captureSnapshot(page, `${testCase.name} step4 collapse_VOL`, testCase.name);
    testCase.snapshots.push(step4);

    addNumericCheck(testCase, 'expand RSI keeps main height', mainPx(step1), mainPx(step0), PX_TOLERANCE);
    addNumericCheck(testCase, 'expand VOL keeps main height', mainPx(step3), mainPx(step0), PX_TOLERANCE);

    comparePaneSet(testCase, step0, step2, 'collapse RSI returns to baseline');
    comparePaneSet(testCase, step0, step4, 'collapse VOL returns to baseline');

    return testCase;
}

async function runBug4Case(page, symbols, preDrag) {
    const testCase = {
        name: preDrag ? 'Bug4_pre_drag_switch_stock' : 'Bug4_no_drag_switch_stock',
        checks: [],
        snapshots: [],
    };

    await loadStock(page, symbols[0]);
    await setExpanded(page, null);
    await setSubChartState(page, { volEnabled: true, rsiEnabled: true, clearSaved: true });

    if (preDrag) {
        await applySyntheticSubchartDrag(page);
    }

    const step0 = await captureSnapshot(page, `${testCase.name} step0 ${symbols[0]}`, testCase.name);
    testCase.snapshots.push(step0);

    await loadStock(page, symbols[1]);
    const step1 = await captureSnapshot(page, `${testCase.name} step1 ${symbols[0]}_to_${symbols[1]}`, testCase.name);
    testCase.snapshots.push(step1);

    await loadStock(page, symbols[2]);
    const step2 = await captureSnapshot(page, `${testCase.name} step2 ${symbols[1]}_to_${symbols[2]}`, testCase.name);
    testCase.snapshots.push(step2);

    compareSavedHeights(testCase, step0, step1, 'A->B savedHeight');
    compareSavedHeights(testCase, step0, step2, 'A->C savedHeight');

    comparePaneSet(testCase, step0, step1, 'A->B panePx');
    comparePaneSet(testCase, step0, step2, 'A->C panePx');

    comparePaneRatios(testCase, step0, step1, 'A->B pane ratio');
    comparePaneRatios(testCase, step0, step2, 'A->C pane ratio');

    addControlBarAlignmentCheck(testCase, 'A', step0, 'VOL');
    addControlBarAlignmentCheck(testCase, 'A', step0, 'RSI');
    addControlBarAlignmentCheck(testCase, 'B', step1, 'VOL');
    addControlBarAlignmentCheck(testCase, 'B', step1, 'RSI');
    addControlBarAlignmentCheck(testCase, 'C', step2, 'VOL');
    addControlBarAlignmentCheck(testCase, 'C', step2, 'RSI');

    return testCase;
}

async function runBug4SingleSubCase(page, symbols) {
    const testCase = {
        name: 'Bug4_single_sub_drag_switch_stock',
        checks: [],
        snapshots: [],
    };

    await loadStock(page, symbols[0]);
    await setExpanded(page, null);
    await setSubChartState(page, { volEnabled: true, rsiEnabled: false, clearSaved: true });
    await applySyntheticSingleSubchartDrag(page, 190);

    const step0 = await captureSnapshot(page, `${testCase.name} step0 ${symbols[0]}`, testCase.name);
    testCase.snapshots.push(step0);

    await loadStock(page, symbols[1]);
    const step1 = await captureSnapshot(page, `${testCase.name} step1 ${symbols[0]}_to_${symbols[1]}`, testCase.name);
    testCase.snapshots.push(step1);

    await loadStock(page, symbols[2]);
    const step2 = await captureSnapshot(page, `${testCase.name} step2 ${symbols[1]}_to_${symbols[2]}`, testCase.name);
    testCase.snapshots.push(step2);

    addNumericCheck(testCase, 'A->B VOL.saved stable', step1?.VOL?.saved, step0?.VOL?.saved, PX_TOLERANCE);
    addNumericCheck(testCase, 'A->C VOL.saved stable', step2?.VOL?.saved, step0?.VOL?.saved, PX_TOLERANCE);

    addNumericCheck(testCase, 'A->B VOL panePx stable', volPx(step1), volPx(step0), PX_TOLERANCE);
    addNumericCheck(testCase, 'A->C VOL panePx stable', volPx(step2), volPx(step0), PX_TOLERANCE);
    addNumericCheck(testCase, 'A->B main panePx stable', mainPx(step1), mainPx(step0), PX_TOLERANCE);
    addNumericCheck(testCase, 'A->C main panePx stable', mainPx(step2), mainPx(step0), PX_TOLERANCE);

    addControlBarAlignmentCheck(testCase, 'A', step0, 'VOL');
    addControlBarAlignmentCheck(testCase, 'B', step1, 'VOL');
    addControlBarAlignmentCheck(testCase, 'C', step2, 'VOL');

    return testCase;
}

function summarizeCases(cases) {
    let totalChecks = 0;
    let failedChecks = 0;

    const caseSummaries = cases.map((testCase) => {
        const checks = Array.isArray(testCase.checks) ? testCase.checks : [];
        const failed = checks.filter((c) => !c.pass).length;
        totalChecks += checks.length;
        failedChecks += failed;
        return {
            name: testCase.name,
            totalChecks: checks.length,
            failedChecks: failed,
            passed: failed === 0,
        };
    });

    return {
        totalCases: cases.length,
        totalChecks,
        failedChecks,
        passed: failedChecks === 0,
        caseSummaries,
    };
}

async function main() {
    const target = new URL(BASE_URL);
    const origin = `${target.protocol}//${target.host}`;

    const symbols = await fetchUsableSymbols(origin);
    report.symbols = symbols;

    const browser = await chromium.launch({ headless: HEADLESS });
    const context = await browser.newContext({ viewport: { width: 1700, height: 960 } });
    const page = await context.newPage();

    try {
        await waitForScreeningReady(page);

        await loadStock(page, symbols[0]);

        const bug2NoDrag = await runBug2Case(page, false);
        report.cases.push(bug2NoDrag);

        const bug2PreDrag = await runBug2Case(page, true);
        report.cases.push(bug2PreDrag);

        const bug3NoDrag = await runBug3Case(page, false);
        report.cases.push(bug3NoDrag);

        const bug3PreDrag = await runBug3Case(page, true);
        report.cases.push(bug3PreDrag);

        const bug4NoDrag = await runBug4Case(page, symbols, false);
        report.cases.push(bug4NoDrag);

        const bug4PreDrag = await runBug4Case(page, symbols, true);
        report.cases.push(bug4PreDrag);

        const bug4SingleSub = await runBug4SingleSubCase(page, symbols);
        report.cases.push(bug4SingleSub);
    } finally {
        await context.close();
        await browser.close();
    }

    report.meta.finishedAt = new Date().toISOString();
    report.summary = summarizeCases(report.cases);

    await ensureDir(REPORT_PATH);
    await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

    console.log('=== Chart Height Auto Test Summary ===');
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Symbols: ${report.symbols.join(', ')}`);
    report.summary.caseSummaries.forEach((entry) => {
        const status = entry.passed ? 'PASS' : 'FAIL';
        console.log(`- [${status}] ${entry.name}: ${entry.totalChecks - entry.failedChecks}/${entry.totalChecks}`);
    });
    console.log(`Total checks: ${report.summary.totalChecks}`);
    console.log(`Failed checks: ${report.summary.failedChecks}`);
    console.log(`Report: ${REPORT_PATH}`);

    if (!report.summary.passed) {
        process.exitCode = 1;
    }
}

main().catch(async (error) => {
    report.meta.finishedAt = new Date().toISOString();
    report.meta.fatalError = String(error?.stack || error);
    try {
        await ensureDir(REPORT_PATH);
        await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
    } catch {
        // Ignore report write failures in fatal path.
    }
    console.error('Chart height automation failed:', error);
    process.exitCode = 1;
});
