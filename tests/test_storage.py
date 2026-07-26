from pathlib import Path

import pytest

from auralive.automation import ActionSpec, Automation, Event, ExecutionReport
from auralive.storage import SQLiteStore


@pytest.mark.asyncio
async def test_storage_roundtrip(tmp_path: Path) -> None:
    store = SQLiteStore(tmp_path / "aura.db")
    await store.initialize()
    automation = Automation(
        id="persistent",
        name="Persistante",
        trigger="twitch.follow",
        actions=[ActionSpec("debug.capture", {"message": "ok"})],
        tags=["community"],
    )

    await store.save_automation(automation)
    loaded = await store.load_automations()

    assert len(loaded) == 1
    assert loaded[0].id == automation.id
    assert loaded[0].actions[0].type == "debug.capture"


@pytest.mark.asyncio
async def test_variables_and_reports_are_persistent(tmp_path: Path) -> None:
    store = SQLiteStore(tmp_path / "aura.db")
    await store.initialize()
    await store.save_variables("global", {"follows": 12})
    await store.save_variables("viewer", {"ecumes": 500}, owner_key="viewer-1")

    report = ExecutionReport(
        automation_id="test",
        event_type="internal.test",
        event_id=Event("internal.test", {}).id,
        ok=True,
    )
    await store.save_report(report)

    assert await store.load_variables("global") == {"follows": 12}
    assert await store.load_variables("viewer", owner_key="viewer-1") == {"ecumes": 500}
    reports = await store.list_reports()
    assert reports[0]["automation_id"] == "test"
