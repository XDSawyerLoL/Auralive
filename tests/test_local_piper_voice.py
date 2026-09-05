from pathlib import Path

from app.services import local_piper_voice


def test_relative_piper_directory_is_resolved_beside_runtime(tmp_path, monkeypatch) -> None:
    runtime = tmp_path / "AuraLive"
    monkeypatch.setattr(local_piper_voice, "RUNTIME_DIR", runtime)
    monkeypatch.setenv("MAIRAIY_LOCAL_VOICE_DIR", "data/voices/piper")
    monkeypatch.setenv("MAIRAIY_LOCAL_VOICE", "fr_FR-siwis-medium")

    voice = local_piper_voice.LocalPiperVoice(tmp_path / "tts")

    assert voice.data_dir == (runtime / "data/voices/piper").resolve()
    assert voice.model_path == (
        runtime / "data/voices/piper/fr_FR-siwis-medium.onnx"
    ).resolve()


def test_absolute_piper_directory_is_preserved(tmp_path, monkeypatch) -> None:
    runtime = tmp_path / "AuraLive"
    custom = tmp_path / "voices"
    monkeypatch.setattr(local_piper_voice, "RUNTIME_DIR", runtime)
    monkeypatch.setenv("MAIRAIY_LOCAL_VOICE_DIR", str(custom))

    voice = local_piper_voice.LocalPiperVoice(tmp_path / "tts")

    assert voice.data_dir == custom.resolve()
