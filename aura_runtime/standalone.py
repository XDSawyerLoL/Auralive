from __future__ import annotations

import asyncio
import os
import signal
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import aiohttp

from .evolution_fleet import EvolutionFleet
from .evolution_lab import RuntimeFleetLab
from .operator import RuntimeOperator
from .worker import AuraRuntimeWorker


def _bool(name: str, default: bool = False) -> bool:
    raw = str(os.getenv(name, '1' if default else '0')).strip().casefold()
    return raw in {'1', 'true', 'yes', 'on'}


def _int(name: str, default: int) -> int:
    try:
        return int(str(os.getenv(name, default)).strip())
    except Exception:
        return default


def _list(name: str, default: str = '') -> list[str]:
    raw = str(os.getenv(name, default) or '').strip()
    if not raw:
        return []
    separator = ';' if ';' in raw else ','
    return [item.strip() for item in raw.split(separator) if item.strip()]


def runtime_settings_from_env() -> SimpleNamespace:
    return SimpleNamespace(
        aura_cloud_worker_enabled=True,
        aura_cloud_base_url=str(os.getenv('AURA_CLOUD_BASE_URL', '')).strip(),
        aura_cloud_token=str(os.getenv('AURA_CLOUD_TOKEN', '')).strip(),
        aura_cloud_worker_poll_seconds=max(0.5, float(os.getenv('AURA_RUNTIME_POLL_SECONDS', '1.5'))),
        aura_cloud_worker_heartbeat_seconds=max(5, _int('AURA_RUNTIME_HEARTBEAT_SECONDS', 15)),
        aura_cloud_worker_timeout_seconds=max(15, _int('AURA_RUNTIME_TIMEOUT_SECONDS', 95)),
        aura_compute_mesh_consent=_bool('AURA_COMPUTE_MESH_CONSENT', False),
        aura_compute_mesh_identity_file=Path(
            os.getenv('AURA_RUNTIME_IDENTITY_FILE', str(Path.home() / '.aura-runtime' / 'node-id'))
        ),
        ai_model=str(os.getenv('AURA_RUNTIME_MODEL', 'qwen3:8b')).strip(),
        ai_constellation_moa_enabled=_bool('AURA_RUNTIME_MOA_ENABLED', False),
        image_default_width=1024,
        image_default_height=1024,
        image_default_steps=8,
        aura_runtime_ollama_url=str(os.getenv('AURA_RUNTIME_OLLAMA_URL', 'http://127.0.0.1:11434')).rstrip('/'),
        aura_runtime_data_dir=Path(
            os.getenv('AURA_RUNTIME_DATA_DIR', str(Path.home() / '.aura-runtime'))
        ),
        evolution_github_repository=str(
            os.getenv('AURA_RUNTIME_GITHUB_REPOSITORY', 'XDSawyerLoL/Auralive')
        ).strip(),
        evolution_github_allowed_repositories=str(
            os.getenv(
                'AURA_RUNTIME_GITHUB_ALLOWED_REPOSITORIES',
                'XDSawyerLoL/Auralive,XDSawyerLoL/QuanticSillage,XDSawyerLoL/QuanticMail,'
                'XDSawyerLoL/QUANTIC-OS,XDSawyerLoL/Quantic-Browser,XDSawyerLoL/Human-Agency-Engine',
            )
        ).strip(),
        evolution_github_token=str(os.getenv('AURA_RUNTIME_GITHUB_TOKEN', '')).strip(),
        evolution_auto_submit=_bool('AURA_RUNTIME_EVOLUTION_AUTO_SUBMIT', True),
        aura_runtime_operator_roots=[
            Path(item).expanduser()
            for item in _list('AURA_RUNTIME_OPERATOR_ROOTS', os.getcwd())
        ],
        aura_runtime_operator_allowed_risks=set(
            _list(
                'AURA_RUNTIME_OPERATOR_ALLOWED_RISKS',
                'safe,ai,network,local-write,process,local-control',
            )
        ),
        aura_runtime_operator_commands=set(
            _list(
                'AURA_RUNTIME_OPERATOR_COMMANDS',
                'git,python,python3,node,npm,npx,pytest,cargo',
            )
        ),
        aura_runtime_operator_domains=set(_list('AURA_RUNTIME_OPERATOR_DOMAINS', '')),
        aura_runtime_operator_max_file_bytes=max(
            1_000,
            _int('AURA_RUNTIME_OPERATOR_MAX_FILE_BYTES', 200_000),
        ),
        aura_runtime_operator_process_timeout_seconds=max(
            5,
            _int('AURA_RUNTIME_OPERATOR_PROCESS_TIMEOUT_SECONDS', 90),
        ),
        aura_runtime_operator_http_timeout_seconds=max(
            5,
            _int('AURA_RUNTIME_OPERATOR_HTTP_TIMEOUT_SECONDS', 20),
        ),
    )


