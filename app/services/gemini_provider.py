from __future__ import annotations

import asyncio
import logging
from time import monotonic
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)

_DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
_DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite"
_MIN_OUTPUT_TOKENS = 32


class GeminiEmptyResponse(RuntimeError):
    pass


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


def _generation_config(max_tokens: int) -> dict[str, Any]:
    # Les modèles Gemini 3 utilisent la réflexion par défaut. Pour un chat Twitch,
    # le niveau minimal réduit la latence et évite qu'un budget de sortie trop court
    # soit entièrement consommé avant la réponse visible.
    return {
        "candidateCount": 1,
        "maxOutputTokens": max(_MIN_OUTPUT_TOKENS, min(int(max_tokens), 360)),
        "thinkingConfig": {
            "thinkingLevel": "minimal",
            "includeThoughts": False,
        },
    }


def _extract_text(body: dict[str, Any]) -> str:
    candidates = body.get("candidates") or []
    if not candidates:
        feedback = body.get("promptFeedback") or {}
        raise GeminiEmptyResponse(
            "Gemini n'a renvoyé aucun candidat"
            + (f" ({feedback})" if feedback else "")
        )

    candidate = candidates[0] or {}
    finish_reason = str(candidate.get("finishReason") or "inconnu")
    parts = candidate.get("content", {}).get("parts", []) or []
    visible_parts = [
        str(part.get("text") or "").strip()
        for part in parts
        if not bool(part.get("thought")) and str(part.get("text") or "").strip()
    ]
    text = " ".join(visible_parts).strip()
    if text:
        return text

    usage = body.get("usageMetadata") or {}
    feedback = body.get("promptFeedback") or {}
    details = [f"finishReason={finish_reason}"]
    if usage:
        details.append(f"usage={usage}")
    if feedback:
        details.append(f"feedback={feedback}")
    raise GeminiEmptyResponse("Gemini a renvoyé une réponse vide (" + ", ".join(details) + ")")


async def _post_generate_content(
    self: Any,
    *,
    base_url: str,
    model: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    assert self.session
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
        if not isinstance(body, dict):
            raise RuntimeError("Gemini a renvoyé un format de réponse inattendu")
        return body


async def _gemini_chat(self: Any, messages: list[dict[str, str]], max_tokens: int) -> str:
    await self.start()
    if not self.settings.ai_api_key:
        raise RuntimeError("Clé API Gemini absente dans AI_API_KEY")

    model = _effective_model(self.settings)
    base_url = _effective_base_url(self.settings)
    system_instruction, contents = _convert_messages(messages)
    payload: dict[str, Any] = {
        "contents": contents,
        "generationConfig": _generation_config(max_tokens),
    }
    if system_instruction:
        payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}

    started = monotonic()
    body = await _post_generate_content(
        self,
        base_url=base_url,
        model=model,
        payload=payload,
    )
    try:
        text = _extract_text(body)
    except GeminiEmptyResponse:
        # Un préchargement très court ou une réponse de fin de quota peut parfois
        # produire un candidat sans texte. Une seule relance plus large est permise.
        retry_payload = dict(payload)
        retry_payload["generationConfig"] = {
            **payload["generationConfig"],
            "maxOutputTokens": max(96, payload["generationConfig"]["maxOutputTokens"]),
        }
        logger.info("Réponse Gemini vide, nouvelle tentative unique avec un budget élargi")
        body = await _post_generate_content(
            self,
            base_url=base_url,
            model=model,
            payload=retry_payload,
        )
        text = _extract_text(body)

    self.last_latency_ms = round((monotonic() - started) * 1000)
    return self._clean(text)


def install_gemini_provider(ai: Any) -> None:
    """Ajoute Gemini sans casser Ollama ni les fournisseurs OpenAI compatibles."""
    cls = type(ai)
    if getattr(cls, "_aura_gemini_provider_installed", False):
        return

    original_chat = cls._chat
    original_warmup = cls._warmup
    original_diagnostic = cls.diagnostic
    original_active_model = cls.active_model.fget
    original_degraded_fallback = cls._degraded_fallback

    async def chat(self: Any, messages: list[dict[str, str]], max_tokens: int) -> str:
        if self.settings.ai_mode == "gemini":
            return await _gemini_chat(self, messages, max_tokens)
        return await original_chat(self, messages, max_tokens)

    async def warmup(self: Any) -> None:
        if self.settings.ai_mode != "gemini":
            await original_warmup(self)
            return
        try:
            await asyncio.wait_for(
                self.generate(
                    "Réponds uniquement par OK.",
                    "Initialisation silencieuse. Aucun commentaire supplémentaire.",
                    32,
                ),
                timeout=max(5, int(self.settings.ai_warmup_timeout_seconds)),
            )
            logger.info("Moteur IA Gemini préchargé avec %s", self.active_model)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            # Un échec de préchargement ne doit pas couper les premières réponses du live.
            self.last_error = self._error_label(exc)
            logger.info("Préchargement Gemini non bloquant indisponible: %s", self.last_error)

    def enabled(self: Any) -> bool:
        return self.settings.ai_mode in {"ollama", "openai_compatible", "gemini"}

    def active_model(self: Any) -> str:
        if self.settings.ai_mode == "gemini":
            return _effective_model(self.settings)
        return original_active_model(self)

    def diagnostic(self: Any) -> dict[str, Any]:
        result = original_diagnostic(self)
        if self.settings.ai_mode == "gemini":
            result.update(
                {
                    "provider": "google-gemini",
                    "base_url": _effective_base_url(self.settings),
                    "configured_model": _effective_model(self.settings),
                    "active_model": _effective_model(self.settings),
                    "api_key_configured": bool(self.settings.ai_api_key),
                }
            )
        return result

    def degraded_fallback(self: Any, viewer_name: str, message: str) -> str:
        if self.settings.ai_mode != "gemini":
            return original_degraded_fallback(viewer_name, message)
        lowered = message.casefold()
        if any(word in lowered for word in ("salut", "bonjour", "bonsoir")):
            return f"Salut {viewer_name}. Je suis connectée, mais Gemini est momentanément indisponible."
        if "ça va" in lowered or "ca va" in lowered:
            return "Je suis connectée. Gemini ralentit, donc je réponds en mode de secours."
        if "qui es-tu" in lowered or "qui tu es" in lowered:
            return (
                "Je suis Aura, présente sur Twitch avec le compte mairaiy. "
                "Gemini récupère, mais le reste du bot continue de fonctionner."
            )
        return (
            "Gemini n'a pas répondu assez vite. "
            "Je reste opérationnelle pour le chat, les alertes, la modération et OBS."
        )

    cls._chat = chat
    cls._warmup = warmup
    cls.enabled = property(enabled)
    cls.active_model = property(active_model)
    cls.diagnostic = diagnostic
    cls._degraded_fallback = degraded_fallback
    cls._aura_gemini_provider_installed = True
