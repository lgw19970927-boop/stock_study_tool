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
