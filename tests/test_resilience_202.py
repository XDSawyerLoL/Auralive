import asyncio
from pathlib import Path
from types import SimpleNamespace

from app.automation.registry import AutomationRegistry
from app.automation.resilience_nodes import install_resilience_nodes
from app.config import Settings
from app.core.identity import AuraIdentity
from app.database import Database
from app.modules.moderation import ModerationModule
from app.services.ai import AuraAI


def run(coro):
    return asyncio.run(coro)


def test_commercial_viewer_spam_and_obfuscated_domain_are_blocked(tmp_path: Path):
    async def scenario():
        db = Database(tmp_path / "test.db")
        await db.initialize()
        moderation = ModerationModule(db)
        result = await moderation.evaluate(
            "spam-1",
            "Ai viewers streamboo. com ca",
            [],
            False,
        )
        assert result.blocked is True
        assert result.timeout_seconds == 1_209_600
        assert "faux viewers" in result.reason
        assert result.fingerprint

    run(scenario())


def test_same_promo_signature_from_another_account_is_flagged_as_probable_evasion(tmp_path: Path):
    async def scenario():
        db = Database(tmp_path / "test.db")
        await db.initialize()
        moderation = ModerationModule(db)
        first = await moderation.commercial_spam_decision(
            "spam-1", "buy viewers streamboo.com", [], False
        )
        second = await moderation.commercial_spam_decision(
            "spam-2", "buy viewers streamboo . com", [], False
        )
        assert first.blocked is True
        assert second.blocked is True
        assert "contournement probable" in second.reason

    run(scenario())


def test_resilience_nodes_are_registered():
    registry = AutomationRegistry()
    install_resilience_nodes(registry)
    expected = {
        "moderation.domain.block",
        "moderation.commercial_spam.configure",
        "twitch.user.ban",
        "twitch.user.unban",
        "twitch.chat.clear",
        "aura.ai.recover",
        "aura.ai.model.set",
        "obs.recording.start",
        "obs.recording.stop",
        "obs.replay_buffer.save",
        "obs.virtual_camera.toggle",
    }
    assert expected.issubset(registry.actions)


def test_ai_circuit_breaker_returns_immediately_after_failure(tmp_path: Path):
    identity_file = tmp_path / "identity.json"
    identity_file.write_text('{"name":"Aura"}', encoding="utf-8")
    identity = AuraIdentity(identity_file)
    identity.load()
    settings = Settings(
        ai_mode="ollama",
        ai_model="gemma3:12b",
        ai_failure_cooldown_seconds=60,
    )
    ai = AuraAI(settings, identity)
    ai._register_failure(asyncio.TimeoutError())
    assert ai.degraded is True
    diagnostic = ai.diagnostic()
    assert diagnostic["consecutive_failures"] == 1
    assert diagnostic["last_error"] == "TimeoutError"
    assert "modèle local" in ai._degraded_fallback("Sansa", "bonjour").casefold()
