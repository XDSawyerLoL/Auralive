import asyncio
from pathlib import Path

from app.database import Database
from app.modules.studio import StudioModule


def run(coro):
    return asyncio.run(coro)


def test_announcements_crud(tmp_path: Path):
    async def scenario():
        db = Database(tmp_path / "studio.db")
        await db.initialize()
        studio = StudioModule(db)
        row = await studio.create_announcement("Test", "Message test", 12, 3, True, True)
        assert row["title"] == "Test"
        updated = await studio.update_announcement(row["id"], {**row, "enabled": False})
        assert updated and updated["enabled"] == 0
    run(scenario())


def test_alert_template_renders_variables(tmp_path: Path):
    async def scenario():
        db = Database(tmp_path / "studio.db")
        await db.initialize()
        studio = StudioModule(db)
        alert = await studio.render_alert("raid", {"viewer": "Nova", "count": 42})
        assert "Nova" in alert["message"]
        assert "42" in alert["message"]
    run(scenario())


def test_goal_crud(tmp_path: Path):
    async def scenario():
        db = Database(tmp_path / "studio.db")
        await db.initialize()
        studio = StudioModule(db)
        goal = await studio.create_goal("Subs", "subs", 3, 10, "subs", True)
        assert goal["target_value"] == 10
        updated = await studio.update_goal(goal["id"], {**goal, "current_value": 4})
        assert updated and updated["current_value"] == 4
    run(scenario())


def test_reward_action_payload_is_decoded(tmp_path: Path):
    async def scenario():
        db = Database(tmp_path / "studio.db")
        await db.initialize()
        studio = StudioModule(db)
        row = await studio.create_reward_action(
            "Faire une vague", "overlay", {"type": "wave"}, "{viewer} déclenche une vague", True
        )
        assert row["action_payload"]["type"] == "wave"
        match = await studio.matching_reward_action("faire une vague")
        assert match and match["action_payload"]["type"] == "wave"
    run(scenario())
