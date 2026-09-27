from __future__ import annotations

import asyncio
import ipaddress
import json
import os
import platform
import socket
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import aiohttp

from .open_capabilities import OpenCapabilities


_ACTIONS: dict[str, dict[str, str]] = {
    "system.info": {
        "title": "Inspecter le système local",
        "category": "system",
        "risk": "safe",
    },
    "fs.list": {
        "title": "Lister un répertoire autorisé",
        "category": "filesystem",
        "risk": "safe",
    },
    "fs.read": {
        "title": "Lire un fichier autorisé",
        "category": "filesystem",
        "risk": "safe",
    },
    "fs.write": {
        "title": "Écrire un fichier autorisé avec rollback",
        "category": "filesystem",
        "risk": "local-write",
    },
    "fs.mkdir": {
        "title": "Créer un répertoire autorisé",
        "category": "filesystem",
        "risk": "local-write",
    },
    "process.run": {
        "title": "Lancer une commande allowlistée sans shell",
        "category": "process",
        "risk": "process",
    },
    "http.get": {
        "title": "Lire une ressource HTTPS publique",
        "category": "network",
        "risk": "network",
    },
    "web.deep_read": {
        "title": "Lire une page Web dynamique avec Crawl4AI",
        "category": "web",
        "risk": "network",
    },
    "browser.task": {
        "title": "Piloter un navigateur local borné aux domaines autorisés",
        "category": "browser",
        "risk": "browser-control",
    },
}


def _json_object(value: str) -> dict[str, Any]:
    text = str(value or "").strip()
    fence = chr(96) * 3
    if text.startswith(fence + "json"):
        text = text[len(fence) + 4 :]
    elif text.startswith(fence):
        text = text[len(fence) :]
    if text.endswith(fence):
        text = text[: -len(fence)]
    text = text.strip()
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        return {}
    try:
        payload = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


