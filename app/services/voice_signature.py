from __future__ import annotations

import re
from typing import Any

from app.services import avatar_audio


_SIGNATURE_PROFILE = (
    "Mairaiy is a French adult anime-style live co-host. Her voice is bright, lively, "
    "almost innocent on the surface, and highly expressive, while remaining unmistakably adult. "
    "She combines playful charm, quick emotional shifts and confident control. The comic signature "
    "comes from calmly or cheerfully announcing fictional chaos, defeats or absurdly dark events in "
    "video games, like an upbeat television presenter in a dystopian game show. She never sounds "
    "childish, squeaky, naive, robotic or like a parody of Japanese speech."
)

_FICTION_MARKERS = (
    "jeu", "game", "partie", "battle royale", "boss", "ennemi", "adversaire",
    "kill", "élimin", "respawn", "loot", "gta", "league of legends", "fortnite",
    "warzone", "manche", "score", "victoire", "défaite", "combat", "arène",
)

_DARK_FICTION_MARKERS = (
    "mort", "sang", "massacre", "explos", "découp", "écras", "abattu", "tué",
    "cadavre", "fatal", "boucherie", "anéanti", "détruit", "exécut", "survivant",
)

_REAL_SENSITIVE_MARKERS = (
    "suicide", "attentat", "victime réelle", "accident réel", "deuil", "harcèlement",
    "agression réelle", "violence conjugale", "maladie grave", "décès réel",
)


def _contains_any(text: str, markers: tuple[str, ...]) -> bool:
    lowered = text.casefold()
    return any(marker in lowered for marker in markers)


def _is_dark_fiction(context: str, text: str) -> bool:
    joined = f"{context} {text}".casefold()
    if _contains_any(joined, _REAL_SENSITIVE_MARKERS):
        return False
    has_dark = _contains_any(joined, _DARK_FICTION_MARKERS)
    has_fiction = _contains_any(joined, _FICTION_MARKERS) or any(
        marker in context.casefold()
        for marker in ("screen", "game", "initiative", "raid", "stream", "clip")
    )
    return has_dark and has_fiction


def expressive_performance(context: str, text: str) -> str:
    normalized = str(context or "conversation").casefold()
    clean = " ".join(str(text or "").split())

    if _contains_any(f"{normalized} {clean}", _REAL_SENSITIVE_MARKERS):
        return "sober, empathetic and grounded; remove the cheerful contrast entirely"
    if "moderation" in normalized:
        return "polite, composed and firmly authoritative, with no playful ambiguity"
    if _is_dark_fiction(normalized, clean):
        return (
            "bright, delighted and almost innocently matter-of-fact while describing fictional "
            "video-game chaos; the contrast should be dryly funny, controlled and never childish"
        )
    if "raid" in normalized:
        return "explosively welcoming, sparkling and genuinely delighted, with anime-host energy"
    if any(marker in normalized for marker in ("follow", "subscribe", "gift", "cheer")):
        return "warm, bubbly and grateful, with a clear audible smile and quick expressive shifts"
    if "cta" in normalized:
        return "playfully inviting and conversational, never sounding like an advertisement"
    if "tts" in normalized:
        return "clear, animated and mischievous, as if reacting live to a viewer message"
    if "test" in normalized:
        return "bright, highly expressive and charmingly theatrical while remaining natural"
    if clean.rstrip().endswith("?"):
        return "curious, bright and intensely engaged, with a playful upward turn"
    if "!" in clean:
        return "lively, sparkling and spontaneous, without forced cheerfulness"
    return (
        "bright and almost innocent on the surface, with mature confidence, subtle mischief and "
        "quick natural changes of intonation"
    )


def _signature_prompt(
    text: str,
    *,
    rate: float = 1.0,
    pitch: float = 1.0,
    context: str = "conversation",
    style: str = "",
) -> str:
    selected_style = " ".join(str(style or "").split()).strip()[:700] or _SIGNATURE_PROFILE
    prompt = avatar_audio._original_build_gemini_prompt(
        text,
        rate=rate,
        pitch=pitch,
        context=context,
        style=selected_style,
    )
    extra = (
        "- Keep the voice adult even when it sounds bright or nearly innocent.\n"
        "- For fictional game violence, preserve the cheerful presenter contrast for dark comedy.\n"
        "- Never use that comic contrast for real tragedy, distress, harassment or real victims.\n"
        "- Use fast emotional pivots, tiny amused breaths and precise comic timing when appropriate.\n"
    )
    return prompt.replace("- Never add, remove or paraphrase words.\n", extra + "- Never add, remove or paraphrase words.\n")


def install_voice_signature(audio_service: Any | None = None) -> None:
    if getattr(avatar_audio, "_mairaiy_voice_signature_installed", False):
        return

    avatar_audio._original_build_gemini_prompt = avatar_audio._build_gemini_prompt
    avatar_audio._GEMINI_TTS_DEFAULT_VOICE = "Laomedeia"
    avatar_audio._performance_instruction = expressive_performance
    avatar_audio._build_gemini_prompt = _signature_prompt
    avatar_audio._mairaiy_voice_signature_installed = True

    if audio_service is not None and not getattr(audio_service, "last_voice", ""):
        audio_service.last_voice = "Laomedeia"
