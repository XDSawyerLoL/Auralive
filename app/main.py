from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.config import BASE_DIR, settings
from app.core.orchestrator import AuraOrchestrator
from app.database import Database
from app.power_routes import build_power_router
from app.complete_routes import build_complete_router

logging.basicConfig(
    level=getattr(logging, settings.log_level, logging.INFO),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("aura-live")

db = Database(settings.database_path)
aura = AuraOrchestrator(settings, db)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.initialize()
    await aura.start()
    yield
    await aura.close()


app = FastAPI(title="Aura Live", version="1.2.0", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=BASE_DIR / "app" / "web" / "static"), name="static")
settings.media_dir.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=settings.media_dir), name="media")
app.include_router(build_power_router(aura, db, settings))
app.include_router(build_complete_router(aura, db))


@app.middleware("http")
async def prevent_stale_interface_cache(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path in {"/", "/channel", "/overlay", "/overlay/avatar", "/overlay/song", "/overlay/streamathon", "/overlay/emotes", "/overlay/topwords", "/overlay/giveaway", "/overlay/credits", "/overlay/ping"} or path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


class CommandInput(BaseModel):
    name: str = Field(min_length=2, max_length=40)
    response: str = Field(min_length=1, max_length=500)
    cooldown_seconds: int = Field(default=10, ge=0, le=3600)
    min_role: str = Field(default="everyone", pattern="^(everyone|subscriber|mod|broadcaster)$")
    enabled: bool = True


class ChatInput(BaseModel):
    message: str = Field(min_length=1, max_length=500)


class SettingInput(BaseModel):
    value: Any


class OverlayInput(BaseModel):
    type: str = "aura_message"
    viewer: str = "Sansa"
    message: str = "Aura est connectée au Spot."


class ShopInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: str = Field(default="", max_length=300)
    cost: int = Field(default=100, ge=0, le=1_000_000)
    action_type: str = Field(default="manual", pattern="^(manual|overlay|tts|obs)$")
    action_payload: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class GiveawayInput(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    keyword: str = Field(default="!concours", min_length=2, max_length=30)
    cost: int = Field(default=0, ge=0, le=100_000)


class QueueInput(BaseModel):
    user_id: str
    login: str
    display_name: str
    note: str = ""


class PollInput(BaseModel):
    question: str = Field(min_length=3, max_length=60)
    options: list[str] = Field(min_length=2, max_length=5)
    duration: int = Field(default=120, ge=15, le=1800)


class AITestInput(BaseModel):
    message: str = Field(min_length=1, max_length=500)
    viewer_name: str = Field(default="Sansa", min_length=1, max_length=50)
    send_to_chat: bool = False


class AvatarSettingsInput(BaseModel):
    enabled: bool = True
    voice: str = Field(default="", max_length=120)
    rate: float = Field(default=1.0, ge=0.5, le=2.0)
    pitch: float = Field(default=1.0, ge=0.5, le=2.0)
    volume: float = Field(default=1.0, ge=0.0, le=1.0)
    subtitles: bool = True
    subtitle_seconds: int = Field(default=12, ge=2, le=60)


class AvatarTestInput(BaseModel):
    text: str = Field(default="Bonjour, je suis Aura. Test vocal de Mairaiy.", min_length=1, max_length=430)


class CounterInput(BaseModel):
    value: int = Field(ge=0, le=1_000_000)


class TTSInput(BaseModel):
    user_id: str = "dashboard"
    login: str = "dashboard"
    display_name: str = "Sansa"
    text: str = Field(min_length=2, max_length=300)


class AnnouncementInput(BaseModel):
    title: str = Field(min_length=2, max_length=80)
    message: str = Field(min_length=2, max_length=500)
    interval_minutes: int = Field(default=20, ge=1, le=1440)
    min_messages: int = Field(default=0, ge=0, le=10000)
    only_live: bool = True
    enabled: bool = True


class AlertTemplateInput(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    message_template: str = Field(min_length=1, max_length=500)
    accent: str = Field(default="aqua", max_length=20)
    duration_seconds: int = Field(default=7, ge=2, le=30)
    sound_path: str = Field(default="", max_length=300)
    media_path: str = Field(default="", max_length=300)
    animation_in: str = Field(default="pop", max_length=40)
    animation_out: str = Field(default="fade", max_length=40)
    volume: float = Field(default=0.8, ge=0, le=1)
    layout: str = Field(default="card", max_length=40)
    variants: list[dict[str, Any]] = Field(default_factory=list)
    enabled: bool = True


class GoalInput(BaseModel):
    title: str = Field(min_length=2, max_length=100)
    goal_type: str = Field(default="custom", max_length=30)
    current_value: int = Field(default=0, ge=0, le=10_000_000)
    target_value: int = Field(default=100, ge=1, le=10_000_000)
    unit: str = Field(default="", max_length=30)
    enabled: bool = True


class RewardActionInput(BaseModel):
    reward_title: str = Field(min_length=2, max_length=100)
    action_type: str = Field(default="overlay", pattern="^(overlay|tts|counter|chat)$")
    action_payload: dict[str, Any] = Field(default_factory=dict)
    response_message: str = Field(default="", max_length=500)
    enabled: bool = True


class PredictionInput(BaseModel):
    title: str = Field(min_length=3, max_length=45)
    outcomes: list[str] = Field(min_length=2, max_length=10)
    window: int = Field(default=120, ge=30, le=1800)


class PredictionResolveInput(BaseModel):
    status: str = Field(pattern="^(LOCKED|RESOLVED|CANCELED)$")
    winning_outcome_id: str | None = None


@app.get("/", response_class=HTMLResponse)
async def dashboard() -> HTMLResponse:
    return HTMLResponse((BASE_DIR / "app" / "web" / "templates" / "index.html").read_text(encoding="utf-8"))


def overlay_html(mode: str) -> HTMLResponse:
    content = (BASE_DIR / "app" / "web" / "templates" / "overlay.html").read_text(encoding="utf-8")
    return HTMLResponse(content.replace("__AURA_OVERLAY_MODE__", mode))


@app.get("/overlay", response_class=HTMLResponse)
async def overlay() -> HTMLResponse:
    return overlay_html("alerts")


@app.get("/overlay/chat", response_class=HTMLResponse)
async def overlay_chat() -> HTMLResponse:
    return overlay_html("chat")


@app.get("/overlay/goal", response_class=HTMLResponse)
async def overlay_goal() -> HTMLResponse:
    return overlay_html("goal")


@app.get("/overlay/screen", response_class=HTMLResponse)
async def overlay_screen() -> HTMLResponse:
    return overlay_html("screen")


@app.get("/overlay/song", response_class=HTMLResponse)
async def overlay_song() -> HTMLResponse:
    return HTMLResponse((BASE_DIR / "app" / "web" / "templates" / "song_overlay.html").read_text(encoding="utf-8"))


@app.get("/overlay/streamathon", response_class=HTMLResponse)
async def overlay_streamathon() -> HTMLResponse:
    return HTMLResponse((BASE_DIR / "app" / "web" / "templates" / "streamathon_overlay.html").read_text(encoding="utf-8"))


@app.get("/overlay/avatar", response_class=HTMLResponse)
async def overlay_avatar() -> HTMLResponse:
    return HTMLResponse((BASE_DIR / "app" / "web" / "templates" / "avatar_overlay.html").read_text(encoding="utf-8"))


def complete_overlay_html(mode: str) -> HTMLResponse:
    content = (BASE_DIR / "app" / "web" / "templates" / "complete_overlay.html").read_text(encoding="utf-8")
    return HTMLResponse(content.replace("__COMPLETE_OVERLAY_MODE__", mode))


@app.get("/overlay/emotes", response_class=HTMLResponse)
async def overlay_emotes() -> HTMLResponse:
    return complete_overlay_html("emotes")


@app.get("/overlay/topwords", response_class=HTMLResponse)
async def overlay_topwords() -> HTMLResponse:
    return complete_overlay_html("topwords")


@app.get("/overlay/giveaway", response_class=HTMLResponse)
async def overlay_giveaway() -> HTMLResponse:
    return complete_overlay_html("giveaway")


@app.get("/overlay/credits", response_class=HTMLResponse)
async def overlay_credits() -> HTMLResponse:
    return complete_overlay_html("credits")


@app.get("/overlay/ping", response_class=HTMLResponse)
async def overlay_ping() -> HTMLResponse:
    return complete_overlay_html("ping")


@app.get("/channel", response_class=HTMLResponse)
async def public_channel_page() -> HTMLResponse:
    return HTMLResponse((BASE_DIR / "app" / "web" / "templates" / "channel.html").read_text(encoding="utf-8"))


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "name": "Aura Live", "version": "1.2.0"}


@app.get("/api/status")
async def api_status() -> dict[str, Any]:
    return await aura.status()


def normalize_twitch_poll(poll: dict[str, Any] | None) -> dict[str, Any] | None:
    if not poll:
        return None
    choices = []
    total_votes = 0
    for index, choice in enumerate(poll.get("choices", []), start=1):
        votes = int(choice.get("votes", 0))
        total_votes += votes
        choices.append({
            "id": choice.get("id"),
            "position": index,
            "label": choice.get("title", ""),
            "title": choice.get("title", ""),
            "votes": votes,
        })
    return {
        "id": poll.get("id"),
        "question": poll.get("title", ""),
        "title": poll.get("title", ""),
        "options": choices,
        "choices": choices,
        "total_votes": total_votes,
        "status": poll.get("status"),
        "duration": poll.get("duration"),
        "started_at": poll.get("started_at"),
        "ended_at": poll.get("ended_at"),
        "source": "twitch",
    }


@app.get("/api/overview")
async def api_overview() -> dict[str, Any]:
    overview = await db.overview()
    giveaway = await aura.engagement.active_giveaway()
    poll = None
    try:
        poll = normalize_twitch_poll(await aura.twitch.active_poll())
    except Exception:
        logger.debug("Sondage Twitch indisponible dans la vue d'ensemble", exc_info=True)
    return {**overview, "giveaway": giveaway, "poll": poll}


@app.get("/api/activity")
async def api_activity(limit: int = 30) -> list[dict[str, Any]]:
    return await db.fetchall(
        "SELECT id,event_type,payload,created_at FROM event_log ORDER BY id DESC LIMIT ?",
        (min(max(limit, 1), 200),),
    )


@app.get("/api/commands")
async def list_commands() -> list[dict[str, Any]]:
    return await db.fetchall("SELECT * FROM commands ORDER BY name")


@app.post("/api/commands")
async def create_command(command: CommandInput) -> dict[str, Any]:
    name = command.name.strip().lower()
    if not name.startswith("!"):
        name = "!" + name
    try:
        command_id = await db.execute(
            """
            INSERT INTO commands(name,response,cooldown_seconds,min_role,enabled,created_at)
            VALUES(?,?,?,?,?,datetime('now'))
            """,
            (name, command.response, command.cooldown_seconds, command.min_role, int(command.enabled)),
        )
    except Exception as exc:
        raise HTTPException(409, "Commande déjà existante ou invalide") from exc
    return {"id": command_id, "name": name}


@app.put("/api/commands/{command_id}")
async def update_command(command_id: int, command: CommandInput) -> dict[str, bool]:
    name = command.name.strip().lower()
    if not name.startswith("!"):
        name = "!" + name
    await db.execute(
        """
        UPDATE commands SET name=?,response=?,cooldown_seconds=?,min_role=?,enabled=? WHERE id=?
        """,
        (name, command.response, command.cooldown_seconds, command.min_role, int(command.enabled), command_id),
    )
    return {"ok": True}


@app.delete("/api/commands/{command_id}")
async def delete_command(command_id: int) -> dict[str, bool]:
    await db.execute("DELETE FROM commands WHERE id=?", (command_id,))
    return {"ok": True}


@app.get("/api/viewers/top")
async def viewers_top(limit: int = 20) -> list[dict[str, Any]]:
    return await db.top_viewers(min(max(limit, 1), 100))


@app.get("/api/shop")
async def list_shop() -> list[dict[str, Any]]:
    return await db.fetchall("SELECT * FROM shop_items ORDER BY cost,id")


@app.post("/api/shop")
async def create_shop_item(item: ShopInput) -> dict[str, Any]:
    import json

    item_id = await db.execute(
        """
        INSERT INTO shop_items(name,description,cost,action_type,action_payload,enabled)
        VALUES(?,?,?,?,?,?)
        """,
        (item.name, item.description, item.cost, item.action_type, json.dumps(item.action_payload), int(item.enabled)),
    )
    return {"id": item_id}


@app.delete("/api/shop/{item_id}")
async def delete_shop_item(item_id: int) -> dict[str, bool]:
    await db.execute("DELETE FROM shop_items WHERE id=?", (item_id,))
    return {"ok": True}


@app.get("/api/giveaway")
async def get_giveaway() -> dict[str, Any]:
    giveaway = await aura.engagement.active_giveaway()
    if not giveaway:
        return {"active": False}
    entries = await aura.engagement.giveaway_entries(int(giveaway["id"]))
    return {"active": True, "giveaway": giveaway, "entries": entries}


@app.post("/api/giveaway")
async def create_giveaway(payload: GiveawayInput) -> dict[str, Any]:
    giveaway = await aura.engagement.create_giveaway(payload.title, payload.keyword, payload.cost)
    await aura.say(f"Concours ouvert : « {payload.title} ». Participation avec {payload.keyword}.")
    await aura.overlay.emit({"type": "giveaway_open", "viewer": "Aura", "message": payload.title})
    return giveaway


@app.post("/api/giveaway/draw")
async def draw_giveaway() -> dict[str, Any]:
    result = await aura.engagement.draw_giveaway()
    if not result:
        raise HTTPException(404, "Aucun concours actif")
    if result["winner"]:
        await aura.say(f"{result['winner']['display_name']} remporte « {result['giveaway']['title']} » !")
        await aura.overlay.emit({"type": "giveaway_winner", "viewer": result["winner"]["display_name"], "message": result["giveaway"]["title"]})
    return result


@app.get("/api/queue")
async def get_queue() -> list[dict[str, Any]]:
    return await aura.engagement.queue_list()


@app.post("/api/queue")
async def add_queue(payload: QueueInput) -> dict[str, str]:
    viewer = {"user_id": payload.user_id, "login": payload.login, "display_name": payload.display_name}
    return {"message": await aura.engagement.queue_join(viewer, payload.note)}


@app.post("/api/queue/next")
async def queue_next() -> dict[str, Any]:
    entry = await aura.engagement.queue_next()
    if entry:
        await aura.overlay.emit({"type": "queue_next", "viewer": entry["display_name"], "message": "À toi de jouer !"})
    return {"entry": entry}


@app.delete("/api/queue")
async def queue_clear() -> dict[str, bool]:
    await aura.engagement.queue_clear()
    return {"ok": True}


@app.get("/api/poll")
async def get_poll() -> dict[str, Any]:
    try:
        return {"poll": normalize_twitch_poll(await aura.twitch.active_poll()), "error": None}
    except Exception as exc:
        return {"poll": None, "error": str(exc)}


@app.post("/api/poll")
async def create_poll(payload: PollInput) -> dict[str, Any]:
    options = [option.strip() for option in payload.options if option.strip()]
    if len(options) < 2 or len(options) > 5:
        raise HTTPException(400, "Un sondage Twitch doit contenir entre 2 et 5 réponses")
    if any(len(option) > 25 for option in options):
        raise HTTPException(400, "Chaque réponse est limitée à 25 caractères")
    try:
        poll = await aura.twitch.create_poll(payload.question.strip(), options, payload.duration)
    except Exception as exc:
        raise HTTPException(503, str(exc)) from exc
    await aura.overlay.emit({
        "type": "poll",
        "viewer": "AURA LIVE",
        "message": payload.question,
        "options": options,
    })
    return normalize_twitch_poll(poll) or {}


@app.post("/api/poll/close")
async def close_poll() -> dict[str, Any]:
    try:
        active = await aura.twitch.active_poll()
        if not active:
            raise HTTPException(404, "Aucun sondage Twitch actif")
        poll = await aura.twitch.end_poll(str(active["id"]), "TERMINATED")
        return normalize_twitch_poll(poll) or {}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, str(exc)) from exc


@app.get("/api/counters")
async def list_counters() -> list[dict[str, Any]]:
    return await aura.engagement.counters()


@app.post("/api/counters/{slug}/increment")
async def increment_counter(slug: str) -> dict[str, Any]:
    counter = await aura.engagement.counter_change(slug, 1)
    if not counter:
        raise HTTPException(404, "Compteur inconnu")
    await aura.overlay.emit({"type": "counter", "slug": slug, "label": counter["label"], "value": counter["value"]})
    return counter


@app.post("/api/counters/{slug}/decrement")
async def decrement_counter(slug: str) -> dict[str, Any]:
    counter = await aura.engagement.counter_change(slug, -1)
    if not counter:
        raise HTTPException(404, "Compteur inconnu")
    await aura.overlay.emit({"type": "counter", "slug": slug, "label": counter["label"], "value": counter["value"]})
    return counter


@app.put("/api/counters/{slug}")
async def set_counter(slug: str, payload: CounterInput) -> dict[str, Any]:
    counter = await aura.engagement.counter_set(slug, payload.value)
    if not counter:
        raise HTTPException(404, "Compteur inconnu")
    return counter


@app.get("/api/tts")
async def list_tts() -> list[dict[str, Any]]:
    return await aura.engagement.pending_tts()


@app.post("/api/tts")
async def create_tts(payload: TTSInput) -> dict[str, str]:
    viewer = await db.get_viewer(user_id=payload.user_id)
    if not viewer:
        viewer = await db.upsert_viewer(payload.user_id, payload.login, payload.display_name)
        await db.adjust_points(payload.user_id, 100000, "crédit dashboard TTS")
        viewer = await db.get_viewer(user_id=payload.user_id) or viewer
    message = await aura.engagement.enqueue_tts(viewer, payload.text)
    await aura.push_next_tts()
    return {"message": message}


@app.post("/api/tts/next")
async def tts_next() -> dict[str, Any]:
    return {"item": await aura.push_next_tts()}


@app.get("/api/announcements")
async def list_announcements() -> list[dict[str, Any]]:
    return await aura.studio.announcements()


@app.post("/api/announcements")
async def create_announcement(payload: AnnouncementInput) -> dict[str, Any]:
    return await aura.studio.create_announcement(**payload.model_dump())


@app.put("/api/announcements/{announcement_id}")
async def update_announcement(announcement_id: int, payload: AnnouncementInput) -> dict[str, Any]:
    row = await aura.studio.update_announcement(announcement_id, payload.model_dump())
    if not row:
        raise HTTPException(404, "Annonce introuvable")
    return row


@app.delete("/api/announcements/{announcement_id}")
async def delete_announcement(announcement_id: int) -> dict[str, bool]:
    await db.execute("DELETE FROM announcements WHERE id=?", (announcement_id,))
    return {"ok": True}


@app.get("/api/alert-templates")
async def list_alert_templates() -> list[dict[str, Any]]:
    return await aura.studio.alert_templates()


@app.put("/api/alert-templates/{event_type}")
async def save_alert_template(event_type: str, payload: AlertTemplateInput) -> dict[str, Any]:
    return await aura.studio.save_alert_template(event_type, payload.model_dump())


@app.get("/api/goals")
async def list_goals() -> list[dict[str, Any]]:
    return await aura.studio.goals()


@app.post("/api/goals")
async def create_goal(payload: GoalInput) -> dict[str, Any]:
    row = await aura.studio.create_goal(**payload.model_dump())
    await aura.overlay.emit({"type": "goal_update", "goal": row})
    return row


@app.put("/api/goals/{goal_id}")
async def update_goal(goal_id: int, payload: GoalInput) -> dict[str, Any]:
    row = await aura.studio.update_goal(goal_id, payload.model_dump())
    if not row:
        raise HTTPException(404, "Objectif introuvable")
    await aura.overlay.emit({"type": "goal_update", "goal": row})
    return row


@app.delete("/api/goals/{goal_id}")
async def delete_goal(goal_id: int) -> dict[str, bool]:
    await db.execute("DELETE FROM goals WHERE id=?", (goal_id,))
    await aura.overlay.emit({"type": "goal_update", "goal": await aura.studio.active_goal()})
    return {"ok": True}


@app.get("/api/goal/active")
async def active_goal() -> dict[str, Any]:
    return {"goal": await aura.studio.active_goal()}


@app.get("/api/reward-actions")
async def list_reward_actions() -> list[dict[str, Any]]:
    return await aura.studio.reward_actions()


@app.post("/api/reward-actions")
async def create_reward_action(payload: RewardActionInput) -> dict[str, Any]:
    try:
        return await aura.studio.create_reward_action(**payload.model_dump())
    except Exception as exc:
        raise HTTPException(409, "Une action existe déjà pour cette récompense") from exc


@app.delete("/api/reward-actions/{action_id}")
async def delete_reward_action(action_id: int) -> dict[str, bool]:
    await db.execute("DELETE FROM reward_actions WHERE id=?", (action_id,))
    return {"ok": True}


@app.get("/api/moderation/log")
async def moderation_log(limit: int = 50) -> list[dict[str, Any]]:
    return await db.fetchall(
        "SELECT * FROM moderation_log ORDER BY id DESC LIMIT ?",
        (min(max(limit, 1), 200),),
    )


@app.post("/api/control/{action}")
async def control_bot(action: str) -> dict[str, Any]:
    if action == "activate":
        await db.set_setting("bot.active", True)
        await db.set_setting("bot.silent", False)
    elif action == "silence":
        await db.set_setting("bot.silent", True)
    elif action == "emergency":
        current = bool(await db.get_setting("moderation.emergency_mode", False))
        await db.set_setting("moderation.emergency_mode", not current)
    else:
        raise HTTPException(404, "Action inconnue")
    return await aura.status()


@app.get("/api/prediction")
async def get_prediction() -> dict[str, Any]:
    try:
        return {"prediction": await aura.twitch.active_prediction(), "error": None}
    except Exception as exc:
        return {"prediction": None, "error": str(exc)}


@app.post("/api/prediction")
async def create_prediction(payload: PredictionInput) -> dict[str, Any]:
    outcomes = [item.strip() for item in payload.outcomes if item.strip()]
    if len(outcomes) < 2:
        raise HTTPException(400, "Deux résultats minimum sont requis")
    try:
        row = await aura.twitch.create_prediction(payload.title.strip(), outcomes, payload.window)
        await aura.overlay.emit({"type": "prediction", "viewer": "Aura", "message": payload.title})
        return row
    except Exception as exc:
        raise HTTPException(503, str(exc)) from exc


@app.post("/api/prediction/{prediction_id}/resolve")
async def resolve_prediction(prediction_id: str, payload: PredictionResolveInput) -> dict[str, Any]:
    try:
        return await aura.twitch.end_prediction(prediction_id, payload.status, payload.winning_outcome_id)
    except Exception as exc:
        raise HTTPException(503, str(exc)) from exc


@app.get("/api/settings")
async def api_settings() -> dict[str, Any]:
    return await db.all_settings()


@app.put("/api/settings/{key:path}")
async def set_setting(key: str, setting: SettingInput) -> dict[str, bool]:
    await db.set_setting(key, setting.value)
    return {"ok": True}


@app.post("/api/chat/send")
async def send_chat(payload: ChatInput) -> dict[str, Any]:
    try:
        result = await aura.twitch.send_chat(payload.message)
        accounts = await aura.twitch.account_status()
        return {
            "ok": True,
            "result": result,
            "sender": accounts["bot"].get("display_name") or accounts["bot"].get("login"),
        }
    except Exception as exc:
        raise HTTPException(503, str(exc)) from exc




@app.get("/api/ai/diagnostic")
async def ai_diagnostic() -> dict[str, Any]:
    accounts = await aura.twitch.account_status()
    return {
        "ok": True,
        "ai_enabled": aura.ai.enabled,
        "ai_mode": settings.ai_mode,
        "ai_model": settings.ai_model,
        "ai_timeout_seconds": settings.ai_timeout_seconds,
        "reply_enabled": bool(await db.get_setting("ai.reply_enabled", True)),
        "trigger_names": await db.get_setting("ai.trigger_names", ["aura", "mairaiy"]),
        "direct_cooldown_seconds": int(await db.get_setting("ai.direct_cooldown_seconds", 4)),
        "threaded_replies": False,
        "thinking_message_enabled": False,
        "warmup_enabled": settings.ai_warmup_enabled,
        "bot_active": bool(await db.get_setting("bot.active", True)),
        "bot_silent": bool(await db.get_setting("bot.silent", False)),
        "chat_eventsub_connected": aura.twitch.chat_connected,
        "broadcaster_eventsub_connected": aura.twitch.eventsub_connected.get("broadcaster", False),
        "bot_account": accounts["bot"],
        "broadcaster_account": accounts["broadcaster"],
        "ai_busy": aura.ai_lock.locked(),
    }

@app.post("/api/ai/test")
async def ai_test(payload: AITestInput) -> dict[str, Any]:
    if not aura.ai.enabled:
        raise HTTPException(503, "Le moteur IA est désactivé. Vérifie AI_MODE=ollama dans .env")
    try:
        answer = await aura.ai.reply(
            payload.viewer_name,
            payload.message,
            "conversation privée depuis le panneau Aura, sans mémoire viewer",
            list(aura.recent_chat),
        )
        sent = False
        sender = None
        if payload.send_to_chat:
            result = await aura.twitch.send_chat(answer)
            sent = bool(result.get("is_sent"))
            accounts = await aura.twitch.account_status()
            sender = accounts["bot"].get("display_name") or accounts["bot"].get("login")
        return {"ok": True, "answer": answer, "sent_to_chat": sent, "sender": sender}
    except Exception as exc:
        raise HTTPException(503, str(exc)) from exc


@app.get("/api/avatar/settings")
async def avatar_settings() -> dict[str, Any]:
    return {
        "enabled": bool(await db.get_setting("avatar.enabled", True)),
        "voice": str(await db.get_setting("avatar.voice", "")),
        "rate": float(await db.get_setting("avatar.rate", 1.0)),
        "pitch": float(await db.get_setting("avatar.pitch", 1.0)),
        "volume": float(await db.get_setting("avatar.volume", 1.0)),
        "subtitles": bool(await db.get_setting("avatar.subtitles", True)),
        "subtitle_seconds": int(await db.get_setting("avatar.subtitle_seconds", 12)),
    }


@app.put("/api/avatar/settings")
async def update_avatar_settings(payload: AvatarSettingsInput) -> dict[str, Any]:
    values = payload.model_dump()
    for key, value in values.items():
        await db.set_setting(f"avatar.{key}", value)
    return values


@app.post("/api/avatar/test")
async def avatar_test(payload: AvatarTestInput) -> dict[str, bool]:
    await aura.overlay.emit({"type": "avatar_test", "text": payload.text, "message": payload.text, "speak": True})
    return {"ok": True}


@app.delete("/api/ai/conversation/{user_id}")
async def reset_ai_conversation(user_id: str) -> dict[str, bool]:
    await aura.memory.reset_conversation(user_id)
    return {"ok": True}


@app.post("/api/overlay/test")
async def overlay_test(payload: OverlayInput) -> dict[str, bool]:
    await aura.overlay.emit(payload.model_dump())
    return {"ok": True}


@app.post("/api/obs/test")
async def obs_test() -> dict[str, Any]:
    try:
        return {"ok": True, "data": await aura.obs.test()}
    except Exception as exc:
        raise HTTPException(503, str(exc)) from exc




@app.get("/api/twitch/accounts")
async def twitch_accounts() -> dict[str, Any]:
    return await aura.twitch.account_status()


@app.delete("/api/twitch/accounts/{role}")
async def disconnect_twitch_account(role: str) -> dict[str, bool]:
    if role not in {"bot", "broadcaster"}:
        raise HTTPException(404, "Rôle Twitch inconnu")
    await aura.twitch.disconnect(role)
    return {"ok": True}


@app.get("/auth/twitch/{role}")
async def twitch_auth(role: str):
    if not settings.twitch_configured:
        raise HTTPException(400, "Renseigne TWITCH_CLIENT_ID et TWITCH_CLIENT_SECRET dans .env")
    if role not in {"bot", "broadcaster"}:
        raise HTTPException(404, "Rôle inconnu")
    url = await aura.twitch.build_auth_url(role)
    return RedirectResponse(url)


@app.get("/auth/callback", response_class=HTMLResponse)
async def twitch_callback(code: str = "", state: str = "", error: str = "") -> HTMLResponse:
    if error:
        return HTMLResponse(f"<h1>Autorisation refusée</h1><p>{error}</p>", status_code=400)
    try:
        role = await aura.twitch.handle_oauth_callback(code, state)
    except Exception as exc:
        logger.exception("OAuth Twitch")
        return HTMLResponse(f"<h1>Erreur OAuth</h1><p>{exc}</p>", status_code=400)
    return HTMLResponse(
        f"<h1>Compte {role} connecté</h1>"
        "<p>Tu peux fermer cette fenêtre et revenir au panneau Aura.</p>"
        "<script>setTimeout(()=>location.href='/',1800)</script>"
    )


@app.websocket("/ws/overlay")
async def overlay_socket(websocket: WebSocket):
    await aura.overlay.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await aura.overlay.disconnect(websocket)
    except Exception:
        await aura.overlay.disconnect(websocket)


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
        log_level=settings.log_level.lower(),
    )
