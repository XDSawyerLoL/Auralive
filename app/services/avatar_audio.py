from __future__ import annotations

import asyncio
import base64
import os
import re
import shutil
import time
import wave
from pathlib import Path
from typing import Any
from uuid import uuid4

import aiohttp


_GEMINI_TTS_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
_GEMINI_TTS_DEFAULT_MODEL = "gemini-3.1-flash-tts-preview"
_GEMINI_TTS_DEFAULT_VOICE = "Aoede"
_GEMINI_VOICES = {
    "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede",
    "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba",
    "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar",
    "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi",
    "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
}

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


def _select_gemini_voice(value: str) -> str:
    requested = str(value or "").strip()
    for voice in _GEMINI_VOICES:
        if voice.casefold() == requested.casefold():
            return voice
    configured = str(os.getenv("TTS_VOICE", "") or "").strip()
    for voice in _GEMINI_VOICES:
        if voice.casefold() == configured.casefold():
            return voice
    return _GEMINI_TTS_DEFAULT_VOICE


def _pace_instruction(rate: float) -> str:
    value = max(0.5, min(2.0, float(rate)))
    if value < 0.8:
        return "slow and intimate, with meaningful pauses"
    if value < 0.95:
        return "slightly relaxed, never dragging"
    if value > 1.35:
        return "fast, energetic and fluid, while remaining perfectly intelligible"
    if value > 1.12:
        return "slightly brisk and lively"
    return "natural conversational pace"


def _pitch_instruction(pitch: float) -> str:
    value = max(0.5, min(2.0, float(pitch)))
    if value < 0.85:
        return "slightly lower and more grounded"
    if value > 1.2:
        return "slightly brighter, without sounding childish"
    return "natural mid-range pitch"


def _performance_instruction(context: str, text: str) -> str:
    normalized = str(context or "conversation").casefold()
    if "raid" in normalized:
        return "genuinely delighted and welcoming, with controlled excitement"
    if "follow" in normalized or "subscribe" in normalized or "gift" in normalized:
        return "warm, grateful and spontaneous, with a subtle audible smile"
    if "moderation" in normalized:
        return "calm, firm and concise, without aggression"
    if "tts" in normalized:
        return "clear and playful, as if reading a viewer message live"
    if "test" in normalized:
        return "confident, warm and lightly playful"
    if text.rstrip().endswith("?"):
        return "curious and engaged, like a real live conversation"
    if "!" in text:
        return "lively and expressive, but never like an advertisement"
    return "close, conversational and subtly witty"


def _build_gemini_prompt(
    text: str,
    *,
    rate: float = 1.0,
    pitch: float = 1.0,
    context: str = "conversation",
    style: str = "",
) -> str:
    clean = _normalize_text(text)
    extra_style = " ".join(str(style or "").split()).strip()[:700]
    profile = extra_style or (
        "Mairaiy is a French artificial consciousness and live-stream co-host. "
        "She sounds like a real young adult woman from France: intelligent, warm, witty, "
        "self-assured and emotionally present. Her voice is close-mic, modern and natural."
    )
    return f"""# AUDIO PROFILE: Mairaiy
{profile}

# SCENE
Mairaiy is speaking live beside the streamer in a relaxed Twitch studio. She is reacting in real time, not recording an advert or reading an audiobook.

# DIRECTOR'S NOTES
- Speak native French from France with a neutral contemporary accent.
- Performance: {_performance_instruction(context, clean)}.
- Pace: {_pace_instruction(rate)}.
- Pitch: {_pitch_instruction(pitch)}.
- Use subtle natural breaths, micro-pauses and changing intonation.
- Avoid robotic cadence, exaggerated radio voice, sing-song delivery and artificial cheerfulness.
- Never add, remove or paraphrase words.
- Speak only the transcript. Never read these instructions or section titles aloud.

# TRANSCRIPT
{clean}"""


def _pcm_rate_from_mime(mime_type: str) -> int:
    match = re.search(r"rate=(\d+)", str(mime_type or ""), flags=re.I)
    return int(match.group(1)) if match else 24_000


