from __future__ import annotations

import asyncio
import os
import time
import wave
from pathlib import Path
from typing import Any
from uuid import uuid4

import aiohttp

from app.config import RUNTIME_DIR


_MODEL_URL = (
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/"
    "model-files-v1.0/kokoro-v1.0.onnx"
)
_VOICES_URL = (
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/"
    "model-files-v1.0/voices-v1.0.bin"
)


def _bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().casefold() in {"1", "true", "yes", "oui", "on"}


def _float_env(name: str, default: float, minimum: float, maximum: float) -> float:
    try:
        return max(minimum, min(maximum, float(os.getenv(name, str(default)))))
    except (TypeError, ValueError):
        return default


def _runtime_path(env_name: str, default: str) -> Path:
    raw = Path(os.getenv(env_name, default) or default).expanduser()
    if raw.is_absolute():
        return raw
    return RUNTIME_DIR / raw


def _wav_duration_ms(path: Path) -> int:
    try:
        with wave.open(str(path), "rb") as source:
            rate = int(source.getframerate() or 0)
            frames = int(source.getnframes() or 0)
        if rate <= 0 or frames <= 0:
            return 0
        return max(1, round(frames / rate * 1000))
    except (OSError, EOFError, wave.Error):
        return 0


class LocalKokoroVoice:
    """Voix francaise Kokoro locale prechargee pour les conversations en live."""

    def __init__(self, output_dir: Path):
        self.output_dir = Path(output_dir)
        self.data_dir = _runtime_path("MAIRAIY_KOKORO_DIR", "data/voices/kokoro")
        self.voice_name = str(
            os.getenv("MAIRAIY_KOKORO_VOICE", "ff_siwis") or "ff_siwis"
        ).strip()
        self.language = str(
            os.getenv("MAIRAIY_KOKORO_LANGUAGE", "fr-fr") or "fr-fr"
        ).strip()
        self.enabled = _bool_env("MAIRAIY_KOKORO_ENABLED", True)
        self.auto_download = _bool_env("MAIRAIY_KOKORO_AUTO_DOWNLOAD", True)
        self._kokoro: Any | None = None
        self._g2p: Any | None = None
        self._soundfile: Any | None = None
        self._fallback: Any | None = None
        self._load_lock = asyncio.Lock()
        self._synth_lock = asyncio.Lock()
        self.last_error = ""
        self.last_file = ""
        self.last_generation_ms = 0
        self.last_audio_duration_ms = 0
        self.generated_count = 0
        self.download_attempted = False

    @property
    def model_path(self) -> Path:
        return _runtime_path(
            "MAIRAIY_KOKORO_MODEL",
            str(self.data_dir / "kokoro-v1.0.onnx"),
        )

    @property
    def voices_path(self) -> Path:
        return _runtime_path(
            "MAIRAIY_KOKORO_VOICES",
            str(self.data_dir / "voices-v1.0.bin"),
        )

    @property
    def ready(self) -> bool:
        return bool(
            self.enabled
            and self.model_path.exists()
            and self.voices_path.exists()
            and self._kokoro is not None
            and self._g2p is not None
            and self._soundfile is not None
        )

    async def _download_file(self, url: str, path: Path) -> bool:
        self.download_attempted = True
        path.parent.mkdir(parents=True, exist_ok=True)
        partial = Path(str(path) + ".part")
        partial.unlink(missing_ok=True)
        timeout = aiohttp.ClientTimeout(total=900, connect=20)
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(url) as response:
                    if response.status >= 400:
                        raise RuntimeError(f"HTTP {response.status}")
                    with partial.open("wb") as target:
                        async for chunk in response.content.iter_chunked(1024 * 1024):
                            target.write(chunk)
            if not partial.exists() or partial.stat().st_size < 1024:
                raise RuntimeError("fichier telecharge vide")
            partial.replace(path)
            return True
        except Exception as exc:
            partial.unlink(missing_ok=True)
            self.last_error = f"Telechargement Kokoro impossible: {exc}"
            return False

    async def _ensure_assets(self) -> bool:
        missing: list[tuple[str, Path]] = []
        if not self.model_path.exists():
            missing.append((_MODEL_URL, self.model_path))
        if not self.voices_path.exists():
            missing.append((_VOICES_URL, self.voices_path))
        if not missing:
            return True
        if not self.auto_download:
            self.last_error = "Modele Kokoro local absent"
            return False
        for url, path in missing:
            if not await self._download_file(url, path):
                return False
        return True

    def _load_components(self) -> tuple[Any, Any, Any, Any]:
        from kokoro_onnx import Kokoro
        from misaki import espeak
        from misaki.espeak import EspeakG2P
        import soundfile as sf

        fallback = espeak.EspeakFallback(british=False)
        g2p = EspeakG2P(language=self.language)
        kokoro = Kokoro(str(self.model_path), str(self.voices_path))
        voices = set(kokoro.get_voices())
        if self.voice_name not in voices:
            raise RuntimeError(
                f"Voix Kokoro {self.voice_name!r} absente du pack "
                f"({len(voices)} voix disponibles)"
            )
        return kokoro, g2p, sf, fallback

    async def ensure_ready(self) -> bool:
        if self.ready:
            return True
        if not self.enabled:
            self.last_error = "Kokoro local desactive"
            return False

        async with self._load_lock:
            if self.ready:
                return True
            if not await self._ensure_assets():
                return False
            try:
                (
                    self._kokoro,
                    self._g2p,
                    self._soundfile,
                    self._fallback,
                ) = await asyncio.to_thread(self._load_components)
            except Exception as exc:
                self._kokoro = None
                self._g2p = None
                self._soundfile = None
                self._fallback = None
                self.last_error = f"Chargement Kokoro impossible: {exc}"
                return False

            self.last_error = ""
            return True

    async def synthesize(
        self,
        text: str,
        *,
        rate: float = 1.0,
        volume: float = 1.0,
    ) -> str | None:
        if not await self.ensure_ready():
            return None

        clean = " ".join(str(text or "").replace("\n", " ").split()).strip()[:430]
        if not clean:
            self.last_error = "Texte vocal Kokoro vide"
            return None

        assert self._kokoro is not None
        assert self._g2p is not None
        assert self._soundfile is not None

        async with self._synth_lock:
            filename = f"mairaiy-kokoro-{uuid4().hex}.wav"
            path = self.output_dir / filename
            self.output_dir.mkdir(parents=True, exist_ok=True)
            speed = max(
                0.72,
                min(
                    1.45,
                    float(rate)
                    * _float_env("MAIRAIY_KOKORO_SPEED", 1.0, 0.75, 1.35),
                ),
            )
            gain = max(0.1, min(1.5, float(volume)))

            def generate() -> None:
                import numpy as np

                phonemes, _ = self._g2p(clean)
                samples, sample_rate = self._kokoro.create(
                    phonemes,
                    voice=self.voice_name,
                    speed=speed,
                    is_phonemes=True,
                )
                audio = np.asarray(samples, dtype=np.float32)
                if gain != 1.0:
                    audio = np.clip(audio * gain, -1.0, 1.0)
                self._soundfile.write(
                    str(path),
                    audio,
                    int(sample_rate),
                    subtype="PCM_16",
                )

            started = time.monotonic()
            try:
                await asyncio.wait_for(asyncio.to_thread(generate), timeout=35)
            except asyncio.TimeoutError:
                path.unlink(missing_ok=True)
                self.last_error = "Kokoro local a depasse 35 secondes"
                return None
            except Exception as exc:
                path.unlink(missing_ok=True)
                self.last_error = f"Kokoro local impossible: {exc}"
                return None

            if not path.exists() or path.stat().st_size <= 44:
                path.unlink(missing_ok=True)
                self.last_error = "Kokoro a produit un fichier audio vide"
                return None

            self.last_generation_ms = round((time.monotonic() - started) * 1000)
            self.last_audio_duration_ms = _wav_duration_ms(path)
            self.last_file = filename
            self.last_error = ""
            self.generated_count += 1
            return f"/media/tts/{filename}"

    def diagnostic(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "ready": self.ready,
            "engine": "kokoro-onnx",
            "voice": self.voice_name,
            "language": self.language,
            "model_path": str(self.model_path),
            "voices_path": str(self.voices_path),
            "assets_present": self.model_path.exists() and self.voices_path.exists(),
            "auto_download": self.auto_download,
            "download_attempted": self.download_attempted,
            "generated_count": self.generated_count,
            "last_file": self.last_file,
            "last_generation_ms": self.last_generation_ms,
            "last_audio_duration_ms": self.last_audio_duration_ms,
            "last_error": self.last_error,
            "offline": True,
        }
