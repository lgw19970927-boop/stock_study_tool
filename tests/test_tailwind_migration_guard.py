from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_chart_modal_css_consolidated_import():
    content = _read("app/static/css/input.css")

    assert '@import "../../feature/screening/chart/chart_management/chart-modal.css";' in content

    removed_imports = [
        "chart-modal-core.css",
        "chart-modal-sidebar.css",
        "chart-modal-indicators.css",
        "chart-modal-patterns.css",
        "chart-modal-color-picker.css",
        "chart-modal-general.css",
    ]

    for name in removed_imports:
        assert name not in content


def test_old_chart_modal_css_files_deleted():
    deleted_files = [
        "app/feature/screening/chart/chart_management/chart-modal-core.css",
        "app/feature/screening/chart/chart_management/chart-modal-sidebar.css",
        "app/feature/screening/chart/chart_management/chart-modal-indicators.css",
        "app/feature/screening/chart/chart_management/chart-modal-patterns.css",
        "app/feature/screening/chart/chart_management/chart-modal-color-picker.css",
        "app/feature/screening/chart/chart_management/chart-modal-general.css",
    ]

    for file_path in deleted_files:
        assert not (ROOT / file_path).exists(), f"Expected deleted file still exists: {file_path}"


def test_screening_js_has_no_style_display_mutation():
    screening_root = ROOT / "app/feature/screening"
    js_files = list(screening_root.rglob("*.js"))

    offenders = []
    for js_file in js_files:
        text = js_file.read_text(encoding="utf-8")
        if "style.display" in text:
            offenders.append(str(js_file.relative_to(ROOT)).replace("\\", "/"))

    assert not offenders, f"Found style.display usage in: {offenders}"


def test_strategy_buttons_have_spacing_class():
    ui = _read("app/feature/screening/components/strategy_manager/templates/ui.html")
    assert 'class="button-group flex flex-col gap-2"' in ui


def test_stop_dialog_utility_migration_applied():
    dialog_tpl = _read("app/feature/screening/components/progress_area/templates/ui.html")
    screening_css = _read("app/feature/screening/screening.css")

    assert "stop-dialog-window is-hidden fixed left-1/2" in dialog_tpl
    assert "btn-dialog-confirm cursor-pointer" in dialog_tpl
    assert "btn-dialog-cancel cursor-pointer" in dialog_tpl

    # stop dialog shell/button rules should now live in template utility classes.
    assert ".stop-dialog-window" not in screening_css
    assert ".btn-dialog-confirm" not in screening_css
    assert ".btn-dialog-cancel" not in screening_css


def test_stock_list_state_class_contract():
    screening_css = _read("app/feature/screening/screening.css")
    progress_js = _read("app/feature/screening/components/progress_area/progress_area.js")
    results_js = _read("app/feature/screening/components/results_table/results_table.js")
    screening_js = _read("app/feature/screening/screening.js")

    # CSS contract
    assert "#stockList.state-idle" in screening_css
    assert "#stockList.state-progressing" in screening_css
    assert "#stockList.state-result" in screening_css

    # JS mutation contract
    assert "stockList.classList.add('state-progressing')" in progress_js
    assert "stockList.classList.add('state-result')" in results_js
    assert "stockListInit.classList.add('state-idle')" in screening_js


def test_indicator_modules_no_inline_style_templates():
    module_files = [
        "app/feature/screening/indicators/modules/sma/sma.js",
        "app/feature/screening/indicators/modules/bollinger/bollinger.js",
        "app/feature/screening/indicators/modules/amount/amount.js",
        "app/feature/screening/indicators/modules/volume/volume.js",
    ]

    offenders = []
    for file_path in module_files:
        content = _read(file_path)
        if 'style="' in content or "style='" in content or "card.style" in content:
            offenders.append(file_path)

    assert not offenders, f"Inline style remains in indicator modules: {offenders}"


def test_screening_fragment_layout_is_class_based():
    fragment = _read("app/feature/screening/screening_fragment.html")

    assert 'class="page-content page-content--fill active" id="page-screening"' in fragment
    assert 'id="page-screening" style=' not in fragment


def test_chart_fullscreen_class_contract_is_class_based():
    chart_css = _read("app/feature/screening/chart/kline_viewer/chart-area.css")
    screening_js = _read("app/feature/screening/screening.js")

    assert ".chart-wrapper.chart-viewport-fullscreen" in chart_css
    assert "body.is-chart-viewport-fullscreen" in chart_css
    assert "document.body.classList.toggle('is-chart-viewport-fullscreen'" in screening_js
    assert "setFullscreenState(" in screening_js


def test_chart_modal_template_uses_semantic_classes():
    template = _read("app/feature/screening/chart/chart_management/chart_settings_modal_template.js")
    modal_css = _read("app/feature/screening/chart/chart_management/chart-modal.css")

    assert 'class="chart-modal-overlay is-hidden"' in template
    assert 'class="chart-modal-container"' in template
    assert 'class="chart-tab-btn active"' in template
    assert "disabled:cursor-not-allowed" not in template
    assert "z-[9999]" not in template
    assert ".chart-modal-overlay" in modal_css
    assert ".chart-tab-btn" in modal_css


def test_chart_modal_presentational_inline_styles_removed():
    indicator_tab = _read("app/feature/screening/indicators/indicator_settings_tab.js")
    pattern_tab = _read("app/feature/screening/pattern/pattern_settings_tab.js")

    assert 'style="display:flex;align-items:center;gap:4px;"' not in indicator_tab
    assert 'style="flex:1;"' not in pattern_tab
    assert 'class="boll-line-label"' in indicator_tab
    assert 'class="pattern-range"' in pattern_tab


