from __future__ import annotations

import wave

from app.services.voice_stability import _is_hands_free, _wav_duration_ms


def test_hands_free_detection() -> None:
    assert _is_hands_free("audio/wav; mode=handsfree", False) is True
    assert _is_hands_free("audio/wav", True) is True
    assert _is_hands_free("audio/wav", False) is False


def test_wav_duration_is_read_from_file(tmp_path) -> None:
    path = tmp_path / "voice.wav"
    rate = 24_000
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes(b"\x00\x00" * rate)

    assert 990 <= _wav_duration_ms(path) <= 1010
