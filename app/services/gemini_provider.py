from __future__ import annotations

import asyncio
from time import monotonic
from typing import Any

import aiohttp


_DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
_DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite"


def _effective_base_url(settings: Any) -> str:
    configured = str(getattr(settings, "ai_base_url", "") or "").rstrip("/")
    if not configured or "localhost:11434" in configured or "127.0.0.1:11434" in configured:
        return _DEFAULT_GEMINI_BASE_URL
    return configured


def _effective_model(settings: Any) -> str:
    configured = str(
        getattr(settings, "ai_fast_model", "")
        or getattr(settings, "ai_model", "")
        or ""
    ).strip()
    if configured.startswith("models/"):
        configured = configured.removeprefix("models/")
    if not configured.startswith("gemini-"):
        return _DEFAULT_GEMINI_MODEL
    return configured


def _convert_messages(messages: list[dict[str, str]]) -> tuple[str, list[dict[str, Any]]]:
    system_parts: list[str] = []
    contents: list[dict[str, Any]] = []

    for item in messages:
        role = str(item.get("role") or "user")
        text = str(item.get("content") or "").strip()
        if not text:
            continue
        if role == "system":
            system_parts.append(text)
            continue

        gemini_role = "model" if role == "assistant" else "user"
        if contents and contents[-1]["role"] == gemini_role:
            contents[-1]["parts"][0]["text"] += "\n" + text
        else:
            contents.append({"role": gemini_role, "parts": [{"text": text}]})

    if not contents:
        contents = [{"role": "user", "parts": [{"text": "Réponds brièvement."}]}]
    return "\n\n".join(system_parts), contents


async def _gemini_chat(self: Any, messages: list[dict[str, str]], max_tokens: int) -> str:
    await self.start()
    if not self.settings.ai_api_key:
        raise RuntimeError("Clé API Gemini absente dans AI_API_KEY")

    assert self.session
    model = _effective_model(self.settings)
    base_url = _effective_base_url(self.settings)
    system_instruction, contents = _convert_messages(messages)
    payload: dict[str, Any] = {
        "contents": contents,
        "generationConfig": {
            "maxOutputTokens": max(1, min(int(max_tokens), 360)),
        },
    }
    if system_instruction:
        payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}

    started = monotonic()
    async with self.session.post(
        f"{base_url}/models/{model}:generateContent",
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": self.settings.ai_api_key,
        },
        json=payload,
        timeout=aiohttp.ClientTimeout(
            total=max(5, int(self.settings.ai_request_timeout_seconds))
        ),
    ) as response:
        body = await response.json(content_type=None)
        if response.status >= 400:
            error = body.get("error") if isinstance(body, dict) else None
            detail = error.get("message") if isinstance(error, dict) else str(body)
            raise RuntimeError(f"Gemini a répondu {response.status}: {detail}")

    self.last_latency_ms = round((monotonic() - started) * 1000)
    candidates = body.get("candidates") or []
    if not candidates:
        feedback = body.get("promptFeedback") or {}
        raise RuntimeError(
            "Gemini n'a renvoyé aucune réponse"
            + (f" ({feedback})" if feedback else "")
        )
    parts = candidates[0].get("content", {}).get("parts", [])
    text = " ".join(str(part.get("text") or "").strip() for part in parts).strip()
    if not text:
        raise RuntimeError("Gemini a renvoyé une réponse vide")
    return self._clean(text)


def install_gemini_provider(ai: Any) -> None:
    """Ajoute Gemini sans casser Ollama ni les fournisseurs OpenAI compatibles."""
    cls = type(ai)
    if getattr(cls, "_aura_gemini_provider_installed", False):
        return

    original_chat = cls._chat
    original_active_model = cls.active_model.fget
    original_degraded_fallback = cls._degraded_fallback

    async def chat(self: Any, messages: list[dict[str, str]], max_tokens: int) -> str:
        if self.settings.ai_mode == "gemini":
            return await _gemini_chat(self, messages, max_tokens)
        return await original_chat(self, messages, max_tokens)

    def enabled(self: Any) -> bool:
        return self.settings.ai_mode in {"ollama", "openai_compatible", "gemini"}

    def active_model(self: Any) -> str:
        if self.settings.ai_mode == "gemini":
            return _effective_model(self.settings)
        return original_active_model(self)

    @staticmethod
    def degraded_fallback(viewer_name: str, message: str) -> str:
        lowered = message.casefold()
        if any(word in lowered for word in ("salut", "bonjour", "bonsoir")):
            return f"Salut {viewer_name}. Je suis connectée, mais mon fournisseur IA est momentanément indisponible."
        if "ça va" in lowered or "ca va" in lowered:
            return "Je suis connectée. Mon fournisseur IA ralentit, donc je réponds en mode de secours."
        if "qui es-tu" in lowered or "qui tu es" in lowered:
            return (
                "Je suis Aura, présente sur Twitch avec le compte mairaiy. "
                "Mon fournisseur IA récupère, mais le reste du bot continue de fonctionner."
            )
        return (
            "Mon fournisseur IA n'a pas répondu assez vite. "
            "Je reste opérationnelle pour le chat, les alertes, la modération et OBS."
        )

    cls._chat = chat
    cls.enabled = property(enabled)
    cls.active_model = property(active_model)
    cls._degraded_fallback = degraded_fallback
    cls._aura_gemini_provider_installed = True