class StandaloneOllamaAI:
    def __init__(self, settings: Any):
        self.settings = settings
        self.active_model = str(settings.ai_model or '').strip()
        self.enabled = bool(self.active_model)
        self.constellation = SimpleNamespace(
            installed=[{'name': self.active_model}] if self.active_model else []
        )

    def diagnostic(self) -> dict[str, Any]:
        return {
            'mode': 'ollama-standalone',
            'runtime_model': self.active_model,
            'endpoint': self.settings.aura_runtime_ollama_url,
            'enabled': self.enabled,
            'runtime_role': 'aura-runtime',
        }

    async def generate(
        self,
        prompt: str,
        system_instruction: str = '',
        max_tokens: int = 700,
        *,
        system_is_complete: bool = False,
        task_role: str = 'auto',
        preferred_model: str = '',
    ) -> str:
        if not self.enabled:
            raise RuntimeError('Aucun modèle local configuré pour AURA Runtime')
        model = str(preferred_model or self.active_model).strip()
        messages: list[dict[str, str]] = []
        system = str(system_instruction or '').strip()
        if system:
            messages.append({'role': 'system', 'content': system})
        messages.append({'role': 'user', 'content': str(prompt or '')})
        timeout = aiohttp.ClientTimeout(total=max(30, int(self.settings.aura_cloud_worker_timeout_seconds)))
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                f"{self.settings.aura_runtime_ollama_url}/api/chat",
                json={
                    'model': model,
                    'messages': messages,
                    'stream': False,
                    'options': {'num_predict': max(64, min(int(max_tokens or 700), 8000))},
                },
            ) as response:
                body = await response.json(content_type=None)
                if response.status >= 400:
                    raise RuntimeError(f"Ollama HTTP {response.status}: {str(body)[:500]}")
                answer = str((body.get('message') or {}).get('content') or '').strip()
                if not answer:
                    raise RuntimeError('Ollama n’a renvoyé aucune réponse')
                return answer


class StandaloneRuntimeHost:
    def __init__(self, settings: Any):
        self.ai = StandaloneOllamaAI(settings)
        self.operator = RuntimeOperator(self.ai, settings)
        self.cognitive = None
        self.avatar_audio = None
        self.image = None
        self.evolution = RuntimeFleetLab(self, settings)


async def run_forever() -> None:
    settings = runtime_settings_from_env()
    if not settings.aura_cloud_base_url or not settings.aura_cloud_token:
        raise RuntimeError('AURA_CLOUD_BASE_URL et AURA_CLOUD_TOKEN sont requis')

    host = StandaloneRuntimeHost(settings)
    worker = AuraRuntimeWorker(
        host,
        settings,
        fleet_factory=EvolutionFleet,
        host_product='',
        runtime_packaging='standalone-service',
    )
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except (NotImplementedError, RuntimeError):
            pass

    await worker.start()
    try:
        await stop.wait()
    finally:
        await worker.close()


def main() -> None:
    asyncio.run(run_forever())