def test_chart_modal_state_class_guard():
    modal_css = _read("app/feature/screening/chart/chart_management/chart-modal.css")
    modal_js = _read("app/feature/screening/chart/chart_management/chart_settings_modal.js")

    assert ".chart-tab-btn.active" in modal_css
    assert "classList.toggle('active', btn.dataset.tab === tabName)" in modal_js
    assert "classList.add('is-hidden')" in modal_js
    assert "classList.remove('is-hidden')" in modal_js


def test_indicator_manager_summary_state_class_contract():
    manager_js = _read("app/feature/screening/indicators/indicator_manager.js")
    screening_css = _read("app/feature/screening/screening.css")

    assert "card.style" not in manager_js
    assert "classList.add('indicator-card--summary')" in manager_js
    assert "classList.remove('indicator-card--summary')" in manager_js
    assert ".indicator-card.indicator-card--summary {" in screening_css
    assert ".indicator-card.indicator-card--summary:hover" in screening_css


def test_risk_management_no_broad_input_override():
    css = _read("app/feature/risk_management/risk_management.css")

    assert "#risk-page input[type=\"text\"]" not in css
    assert "#risk-page input[type=\"number\"]" not in css
    assert ".rm-param-input" in css
    assert "!important" not in css


def test_risk_management_templates_are_class_based():
    template_files = [
        "app/feature/risk_management/risk_management_fragment.html",
        "app/feature/risk_management/components/params/templates/ui.html",
        "app/feature/risk_management/components/overview/templates/ui.html",
        "app/feature/risk_management/components/portfolio/templates/ui.html",
    ]

    for file_path in template_files:
        content = _read(file_path)
        assert 'style="' not in content, f"Inline style remains in {file_path}"

    fragment = _read("app/feature/risk_management/risk_management_fragment.html")
    assert 'class="page-content page-content--fill active" id="risk-page"' in fragment


def test_risk_portfolio_block_static_inline_styles_removed():
    js = _read("app/feature/risk_management/components/portfolio/portfolio_block.js")

    assert 'style="display:' not in js
    assert 'style="width:' not in js
    assert 'style="font-size:' not in js
    assert 'class="pm-cell-stack' in js
    assert 'class="pm-batch-symbol"' in js


def test_input_css_import_convergence_wave6():
    input_css = _read("app/static/css/input.css")

    expected_imports = [
        '@import "./variables.css";',
        '@import "./animations.css";',
        '@import "./layout.css";',
        '@import "./components.css";',
        '@import "./tabs.css";',
        '@import "../../feature/screening/screening.css";',
        '@import "../../feature/screening/chart/kline_viewer/chart-area.css";',
        '@import "../../feature/screening/chart/chart_management/chart-modal.css";',
        '@import "../../feature/risk_management/risk_management.css";',
    ]

    for rule in expected_imports:
        assert rule in input_css

    assert input_css.count('@import "') == len(expected_imports)
    assert "Wave 6 收尾規則" in input_css


def test_global_css_wave1_convergence_contract():
    layout_css = _read("app/static/css/layout.css")
    components_css = _read("app/static/css/components.css")
    tabs_css = _read("app/static/css/tabs.css")
    animations_css = _read("app/static/css/animations.css")

    assert ".sidebar-resize-handle," in layout_css
    assert ".vertical-resize-handle" in layout_css
    assert ".btn," in components_css
    assert ".btn-icon" in components_css
    assert "font-family: var(--font-family);" in tabs_css
    assert "@apply fixed inset-0 flex items-center justify-center;" in animations_css


def test_risk_portfolio_centered_layout_contract():
    css = _read("app/feature/risk_management/risk_management.css")
    js = _read("app/feature/risk_management/components/portfolio/portfolio_block.js")

    assert ".pm-batch-list-centered" in css
    assert ".pm-batch-row-centered" in css
    assert ".pm-add-batch-btn-center" in css
    assert ".pm-plan-col" in css
    assert ".pm-batch-col" in css
    assert "flex-direction: column;" in css
    assert ".pm-batch-col .pm-cell-divider" in css
    assert ".pm-batch-col .pm-avg-output" in css
    assert "display: block;" in css

    assert 'class="pm-batch-list pm-batch-list-centered"' in js
    assert 'class="pm-batch-row pm-batch-row-centered"' in js
    assert 'class="pm-add-batch-btn pm-add-batch-btn-center"' in js
    assert 'class="pm-cell-stack pm-cell-stack-compact pm-plan-col"' in js


def test_risk_portfolio_column_separator_contract():
    css = _read("app/feature/risk_management/risk_management.css")

    assert "#risk-page #rm-portfolioTable th," in css
    assert "#risk-page #rm-portfolioTable td {" in css
    assert "border-right: 1px solid rgba(255, 255, 255, 0.14);" in css


def test_risk_params_local_storage_and_formatting_contract():
    params_js = _read("app/feature/risk_management/components/params/params_block.js")

    assert "const LS_KEY = 'rm-risk-params-v1';" in params_js
    assert "localStorage.setItem(LS_KEY" in params_js
    assert "localStorage.getItem(LS_KEY" in params_js
    assert "_bindCapitalFormatter" in params_js
    assert "toLocaleString('en-US')" in params_js
