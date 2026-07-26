from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


class FAQInput(BaseModel):
    question: str = Field(min_length=2, max_length=240)
    answer: str = Field(min_length=1, max_length=1000)
    keywords: list[str] = Field(default_factory=list)
    enabled: bool = True


class PermitInput(BaseModel):
    login: str = Field(min_length=1, max_length=80)
    minutes: int = Field(default=5, ge=1, le=1440)
    issued_by: str = Field(default="Sansa", max_length=80)


class RestrictionInput(BaseModel):
    login: str = Field(min_length=1, max_length=80)
    minutes: int = Field(default=10, ge=1, le=10080)
    reason: str = Field(default="Restriction temporaire", max_length=300)
    issued_by: str = Field(default="Sansa", max_length=80)


class DropInput(BaseModel):
    amount: int = Field(default=100, ge=1, le=1_000_000)
    actor: str = Field(default="Sansa", max_length=80)


class DecryptInput(BaseModel):
    word: str = Field(min_length=3, max_length=80)
    actor: str = Field(default="Sansa", max_length=80)


class BingoInput(BaseModel):
    actor: str = Field(default="Sansa", max_length=80)


class TopWordsInput(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    options: list[str] = Field(min_length=2, max_length=8)
    actor: str = Field(default="Sansa", max_length=80)
    minutes: int = Field(default=5, ge=1, le=120)


class PingInput(BaseModel):
    title: str = Field(default="PING MODÉRATION", min_length=1, max_length=100)
    message: str = Field(min_length=1, max_length=500)
    priority: str = Field(default="normal", pattern="^(low|normal|high|urgent)$")
    actor: str = Field(default="Dashboard", max_length=80)


class AITextInput(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class ConnectorInput(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    kind: str = Field(
        default="generic_webhook",
        pattern="^(generic_webhook|discord_webhook|bluesky|x|lastfm|youtube|steam|igdb|telnet|rcon|streamdeck|loupedeck|home_assistant|n8n|make)$",
    )
    config: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = False


class ClipRuleInput(BaseModel):
    threshold: int = Field(default=0, ge=0, le=10_000_000)
    enabled: bool = False
    delay_seconds: int = Field(default=0, ge=0, le=30)


class DeckActionInput(BaseModel):
    action: str = Field(pattern="^(chat|overlay|scene|counter|clip|silence|emergency|credits|ping)$")
    payload: dict[str, Any] = Field(default_factory=dict)


def build_complete_router(aura: Any, db: Any) -> APIRouter:
    router = APIRouter(prefix="/api/complete", tags=["Aura Complete Suite"])

    @router.get("/summary")
    async def summary() -> dict[str, Any]:
        active_games = await db.fetchall("SELECT game_type,title,state,ends_at FROM game_sessions WHERE status='active'")
        return {
            "features": await aura.complete.feature_matrix(),
            "active_games": active_games,
            "topwords": await aura.complete.topwords_state(),
            "audience": {
                "followers": (await db.fetchone("SELECT COUNT(*) AS n FROM audience_members WHERE kind='follower' AND active=1") or {"n": 0})["n"],
                "subscribers": (await db.fetchone("SELECT COUNT(*) AS n FROM audience_members WHERE kind='subscriber' AND active=1") or {"n": 0})["n"],
                "unfollowers": (await db.fetchone("SELECT COUNT(*) AS n FROM audience_members WHERE kind='follower' AND active=0") or {"n": 0})["n"],
            },
        }

    @router.get("/features")
    async def features() -> list[dict[str, Any]]:
        return await aura.complete.feature_matrix()

    @router.get("/faq")
    async def faq() -> list[dict[str, Any]]:
        return await aura.complete.list_faq()

    @router.post("/faq")
    async def add_faq(payload: FAQInput) -> dict[str, Any]:
        return await aura.complete.save_faq(payload.model_dump())

    @router.put("/faq/{faq_id}")
    async def update_faq(faq_id: int, payload: FAQInput) -> dict[str, Any]:
        return await aura.complete.save_faq(payload.model_dump(), faq_id)

    @router.delete("/faq/{faq_id}")
    async def delete_faq(faq_id: int) -> dict[str, bool]:
        await db.execute("DELETE FROM faq_entries WHERE id=?", (faq_id,))
        return {"ok": True}

    @router.get("/permits")
    async def permits() -> list[dict[str, Any]]:
        return await db.fetchall("SELECT * FROM link_permits ORDER BY expires_at")

    @router.post("/permits")
    async def grant_permit(payload: PermitInput) -> dict[str, bool]:
        target = await db.get_viewer(login=payload.login.lstrip("@"))
        if not target:
            raise HTTPException(404, "Viewer inconnu. Il doit avoir parlé au moins une fois.")
        await aura.complete.grant_permit(target, payload.minutes, payload.issued_by)
        return {"ok": True}

    @router.delete("/permits/{user_id}")
    async def delete_permit(user_id: str) -> dict[str, bool]:
        await db.execute("DELETE FROM link_permits WHERE user_id=?", (user_id,))
        return {"ok": True}

    @router.get("/restrictions")
    async def restrictions() -> list[dict[str, Any]]:
        return await db.fetchall("SELECT * FROM user_restrictions ORDER BY created_at DESC")

    @router.post("/restrictions")
    async def add_restriction(payload: RestrictionInput) -> dict[str, bool]:
        target = await db.get_viewer(login=payload.login.lstrip("@"))
        if not target:
            raise HTTPException(404, "Viewer inconnu.")
        await aura.complete.restrict_user(target, payload.minutes, payload.reason, payload.issued_by)
        return {"ok": True}

    @router.delete("/restrictions/{user_id}")
    async def delete_restriction(user_id: str) -> dict[str, bool]:
        await db.execute("DELETE FROM user_restrictions WHERE user_id=?", (user_id,))
        return {"ok": True}

    @router.get("/games")
    async def games() -> list[dict[str, Any]]:
        rows = await db.fetchall("SELECT * FROM game_sessions ORDER BY id DESC LIMIT 100")
        for row in rows:
            row["state"] = json.loads(row.get("state") or "{}")
        return rows

    @router.post("/games/drop")
    async def start_drop(payload: DropInput) -> dict[str, Any]:
        row = await aura.complete.start_drop(payload.amount, payload.actor)
        await aura.say(f"DROP ouvert : le premier à taper !drop gagne {payload.amount} Écumes.")
        await aura.overlay.emit({"type": "drop_open", "amount": payload.amount})
        return row

    @router.post("/games/decrypt")
    async def start_decrypt(payload: DecryptInput) -> dict[str, Any]:
        row = await aura.complete.start_decrypt(payload.word, payload.actor)
        state = row.get("state") or {}
        await aura.say(f"Décryptage : remets les lettres dans l'ordre — {state.get('scrambled', '')}")
        return row

    @router.post("/games/bingo")
    async def start_bingo(payload: BingoInput) -> dict[str, Any]:
        row = await aura.complete.start_bingo(payload.actor)
        await aura.say("Bingo ouvert. Les viewers rejoignent avec !bingo.")
        return row

    @router.post("/games/bingo/draw")
    async def draw_bingo() -> dict[str, Any]:
        return {"number": await aura.complete.bingo_draw()}

    @router.post("/games/{game_type}/end")
    async def end_game(game_type: str) -> dict[str, bool]:
        await aura.complete.end_game(game_type)
        return {"ok": True}

    @router.get("/topwords")
    async def topwords() -> dict[str, Any] | None:
        return await aura.complete.topwords_state()

    @router.post("/topwords")
    async def start_topwords(payload: TopWordsInput) -> dict[str, Any]:
        row = await aura.complete.start_topwords(payload.title, payload.options, payload.actor, payload.minutes)
        await aura.say(f"TopWords : {payload.title} — vote en écrivant : {' / '.join(payload.options)}")
        return row

    @router.post("/topwords/close")
    async def close_topwords() -> dict[str, str]:
        message = await aura.complete.close_topwords()
        await aura.say(message)
        return {"message": message}

    @router.get("/audience")
    async def audience(kind: str = "", active: str = "") -> list[dict[str, Any]]:
        query = "SELECT * FROM audience_members WHERE 1=1"
        params: list[Any] = []
        if kind:
            query += " AND kind=?"
            params.append(kind)
        if active in {"0", "1"}:
            query += " AND active=?"
            params.append(int(active))
        query += " ORDER BY last_seen DESC LIMIT 5000"
        return await db.fetchall(query, tuple(params))

    @router.post("/audience/sync")
    async def sync_audience() -> dict[str, Any]:
        return await aura.complete.sync_audience()

    @router.get("/pings")
    async def pings() -> list[dict[str, Any]]:
        return await db.fetchall("SELECT * FROM streamer_pings ORDER BY id DESC LIMIT 100")

    @router.post("/pings")
    async def create_ping(payload: PingInput) -> dict[str, Any]:
        return await aura.complete.create_ping(payload.title, payload.message, payload.priority, payload.actor)

    @router.post("/pings/{ping_id}/ack")
    async def acknowledge_ping(ping_id: int) -> dict[str, bool]:
        from app.database import utcnow
        await db.execute("UPDATE streamer_pings SET acknowledged_at=? WHERE id=?", (utcnow(), ping_id))
        return {"ok": True}

    @router.get("/credits")
    async def credits() -> dict[str, Any]:
        return await aura.complete.credits_payload()

    @router.post("/credits/start")
    async def start_credits() -> dict[str, Any]:
        payload = await aura.complete.credits_payload()
        await aura.overlay.emit({"type": "credits_start", **payload})
        return payload

    @router.post("/ai/title")
    async def ai_title(payload: AITextInput) -> dict[str, str]:
        return {"result": await aura.complete.generate_title(payload.text)}

    @router.post("/ai/enhance")
    async def ai_enhance(payload: AITextInput) -> dict[str, str]:
        return {"result": await aura.complete.enhance_text(payload.text)}

    @router.post("/ai/recap")
    async def ai_recap() -> dict[str, str]:
        return {"result": await aura.complete.generate_recap()}

    @router.get("/connectors")
    async def connectors() -> list[dict[str, Any]]:
        return await aura.complete.list_connectors()

    @router.post("/connectors")
    async def add_connector(payload: ConnectorInput) -> dict[str, Any]:
        return await aura.complete.save_connector(payload.model_dump())

    @router.put("/connectors/{connector_id}")
    async def update_connector(connector_id: int, payload: ConnectorInput) -> dict[str, Any]:
        return await aura.complete.save_connector(payload.model_dump(), connector_id)

    @router.delete("/connectors/{connector_id}")
    async def delete_connector(connector_id: int) -> dict[str, bool]:
        await db.execute("DELETE FROM external_connectors WHERE id=?", (connector_id,))
        return {"ok": True}

    @router.post("/connectors/{connector_id}/test")
    async def test_connector(connector_id: int) -> dict[str, Any]:
        try:
            return await aura.complete.test_connector(connector_id)
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc

    @router.get("/clip-rules")
    async def clip_rules() -> list[dict[str, Any]]:
        return await db.fetchall("SELECT * FROM clip_rules ORDER BY event_type")

    @router.put("/clip-rules/{event_type:path}")
    async def update_clip_rule(event_type: str, payload: ClipRuleInput) -> dict[str, bool]:
        from app.database import utcnow
        await db.execute(
            """
            INSERT INTO clip_rules(event_type,threshold,enabled,delay_seconds,created_at,updated_at)
            VALUES(?,?,?,?,?,?)
            ON CONFLICT(event_type) DO UPDATE SET threshold=excluded.threshold,enabled=excluded.enabled,
            delay_seconds=excluded.delay_seconds,updated_at=excluded.updated_at
            """,
            (event_type, payload.threshold, int(payload.enabled), payload.delay_seconds, utcnow(), utcnow()),
        )
        return {"ok": True}

    @router.post("/deck/action")
    async def deck_action(payload: DeckActionInput) -> dict[str, Any]:
        action = payload.action
        data = payload.payload
        if action == "chat":
            await aura.say(str(data.get("message", "")))
        elif action == "overlay":
            await aura.overlay.emit({"type": data.get("type", "deck"), **data})
        elif action == "scene":
            await aura.obs.set_scene(str(data.get("scene", "")))
        elif action == "counter":
            row = await aura.engagement.counter_change(str(data.get("slug", "fails")), int(data.get("delta", 1)))
            return {"ok": True, "counter": row}
        elif action == "clip":
            await aura.twitch.create_clip()
        elif action == "silence":
            current = bool(await db.get_setting("bot.silent", False))
            await db.set_setting("bot.silent", not current)
        elif action == "emergency":
            current = bool(await db.get_setting("moderation.emergency_mode", False))
            await db.set_setting("moderation.emergency_mode", not current)
        elif action == "credits":
            await aura.overlay.emit({"type": "credits_start", **await aura.complete.credits_payload()})
        elif action == "ping":
            await aura.complete.create_ping(str(data.get("title", "PING")), str(data.get("message", "")), str(data.get("priority", "normal")), "StreamDeck")
        return {"ok": True}

    return router
