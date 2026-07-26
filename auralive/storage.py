from __future__ import annotations

import asyncio
import json
import sqlite3
from pathlib import Path
from typing import Any

from .automation.models import Automation, ExecutionReport
from .automation.serialization import automation_from_dict, automation_to_dict, report_to_dict


class SQLiteStore:
    """Stockage local durable, sans service externe ni secret dans le dépôt."""

    def __init__(self, path: str | Path = "data/aura_live_v2.db") -> None:
        self.path = Path(path)

    async def initialize(self) -> None:
        await asyncio.to_thread(self._initialize)

    def _connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA foreign_keys=ON")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS automations (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    enabled INTEGER NOT NULL,
                    trigger TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    document TEXT NOT NULL,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS variables (
                    scope TEXT NOT NULL,
                    owner_key TEXT NOT NULL,
                    name TEXT NOT NULL,
                    value_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (scope, owner_key, name)
                );

                CREATE TABLE IF NOT EXISTS execution_reports (
                    id TEXT PRIMARY KEY,
                    automation_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    ok INTEGER NOT NULL,
                    document TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX IF NOT EXISTS idx_execution_automation
                ON execution_reports(automation_id, created_at DESC);
                """
            )

    async def save_automation(self, automation: Automation) -> None:
        await asyncio.to_thread(self._save_automation, automation)

    def _save_automation(self, automation: Automation) -> None:
        document = json.dumps(automation_to_dict(automation), ensure_ascii=False)
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO automations(id, name, enabled, trigger, version, document, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    enabled=excluded.enabled,
                    trigger=excluded.trigger,
                    version=excluded.version,
                    document=excluded.document,
                    updated_at=CURRENT_TIMESTAMP
                """,
                (
                    automation.id,
                    automation.name,
                    int(automation.enabled),
                    automation.trigger,
                    automation.version,
                    document,
                ),
            )

    async def delete_automation(self, automation_id: str) -> None:
        await asyncio.to_thread(self._delete_automation, automation_id)

    def _delete_automation(self, automation_id: str) -> None:
        with self._connect() as connection:
            connection.execute("DELETE FROM automations WHERE id = ?", (automation_id,))

    async def load_automations(self) -> list[Automation]:
        return await asyncio.to_thread(self._load_automations)

    def _load_automations(self) -> list[Automation]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT document FROM automations ORDER BY name COLLATE NOCASE"
            ).fetchall()
        return [automation_from_dict(json.loads(row["document"])) for row in rows]

    async def save_variables(
        self, scope: str, values: dict[str, Any], *, owner_key: str = "global"
    ) -> None:
        await asyncio.to_thread(self._save_variables, scope, values, owner_key)

    def _save_variables(self, scope: str, values: dict[str, Any], owner_key: str) -> None:
        with self._connect() as connection:
            connection.execute(
                "DELETE FROM variables WHERE scope = ? AND owner_key = ?",
                (scope, owner_key),
            )
            connection.executemany(
                """
                INSERT INTO variables(scope, owner_key, name, value_json)
                VALUES (?, ?, ?, ?)
                """,
                [
                    (scope, owner_key, str(name), json.dumps(value, ensure_ascii=False))
                    for name, value in values.items()
                ],
            )

    async def load_variables(self, scope: str, *, owner_key: str = "global") -> dict[str, Any]:
        return await asyncio.to_thread(self._load_variables, scope, owner_key)

    def _load_variables(self, scope: str, owner_key: str) -> dict[str, Any]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT name, value_json FROM variables WHERE scope = ? AND owner_key = ?",
                (scope, owner_key),
            ).fetchall()
        return {row["name"]: json.loads(row["value_json"]) for row in rows}

    async def save_report(self, report: ExecutionReport) -> None:
        await asyncio.to_thread(self._save_report, report)

    def _save_report(self, report: ExecutionReport) -> None:
        document = json.dumps(report_to_dict(report), ensure_ascii=False, default=str)
        with self._connect() as connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO execution_reports(
                    id, automation_id, event_type, status, ok, document
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    report.id,
                    report.automation_id,
                    report.event_type,
                    report.status.value,
                    int(report.ok),
                    document,
                ),
            )

    async def list_reports(self, *, limit: int = 100) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._list_reports, limit)

    def _list_reports(self, limit: int) -> list[dict[str, Any]]:
        safe_limit = min(max(int(limit), 1), 1000)
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT document FROM execution_reports
                ORDER BY created_at DESC LIMIT ?
                """,
                (safe_limit,),
            ).fetchall()
        return [json.loads(row["document"]) for row in rows]
