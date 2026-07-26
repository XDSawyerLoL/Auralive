from __future__ import annotations

import asyncio
import os
import shutil
import time
from pathlib import Path
from typing import Any
from uuid import uuid4


_POWERSHELL_SCRIPT = r"""
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $requestedVoice = [string]$env:AURA_TTS_VOICE
    if ($requestedVoice) {
        $voice = $synth.GetInstalledVoices() |
            ForEach-Object { $_.VoiceInfo.Name } |
            Where-Object { $_ -like "*$requestedVoice*" } |
            Select-Object -First 1
        if ($voice) { $synth.SelectVoice($voice) }
    }
    $synth.Rate = [int]$env:AURA_TTS_RATE
    $synth.Volume = [int]$env:AURA_TTS_VOLUME
    $synth.SetOutputToWaveFile([string]$env:AURA_TTS_OUTPUT)
    $synth.Speak([string]$env:AURA_TTS_TEXT)
}
finally {
    $synth.Dispose()
}
"""


def _normalize_text(value: str) -> str:
    text = " ".join(str(value or "").replace("\n", " ").split()).strip()
    if text.startswith("@") and " " in text:
        text = text.split(" ", 1)[1].strip()
    return text[:430]


def _rate_to_sapi(rate: float) -> int:
    value = round((max(0.5, min(2.0, float(rate))) - 1.0) * 6)
    return max(-10, min(10, value))


def _volume_to_sapi(volume: float) -> int:
    return max(0, min(100, round(float(volume) * 100)))


class AvatarAudioService:
    """Produit des WAV locaux avec la voix Windows, sans service cloud supplémentaire."""

    def __init__(self, media_dir: Path):
        self.output_dir = Path(media_dir) / "tts"
        self._lock = asyncio.Lock()
        self.last_error = ""
        self.last_file = ""
        self.last_duration_ms = 0
        self.generated_count = 0

    @property
    def shell(self) -> str:
        return (
            shutil.which("powershell.exe")
            or shutil.which("powershell")
            or shutil.which("pwsh")
            or ""
        )

    @property
    def available(self) -> bool:
        return os.name == "nt" and bool(self.shell)

    async def synthesize(
        self,
        text: str,
        *,
        voice: str = "",
        rate: float = 1.0,
        pitch: float = 1.0,
        volume: float = 1.0,
    ) -> str | None:
        del pitch  # System.Speech ne permet pas une hauteur fiable sans SSML spécifique.
        clean = _normalize_text(text)
        if not clean:
            self.last_error = "Texte vocal vide"
            return None
        if not self.available:
            self.last_error = "Synthèse vocale Windows indisponible"
            return None

        async with self._lock:
            self.output_dir.mkdir(parents=True, exist_ok=True)
            filename = f"mairaiy-{uuid4().hex}.wav"
            path = self.output_dir / filename
            environment = os.environ.copy()
            environment.update(
                {
                    "AURA_TTS_TEXT": clean,
                    "AURA_TTS_VOICE": str(voice or ""),
                    "AURA_TTS_RATE": str(_rate_to_sapi(rate)),
                    "AURA_TTS_VOLUME": str(_volume_to_sapi(volume)),
                    "AURA_TTS_OUTPUT": str(path.resolve()),
                }
            )
            started = time.monotonic()
            process = await asyncio.create_subprocess_exec(
                self.shell,
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                _POWERSHELL_SCRIPT,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=environment,
            )
            try:
                _, stderr = await asyncio.wait_for(process.communicate(), timeout=25)
            except asyncio.TimeoutError:
                process.kill()
                await process.communicate()
                self.last_error = "La synthèse vocale Windows a dépassé 25 secondes"
                return None

            self.last_duration_ms = round((time.monotonic() - started) * 1000)
            if process.returncode != 0:
                self.last_error = stderr.decode("utf-8", errors="replace").strip()[-500:]
                path.unlink(missing_ok=True)
                return None
            if not path.exists() or path.stat().st_size <= 44:
                self.last_error = "Windows n'a produit aucun fichier audio exploitable"
                path.unlink(missing_ok=True)
                return None

            self.last_error = ""
            self.last_file = filename
            self.generated_count += 1
            await asyncio.to_thread(self._cleanup)
            return f"/media/tts/{filename}"

    def _cleanup(self) -> None:
        cutoff = time.time() - 6 * 3600
        files = sorted(
            self.output_dir.glob("mairaiy-*.wav"),
            key=lambda item: item.stat().st_mtime,
            reverse=True,
        )
        for index, path in enumerate(files):
            try:
                if index >= 40 or path.stat().st_mtime < cutoff:
                    path.unlink(missing_ok=True)
            except OSError:
                pass

    def diagnostic(self) -> dict[str, Any]:
        try:
            generated_files = len(list(self.output_dir.glob("mairaiy-*.wav")))
        except OSError:
            generated_files = 0
        return {
            "available": self.available,
            "engine": "windows-system-speech" if self.available else "browser-fallback",
            "shell": Path(self.shell).name if self.shell else "",
            "generated_files": generated_files,
            "generated_count": self.generated_count,
            "last_file": self.last_file,
            "last_error": self.last_error,
            "last_duration_ms": self.last_duration_ms,
        }


async def _setting(aura: Any, key: str, default: Any) -> Any:
    try:
        return await aura.db.get_setting(key, default)
    except Exception:
        return default


def install_avatar_audio(aura: Any) -> AvatarAudioService:
    """Intercepte les événements vocaux et les dirige vers la seule source avatar."""
    if getattr(aura, "avatar_audio", None):
        return aura.avatar_audio

    service = AvatarAudioService(aura.settings.media_dir)
    aura.avatar_audio = service
    original_emit = aura.overlay.emit

    async def emit(event: dict[str, Any], *, target: str | None = None) -> None:
        payload = dict(event)
        event_type = str(payload.get("type") or "")
        vocal = (
            event_type in {"aura_message", "avatar_test", "tts"}
            and payload.get("speak", True) is not False
            and bool(await _setting(aura, "avatar.enabled", True))
        )
        if not vocal:
            await original_emit(payload, target=target)
            return

        visual = dict(payload)
        visual["speak"] = False
        await original_emit(visual, target=target)

        settings_prefix = "tts" if event_type == "tts" else "avatar"
        voice = str(
            payload.get("voice")
            or await _setting(aura, f"{settings_prefix}.voice", "")
            or ""
        )
        rate = float(
            payload.get("rate")
            or await _setting(aura, f"{settings_prefix}.rate", 1.0)
            or 1.0
        )
        pitch = float(
            payload.get("pitch")
            or await _setting(aura, f"{settings_prefix}.pitch", 1.0)
            or 1.0
        )
        volume = float(
            payload.get("volume")
            if payload.get("volume") is not None
            else await _setting(aura, f"{settings_prefix}.volume", 1.0)
        )
        text = str(payload.get("text") or payload.get("message") or "")
        audio_url = await service.synthesize(
            text,
            voice=voice,
            rate=rate,
            pitch=pitch,
            volume=volume,
        )
        await original_emit(
            {
                **payload,
                "type": "avatar_voice",
                "source_type": event_type,
                "text": text,
                "message": text,
                "audio_url": audio_url or "",
                "voice": voice,
                "rate": rate,
                "pitch": pitch,
                "volume": volume,
                "audio_engine": "windows" if audio_url else "browser",
                "speak": True,
            },
            target="avatar",
        )

    aura.overlay.emit = emit
    return service
