from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / "scripts" / "run.ps1"


def test_run_ps1_is_ascii_safe_for_windows_powershell_51() -> None:
    payload = RUNNER.read_bytes()
    payload.decode("ascii")


def test_run_ps1_starts_main_v3_through_uvicorn() -> None:
    source = RUNNER.read_text(encoding="ascii")
    assert "-m uvicorn app.main_v3:app" in source
    assert "Aura Live 2.5" in source
    assert "secours local fixe" in source
