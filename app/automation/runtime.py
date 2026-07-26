from __future__ import annotations

import json
import logging
from dataclasses import asdict
from typing import Any

from app.database import Database, utcnow

from .builtins import install_builtins
from .engine import AutomationEngine
from .models import (
    ActionSpec,
    Automation,
    ConditionMode,
    ConditionSpec,
    Event,
    ExecutionReport,
    FailurePolicy,
    RunMode,
)
from .native import install_native_nodes
from .registry import AutomationRegistry

logger = logging.getLogger(__name__)


class AutomationStudioRuntime:
    def __init__(self, aura: Any, db: Database, settings: Any):
        self.aura = aura
        self.db = db
        self.settings = settings
        self.registry = AutomationRegistry()
        install_builtins(self.registry)
        install_native_nodes(self.registry)
        self.engine = AutomationEngine(
            self.registry,
            history_limit=1000,
            services={
                "aura": aura,
                "db": db,
                "twitch": aura.twitch,
                "obs": aura.obs,
                "ai": aura.ai,
                "overlay": aura.overlay,
                "files_root": str(settings.database_path.parent / "automation-files"),
            },
        )
        self.engine.add_listener(self._persist_report)
        self.started = False

    async def initialize(self) -> None:
        await self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS automation_definitions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                trigger TEXT NOT NULL,
                definition TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                priority INTEGER NOT NULL DEFAULT 100,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS automation_executions (
                id TEXT PRIMARY KEY,
                automation_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                status TEXT NOT NULL,
                ok INTEGER NOT NULL,
                skipped INTEGER NOT NULL,
                report TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_automation_executions_created
            ON automation_executions(created_at DESC);

            CREATE TABLE IF NOT EXISTS automation_variables (
                scope TEXT NOT NULL,
                owner TEXT NOT NULL DEFAULT '',
                name TEXT NOT NULL,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY(scope, owner, name)
            );
            """
        )
        await self._load_variables()
        await self._load_definitions()
        self.started = True

    async def close(self) -> None:
        await self._save_variables()
        self.started = False

    async def _load_definitions(self) -> None:
        rows = await self.db.fetchall(
            "SELECT definition FROM automation_definitions ORDER BY priority,id"
        )
        for row in rows:
            try:
                automation = self.from_dict(json.loads(row["definition"]))
                self.engine.upsert(automation)
            except Exception:
                logger.exception("Automatisation invalide ignorée")

    async def _load_variables(self) -> None:
        rows = await self.db.fetchall(
            "SELECT scope,owner,name,value FROM automation_variables"
        )
        for row in rows:
            try:
                value = json.loads(row["value"])
            except json.JSONDecodeError:
                value = row["value"]
            if row["scope"] == "global":
                self.engine.global_variables[row["name"]] = value
            elif row["scope"] == "viewer":
                self.engine.viewer_variables[row["owner"]][row["name"]] = value

    async def _save_variables(self) -> None:
        await self.db.execute("DELETE FROM automation_variables")
        now = utcnow()
        for name, value in self.engine.global_variables.items():
            await self.db.execute(
                "INSERT INTO automation_variables(scope,owner,name,value,updated_at) VALUES('global','',?,?,?)",
                (name, json.dumps(value, ensure_ascii=False, default=str), now),
            )
        for owner, values in self.engine.viewer_variables.items():
            for name, value in values.items():
                await self.db.execute(
                    "INSERT INTO automation_variables(scope,owner,name,value,updated_at) VALUES('viewer',?,?,?,?)",
                    (owner, name, json.dumps(value, ensure_ascii=False, default=str), now),
                )

    async def _persist_report(self, report: ExecutionReport) -> None:
        payload = self.report_to_dict(report)
        await self.db.execute(
            """
            INSERT OR REPLACE INTO automation_executions(
                id,automation_id,event_type,status,ok,skipped,report,created_at
            ) VALUES(?,?,?,?,?,?,?,?)
            """,
            (
                report.id,
                report.automation_id,
                report.event_type,
                report.status.value,
                int(report.ok),
                int(report.skipped),
                json.dumps(payload, ensure_ascii=False, default=str),
                report.finished_at or report.started_at,
            ),
        )
        await self._save_variables()

    async def dispatch(
        self,
        event_type: str,
        payload: dict[str, Any] | None = None,
        *,
        source: str = "aura",
    ) -> list[dict[str, Any]]:
        event = Event(event_type, self.normalize_payload(payload or {}), source=source)
        reports = await self.engine.dispatch(event)
        return [self.report_to_dict(item) for item in reports]

    async def simulate(
        self, automation_id: str, event_type: str, payload: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        event = Event(event_type, self.normalize_payload(payload or {}), source="simulation")
        return self.report_to_dict(await self.engine.simulate(automation_id, event))

    async def upsert(self, definition: dict[str, Any]) -> dict[str, Any]:
        automation = self.from_dict(definition)
        now = utcnow()
        encoded = json.dumps(self.to_dict(automation), ensure_ascii=False)
        await self.db.execute(
            """
            INSERT INTO automation_definitions(
                id,name,trigger,definition,enabled,priority,created_at,updated_at
            ) VALUES(?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
                name=excluded.name,
                trigger=excluded.trigger,
                definition=excluded.definition,
                enabled=excluded.enabled,
                priority=excluded.priority,
                updated_at=excluded.updated_at
            """,
            (
                automation.id,
                automation.name,
                automation.trigger,
                encoded,
                int(automation.enabled),
                automation.priority,
                now,
                now,
            ),
        )
        self.engine.upsert(automation)
        return self.to_dict(automation)

    async def remove(self, automation_id: str) -> bool:
        exists = await self.db.fetchone(
            "SELECT id FROM automation_definitions WHERE id=?", (automation_id,)
        )
        await self.db.execute(
            "DELETE FROM automation_definitions WHERE id=?", (automation_id,)
        )
        self.engine.remove(automation_id)
        return bool(exists)

    async def list_definitions(self) -> list[dict[str, Any]]:
        return [
            self.to_dict(item)
            for item in sorted(
                self.engine.automations.values(), key=lambda row: (row.priority, row.name.casefold())
            )
        ]

    async def reports(self, limit: int = 100) -> list[dict[str, Any]]:
        rows = await self.db.fetchall(
            "SELECT report FROM automation_executions ORDER BY created_at DESC LIMIT ?",
            (max(1, min(int(limit), 500)),),
        )
        return [json.loads(row["report"]) for row in rows]

    def catalog(self) -> dict[str, Any]:
        result = self.registry.catalog()
        result["triggers"] = self.trigger_catalog()
        return result

    @staticmethod
    def trigger_catalog() -> list[dict[str, str]]:
        names = [
            ("channel.chat.message", "Message Twitch", "Twitch"),
            ("channel.follow", "Nouveau follow", "Twitch"),
            ("channel.subscribe", "Abonnement", "Twitch"),
            ("channel.subscription.gift", "Abonnements offerts", "Twitch"),
            ("channel.subscription.message", "Resub", "Twitch"),
            ("channel.cheer", "Bits", "Twitch"),
            ("channel.raid", "Raid", "Twitch"),
            ("channel.channel_points_custom_reward_redemption.add", "Récompense Twitch", "Twitch"),
            ("channel.hype_train.*", "Hype Train", "Twitch"),
            ("stream.online", "Début du live", "Twitch"),
            ("stream.offline", "Fin du live", "Twitch"),
            ("obs.*", "Événement OBS", "OBS"),
            ("automation.manual", "Déclenchement manuel", "Aura Live"),
            ("automation.timer", "Planificateur", "Aura Live"),
            ("*", "Tous les événements", "Avancé"),
        ]
        return [{"name": name, "title": title, "category": category} for name, title, category in names]

    @staticmethod
    def normalize_payload(payload: dict[str, Any]) -> dict[str, Any]:
        result = dict(payload)
        result.setdefault("user_id", result.get("chatter_user_id") or result.get("user_id") or "")
        result.setdefault("user_name", result.get("chatter_user_name") or result.get("user_name") or "")
        result.setdefault("user_login", result.get("chatter_user_login") or result.get("user_login") or "")
        message = result.get("message") or {}
        if isinstance(message, dict):
            result.setdefault("text", message.get("text", ""))
        badges = result.get("badges") or []
        roles = []
        for badge in badges:
            role = str((badge or {}).get("set_id", ""))
            if role:
                roles.append(role)
        result.setdefault("roles", roles)
        return result

    @staticmethod
    def to_dict(automation: Automation) -> dict[str, Any]:
        data = asdict(automation)
        data["run_mode"] = automation.run_mode.value
        data["condition_mode"] = automation.condition_mode.value
        for action, raw in zip(automation.actions, data["actions"], strict=False):
            raw["failure_policy"] = action.failure_policy.value
        return data

    @staticmethod
    def from_dict(data: dict[str, Any]) -> Automation:
        actions = [
            ActionSpec(
                type=str(item["type"]),
                config=dict(item.get("config") or {}),
                timeout_seconds=float(item.get("timeout_seconds", 30)),
                failure_policy=FailurePolicy(str(item.get("failure_policy", "stop"))),
                enabled=bool(item.get("enabled", True)),
                retries=int(item.get("retries", 0)),
                retry_delay_seconds=float(item.get("retry_delay_seconds", 0)),
                save_as=item.get("save_as"),
                id=str(item.get("id") or ""),
            )
            for item in data.get("actions", [])
        ]
        # Un identifiant vide empêcherait le suivi fin d’une action.
        for action in actions:
            if not action.id:
                from uuid import uuid4
                action.id = str(uuid4())
        conditions = [
            ConditionSpec(
                type=str(item["type"]),
                config=dict(item.get("config") or {}),
                negate=bool(item.get("negate", False)),
                enabled=bool(item.get("enabled", True)),
            )
            for item in data.get("conditions", [])
        ]
        automation = Automation(
            id=str(data["id"]),
            name=str(data.get("name") or data["id"]),
            trigger=str(data.get("trigger") or "automation.manual"),
            actions=actions,
            conditions=conditions,
            enabled=bool(data.get("enabled", True)),
            priority=int(data.get("priority", 100)),
            run_mode=RunMode(str(data.get("run_mode", "sequential"))),
            queue_key=data.get("queue_key"),
            condition_mode=ConditionMode(str(data.get("condition_mode", "all"))),
            cooldown_seconds=float(data.get("cooldown_seconds", 0)),
            cooldown_scope=str(data.get("cooldown_scope", "global")),
            max_concurrency=max(1, int(data.get("max_concurrency", 1))),
            tags=[str(item) for item in data.get("tags", [])],
            description=str(data.get("description", "")),
            version=int(data.get("version", 1)),
        )
        if not automation.actions:
            raise ValueError("Une automatisation doit contenir au moins une action")
        return automation

    @staticmethod
    def report_to_dict(report: ExecutionReport) -> dict[str, Any]:
        data = asdict(report)
        data["status"] = report.status.value
        return data

    @staticmethod
    def templates() -> list[dict[str, Any]]:
        return [
            {
                "id": "template-follow-intelligent",
                "name": "Accueil follow intelligent",
                "trigger": "channel.follow",
                "description": "Mairaiy accueille le viewer dans le chat et dans l’overlay.",
                "enabled": False,
                "priority": 50,
                "actions": [
                    {"type": "aura.ai.generate", "config": {"prompt": "Remercie {{event.user_name}} pour son follow en une phrase naturelle.", "send_to_chat": True, "speak": True}},
                    {"type": "aura.overlay.emit", "config": {"payload": {"type": "follow", "viewer": "{{event.user_name}}"}}},
                ],
            },
            {
                "id": "template-raid-production",
                "name": "Raid production complète",
                "trigger": "channel.raid",
                "enabled": False,
                "priority": 40,
                "actions": [
                    {"type": "aura.chat.send", "config": {"message": "Bienvenue à la communauté de {{event.from_broadcaster_user_name}} !"}},
                    {"type": "aura.overlay.emit", "config": {"payload": {"type": "raid", "viewer": "{{event.from_broadcaster_user_name}}", "count": "{{event.viewers}}"}}},
                    {"type": "aura.tts.speak", "config": {"text": "Raid de {{event.from_broadcaster_user_name}}, bienvenue à bord."}},
                ],
            },
            {
                "id": "template-reward-scene",
                "name": "Récompense vers scène OBS",
                "trigger": "channel.channel_points_custom_reward_redemption.add",
                "enabled": False,
                "conditions": [
                    {"type": "data.compare", "config": {"path": "event.reward.title", "operator": "eq", "value": "CHANGE_SCENE"}}
                ],
                "actions": [
                    {"type": "obs.scene.set", "config": {"scene": "Just Chatting"}},
                    {"type": "aura.chat.send", "config": {"message": "{{event.user_name}} prend le contrôle de la scène."}},
                ],
            },
        ]
