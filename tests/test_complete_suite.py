import asyncio
from pathlib import Path
from types import SimpleNamespace

from app.config import Settings
from app.core.orchestrator import AuraOrchestrator
from app.database import Database
from app.modules.complete_suite import CompleteSuite
from app.modules.moderation import ModerationModule


def run(coro):
    return asyncio.run(coro)


class DummyOverlay:
    def __init__(self):
        self.events = []

    async def emit(self, event):
        self.events.append(event)


class DummyOrchestrator:
    def __init__(self):
        self.messages = []
        self.overlay = DummyOverlay()

    async def say(self, message, *_args):
        self.messages.append(message)
        return {"is_sent": True}


def test_direct_ai_posts_only_final_message_and_not_threaded(tmp_path: Path):
    async def scenario():
        settings = Settings()
        settings.database_path = tmp_path / "aura.db"
        db = Database(settings.database_path)
        await db.initialize()
        aura = AuraOrchestrator(settings, db)
        viewer = await db.upsert_viewer("u1", "sansa", "SANSAHD")
        calls = []

        async def fake_reply(*_args, **_kwargs):
            return "Je suis ici pour animer le Spot et te rappeler tes fails."

        async def fake_say(message, reply_id=None):
            calls.append((message, reply_id))
            return {"is_sent": True}

        aura.ai.reply = fake_reply  # type: ignore[method-assign]
        aura.say = fake_say  # type: ignore[method-assign]
        sent = await aura.answer_ai(viewer, "tu fais quoi ici ?", "message-parent", direct=True)
        assert sent is True
        assert calls == [("@SANSAHD Je suis ici pour animer le Spot et te rappeler tes fails.", None)]
        assert "réfléchis" not in calls[0][0].lower()

    run(scenario())


def test_faq_link_permit_and_restriction(tmp_path: Path):
    async def scenario():
        db = Database(tmp_path / "aura.db")
        await db.initialize()
        suite = CompleteSuite(db, SimpleNamespace())
        await suite.initialize()
        viewer = await db.upsert_viewer("u1", "rider", "Rider")

        faq = await suite.search_faq("comment avoir des points écumes")
        assert faq and "Écumes" in faq["answer"]

        moderation = ModerationModule(db)
        blocked = await moderation.evaluate("u1", "https://example.com", [], False)
        assert blocked.blocked is True
        await suite.grant_permit(viewer, 5, "Sansa")
        assert await suite.has_link_permit("u1") is True
        allowed = await moderation.evaluate("u1", "https://example.com", [], False, link_permitted=True)
        assert allowed.blocked is False

        await suite.restrict_user(viewer, 10, "test", "Sansa")
        restriction = await suite.restriction_for("u1")
        assert restriction and restriction["block_commands"] == 1

    run(scenario())


def test_drop_can_only_reward_one_viewer(tmp_path: Path):
    async def scenario():
        db = Database(tmp_path / "aura.db")
        await db.initialize()
        suite = CompleteSuite(db, SimpleNamespace())
        await suite.initialize()
        suite.orchestrator = DummyOrchestrator()
        a = await db.upsert_viewer("u1", "a", "A")
        b = await db.upsert_viewer("u2", "b", "B")
        await suite.start_drop(100, "Sansa")
        await asyncio.gather(
            suite._cmd_drop(a, "", {}),
            suite._cmd_drop(b, "", {}),
        )
        a2 = await db.get_viewer(user_id="u1")
        b2 = await db.get_viewer(user_id="u2")
        assert int(a2["points"]) + int(b2["points"]) == 100
        assert len([m for m in suite.orchestrator.messages if "attrape le drop" in m]) == 1

    run(scenario())


def test_ticket_draw_cannot_pay_twice(tmp_path: Path):
    async def scenario():
        db = Database(tmp_path / "aura.db")
        await db.initialize()
        suite = CompleteSuite(db, SimpleNamespace())
        await suite.initialize()
        viewer = await db.upsert_viewer("u1", "rider", "Rider")
        await db.adjust_points("u1", 100, "test")
        viewer = await db.get_viewer(user_id="u1")
        assert "Ticket" in await suite.buy_ticket(viewer)
        first = await suite.draw_tickets()
        second = await suite.draw_tickets()
        assert first is not None
        assert second is None

    run(scenario())


def test_feature_matrix_reports_external_requirements(tmp_path: Path):
    async def scenario():
        db = Database(tmp_path / "aura.db")
        await db.initialize()
        suite = CompleteSuite(db, SimpleNamespace())
        await suite.initialize()
        rows = await suite.feature_matrix()
        assert any(row["name"] == "Chat IA Mairaiy" and row["status"] == "ready" for row in rows)
        assert any(row["name"] == "Fonctionnement 24/7" and row["status"] == "external" for row in rows)

    run(scenario())


def test_local_controller_connector_can_be_tested(tmp_path: Path):
    async def scenario():
        db = Database(tmp_path / "aura.db")
        await db.initialize()
        suite = CompleteSuite(db, SimpleNamespace())
        await suite.initialize()
        connector = await suite.save_connector({
            "name": "StreamDeck local",
            "kind": "streamdeck",
            "config": {},
            "enabled": True,
        })
        result = await suite.test_connector(int(connector["id"]))
        assert result["ok"] is True
        assert "API locale" in result["status"]

    run(scenario())


def test_full_chat_pipeline_answers_mention_with_final_only(tmp_path: Path):
    async def scenario():
        settings = Settings()
        settings.database_path = tmp_path / "aura.db"
        settings.twitch_bot_login = "mairaiy"
        db = Database(settings.database_path)
        await db.initialize()
        aura = AuraOrchestrator(settings, db)
        await aura.power.initialize()
        await aura.complete.initialize()
        sent = []

        async def fake_reply(*_args, **_kwargs):
            return "Je suis la conscience du stream : j'anime, je modère et je garde Sansa à l'œil."

        async def fake_send_chat(message, reply_parent_message_id=None):
            sent.append((message, reply_parent_message_id))
            return {"is_sent": True}

        aura.ai.reply = fake_reply  # type: ignore[method-assign]
        aura.twitch.send_chat = fake_send_chat  # type: ignore[method-assign]
        aura.twitch.bot_user_id = "bot-id"
        event = {
            "chatter_user_id": "viewer-id",
            "chatter_user_login": "sansahd",
            "chatter_user_name": "SANSAHD",
            "message_id": "parent-id",
            "message": {
                "text": "@mairaiy super tu fais quoi ici toi ?",
                "fragments": [{"type": "mention", "text": "@mairaiy", "mention": {"user_login": "mairaiy"}}],
            },
            "badges": [{"set_id": "broadcaster"}],
        }
        await aura._handle_chat(event)
        if aura.ai_tasks:
            await asyncio.gather(*list(aura.ai_tasks))
        assert len(sent) == 1
        assert sent[0][0].startswith("@SANSAHD Je suis la conscience du stream")
        assert sent[0][1] is None
        assert "réfléchis" not in sent[0][0].lower()

    run(scenario())
