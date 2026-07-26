from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.database import Database, utcnow

from .models import Event


@dataclass(slots=True)
class PermissionDecision:
    allowed: bool
    risk: str
    reason: str


class AutomationPermissionPolicy:
    """Politique locale pour les blocs capables d'agir sur le PC ou la chaîne.

    Aura Live reste puissant, mais une automatisation importée ne peut pas lancer
    silencieusement un programme, contacter une URL arbitraire ou couper le live.
    Les autorisations sont stockées localement dans SQLite.
    """

    DEFAULT_ALLOWED = {
        "safe",
        "ai",
        "ai-generation",
        "audio",
        "visual",
        "obs-control",
        "twitch-write",
    }
    ALWAYS_BLOCKED = {"secret-access", "credential-export"}

    def __init__(self, db: Database):
        self.db = db

    async def initialize(self) -> None:
        await self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS automation_permission_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action_type TEXT NOT NULL,
                risk TEXT NOT NULL,
                allowed INTEGER NOT NULL,
                reason TEXT NOT NULL,
                event_type TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_automation_permission_log_created
            ON automation_permission_log(created_at DESC);
            """
        )

    async def authorize(
        self,
        action_type: str,
        risk: str,
        config: dict[str, Any],
        event: Event,
        context: dict[str, Any],
    ) -> PermissionDecision:
        normalized = str(risk or "safe").strip().lower()
        if context.get("dry_run", False):
            return PermissionDecision(True, normalized, "Simulation sans effet réel")
        if normalized in self.ALWAYS_BLOCKED:
            decision = PermissionDecision(False, normalized, "Catégorie interdite par le noyau")
        else:
            overrides = await self.db.get_setting("automation.permissions", {})
            explicit = overrides.get(normalized) if isinstance(overrides, dict) else None
            if explicit is None:
                allowed = normalized in self.DEFAULT_ALLOWED
                reason = "Autorisation par défaut" if allowed else "Autorisation locale requise"
            else:
                allowed = bool(explicit)
                reason = "Autorisation locale explicite" if allowed else "Bloqué dans les paramètres"
            decision = PermissionDecision(allowed, normalized, reason)
        await self._log(action_type, decision, config, event)
        return decision

    async def set_permission(self, risk: str, allowed: bool) -> dict[str, bool]:
        current = await self.db.get_setting("automation.permissions", {})
        permissions = dict(current) if isinstance(current, dict) else {}
        permissions[str(risk).strip().lower()] = bool(allowed)
        await self.db.set_setting("automation.permissions", permissions)
        return permissions

    async def list_permissions(self) -> dict[str, Any]:
        current = await self.db.get_setting("automation.permissions", {})
        overrides = dict(current) if isinstance(current, dict) else {}
        risks = sorted(
            self.DEFAULT_ALLOWED
            | self.ALWAYS_BLOCKED
            | set(overrides)
            | {"network", "process", "powershell", "moderation", "moderation-high", "broadcast-critical"}
        )
        return {
            "permissions": {
                risk: (
                    False
                    if risk in self.ALWAYS_BLOCKED
                    else bool(overrides.get(risk, risk in self.DEFAULT_ALLOWED))
                )
                for risk in risks
            },
            "overrides": overrides,
            "immutable_blocked": sorted(self.ALWAYS_BLOCKED),
        }

    async def recent_log(self, limit: int = 100) -> list[dict[str, Any]]:
        rows = await self.db.fetchall(
            """
            SELECT action_type,risk,allowed,reason,event_type,payload,created_at
            FROM automation_permission_log ORDER BY id DESC LIMIT ?
            """,
            (max(1, min(int(limit), 500)),),
        )
        return [dict(row) for row in rows]

    async def _log(
        self,
        action_type: str,
        decision: PermissionDecision,
        config: dict[str, Any],
        event: Event,
    ) -> None:
        import json

        safe_payload = {
            key: ("***" if any(secret in key.lower() for secret in ("token", "secret", "password", "key")) else value)
            for key, value in config.items()
        }
        await self.db.execute(
            """
            INSERT INTO automation_permission_log(
                action_type,risk,allowed,reason,event_type,payload,created_at
            ) VALUES(?,?,?,?,?,?,?)
            """,
            (
                action_type,
                decision.risk,
                int(decision.allowed),
                decision.reason,
                event.type,
                json.dumps(safe_payload, ensure_ascii=False, default=str),
                utcnow(),
            ),
        )
