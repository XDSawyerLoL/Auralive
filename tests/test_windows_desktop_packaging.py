from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DESKTOP = ROOT / "app" / "desktop.py"
BUILD = ROOT / "scripts" / "build-windows.ps1"
REQUIREMENTS = ROOT / "requirements-desktop.txt"


def test_desktop_launcher_does_not_depend_on_pythonnet_or_pywebview() -> None:
    desktop = DESKTOP.read_text(encoding="utf-8")
    build = BUILD.read_text(encoding="utf-8")
    requirements = REQUIREMENTS.read_text(encoding="utf-8")

    assert "import webview" not in desktop
    assert "pythonnet" not in desktop.casefold()
    assert "pywebview" not in requirements.casefold()
    assert '--collect-all "webview"' not in build


def test_desktop_launcher_uses_chromium_app_mode() -> None:
    desktop = DESKTOP.read_text(encoding="utf-8")
    assert "msedge.exe" in desktop
    assert "chrome.exe" in desktop
    assert 'f"--app={url}"' in desktop
    assert "--disable-background-mode" in desktop


def test_desktop_disables_uvicorn_default_formatter_config() -> None:
    desktop = DESKTOP.read_text(encoding="utf-8")
    assert "log_config=None" in desktop


def test_desktop_tracks_real_chromium_instance_not_bootstrap_pid() -> None:
    desktop = DESKTOP.read_text(encoding="utf-8")
    assert "--remote-debugging-port=0" in desktop
    assert "DevToolsActivePort" in desktop
    assert "_wait_for_app_window" in desktop
    assert "browser_process.wait()" not in desktop