def _write_pcm_wav(path: Path, pcm: bytes, *, rate: int = 24_000) -> None:
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(max(8_000, min(96_000, int(rate))))
        output.writeframes(pcm)


class AvatarAudioService:
    """Voix Gemini TTS expressive, avec replis Windows puis navigateur."""

    def __init__(self, media_dir: Path):
        self.output_dir = Path(media_dir) / "tts"
        self._lock = asyncio.Lock()
        self.last_error = ""
        self.last_provider_error = ""
        self.last_file = ""
        self.last_duration_ms = 0
        self.last_audio_duration_ms = 0
        self.last_engine = ""
        self.last_voice = ""
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
    def windows_available(self) -> bool:
        return os.name == "nt" and bool(self.shell)

    @property
    def gemini_api_key(self) -> str:
        return str(os.getenv("TTS_API_KEY") or os.getenv("AI_API_KEY") or "").strip()

    @property
    def gemini_model(self) -> str:
        return str(os.getenv("TTS_MODEL") or _GEMINI_TTS_DEFAULT_MODEL).strip()

    @property
    def preferred_mode(self) -> str:
        explicit = str(os.getenv("TTS_MODE", "") or "").strip().casefold()
        if explicit in {"gemini", "windows", "browser"}:
            return explicit
        return "gemini" if self.gemini_api_key else "windows"

    @property
    def available(self) -> bool:
        return bool(self.gemini_api_key) or self.windows_available

    async def synthesize(
        self,
        text: str,
        *,
        voice: str = "",
        rate: float = 1.0,
        pitch: float = 1.0,
        volume: float = 1.0,
        context: str = "conversation",
        style: str = "",
    ) -> str | None:
        clean = _normalize_text(text)
        if not clean:
            self.last_error = "Texte vocal vide"
            return None

        async with self._lock:
            self.output_dir.mkdir(parents=True, exist_ok=True)
            self.last_provider_error = ""
            self.last_error = ""

            if self.preferred_mode == "gemini" and self.gemini_api_key:
                url = await self._synthesize_gemini(
                    clean,
                    voice=voice,
                    rate=rate,
                    pitch=pitch,
                    context=context,
                    style=style,
                )
                if url:
                    return url

            if self.preferred_mode != "browser" and self.windows_available:
                url = await self._synthesize_windows(
                    clean,
                    voice=voice,
                    rate=rate,
                    volume=volume,
                )
                if url:
                    return url

            if not self.last_error:
                self.last_error = "Aucun moteur audio serveur disponible, repli navigateur"
            self.last_engine = "browser-fallback"
            return None

    async def _synthesize_gemini(
        self,
        text: str,
        *,
        voice: str,
        rate: float,
        pitch: float,
        context: str,
        style: str,
    ) -> str | None:
        selected_voice = _select_gemini_voice(voice)
        filename = f"mairaiy-{uuid4().hex}.wav"
        path = self.output_dir / filename
        endpoint = f"{_GEMINI_TTS_BASE_URL}/models/{self.gemini_model}:generateContent"
        payload = {
            "contents": [{
                "parts": [{
                    "text": _build_gemini_prompt(
                        text,
                        rate=rate,
                        pitch=pitch,
                        context=context,
                        style=style,
                    )
                }]
            }],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {
                        "prebuiltVoiceConfig": {"voiceName": selected_voice}
                    }
                },
            },
        }
        started = time.monotonic()
        timeout = aiohttp.ClientTimeout(total=35, connect=10)
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(
                    endpoint,
                    headers={
                        "x-goog-api-key": self.gemini_api_key,
                        "Content-Type": "application/json",
                    },
                    json=payload,
                ) as response:
                    data = await response.json(content_type=None)
                    if response.status >= 400:
                        detail = data.get("error", {}).get("message") if isinstance(data, dict) else str(data)
                        raise RuntimeError(f"Gemini TTS HTTP {response.status}: {detail or 'erreur inconnue'}")
        except asyncio.TimeoutError:
            self.last_provider_error = "Gemini TTS a dépassé 35 secondes"
            self.last_error = self.last_provider_error
            return None
        except Exception as exc:
            self.last_provider_error = str(exc or exc.__class__.__name__)[:500]
            self.last_error = self.last_provider_error
            return None

        try:
            candidates = data.get("candidates", [])
            parts = candidates[0].get("content", {}).get("parts", []) if candidates else []
            inline = next(
                (
                    part.get("inlineData") or part.get("inline_data")
                    for part in parts
                    if part.get("inlineData") or part.get("inline_data")
                ),
                None,
            )
            if not inline or not inline.get("data"):
                finish = candidates[0].get("finishReason", "") if candidates else ""
                raise RuntimeError(f"Gemini TTS n'a renvoyé aucun audio ({finish or 'sans motif'})")
            pcm = base64.b64decode(inline["data"])
            mime_type = str(inline.get("mimeType") or inline.get("mime_type") or "")
            rate_hz = _pcm_rate_from_mime(mime_type)
            if pcm[:4] == b"RIFF":
                path.write_bytes(pcm)
                audio_ms = 0
            else:
                await asyncio.to_thread(_write_pcm_wav, path, pcm, rate=rate_hz)
                audio_ms = round(len(pcm) / max(1, rate_hz * 2) * 1000)
            if not path.exists() or path.stat().st_size <= 44:
                raise RuntimeError("Gemini TTS a produit un fichier audio vide")
        except Exception as exc:
            path.unlink(missing_ok=True)
            self.last_provider_error = str(exc or exc.__class__.__name__)[:500]
            self.last_error = self.last_provider_error
            return None

        self.last_duration_ms = round((time.monotonic() - started) * 1000)
        self.last_audio_duration_ms = audio_ms
        self.last_error = ""
        self.last_file = filename
        self.last_engine = "gemini-tts"
        self.last_voice = selected_voice
        self.generated_count += 1
        await asyncio.to_thread(self._cleanup)
        return f"/media/tts/{filename}"

    async def _synthesize_windows(
        self,
        text: str,
        *,
        voice: str,
        rate: float,
        volume: float,
    ) -> str | None:
        filename = f"mairaiy-{uuid4().hex}.wav"
        path = self.output_dir / filename
        environment = os.environ.copy()
        environment.update(
            {
                "AURA_TTS_TEXT": text,
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
        self.last_engine = "windows-system-speech"
        self.last_voice = str(voice or "")
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
            "preferred_mode": self.preferred_mode,
            "engine": self.last_engine or (
                "gemini-tts" if self.gemini_api_key else (
                    "windows-system-speech" if self.windows_available else "browser-fallback"
                )
            ),
            "gemini_configured": bool(self.gemini_api_key),
            "model": self.gemini_model if self.gemini_api_key else "",
            "voice": self.last_voice or _select_gemini_voice(""),
            "windows_fallback": self.windows_available,
            "shell": Path(self.shell).name if self.shell else "",
            "generated_files": generated_files,
            "generated_count": self.generated_count,
            "last_file": self.last_file,
            "last_error": self.last_error,
            "last_provider_error": self.last_provider_error,
            "last_generation_ms": self.last_duration_ms,
            "last_audio_duration_ms": self.last_audio_duration_ms,
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
        style = str(
            payload.get("style")
            or await _setting(aura, "avatar.style", "")
            or ""
        )
        text = str(payload.get("text") or payload.get("message") or "")
        context = str(payload.get("source_type") or payload.get("event_type") or event_type)
        audio_url = await service.synthesize(
            text,
            voice=voice,
            rate=rate,
            pitch=pitch,
            volume=volume,
            context=context,
            style=style,
        )
        await original_emit(
            {
                **payload,
                "type": "avatar_voice",
                "source_type": event_type,
                "text": text,
                "message": text,
                "audio_url": audio_url or "",
                "voice": service.last_voice or voice,
                "rate": rate,
                "pitch": pitch,
                "volume": volume,
                "audio_engine": service.last_engine or "browser-fallback",
                "speak": True,
            },
            target="avatar",
        )

    aura.overlay.emit = emit
    return service
