from __future__ import annotations

import asyncio
import os
import signal
from pathlib import Path
from time import monotonic
from types import SimpleNamespace
from typing import Any

import aiohttp

from .evolution_fleet import EvolutionFleet
from .evolution_lab import RuntimeFleetLab
from .model_constellation import ModelConstellation
from .operator import RuntimeOperator
from .worker import AuraRuntimeWorker


def _load_env_file() -> None:
    """Charge un .env local sans dépendance supplémentaire.

    Priorité aux vraies variables d'environnement: le fichier ne les écrase jamais.
    Le launcher Windows se place à la racine du package, donc ./.env est le chemin
    normal; les deux chemins suivants couvrent les lancements depuis un autre cwd.
    """
    candidates = [
        Path.cwd() / '.env',
        Path(__file__).resolve().parent.parent / '.env',
        Path(__file__).resolve().parent / '.env',
    ]
    seen: set[Path] = set()
    for path in candidates:
        try:
            path = path.resolve()
        except Exception:
            continue
        if path in seen or not path.is_file():
            continue
        seen.add(path)
        try:
            for raw in path.read_text(encoding='utf-8-sig').splitlines():
                line = raw.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                key, value = line.split('=', 1)
                key = key.strip()
                value = value.strip()
                if not key or key in os.environ:
                    continue
                if (
                    len(value) >= 2
                    and value[0] == value[-1]
                    and value[0] in {'"', "'"}
                ):
                    value = value[1:-1]
                os.environ[key] = value
            return
        except Exception:
            continue


_load_env_file()


def _bool(name: str, default: bool = False) -> bool:
    raw = str(os.getenv(name, '1' if default else '0')).strip().casefold()
    return raw in {'1', 'true', 'yes', 'on'}


def _int(name: str, default: int) -> int:
    try:
        return int(str(os.getenv(name, default)).strip())
    except Exception:
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(str(os.getenv(name, default)).strip())
    except Exception:
        return default


def _list(name: str, default: str = '') -> list[str]:
    raw = str(os.getenv(name, default) or '').strip()
    if not raw:
        return []
    separator = ';' if ';' in raw else ','
    return [item.strip() for item in raw.split(separator) if item.strip()]


def runtime_settings_from_env() -> SimpleNamespace:
    data_dir = Path(
        os.getenv('AURA_RUNTIME_DATA_DIR', str(Path.home() / '.aura-runtime'))
    )
    ollama_url = str(
        os.getenv('AURA_RUNTIME_OLLAMA_URL', 'http://127.0.0.1:11434')
    ).rstrip('/')
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
        ai_mode='ollama',
        ai_base_url=ollama_url,
        ai_model=str(os.getenv('AURA_RUNTIME_MODEL', 'qwen3:8b')).strip(),
        ai_fast_model='',
        ai_constellation_moa_enabled=_bool('AURA_RUNTIME_MOA_ENABLED', True),
        ai_constellation_max_models=max(2, min(4, _int('AURA_RUNTIME_MOA_MAX_MODELS', 3))),
        ai_constellation_moa_parallel=_bool('AURA_RUNTIME_MOA_PARALLEL', False),
        ai_constellation_exploration=max(
            0.0, min(0.2, _float('AURA_RUNTIME_MODEL_EXPLORATION', 0.08))
        ),
        ai_constellation_scorecard_file=Path(
            os.getenv(
                'AURA_RUNTIME_MODEL_SCORECARD_FILE',
                str(data_dir / 'model-scorecard.json'),
            )
        ),
        image_default_width=1024,
        image_default_height=1024,
        image_default_steps=8,
        aura_runtime_ollama_url=ollama_url,
        aura_runtime_data_dir=data_dir,
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
        aura_runtime_operator_domains=set(
            _list(
                'AURA_RUNTIME_OPERATOR_DOMAINS',
                'api.github.com,github.com,pypi.org,registry.npmjs.org',
            )
        ),
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
        aura_runtime_deep_web_enabled=_bool('AURA_RUNTIME_DEEP_WEB_ENABLED', True),
        aura_runtime_deep_web_max_chars=max(
            2_000,
            min(200_000, _int('AURA_RUNTIME_DEEP_WEB_MAX_CHARS', 60_000)),
        ),
        aura_runtime_browser_enabled=_bool('AURA_RUNTIME_BROWSER_ENABLED', False),
        aura_runtime_browser_max_steps=max(
            1,
            min(8, _int('AURA_RUNTIME_BROWSER_MAX_STEPS', 5)),
        ),
    )


