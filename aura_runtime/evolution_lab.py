from __future__ import annotations

import asyncio
import json
import sqlite3
import urllib.error
import urllib.request
from pathlib import Path
from types import SimpleNamespace
from typing import Any


_GITHUB_API = 'https://api.github.com'
_DENIED_PATCH_TOKENS = {
    'os.system(', 'subprocess.popen(', 'subprocess.run(', 'eval(', 'exec(',
    '__import__(', 'ctypes.', 'winreg.', 'shutil.rmtree(', 'socket.socket(',
    'node:child_process', 'child_process', 'process.env', 'node:fs',
    'node:https', 'node:http',
}


class RuntimeSQLite:
    def __init__(self, path: Path):
        self.path = Path(path)

    def _connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path, timeout=20)
        connection.row_factory = sqlite3.Row
        return connection

    async def executescript(self, script: str) -> None:
        def run() -> None:
            with self._connect() as connection:
                connection.executescript(script)
        await asyncio.to_thread(run)

    async def execute(self, sql: str, params: tuple[Any, ...] = ()) -> None:
        def run() -> None:
            with self._connect() as connection:
                connection.execute(sql, params)
                connection.commit()
        await asyncio.to_thread(run)


class RuntimeAutomation:
    async def dispatch(self, event: str, payload: dict[str, Any], *, source: str = '') -> dict[str, Any]:
        return {'event': event, 'payload': payload, 'source': source, 'dispatched': False}


class RuntimeFleetLab:
    """Minimal persistent Evolution host for standalone AURA Runtime.

    It supplies Evolution Fleet with exactly the interfaces it needs: local AI,
    GitHub, conservative patch scanning, cycle persistence and event recording.
    """

    VERSION = 'aura-runtime-fleet-lab-v1'

    def __init__(self, host: Any, settings: Any):
        self.aura = host
        self.settings = settings
        data_dir = Path(getattr(settings, 'aura_runtime_data_dir', Path.home() / '.aura-runtime'))
        self.db = RuntimeSQLite(data_dir / 'evolution.sqlite3')
        self.automation = RuntimeAutomation()
        self._initialized = False

    @property
    def github_repository(self) -> str:
        return str(getattr(self.settings, 'evolution_github_repository', 'XDSawyerLoL/Auralive') or 'XDSawyerLoL/Auralive')

    @property
    def github_token(self) -> str:
        return str(getattr(self.settings, 'evolution_github_token', '') or '').strip()

    @property
    def auto_submit(self) -> bool:
        return bool(getattr(self.settings, 'evolution_auto_submit', True))

    async def initialize(self) -> None:
        if self._initialized:
            return
        await self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS aura_evolution_cycles (
                id TEXT PRIMARY KEY,
                trigger TEXT NOT NULL,
                objective TEXT NOT NULL,
                status TEXT NOT NULL,
                research TEXT NOT NULL DEFAULT '{}',
                diagnosis TEXT NOT NULL DEFAULT '{}',
                candidate TEXT NOT NULL DEFAULT '{}',
                validation TEXT NOT NULL DEFAULT '{}',
                promotion TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_runtime_evolution_status
            ON aura_evolution_cycles(status, updated_at DESC);
            """
        )
        self._initialized = True

    async def _set_cycle(self, cycle_id: str, *, status: str, **fields: Any) -> None:
        await self.initialize()
        allowed = {'research', 'diagnosis', 'candidate', 'validation', 'promotion'}
        assignments = ['status=?', 'updated_at=?']
        from datetime import datetime, timezone
        params: list[Any] = [str(status)[:80], datetime.now(timezone.utc).isoformat()]
        for key, value in fields.items():
            if key not in allowed:
                continue
            assignments.append(f'{key}=?')
            params.append(json.dumps(value or {}, ensure_ascii=False, default=str)[:200000])
        params.append(str(cycle_id))
        await self.db.execute(
            f"UPDATE aura_evolution_cycles SET {','.join(assignments)} WHERE id=?",
            tuple(params),
        )

    def _scan_patch(self, before: str, after: str, *, auto: bool) -> list[str]:
        if not auto:
            return []
        issues: list[str] = []
        lower_before = str(before or '').casefold()
        lower_after = str(after or '').casefold()
        for token in _DENIED_PATCH_TOKENS:
            if token in lower_after and token not in lower_before:
                issues.append(f'nouvelle primitive sensible interdite: {token}')
        if len(str(after or '')) > 28_000:
            issues.append('remplacement trop volumineux pour une promotion automatique')
        return issues

    def _github_request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> Any:
        if not self.github_token:
            raise RuntimeError('AURA_RUNTIME_GITHUB_TOKEN absent')
        route = str(path or '')
        if not route.startswith('/repos/'):
            raise RuntimeError('Route GitHub Fleet hors périmètre')
        data = json.dumps(payload).encode('utf-8') if payload is not None else None
        request = urllib.request.Request(
            f'{_GITHUB_API}{route}',
            data=data,
            method=str(method or 'GET').upper(),
            headers={
                'Accept': 'application/vnd.github+json',
                'Authorization': f'Bearer {self.github_token}',
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json',
                'User-Agent': f'AURA-Runtime-Evolution/{self.VERSION}',
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=20.0) as response:
                raw = response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode('utf-8', errors='replace')[:3000]
            raise RuntimeError(f'GitHub {exc.code}: {detail}') from exc
        return json.loads(raw.decode('utf-8', errors='replace')) if raw else {}

    async def _next_objective(self) -> str:
        return 'Maintenir les produits Quantic par des changements minimaux, réversibles et vérifiables.'

    async def run_cycle(self, objective: str, *, trigger: str = 'aura-runtime', submit: bool | None = None) -> dict[str, Any]:
        return {
            'status': 'cloud-native-evolution-required',
            'objective': str(objective or '')[:8000],
            'trigger': str(trigger or 'aura-runtime')[:80],
            'reason': 'L’évolution native du dépôt AURA reste gérée par le noyau Cloud; le Runtime standalone gère Fleet pour les produits enfants.',
        }
