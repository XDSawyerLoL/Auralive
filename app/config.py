from __future__ import annotations

import json
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


def _local_obs_websocket_config() -> dict[str, object]:
    if not _bool("OBS_DISCOVER_LOCAL", True):
        return {}
    candidates: list[Path] = []
    appdata = os.getenv("APPDATA")
    if appdata:
        candidates.append(Path(appdata) / "obs-studio" / "plugin_config" / "obs-websocket" / "config.json")
    candidates.append(Path.home() / "AppData" / "Roaming" / "obs-studio" / "plugin_config" / "obs-websocket" / "config.json")
    for path in candidates:
        try:
            if path.is_file():
                payload = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(payload, dict):
                    return payload
        except Exception:
            continue
    return {}


_OBS_LOCAL = _local_obs_websocket_config()
_OBS_DISCOVERED_PORT = int(_OBS_LOCAL.get("server_port") or 4455)
_OBS_DISCOVERED_PASSWORD = str(_OBS_LOCAL.get("server_password") or "")


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
    ai_constellation_enabled: bool = _bool("AI_CONSTELLATION_ENABLED", True)
    ai_constellation_multi_review: bool = _bool("AI_CONSTELLATION_MULTI_REVIEW", True)
    ai_constellation_review_min_tokens: int = _int("AI_CONSTELLATION_REVIEW_MIN_TOKENS", 220)
    ai_constellation_max_models: int = _int("AI_CONSTELLATION_MAX_MODELS", 3)
    ai_moa_enabled: bool = _bool("AI_MOA_ENABLED", True)
    ai_moa_min_models: int = _int("AI_MOA_MIN_MODELS", 2)
    ai_moa_max_models: int = _int("AI_MOA_MAX_MODELS", 3)

    vector_memory_enabled: bool = _bool("AURA_VECTOR_MEMORY_ENABLED", True)
    vector_embedding_model: str = os.getenv("AURA_VECTOR_EMBEDDING_MODEL", "embeddinggemma").strip()
    vector_dimensions: int = _int("AURA_VECTOR_DIMENSIONS", 768)
    vector_sync_seconds: int = _int("AURA_VECTOR_SYNC_SECONDS", 45)
    vector_top_k: int = _int("AURA_VECTOR_TOP_K", 6)
    vector_memory_path: Path = _runtime_path("AURA_VECTOR_MEMORY_PATH", "data/aura_vector.db")

    # Génération d'images locale. "auto" essaie A1111 puis ComfyUI.
    image_mode: str = os.getenv("AURA_IMAGE_MODE", "auto").strip().lower()
    image_a1111_url: str = os.getenv("AURA_IMAGE_A1111_URL", "http://127.0.0.1:7860").rstrip("/")
    image_comfy_url: str = os.getenv("AURA_IMAGE_COMFY_URL", "http://127.0.0.1:8188").rstrip("/")
    image_output_dir: Path = _runtime_path("AURA_IMAGE_OUTPUT_DIR", "data/generated-images")
    image_default_width: int = _int("AURA_IMAGE_WIDTH", 1024)
    image_default_height: int = _int("AURA_IMAGE_HEIGHT", 1024)
    image_default_steps: int = _int("AURA_IMAGE_STEPS", 8)
    image_default_model: str = os.getenv("AURA_IMAGE_MODEL", "FLUX.1-schnell").strip()
    image_comfy_workflow: Path = _runtime_path("AURA_IMAGE_COMFY_WORKFLOW", "config/comfyui-aura-workflow.json")

    # Fusion cognitive AURA <-> HORIZON. Le pont reste optionnel et non bloquant :
    # AURA continue de fonctionner localement même si HORIZON est indisponible.
    horizon_enabled: bool = _bool("HORIZON_ENABLED", False)
    horizon_base_url: str = os.getenv("HORIZON_BASE_URL", "").rstrip("/")
    horizon_api_key: str = os.getenv("HORIZON_API_KEY", "")
    horizon_external_id: str = os.getenv("HORIZON_EXTERNAL_ID", "aura-local").strip()
    horizon_poll_seconds: int = _int("HORIZON_POLL_SECONDS", 60)
    horizon_request_timeout_seconds: int = _int("HORIZON_REQUEST_TIMEOUT_SECONDS", 8)
    horizon_event_limit: int = _int("HORIZON_EVENT_LIMIT", 100)
    horizon_candidate_limit: int = _int("HORIZON_CANDIDATE_LIMIT", 100)
    horizon_forecast_limit: int = _int("HORIZON_FORECAST_LIMIT", 100)
    horizon_ai_context_signals: int = _int("HORIZON_AI_CONTEXT_SIGNALS", 10)
    horizon_country: str = os.getenv("HORIZON_COUNTRY", "FR").upper()
    horizon_currency: str = os.getenv("HORIZON_CURRENCY", "EUR").upper()
    horizon_timezone: str = os.getenv("HORIZON_TIMEZONE", "Europe/Paris")

    # Noyau unifié AURA: Soul persistant, réflexion ambient, apprentissage par
    # résultats, routines et agents spécialisés. AURA_CLOUD_TOKEN protège les
    # commandes privées lorsque le même noyau est exposé sur un serveur.
    cognitive_enabled: bool = _bool("AURA_COGNITIVE_ENABLED", True)
    cognitive_tick_seconds: int = _int("AURA_COGNITIVE_TICK_SECONDS", 30)
    cognitive_reflection_seconds: int = _int("AURA_COGNITIVE_REFLECTION_SECONDS", 300)
    cognitive_max_reflections_per_hour: int = _int("AURA_COGNITIVE_MAX_REFLECTIONS_PER_HOUR", 6)
    aura_cloud_token: str = os.getenv("AURA_CLOUD_TOKEN", "")
    aura_cloud_base_url: str = os.getenv(
        "AURA_CLOUD_BASE_URL",
        "https://antiquewhite-dolphin-780448.hostingersite.com",
    ).rstrip("/")
    aura_cloud_worker_enabled: bool = _bool("AURA_CLOUD_WORKER_ENABLED", True)
    aura_cloud_worker_poll_seconds: float = _float("AURA_CLOUD_WORKER_POLL_SECONDS", 1.5)
    aura_cloud_worker_heartbeat_seconds: int = _int("AURA_CLOUD_WORKER_HEARTBEAT_SECONDS", 15)
    aura_cloud_worker_timeout_seconds: int = _int("AURA_CLOUD_WORKER_TIMEOUT_SECONDS", 95)
    aura_compute_mesh_consent: bool = _bool("AURA_COMPUTE_MESH_CONSENT", False)
    aura_compute_mesh_identity_file: Path = _runtime_path(
        "AURA_COMPUTE_MESH_IDENTITY_FILE",
        "data/compute-mesh-node-id",
    )

    # Mode Sovereign : toutes les familles d'actions déjà enregistrées peuvent
    # être planifiées. Les garde-fous internes restent actifs : programmes
    # explicitement autorisés, HORIZON épistémique, rollbacks et journaux.
    cognitive_operator_allowed_risks: str = os.getenv(
        "AURA_COGNITIVE_OPERATOR_ALLOWED_RISKS",
        "safe,ai,network,local-write,process,twitch-write,obs-write,moderation,local-control",
    )

    # AURA Evolution peut proposer, tester et soumettre ses améliorations.
    # L'auto-merge reste conditionné aux checks CI et au canary indépendant.
    evolution_enabled: bool = _bool("AURA_EVOLUTION_ENABLED", True)
    evolution_interval_seconds: int = _int("AURA_EVOLUTION_INTERVAL_SECONDS", 21600)
    evolution_auto_submit: bool = _bool("AURA_EVOLUTION_AUTO_SUBMIT", True)
    evolution_auto_merge: bool = _bool("AURA_EVOLUTION_AUTO_MERGE", True)
    evolution_github_token: str = (
        os.getenv("AURA_EVOLUTION_GITHUB_MACHINE_TOKEN")
        or os.getenv("AURA_EVOLUTION_GITHUB_TOKEN", "")
    )
    evolution_github_repository: str = os.getenv(
        "AURA_EVOLUTION_GITHUB_REPOSITORY", "XDSawyerLoL/Auralive"
    )
    evolution_github_base_branch: str = os.getenv("AURA_EVOLUTION_GITHUB_BASE_BRANCH", "main")
    evolution_allowed_domains: str = os.getenv(
        "AURA_EVOLUTION_ALLOWED_DOMAINS", "api.github.com,pypi.org"
    )
    evolution_research_urls: str = os.getenv("AURA_EVOLUTION_RESEARCH_URLS", "")

    evolution_required_checks: str = os.getenv(
        "AURA_EVOLUTION_REQUIRED_CHECKS",
        "gate-node-cloud,gate-python-core,gate-rust-core,gate-fabric-rust,gate-windows-smoke",
    )
    # Le canary est un troisième sas indépendant de la CI. Le jeton dédié
    # empêche le noyau AURA d'approuver lui-même sa propre évolution distante.
    evolution_canary_required: bool = _bool("AURA_EVOLUTION_CANARY_REQUIRED", True)
    evolution_canary_mode: str = os.getenv("AURA_EVOLUTION_CANARY_MODE", "automatic").strip().lower()
    evolution_canary_token: str = os.getenv("AURA_EVOLUTION_CANARY_TOKEN", "")
    evolution_canary_min_observations: int = _int(
        "AURA_EVOLUTION_CANARY_MIN_OBSERVATIONS", 3
    )

    obs_auto_connect: bool = _bool("OBS_AUTO_CONNECT", True)
    obs_enabled: bool = _bool("OBS_ENABLED", False) or _bool("OBS_AUTO_CONNECT", True)
    obs_host: str = os.getenv("OBS_HOST", "127.0.0.1")
    obs_port: int = _int("OBS_PORT", _OBS_DISCOVERED_PORT)
    obs_password: str = os.getenv("OBS_PASSWORD") or _OBS_DISCOVERED_PASSWORD

    # Backend de diffusion: "obs" conserve le comportement historique.
    # "native" active Quantic Studio Core, le moteur Rust local intégré.
    broadcast_engine: str = os.getenv("AURA_BROADCAST_ENGINE", "native").strip().lower()
    native_engine_autostart: bool = _bool("AURA_NATIVE_ENGINE_AUTOSTART", True)
    native_engine_exe: str = os.getenv("AURA_NATIVE_ENGINE_EXE", "").strip()

    youtube_api_key: str = os.getenv("YOUTUBE_API_KEY", "")
    media_dir: Path = _runtime_path("MEDIA_DIR", "data/media")

    database_path: Path = _runtime_path("DATABASE_PATH", "data/aura_live.db")
    identity_path: Path = BASE_DIR / "config" / "aura_identity.json"
    log_level: str = os.getenv("LOG_LEVEL", "INFO").upper()

    @property
    def twitch_configured(self) -> bool:
        return bool(self.twitch_client_id and self.twitch_client_secret)


settings = Settings()
