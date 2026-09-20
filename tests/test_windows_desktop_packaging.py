from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DESKTOP = ROOT / "app" / "desktop.py"
BUILD = ROOT / "scripts" / "build-windows.ps1"
REQUIREMENTS = ROOT / "requirements-desktop.txt"
ENV_EXAMPLE = ROOT / ".env.example"
WORKFLOW = ROOT / ".github" / "workflows" / "build-windows-app.yml"
INSTALLER = ROOT / "installer" / "QuanticStudio.iss"
UPDATER = ROOT / "app" / "services" / "update_manager.py"
UPDATE_UI = ROOT / "app" / "web" / "static" / "update-center.js"


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
    assert "--autoplay-policy=no-user-gesture-required" in desktop


def test_desktop_disables_uvicorn_default_formatter_config() -> None:
    desktop = DESKTOP.read_text(encoding="utf-8")
    assert "log_config=None" in desktop


def test_desktop_keeps_stdio_fallback_and_startup_log() -> None:
    desktop = DESKTOP.read_text(encoding="utf-8")
    assert "sys.stdout is None" in desktop
    assert "sys.stderr is None" in desktop
    assert "QuanticStudio-startup.log" in desktop
    assert "stdout={'ok' if sys.stdout is not None else 'none'}" in desktop
    assert "stderr={'ok' if sys.stderr is not None else 'none'}" in desktop
    assert desktop.index("_ensure_stdio()") < desktop.index("import uvicorn")


def test_windows_build_uses_console_bootloader_with_hidden_console() -> None:
    build = BUILD.read_text(encoding="utf-8")
    desktop = DESKTOP.read_text(encoding="utf-8")
    build_id = "QuanticStudio-2.7.3-Windows-Native-2026-09-20"

    assert "--console" in build
    assert "--hide-console hide-early" in build
    assert "--windowed" not in build
    assert "pyinstaller==6.22.2" in build
    assert '--hidden-import "uvicorn.logging"' in build
    assert '--name "QuanticStudio"' in build
    assert '--icon "build-assets\\\\quantic-studio.ico"' in build
    assert "BUILD-ID.txt" in build
    assert build_id in build
    assert build_id in desktop


def test_windows_package_bundles_kokoro_and_quality_first_env() -> None:
    build = BUILD.read_text(encoding="utf-8")
    env_example = ENV_EXAMPLE.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    assert '--collect-all "kokoro_onnx"' in build
    assert '--collect-all "misaki"' in build
    assert '--collect-all "espeakng_loader"' in build
    assert '--collect-all "language_tags"' in build
    assert '--collect-all "csvw"' in build
    assert '--collect-all "segments"' in build
    assert "kokoro-v1.0.onnx" in build
    assert "voices-v1.0.bin" in build
    assert 'Copy-Item ".env.example" "dist\\QuanticStudio\\.env"' in build
    assert "AI_MODE=ollama" in env_example
    assert "AI_MODEL=gemma3:12b" in env_example
    assert "AI_AUTO_FAST_MODEL=false" in env_example
    assert "MAIRAIY_KOKORO_PRIMARY=true" in env_example
    assert "MAIRAIY_KOKORO_VOICE=ff_siwis" in env_example
    assert "TTS_VOICE=Aoede" in env_example
    assert "include-hidden-files: true" in workflow
    assert "Kokoro ff_siwis n'est pas pret" in workflow
    assert "api/avatar/test" in workflow
    assert "overlay_required" in workflow
    assert "QuanticStudio-Windows-Native-2.7.3" in workflow


def test_desktop_tracks_real_chromium_instance_not_bootstrap_pid() -> None:
    desktop = DESKTOP.read_text(encoding="utf-8")
    assert "--remote-debugging-port=0" in desktop
    assert "DevToolsActivePort" in desktop
    assert "_wait_for_app_window" in desktop
    assert "browser_process.wait()" not in desktop



def test_windows_installer_preserves_user_data_and_needs_no_admin() -> None:
    installer = INSTALLER.read_text(encoding="utf-8")
    assert "PrivilegesRequired=lowest" in installer
    assert "DefaultDirName={localappdata}\\Programs\\Quantic Studio" in installer
    assert "UsePreviousAppDir=no" in installer
    assert "LegacyInstallDirName = 'Aura Live'" in installer
    assert "MigrateLegacyAuraLiveData" in installer
    assert "DelTree(LegacyDir, True, True, True)" in installer
    assert "uninsneveruninstall" in installer
    assert 'Excludes: ".env,data\\*,QuanticStudio-startup.log"' in installer
    assert 'Source: "{#SourceDir}\\.env"' in installer
    assert "CloseApplications=yes" in installer
    assert "RestartApplications=yes" in installer
    assert "SetupIconFile=..\\build-assets\\quantic-studio.ico" in installer


def test_windows_ci_builds_installer_and_supports_authenticode() -> None:
    workflow = WORKFLOW.read_text(encoding="utf-8")
    assert "build-installer.ps1" in workflow
    assert "QuanticStudio-Setup-2.7.3.exe" in workflow
    assert "sign-windows.ps1" in workflow
    assert "AURA_WINDOWS_SIGNING_PFX_BASE64" in workflow
    assert "AURA_WINDOWS_SIGNING_PFX_PASSWORD" in workflow


def test_updater_is_release_scoped_and_sha256_verified() -> None:
    updater = UPDATER.read_text(encoding="utf-8")
    ui = UPDATE_UI.read_text(encoding="utf-8")
    assert 'REPOSITORY = "XDSawyerLoL/Auralive"' in updater
    assert "releases/latest" in updater
    assert "sha256" in updater.casefold()
    assert "actual != expected" in updater
    assert "QuanticStudio-Setup-" in updater
    assert "/api/update/install" in ui
