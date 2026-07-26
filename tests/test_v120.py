from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app.config import Settings
from app.core.orchestrator import AuraOrchestrator
from app.database import Database
from app.services.twitch import TwitchClient


def run(coro):
    return asyncio.run(coro)


def test_conversation_memory_is_persistent_and_ordered(tmp_path: Path):
    async def scenario():
        db = Database(tmp_path / "aura.db")
        await db.initialize()
        await db.upsert_viewer("u1", "sansahd", "SANSAHD")
        await db.add_conversation_message("u1", "user", "Qui es-tu ?")
        await db.add_conversation_message("u1", "assistant", "Je suis Aura.")
        rows = await db.conversation_for("u1", 12)
        assert [(r["role"], r["content"]) for r in rows] == [
            ("user", "Qui es-tu ?"),
            ("assistant", "Je suis Aura."),
        ]

    run(scenario())


def test_direct_conversation_uses_viewer_history_not_global_chat(tmp_path: Path):
    async def scenario():
        settings = Settings()
        settings.database_path = tmp_path / "aura.db"
        db = Database(settings.database_path)
        await db.initialize()
        viewer = await db.upsert_viewer("u1", "sansahd", "SANSAHD")
        await db.add_conversation_message("u1", "user", "Tu vas t'améliorer ?")
        await db.add_conversation_message("u1", "assistant", "Oui, en gardant le contexte.")
        aura = AuraOrchestrator(settings, db)
        aura.recent_chat.append("StreamElements: ajoute une décoration aux étagères")
        captured = {}

        async def fake_reply(name, message, context, recent_chat, history):
            captured.update(name=name, message=message, recent_chat=recent_chat, history=history)
            return "Parce que je conserve maintenant notre échange précédent."

        async def fake_say(message, reply_id=None):
            captured["sent"] = (message, reply_id)
            return {"is_sent": True}

        aura.ai.reply = fake_reply  # type: ignore[method-assign]
        aura.say = fake_say  # type: ignore[method-assign]
        assert await aura.answer_ai(viewer, "Pourquoi ?", "parent", direct=True)
        assert captured["recent_chat"] == []
        assert captured["history"][-1]["content"] == "Oui, en gardant le contexte."
        assert captured["sent"][1] is None
        assert "réfléchis" not in captured["sent"][0].casefold()

    run(scenario())


def test_twitch_rejects_thinking_placeholder_before_network(tmp_path: Path):
    async def scenario():
        settings = Settings()
        db = Database(tmp_path / "aura.db")
        client = TwitchClient(settings, db, lambda *_: None)
        client.bot_user_id = "bot"
        client.broadcaster_user_id = "broadcaster"

        async def should_not_run(*_args, **_kwargs):
            raise AssertionError("Le réseau ne doit pas être appelé")

        client.request = should_not_run  # type: ignore[method-assign]
        with pytest.raises(RuntimeError, match="Message d'attente interdit"):
            await client.send_chat("@SANSAHD je réfléchis…")

    run(scenario())


def test_avatar_overlay_and_power_menu_fix_are_packaged():
    root = Path(__file__).resolve().parents[1]
    assert (root / "app/web/templates/avatar_overlay.html").exists()
    assert (root / "app/web/static/avatar/mairaiy-idle.png").exists()
    assert (root / "app/web/static/avatar/mairaiy-speaking.png").exists()
    power = (root / "app/web/static/power.js").read_text(encoding="utf-8")
    app_js = (root / "app/web/static/app.js").read_text(encoding="utf-8")
    assert "nav-group-title',group).addEventListener" not in power
    assert "if (link.dataset.powerPage) return" in app_js


def test_grounded_identity_answers_do_not_invent_about_sansa():
    from app.services.ai import AuraAI

    answer = AuraAI._grounded_identity_answer("Raconte-moi un truc sur @SANSAHD")
    assert answer is not None
    assert "un homme" in answer
    assert "n'inventerai pas" in answer
    assert "collection" not in answer.casefold()


def test_confusion_messages_trigger_non_mocking_repair_mode():
    from app.services.ai import AuraAI

    assert AuraAI._needs_conversation_repair("Mais de quoi tu parles ? Ce que tu dis n'a aucun sens")
    assert not AuraAI._needs_conversation_repair("Quel jeu préfères-tu ?")