class StandaloneOllamaAI:
    COMPLEX_ROLES = {'reasoning', 'code', 'research', 'critic', 'security', 'evolution', 'math'}

    def __init__(self, settings: Any):
        self.settings = settings
        self.active_model = str(settings.ai_model or '').strip()
        self.enabled = bool(self.active_model)
        self.constellation = ModelConstellation(settings)
        self.session: aiohttp.ClientSession | None = None
        self.started = False
        self.last_role = 'general'
        self.last_model = self.active_model
        self.last_latency_ms = 0

    async def start(self) -> None:
        if self.started:
            return
        self.started = True
        self.session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(
                total=max(30, int(self.settings.aura_cloud_worker_timeout_seconds))
            )
        )
        await self.constellation.start(self.session)
        if self.constellation.installed:
            names = {str(item.get('name') or '') for item in self.constellation.installed}
            if self.active_model not in names:
                route = await self.constellation.choose('general')
                self.active_model = str(route.get('name') or self.active_model)

    async def close(self) -> None:
        await self.constellation.close()
        if self.session:
            await self.session.close()
            self.session = None
        self.started = False

    async def _ensure_started(self) -> None:
        if not self.started or self.session is None:
            await self.start()

    def diagnostic(self) -> dict[str, Any]:
        return {
            'mode': 'ollama-standalone',
            'runtime_model': self.active_model,
            'model': self.last_model,
            'endpoint': self.settings.aura_runtime_ollama_url,
            'enabled': self.enabled,
            'runtime_role': 'aura-runtime',
            'last_role': self.last_role,
            'last_latency_ms': self.last_latency_ms,
            'constellation_version': self.constellation.VERSION,
            'models': [str(item.get('name') or '') for item in self.constellation.installed],
            'last_route': dict(self.constellation.last_route),
            'last_ensemble': dict(self.constellation.last_ensemble),
        }

    async def _call_model(
        self,
        model: str,
        messages: list[dict[str, str]],
        max_tokens: int,
    ) -> tuple[str, int]:
        await self._ensure_started()
        assert self.session is not None
        started = monotonic()
        async with self.session.post(
            f"{self.settings.aura_runtime_ollama_url}/api/chat",
            json={
                'model': str(model or self.active_model),
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
        elapsed = round((monotonic() - started) * 1000)
        self.last_latency_ms = elapsed
        self.last_model = str(model or self.active_model)
        return answer, elapsed

    async def _single(
        self,
        messages: list[dict[str, str]],
        *,
        role: str,
        preferred_model: str,
        max_tokens: int,
    ) -> str:
        route = await self.constellation.choose(role, preferred=preferred_model)
        model = str(route.get('name') or preferred_model or self.active_model).strip()
        try:
            answer, elapsed = await self._call_model(model, messages, max_tokens)
            self.constellation.record_outcome(
                model,
                role,
                success=True,
                latency_ms=elapsed,
                source='standalone-direct',
            )
            self.active_model = model
            return answer
        except Exception:
            self.constellation.record_outcome(
                model,
                role,
                success=False,
                latency_ms=self.last_latency_ms,
                source='standalone-direct-error',
            )
            raise

    async def _moa(
        self,
        messages: list[dict[str, str]],
        *,
        role: str,
        max_tokens: int,
    ) -> str:
        count = max(2, min(int(self.settings.ai_constellation_max_models or 3), 4))
        routes = await self.constellation.choose_many(role, count=count)
        models = [str(item.get('name') or '').strip() for item in routes]
        models = [model for model in models if model]
        if len(models) < 2:
            return await self._single(
                messages,
                role=role,
                preferred_model=models[0] if models else '',
                max_tokens=max_tokens,
            )

        async def proposal(model: str) -> tuple[str, str] | BaseException:
            try:
                answer, elapsed = await self._call_model(
                    model,
                    messages,
                    min(max_tokens, 900),
                )
                self.constellation.record_outcome(
                    model,
                    role,
                    success=True,
                    latency_ms=elapsed,
                    source='standalone-moa-specialist',
                )
                return model, answer
            except Exception as exc:
                self.constellation.record_outcome(
                    model,
                    role,
                    success=False,
                    latency_ms=self.last_latency_ms,
                    source='standalone-moa-specialist-error',
                )
                return exc

        if bool(self.settings.ai_constellation_moa_parallel):
            raw = list(await asyncio.gather(*(proposal(model) for model in models)))
        else:
            raw = []
            for model in models:
                raw.append(await proposal(model))
        proposals = [
            item for item in raw
            if isinstance(item, tuple) and len(item) == 2 and str(item[1]).strip()
        ]
        if not proposals:
            raise RuntimeError('Aucun spécialiste local de la constellation n’a répondu')
        if len(proposals) == 1:
            model, answer = proposals[0]
            self.constellation.record_ensemble(
                role=role,
                models=models,
                synthesizer=model,
                successful=1,
                elapsed_ms=self.last_latency_ms,
            )
            return answer

        critic_route = await self.constellation.choose('critic', exclude=set(models))
        synthesizer = str(critic_route.get('name') or '').strip() or proposals[0][0]
        mission = '\n'.join(
            f"{item.get('role','user')}: {str(item.get('content') or '')[:6000]}"
            for item in messages[-6:]
        )
        candidates = '\n\n'.join(
            f"PROPOSITION {index + 1}\n{answer[:9000]}"
            for index, (_model, answer) in enumerate(proposals)
        )
        synthesis_messages = [
            {
                'role': 'system',
                'content': (
                    'Tu es le synthétiseur critique de la constellation AURA. '
                    'Produis uniquement la meilleure réponse finale. Corrige les contradictions, '
                    'erreurs et omissions sans mentionner le processus interne.'
                ),
            },
            {
                'role': 'user',
                'content': (
                    'MISSION\n' + mission[:16000]
                    + '\n\nPROPOSITIONS\n' + candidates[:30000]
                ),
            },
        ]
        try:
            final, elapsed = await self._call_model(
                synthesizer,
                synthesis_messages,
                min(max_tokens, 1200),
            )
            self.constellation.record_outcome(
                synthesizer,
                'critic',
                success=True,
                latency_ms=elapsed,
                source='standalone-moa-synthesizer',
            )
        except Exception:
            self.constellation.record_outcome(
                synthesizer,
                'critic',
                success=False,
                latency_ms=self.last_latency_ms,
                source='standalone-moa-synthesizer-error',
            )
            synthesizer, final = proposals[0]

        self.constellation.record_ensemble(
            role=role,
            models=models,
            synthesizer=synthesizer,
            successful=len(proposals),
            elapsed_ms=self.last_latency_ms,
        )
        self.active_model = synthesizer
        return final

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
        await self._ensure_started()
        system = str(system_instruction or '').strip()
        messages: list[dict[str, str]] = []
        if system:
            messages.append({'role': 'system', 'content': system})
        messages.append({'role': 'user', 'content': str(prompt or '')})
        role = self.constellation.infer_role(messages, explicit=task_role)
        self.last_role = role

        should_moa = bool(
            self.settings.ai_constellation_moa_enabled
            and not str(preferred_model or '').strip()
            and role in self.COMPLEX_ROLES
            and len(self.constellation.installed) >= 2
            and int(max_tokens or 0) >= 160
        )
        if should_moa:
            return await self._moa(messages, role=role, max_tokens=max_tokens)
        return await self._single(
            messages,
            role=role,
            preferred_model=str(preferred_model or '').strip(),
            max_tokens=max_tokens,
        )


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
    await host.ai.start()
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
        await host.ai.close()


def main() -> None:
    asyncio.run(run_forever())
