from __future__ import annotations

import asyncio
import os
import tempfile
import time
from pathlib import Path
from typing import Any

from app.config import RUNTIME_DIR


def _bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().casefold() in {"1", "true", "yes", "oui", "on"}


def _int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        return max(minimum, min(maximum, int(os.getenv(name, str(default)))))
    except (TypeError, ValueError):
        return default


class LocalWhisperSTT:
    """Transcription vocale locale avec faster-whisper.

    Le modèle est chargé paresseusement afin de ne pas ralentir le démarrage
    d'AURA. Aucun audio n'est conservé après la transcription.
    """

    VERSION = "aura-local-stt-faster-whisper-v1"

    def __init__(self) -> None:
        self.enabled = _bool_env("VOICE_LOCAL_STT_ENABLED", True)
        self.model_name = str(os.getenv("VOICE_LOCAL_STT_MODEL", "base") or "base").strip()
        self.device = str(os.getenv("VOICE_LOCAL_STT_DEVICE", "auto") or "auto").strip()
        self.compute_type = str(os.getenv("VOICE_LOCAL_STT_COMPUTE_TYPE", "int8") or "int8").strip()
        self.cpu_threads = _int_env("VOICE_LOCAL_STT_CPU_THREADS", 4, 1, 32)
        self.num_workers = _int_env("VOICE_LOCAL_STT_WORKERS", 1, 1, 4)
        self.download_root = Path(
            os.getenv(
                "VOICE_LOCAL_STT_DIR",
                str(RUNTIME_DIR / "data" / "voices" / "faster-whisper"),
            )
        ).expanduser()
        self._model: Any | None = None
        self._load_lock = asyncio.Lock()
        self._transcribe_lock = asyncio.Lock()
        self.last_error = ""
        self.last_latency_ms = 0
        self.transcription_count = 0

    @property
    def ready(self) -> bool:
        return self._model is not None

    async def ensure_ready(self) -> bool:
        if self.ready:
            return True
        if not self.enabled:
            self.last_error = "Transcription locale désactivée"
            return False

        async with self._load_lock:
            if self.ready:
                return True

            def load_model() -> Any:
                from faster_whisper import WhisperModel

                self.download_root.mkdir(parents=True, exist_ok=True)
                return WhisperModel(
                    self.model_name,
                    device=self.device,
                    compute_type=self.compute_type,
                    cpu_threads=self.cpu_threads,
                    num_workers=self.num_workers,
                    download_root=str(self.download_root),
                )

            try:
                self._model = await asyncio.to_thread(load_model)
            except Exception as exc:  # noqa: BLE001
                self._model = None
                self.last_error = f"Chargement faster-whisper impossible: {exc}"
                return False

            self.last_error = ""
            return True

    async def transcribe(self, audio: bytes) -> str:
        if not await self.ensure_ready():
            raise RuntimeError(self.last_error or "faster-whisper indisponible")

        assert self._model is not None
        async with self._transcribe_lock:
            temp_path = ""
            started = time.monotonic()
            try:
                with tempfile.NamedTemporaryFile(
                    suffix=".wav",
                    prefix="aura-stt-",
                    delete=False,
                ) as target:
                    target.write(audio)
                    temp_path = target.name

                def run() -> str:
                    segments, _info = self._model.transcribe(
                        temp_path,
                        language="fr",
                        beam_size=1,
                        vad_filter=True,
                        condition_on_previous_text=False,
                    )
                    return " ".join(
                        str(segment.text or "").strip()
                        for segment in segments
                        if str(segment.text or "").strip()
                    ).strip()

                text = await asyncio.to_thread(run)
                self.last_latency_ms = round((time.monotonic() - started) * 1000)
                if not text:
                    raise ValueError("Aucune parole intelligible détectée")
                self.transcription_count += 1
                self.last_error = ""
                return text
            except Exception as exc:
                self.last_latency_ms = round((time.monotonic() - started) * 1000)
                self.last_error = str(exc or exc.__class__.__name__)[:500]
                raise
            finally:
                if temp_path:
                    try:
                        Path(temp_path).unlink(missing_ok=True)
                    except OSError:
                        pass

    def diagnostic(self) -> dict[str, Any]:
        return {
            "version": self.VERSION,
            "enabled": self.enabled,
            "ready": self.ready,
            "engine": "faster-whisper",
            "model": self.model_name,
            "device": self.device,
            "compute_type": self.compute_type,
            "download_root": str(self.download_root),
            "transcription_count": self.transcription_count,
            "last_latency_ms": self.last_latency_ms,
            "last_error": self.last_error,
            "audio_persisted": False,
            "offline": True,
        }
