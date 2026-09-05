from __future__ import annotations

import asyncio
import os
import sys
import time
import wave
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.config import RUNTIME_DIR


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


def _runtime_path(value: str) -> Path:
    candidate = Path(value).expanduser()
    if candidate.is_absolute():
        return candidate.resolve()
    return (RUNTIME_DIR / candidate).resolve()


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


class LocalPiperVoice:
    """Voix locale fixe, chargee une seule fois puis reutilisee pendant le live."""

    def __init__(self, output_dir: Path):
        self.output_dir = Path(output_dir)
        configured_dir = str(os.getenv("MAIRAIY_LOCAL_VOICE_DIR", "data/voices/piper") or "data/voices/piper")
        self.data_dir = _runtime_path(configured_dir)
        self.voice_name = str(os.getenv("MAIRAIY_LOCAL_VOICE", "fr_FR-siwis-medium") or "fr_FR-siwis-medium").strip()
        self.auto_download = _bool_env("MAIRAIY_LOCAL_VOICE_AUTO_DOWNLOAD", True)
        self.enabled = _bool_env("MAIRAIY_LOCAL_VOICE_ENABLED", True)
        self._voice: Any | None = None
        self._config_type: Any | None = None
        self._load_lock = asyncio.Lock()
        self.last_error = ""
        self.last_file = ""
        self.last_generation_ms = 0
        self.last_audio_duration_ms = 0
        self.generated_count = 0
        self.download_attempted = False

    @property
    def model_path(self) -> Path:
        candidate = Path(self.voice_name).expanduser()
        if candidate.suffix.casefold() == ".onnx":
            return _runtime_path(str(candidate))
        return self.data_dir / f"{self.voice_name}.onnx"

    @property
    def config_path(self) -> Path:
        return Path(str(self.model_path) + ".json")

    @property
    def ready(self) -> bool:
        return bool(
            self.enabled
            and self.model_path.exists()
            and self.config_path.exists()
            and self._voice is not None
        )

    async def _download(self) -> bool:
        if not self.auto_download or Path(self.voice_name).suffix.casefold() == ".onnx":
            return False
        self.download_attempted = True
        self.data_dir.mkdir(parents=True, exist_ok=True)
        process = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "piper.download_voices",
            "--data-dir",
            str(self.data_dir),
            self.voice_name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            _, stderr = await asyncio.wait_for(process.communicate(), timeout=240)
        except asyncio.TimeoutError:
            process.kill()
            await process.communicate()
            self.last_error = "Telechargement de la voix locale depasse 240 secondes"
            return False
        if process.returncode != 0:
            self.last_error = stderr.decode("utf-8", errors="replace").strip()[-500:]
            return False
        return self.model_path.exists() and self.config_path.exists()

    async def ensure_ready(self) -> bool:
        if self.ready:
            return True
        if not self.enabled:
            self.last_error = "Voix locale desactivee"
            return False

        async with self._load_lock:
            if self.ready:
                return True
            try:
                from piper import PiperVoice, SynthesisConfig
            except Exception as exc:
                self.last_error = f"Piper indisponible: {exc}"
                return False

            if not self.model_path.exists() or not self.config_path.exists():
                if not await self._download():
                    if not self.last_error:
                        self.last_error = f"Modele local absent: {self.model_path.name}"
                    return False

            try:
                self._voice = await asyncio.to_thread(PiperVoice.load, str(self.model_path))
                self._config_type = SynthesisConfig
            except Exception as exc:
                self._voice = None
                self._config_type = None
                self.last_error = f"Chargement Piper impossible: {exc}"
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
        assert self._voice is not None
        assert self._config_type is not None

        clean = " ".join(str(text or "").replace("\n", " ").split()).strip()[:430]
        if not clean:
            self.last_error = "Texte vocal local vide"
            return None

        filename = f"mairaiy-local-{uuid4().hex}.wav"
        path = self.output_dir / filename
        self.output_dir.mkdir(parents=True, exist_ok=True)
        speed = max(0.72, min(1.45, float(rate) * _float_env("MAIRAIY_LOCAL_VOICE_SPEED", 1.0, 0.75, 1.35)))
        config = self._config_type(
            length_scale=1.0 / speed,
            noise_scale=_float_env("MAIRAIY_LOCAL_NOISE_SCALE", 0.62, 0.0, 1.2),
            noise_w_scale=_float_env("MAIRAIY_LOCAL_NOISE_W_SCALE", 0.78, 0.0, 1.2),
            volume=max(0.1, min(2.0, float(volume))),
            normalize_audio=True,
        )

        def generate() -> None:
            with wave.open(str(path), "wb") as target:
                self._voice.synthesize_wav(clean, target, syn_config=config)

        started = time.monotonic()
        try:
            await asyncio.wait_for(asyncio.to_thread(generate), timeout=35)
        except asyncio.TimeoutError:
            path.unlink(missing_ok=True)
            self.last_error = "Voix locale depasse 35 secondes"
            return None
        except Exception as exc:
            path.unlink(missing_ok=True)
            self.last_error = f"Voix locale impossible: {exc}"
            return None

        if not path.exists() or path.stat().st_size <= 44:
            path.unlink(missing_ok=True)
            self.last_error = "Piper a produit un fichier vide"
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
            "voice": self.voice_name,
            "model_path": str(self.model_path),
            "model_downloaded": self.model_path.exists() and self.config_path.exists(),
            "auto_download": self.auto_download,
            "download_attempted": self.download_attempted,
            "generated_count": self.generated_count,
            "last_file": self.last_file,
            "last_generation_ms": self.last_generation_ms,
            "last_audio_duration_ms": self.last_audio_duration_ms,
            "last_error": self.last_error,
            "offline": True,
        }
