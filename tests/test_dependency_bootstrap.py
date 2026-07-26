from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_audio_and_vision_dependencies_are_declared():
    requirements = (ROOT / "requirements.txt").read_text(encoding="utf-8")
    assert "Pillow==" in requirements
    assert "piper-tts==" in requirements


def test_windows_launcher_repairs_dependencies_and_downloads_voice():
    path = ROOT / "scripts" / "run.ps1"
    payload = path.read_bytes()
    payload.decode("ascii")
    script = payload.decode("ascii")
    assert "requirements.sha256" in script
    assert "pip install -r" in script
    assert "import fastapi, uvicorn, aiohttp, dotenv, websockets, multipart, PIL, piper" in script
    assert "piper.download_voices" in script
    assert "fr_FR-siwis-medium" in script
    assert "Dependances pretes" in script


def test_full_repair_records_the_installed_requirements_hash():
    script = (ROOT / "reparer-installation.ps1").read_text(encoding="utf-8-sig")
    assert "Get-FileHash" in script
    assert ".venv\\requirements.sha256" in script
