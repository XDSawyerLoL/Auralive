import asyncio
from pathlib import Path

from app.config import Settings
from app.core.orchestrator import AuraOrchestrator
from app.database import Database


def run(coro):
    return asyncio.run(coro)


def test_direct_ai_mentions_are_detected(tmp_path: Path):
    async def scenario():
        settings = Settings()
        settings.database_path = tmp_path / "test.db"
        settings.twitch_bot_login = "mairaiy"
        db = Database(settings.database_path)
        await db.initialize()
        aura = AuraOrchestrator(settings, db)
        assert await aura._is_direct_ai_call("@mairaiy salut", {}) is True
        assert await aura._is_direct_ai_call("Aura, tu en penses quoi ?", {}) is True
        assert await aura._is_direct_ai_call("bonjour tout le monde", {}) is False
    run(scenario())


def test_invocation_name_is_removed_from_prompt(tmp_path: Path):
    async def scenario():
        settings = Settings()
        settings.database_path = tmp_path / "test.db"
        settings.twitch_bot_login = "mairaiy"
        db = Database(settings.database_path)
        await db.initialize()
        aura = AuraOrchestrator(settings, db)
        cleaned = await aura._clean_ai_invocation("@mairaiy, bonjour comment vas-tu ?")
        assert cleaned == "bonjour comment vas-tu ?"
    run(scenario())
