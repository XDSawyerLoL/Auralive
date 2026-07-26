from __future__ import annotations

from typing import Any

from app.services import avatar_audio


_SIGNATURE_PROFILE = (
    "Mairaiy is a French adult anime-style live co-host in her early twenties. Her voice is "
    "distinctly youthful, bright, buoyant and highly expressive, with a light almost innocent "
    "surface and an audible smile. She reacts quickly, changes intonation often and carries the "
    "energy of an animated heroine presenting a chaotic game show. She remains unmistakably adult, "
    "articulate and confident. The comic signature comes from cheerfully announcing fictional chaos, "
    "defeats or absurdly dark events in video games as if they were excellent news. She never sounds "
    "childish, squeaky, sleepy, matronly, robotic or like a parody of Japanese speech."
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
            "very bright, delighted and almost innocently matter-of-fact while describing fictional "
            "video-game chaos; use crisp comic timing, quick melodic shifts and a smiling delivery, "
            "while remaining adult and controlled"
        )
    if "raid" in normalized:
        return "explosively welcoming, sparkling and genuinely delighted, with youthful anime-host energy"
    if any(marker in normalized for marker in ("follow", "subscribe", "gift", "cheer")):
        return "warm, bubbly and grateful, with a clear audible smile and fast expressive shifts"
    if "cta" in normalized:
        return "playfully inviting, youthful and conversational, never sounding like an advertisement"
    if "voice_input" in normalized:
        return "very engaged, bright and spontaneous, like a young adult co-host answering beside the streamer"
    if "tts" in normalized:
        return "clear, animated and mischievous, as if reacting live to a viewer message"
    if "test" in normalized:
        return "young, sparkling, highly expressive and charmingly theatrical while remaining natural"
    if clean.rstrip().endswith("?"):
        return "curious, bright and intensely engaged, with a playful upward turn"
    if "!" in clean:
        return "lively, sparkling and spontaneous, with a strong audible smile"
    return (
        "distinctly youthful, bright and almost innocent on the surface, with mature confidence, "
        "subtle mischief and frequent natural changes of intonation"
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
        "- The first impression must be youthful, sunny and energetic, not mature or reserved.\n"
        "- Keep the voice adult even when it sounds bright or nearly innocent.\n"
        "- Use an audible smile, lively sentence openings and quick emotional pivots.\n"
        "- For fictional game violence, preserve the cheerful presenter contrast for dark comedy.\n"
        "- Never use that comic contrast for real tragedy, distress, harassment or real victims.\n"
        "- Use tiny amused breaths and precise comic timing when appropriate.\n"
    )
    return prompt.replace("- Never add, remove or paraphrase words.\n", extra + "- Never add, remove or paraphrase words.\n")


def install_voice_signature(_audio_service: Any | None = None) -> None:
    if getattr(avatar_audio, "_mairaiy_voice_signature_installed", False):
        return

    avatar_audio._original_build_gemini_prompt = avatar_audio._build_gemini_prompt
    avatar_audio._GEMINI_TTS_DEFAULT_VOICE = "Leda"
    avatar_audio._performance_instruction = expressive_performance
    avatar_audio._build_gemini_prompt = _signature_prompt
    avatar_audio._mairaiy_voice_signature_installed = True
