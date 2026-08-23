from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

_SOURCE_BASE_DIR = Path(__file__).resolve().parent.parent
IS_FROZEN = bool(getattr(sys, "frozen", False))
BASE_DIR = Path(getattr(sys, "_MEIPASS", _SOURCE_BASE_DIR)) if IS_FROZEN else _SOURCE_BASE_DIR
RUNTIME_DIR = Path(sys.executable).resolve().parent if IS_FROZEN else BASE_DIR

# En mode application Windows, le .env reste volontairement a cote de AuraLive.exe.
# En mode developpement, le comportement historique du depot est conserve.
load_dotenv(RUNTIME_DIR / ".env")


def _bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "oui", "on"}


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _runtime_path(env_name: str, default: str) -> Path:
    value = Path(os.getenv(env_name, default))
    if value.is_absolute():
        return value
    return RUNTIME_DIR / value


@dataclass(slots=True)
class Settings:
    host: str = os.getenv("AURA_HOST", "127.0.0.1")
    port: int = _int("AURA_PORT", 8787)
    public_base_url: str = os.getenv("AURA_PUBLIC_BASE_URL", "http://localhost:8787").rstrip("/")

    twitch_client_id: str = os.getenv("TWITCH_CLIENT_ID", "")
    twitch_client_secret: str = os.getenv("TWITCH_CLIENT_SECRET", "")
    twitch_redirect_uri: str = os.getenv(
        "TWITCH_REDIRECT_URI", "http://localhost:8787/auth/callback"
    )
    twitch_broadcaster_login: str = os.getenv("TWITCH_BROADCASTER_LOGIN", "sansahd").lower()
    twitch_bot_login: str = os.getenv("TWITCH_BOT_LOGIN", "mairaiy").lower()

    ai_mode: str = os.getenv("AI_MODE", "off").lower()
    ai_base_url: str = os.getenv("AI_BASE_URL", "http://localhost:11434").rstrip("/")
    ai_model: str = os.getenv("AI_MODEL", "gemma3:12b")
    ai_api_key: str = os.getenv("AI_API_KEY", "")
    ai_spontaneous_enabled: bool = _bool("AI_SPONTANEOUS_ENABLED", False)
    ai_spontaneous_chance: float = _float("AI_SPONTANEOUS_CHANCE", 0.02)
    ai_cooldown_seconds: int = _int("AI_COOLDOWN_SECONDS", 35)
    ai_timeout_seconds: int = _int("AI_TIMEOUT_SECONDS", 120)
    ai_request_timeout_seconds: int = _int("AI_REQUEST_TIMEOUT_SECONDS", 45)
    ai_warmup_timeout_seconds: int = _int("AI_WARMUP_TIMEOUT_SECONDS", 20)
    ai_failure_cooldown_seconds: int = _int("AI_FAILURE_COOLDOWN_SECONDS", 60)
    ai_fast_model: str = os.getenv("AI_FAST_MODEL", "")
    ai_auto_fast_model: bool = _bool("AI_AUTO_FAST_MODEL", True)
    ai_retry_on_timeout: bool = _bool("AI_RETRY_ON_TIMEOUT", True)
    ai_chat_max_tokens: int = _int("AI_CHAT_MAX_TOKENS", 90)
    ai_context_messages: int = _int("AI_CONTEXT_MESSAGES", 4)
    ai_context_window: int = _int("AI_CONTEXT_WINDOW", 4096)
    ai_keep_alive: str = os.getenv("AI_KEEP_ALIVE", "30m")
    ai_temperature: float = _float("AI_TEMPERATURE", 0.78)
    ai_warmup_enabled: bool = _bool("AI_WARMUP_ENABLED", True)

    obs_enabled: bool = _bool("OBS_ENABLED", False)
    obs_host: str = os.getenv("OBS_HOST", "127.0.0.1")
    obs_port: int = _int("OBS_PORT", 4455)
    obs_password: str = os.getenv("OBS_PASSWORD", "")

    youtube_api_key: str = os.getenv("YOUTUBE_API_KEY", "")
    media_dir: Path = _runtime_path("MEDIA_DIR", "data/media")

    database_path: Path = _runtime_path("DATABASE_PATH", "data/aura_live.db")
    identity_path: Path = BASE_DIR / "config" / "aura_identity.json"
    log_level: str = os.getenv("LOG_LEVEL", "INFO").upper()

    @property
    def twitch_configured(self) -> bool:
        return bool(self.twitch_client_id and self.twitch_client_secret)


settings = Settings()
