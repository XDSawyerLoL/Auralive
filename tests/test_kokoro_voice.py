from __future__ import annotations

import asyncio
import wave

from app.services.local_kokoro_voice import LocalKokoroVoice


class _FakeKokoro:
    def create(self, phonemes, *, voice, speed, is_phonemes):
        assert phonemes == "bɔ̃ʒuʁ"
        assert voice == "ff_siwis"
        assert 0.7 < speed < 1.5
        assert is_phonemes is True
        return [0.0] * 2400, 24_000


class _FakeG2P:
    def __call__(self, text):
        assert text == "Bonjour"
        return "bɔ̃ʒuʁ", []


class _FakeSoundFile:
    @staticmethod
    def write(path, _audio, sample_rate, subtype):
        assert subtype == "PCM_16"
        with wave.open(str(path), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(sample_rate)
            output.writeframes(b"\x00\x00" * 2400)


def test_kokoro_defaults_to_validated_french_voice(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("MAIRAIY_KOKORO_DIR", str(tmp_path / "kokoro"))
    monkeypatch.delenv("MAIRAIY_KOKORO_VOICE", raising=False)
    monkeypatch.delenv("MAIRAIY_KOKORO_LANGUAGE", raising=False)

    voice = LocalKokoroVoice(tmp_path / "tts")

    assert voice.voice_name == "ff_siwis"
    assert voice.language == "fr-fr"
    assert voice.data_dir == tmp_path / "kokoro"
    assert voice.model_path.name == "kokoro-v1.0.onnx"
    assert voice.voices_path.name == "voices-v1.0.bin"


def test_kokoro_generates_wav_without_network_when_assets_are_bundled(tmp_path, monkeypatch) -> None:
    kokoro_dir = tmp_path / "kokoro"
    kokoro_dir.mkdir()
    (kokoro_dir / "kokoro-v1.0.onnx").write_bytes(b"model")
    (kokoro_dir / "voices-v1.0.bin").write_bytes(b"voices")
    monkeypatch.setenv("MAIRAIY_KOKORO_DIR", str(kokoro_dir))

    voice = LocalKokoroVoice(tmp_path / "tts")
    monkeypatch.setattr(
        voice,
        "_load_components",
        lambda: (_FakeKokoro(), _FakeG2P(), _FakeSoundFile(), object()),
    )

    assert asyncio.run(voice.ensure_ready()) is True
    result = asyncio.run(voice.synthesize("Bonjour"))

    assert result is not None
    assert result.startswith("/media/tts/mairaiy-kokoro-")
    assert voice.last_error == ""
    assert voice.last_generation_ms >= 0
    assert voice.last_audio_duration_ms >= 90
    assert voice.diagnostic()["offline"] is True
