from __future__ import annotations

import asyncio
import logging
import os
import signal
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from .contracts import EmptyRuntimeHost
from .worker import AuraRuntimeWorker

logger = logging.getLogger(__name__)


def _bool_env(name: str, default: bool = False) -> bool:
    raw = str(os.getenv(name, "")).strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def settings_from_env() -> Any:
    return SimpleNamespace(
        aura_cloud_worker_enabled=_bool_env("AURA_CLOUD_WORKER_ENABLED", True),
        aura_cloud_base_url=str(os.getenv("AURA_CLOUD_BASE_URL", "")).strip(),
        aura_cloud_token=str(os.getenv("AURA_CLOUD_TOKEN", "")).strip(),
        aura_cloud_worker_poll_seconds=float(os.getenv("AURA_CLOUD_WORKER_POLL_SECONDS", "1.5") or 1.5),
        aura_cloud_worker_heartbeat_seconds=int(os.getenv("AURA_CLOUD_WORKER_HEARTBEAT_SECONDS", "15") or 15),
        aura_cloud_worker_timeout_seconds=int(os.getenv("AURA_CLOUD_WORKER_TIMEOUT_SECONDS", "95") or 95),
        aura_compute_mesh_consent=_bool_env("AURA_COMPUTE_MESH_CONSENT", False),
        aura_compute_mesh_identity_file=Path(
            os.getenv("AURA_COMPUTE_MESH_IDENTITY_FILE", "data/aura-runtime-node-id")
        ),
        ai_model=str(os.getenv("AURA_RUNTIME_MODEL", "")).strip(),
        ai_constellation_moa_enabled=False,
        image_default_width=1024,
        image_default_height=1024,
        image_default_steps=8,
    )


async def run() -> None:
    logging.basicConfig(
        level=os.getenv("AURA_RUNTIME_LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    runtime = AuraRuntimeWorker(
        EmptyRuntimeHost(),
        settings_from_env(),
        host_product="",
        packaging="standalone-daemon",
    )

    if not runtime.enabled:
        raise RuntimeError(
            "AURA Runtime standalone nécessite AURA_CLOUD_BASE_URL et AURA_CLOUD_TOKEN"
        )

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except (NotImplementedError, RuntimeError):
            pass

    await runtime.start()
    logger.info("AURA Runtime standalone démarré: %s", runtime.worker_id)
    try:
        await stop.wait()
    finally:
        await runtime.close()
        logger.info("AURA Runtime standalone arrêté")


def main() -> None:
    asyncio.run(run())