class RuntimeOperator:
    """Typed local operator owned by AURA Runtime, not by Quantic Studio.

    The planner can only choose from a fixed capability catalogue. Every action
    is validated locally and Cloud/external models cannot expand the policy.
    """

    VERSION = "aura-runtime-operator-v1"

    def __init__(self, ai: Any, settings: Any):
        self.ai = ai
        self.settings = settings
        self.last_error = ""
        self.last_run_at = ""
        self.open_capabilities = OpenCapabilities(settings)

    @property
    def operator_allowed_risks(self) -> set[str]:
        raw = getattr(
            self.settings,
            "aura_runtime_operator_allowed_risks",
            {"safe", "ai", "network", "local-write", "process", "local-control"},
        )
        if isinstance(raw, str):
            values = raw.split(",")
        else:
            values = list(raw or [])
        return {str(item).strip().casefold() for item in values if str(item).strip()}

    @property
    def roots(self) -> list[Path]:
        values = list(getattr(self.settings, "aura_runtime_operator_roots", []) or [])
        if not values:
            values = [Path.cwd()]
        result: list[Path] = []
        for item in values:
            try:
                path = Path(item).expanduser().resolve()
            except (OSError, RuntimeError):
                continue
            if path not in result:
                result.append(path)
        return result or [Path.cwd().resolve()]

    @property
    def allowed_commands(self) -> set[str]:
        raw = getattr(
            self.settings,
            "aura_runtime_operator_commands",
            {"git", "python", "python3", "node", "npm", "npx", "pytest", "cargo"},
        )
        if isinstance(raw, str):
            values = raw.split(",")
        else:
            values = list(raw or [])
        return {str(item).strip().casefold() for item in values if str(item).strip()}

    @property
    def allowed_domains(self) -> set[str]:
        raw = getattr(self.settings, "aura_runtime_operator_domains", set())
        if isinstance(raw, str):
            values = raw.split(",")
        else:
            values = list(raw or [])
        return {str(item).strip().casefold().rstrip(".") for item in values if str(item).strip()}

    def _action_available(self, name: str) -> bool:
        if name == "web.deep_read":
            return bool(
                self.open_capabilities.deep_web_enabled
                and self.open_capabilities.crawl4ai_available
            )
        if name == "browser.task":
            return bool(
                self.open_capabilities.browser_enabled
                and self.open_capabilities.browser_use_available
            )
        return True

    def capabilities(self) -> list[dict[str, str]]:
        return [
            {"name": name, **definition}
            for name, definition in sorted(_ACTIONS.items())
            if self._action_available(name)
        ]

    def _resolve_path(self, value: str | Path) -> Path:
        raw = Path(str(value or ".")).expanduser()
        candidate = raw if raw.is_absolute() else self.roots[0] / raw
        resolved = candidate.resolve()
        if not any(resolved == root or root in resolved.parents for root in self.roots):
            raise PermissionError(f"Chemin hors workspace AURA Runtime: {resolved}")
        return resolved

    def _safe_env(self) -> dict[str, str]:
        allowed = {
            "PATH", "HOME", "USERPROFILE", "SYSTEMROOT", "WINDIR", "TEMP", "TMP",
            "LANG", "LC_ALL", "PATHEXT", "COMSPEC",
        }
        return {
            key: value
            for key, value in os.environ.items()
            if key.upper() in allowed
        }

    async def _plan(self, task: str, max_steps: int, allowed_risks: set[str]) -> dict[str, Any]:
        direct = _json_object(task)
        if isinstance(direct.get("actions"), list):
            return direct

        catalog = [
            {
                "type": name,
                "risk": meta["risk"],
                "description": meta["title"],
            }
            for name, meta in _ACTIONS.items()
            if meta["risk"] in allowed_risks and self._action_available(name)
        ]
        if not catalog:
            return {"summary": "Aucune capacité locale autorisée.", "actions": []}

        prompt = (
            "Tu pilotes AURA Runtime. Transforme la mission en un plan LOCAL minimal. "
            "Retourne UNIQUEMENT JSON: "
            '{"summary":"...","actions":[{"type":"...","path":"","content":"","command":"","args":[],"cwd":"","url":"","query":"","task":"","max_steps":4}]}. '
            f"Maximum {max_steps} actions. Utilise uniquement le catalogue fourni. "
            "N’invente jamais de shell, élévation de privilèges, secret, credential ou commande non listée. "
            "Préfère inspecter avant de modifier. Les tests/commandes de validation viennent après une écriture.\n\n"
            f"MISSION={str(task)[:8000]}\n"
            f"RISQUES_AUTORISES={sorted(allowed_risks)}\n"
            f"WORKSPACES={[str(item) for item in self.roots]}\n"
            f"CATALOGUE={json.dumps(catalog, ensure_ascii=False)}"
        )
        raw = await self.ai.generate(
            prompt,
            "Tu es le planificateur de l’opérateur local AURA Runtime. Tu ne disposes d’aucune capacité hors catalogue.",
            1400,
            system_is_complete=True,
        )
        plan = _json_object(raw)
        return plan if isinstance(plan.get("actions"), list) else {"summary": "", "actions": []}

    async def _safe_public_url(self, value: str) -> str:
        url = str(value or "").strip()
        parsed = urlparse(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise PermissionError("Seules les URLs HTTPS publiques sans credentials sont admises")
        host = parsed.hostname.casefold().rstrip(".")
        if self.allowed_domains and not any(
            host == domain or host.endswith(f".{domain}")
            for domain in self.allowed_domains
        ):
            raise PermissionError(f"Domaine réseau hors allowlist AURA Runtime: {host}")

        rows = await asyncio.to_thread(
            socket.getaddrinfo,
            host,
            parsed.port or 443,
            type=socket.SOCK_STREAM,
        )
        if not rows:
            raise PermissionError("Résolution DNS vide")
        for row in rows:
            address = row[4][0]
            ip = ipaddress.ip_address(address.split("%", 1)[0])
            if not ip.is_global:
                raise PermissionError(f"Destination réseau privée/non globale interdite: {address}")
        return url

    async def _execute_action(
        self,
        action: dict[str, Any],
        allowed_risks: set[str],
    ) -> tuple[dict[str, Any], dict[str, Any] | None]:
        kind = str(action.get("type") or "").strip()
        definition = _ACTIONS.get(kind)
        if not definition:
            raise ValueError(f"Capacité opérateur inconnue: {kind}")
        if not self._action_available(kind):
            raise RuntimeError(f"Capacité opérateur non disponible sur ce Runtime: {kind}")
        risk = definition["risk"]
        if risk not in allowed_risks:
            raise PermissionError(f"Risque {risk} non autorisé pour {kind}")

        if kind == "system.info":
            return {
                "type": kind,
                "ok": True,
                "platform": platform.platform(),
                "python": platform.python_version(),
                "cpu_count": int(os.cpu_count() or 1),
                "roots": [str(item) for item in self.roots],
            }, None

        if kind == "fs.list":
            path = self._resolve_path(action.get("path") or ".")
            if not path.is_dir():
                raise FileNotFoundError(str(path))
            rows = []
            for item in sorted(path.iterdir(), key=lambda value: value.name.casefold())[:200]:
                rows.append({
                    "name": item.name,
                    "type": "dir" if item.is_dir() else "file",
                    "size": item.stat().st_size if item.is_file() else 0,
                })
            return {"type": kind, "ok": True, "path": str(path), "items": rows}, None

        if kind == "fs.read":
            path = self._resolve_path(action.get("path") or "")
            if not path.is_file():
                raise FileNotFoundError(str(path))
            limit = int(getattr(self.settings, "aura_runtime_operator_max_file_bytes", 200_000))
            if path.stat().st_size > limit:
                raise ValueError(f"Fichier trop volumineux: {path.stat().st_size} > {limit}")
            text = await asyncio.to_thread(path.read_text, encoding="utf-8")
            return {"type": kind, "ok": True, "path": str(path), "content": text}, None

        if kind == "fs.write":
            path = self._resolve_path(action.get("path") or "")
            content = str(action.get("content") or "")
            encoded = content.encode("utf-8")
            limit = int(getattr(self.settings, "aura_runtime_operator_max_file_bytes", 200_000))
            if len(encoded) > limit:
                raise ValueError(f"Écriture trop volumineuse: {len(encoded)} > {limit}")
            existed = path.exists()
            previous = b""
            if existed:
                if not path.is_file():
                    raise IsADirectoryError(str(path))
                if path.stat().st_size > limit:
                    raise ValueError("Fichier existant trop volumineux pour rollback sûr")
                previous = await asyncio.to_thread(path.read_bytes)
            path.parent.mkdir(parents=True, exist_ok=True)
            temp = path.with_name(f".{path.name}.aura-{uuid.uuid4().hex[:8]}.tmp")
            await asyncio.to_thread(temp.write_bytes, encoded)
            await asyncio.to_thread(temp.replace, path)
            rollback = {
                "type": "fs.write",
                "path": str(path),
                "existed": existed,
                "previous_hex": previous.hex(),
            }
            return {
                "type": kind,
                "ok": True,
                "path": str(path),
                "bytes": len(encoded),
                "rollback_available": True,
            }, rollback

        if kind == "fs.mkdir":
            path = self._resolve_path(action.get("path") or "")
            existed = path.exists()
            path.mkdir(parents=True, exist_ok=True)
            return {
                "type": kind,
                "ok": True,
                "path": str(path),
                "created": not existed,
            }, {"type": "fs.mkdir", "path": str(path), "created": not existed}

        if kind == "process.run":
            command = str(action.get("command") or "").strip()
            command_name = Path(command).name.casefold()
            if command_name.endswith(".exe"):
                command_name = command_name[:-4]
            if command_name not in self.allowed_commands:
                raise PermissionError(f"Commande hors allowlist AURA Runtime: {command}")
            args = [str(item) for item in list(action.get("args") or [])[:64]]
            if any(
                not item
                or len(item) > 2000
                or "\x00" in item
                or "\n" in item
                or "\r" in item
                for item in args
            ):
                raise ValueError("Argument process invalide")
            cwd = self._resolve_path(action.get("cwd") or ".")
            if not cwd.is_dir():
                raise FileNotFoundError(str(cwd))
            process = await asyncio.create_subprocess_exec(
                command,
                *args,
                cwd=str(cwd),
                env=self._safe_env(),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            timeout = int(getattr(self.settings, "aura_runtime_operator_process_timeout_seconds", 90))
            try:
                stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=max(5, timeout))
            except TimeoutError:
                process.kill()
                await process.communicate()
                raise RuntimeError(f"Commande expirée après {timeout}s") from None
            result = {
                "type": kind,
                "ok": process.returncode == 0,
                "command": command_name,
                "returncode": int(process.returncode or 0),
                "stdout": stdout.decode("utf-8", errors="replace")[-20_000:],
                "stderr": stderr.decode("utf-8", errors="replace")[-20_000:],
            }
            if process.returncode != 0:
                raise RuntimeError(
                    f"Commande {command_name} en échec ({process.returncode}): "
                    f"{result['stderr'][-2000:]}"
                )
            return result, None

        if kind == "http.get":
            url = await self._safe_public_url(str(action.get("url") or ""))
            timeout = aiohttp.ClientTimeout(
                total=int(getattr(self.settings, "aura_runtime_operator_http_timeout_seconds", 20))
            )
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(
                    url,
                    allow_redirects=False,
                    headers={"User-Agent": f"AURA-Runtime-Operator/{self.VERSION}"},
                ) as response:
                    content_type = str(response.headers.get("content-type") or "").lower()
                    if response.status >= 400:
                        raise RuntimeError(f"HTTP {response.status}")
                    if not any(token in content_type for token in ("text/", "json", "xml", "javascript")):
                        raise RuntimeError(f"Type de contenu réseau non textuel refusé: {content_type}")
                    raw = await response.content.read(200_001)
                    if len(raw) > 200_000:
                        raise RuntimeError("Réponse réseau trop volumineuse")
                    return {
                        "type": kind,
                        "ok": True,
                        "url": url,
                        "status": response.status,
                        "content_type": content_type[:200],
                        "text": raw.decode("utf-8", errors="replace"),
                    }, None

        if kind == "web.deep_read":
            url = await self._safe_public_url(str(action.get("url") or ""))
            result = await self.open_capabilities.deep_read(
                url,
                query=str(action.get("query") or ""),
            )
            return {"type": kind, **result}, None

        if kind == "browser.task":
            result = await self.open_capabilities.browser_task(
                str(action.get("task") or ""),
                allowed_domains=self.allowed_domains,
                model=str(getattr(self.settings, "ai_model", "") or ""),
                ollama_url=str(
                    getattr(
                        self.settings,
                        "aura_runtime_ollama_url",
                        getattr(self.settings, "ai_base_url", ""),
                    )
                    or ""
                ),
                max_steps=max(
                    1,
                    min(
                        int(
                            action.get("max_steps")
                            or getattr(self.settings, "aura_runtime_browser_max_steps", 5)
                        ),
                        8,
                    ),
                ),
            )
            return {"type": kind, **result}, None

        raise ValueError(f"Capacité non implémentée: {kind}")

    async def _rollback(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for rollback in reversed(rows):
            try:
                kind = rollback.get("type")
                path = self._resolve_path(rollback.get("path") or "")
                if kind == "fs.write":
                    if rollback.get("existed"):
                        data = bytes.fromhex(str(rollback.get("previous_hex") or ""))
                        await asyncio.to_thread(path.write_bytes, data)
                    elif path.exists():
                        await asyncio.to_thread(path.unlink)
                elif kind == "fs.mkdir" and rollback.get("created") and path.exists():
                    await asyncio.to_thread(path.rmdir)
                else:
                    continue
                results.append({"type": kind, "path": str(path), "ok": True})
            except Exception as exc:  # noqa: BLE001
                results.append({
                    "type": str(rollback.get("type") or ""),
                    "path": str(rollback.get("path") or ""),
                    "ok": False,
                    "error": f"{exc.__class__.__name__}: {exc}"[:1000],
                })
        return results

    async def operate(
        self,
        task: str,
        max_steps: int = 6,
        requested_risks: set[str] | None = None,
        source: str = "aura-runtime",
    ) -> dict[str, Any]:
        configured = self.operator_allowed_risks
        requested = {
            str(item).strip().casefold()
            for item in (requested_risks or configured)
            if str(item).strip()
        }
        allowed = configured.intersection(requested)
        steps_limit = max(1, min(int(max_steps or 6), 8))
        plan = await self._plan(str(task or ""), steps_limit, allowed)
        actions = [
            item for item in list(plan.get("actions") or [])[:steps_limit]
            if isinstance(item, dict)
        ]
        if not actions:
            return {
                "executed": False,
                "status": "not-executed",
                "reason": "Aucune action opérateur sûre proposée.",
                "summary": str(plan.get("summary") or "")[:2000],
                "allowed_risks": sorted(allowed),
                "source": source,
            }

        reports: list[dict[str, Any]] = []
        rollback_stack: list[dict[str, Any]] = []
        try:
            for action in actions:
                report, rollback = await self._execute_action(action, allowed)
                reports.append(report)
                if rollback:
                    rollback_stack.append(rollback)
            self.last_error = ""
            self.last_run_at = __import__("datetime").datetime.now(
                __import__("datetime").timezone.utc
            ).isoformat()
            return {
                "executed": True,
                "status": "completed",
                "summary": str(plan.get("summary") or "")[:2000],
                "steps": reports,
                "allowed_risks": sorted(allowed),
                "rollback_available": bool(rollback_stack),
                "source": source,
            }
        except Exception as exc:  # noqa: BLE001
            self.last_error = f"{exc.__class__.__name__}: {exc}"[:2000]
            rollback_results = await self._rollback(rollback_stack) if rollback_stack else []
            return {
                "executed": False,
                "status": "error",
                "error": self.last_error,
                "summary": str(plan.get("summary") or "")[:2000],
                "steps": reports,
                "rollback": rollback_results,
                "allowed_risks": sorted(allowed),
                "source": source,
            }
