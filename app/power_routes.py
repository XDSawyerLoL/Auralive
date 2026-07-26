from __future__ import annotations

import json
import mimetypes
import re
import secrets
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.database import utcnow


class AdvancedCommandInput(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    aliases: list[str] = Field(default_factory=list)
    trigger_type: str = Field(default="exact", pattern="^(exact|starts|contains|regex)$")
    trigger_value: str = Field(default="", max_length=300)
    responses: list[str] = Field(default_factory=list)
    actions: list[dict[str, Any]] = Field(default_factory=list)
    cooldown_user: int = Field(default=10, ge=0, le=86400)
    cooldown_global: int = Field(default=2, ge=0, le=86400)
    min_role: str = Field(default="everyone", pattern="^(everyone|subscriber|mod|broadcaster)$")
    min_level: int = Field(default=1, ge=1, le=10000)
    min_points: int = Field(default=0, ge=0, le=10_000_000)
    cost: int = Field(default=0, ge=0, le=10_000_000)
    only_live: bool = False
    game_contains: str = Field(default="", max_length=100)
    enabled: bool = True


class SongInput(BaseModel):
    user_id: str = "dashboard"
    login: str = "dashboard"
    display_name: str = "Sansa"
    url: str = Field(min_length=3, max_length=500)
    title: str = Field(default="", max_length=180)


class SongBlacklistInput(BaseModel):
    value: str = Field(min_length=3, max_length=500)
    reason: str = Field(default="", max_length=200)


class BetInput(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    options: list[str] = Field(min_length=2, max_length=6)
    min_stake: int = Field(default=10, ge=1)
    max_stake: int = Field(default=10000, ge=1)
    duration_minutes: int = Field(default=10, ge=1, le=1440)


class BetEntryInput(BaseModel):
    user_id: str
    login: str
    display_name: str
    option_position: int = Field(ge=1, le=6)
    stake: int = Field(ge=1)


class BetResolveInput(BaseModel):
    option_id: int


class RouletteInput(BaseModel):
    user_id: str
    login: str
    display_name: str
    stake: int = Field(ge=1)


class LootInput(BaseModel):
    user_id: str
    login: str
    display_name: str


class CraftInput(LootInput):
    recipe_id: int


class GrantItemInput(BaseModel):
    user_id: str
    slug: str
    quantity: int = Field(default=1, ge=1, le=999)


class AuctionInput(LootInput):
    item_id: int
    quantity: int = Field(default=1, ge=1, le=99)
    start_price: int = Field(ge=1)
    minutes: int = Field(default=10, ge=1, le=10080)


class BidInput(LootInput):
    amount: int = Field(ge=1)


class StreamathonInput(BaseModel):
    title: str = Field(min_length=2, max_length=100)
    initial_minutes: int = Field(default=60, ge=1, le=100000)
    follow: int = Field(default=60, ge=0, le=86400)
    sub: int = Field(default=300, ge=0, le=86400)
    gift: int = Field(default=300, ge=0, le=86400)
    bits100: int = Field(default=60, ge=0, le=86400)


class StreamathonAdjustInput(BaseModel):
    seconds: int = Field(ge=-86400, le=86400)
    reason: str = Field(default="Ajustement manuel", max_length=200)
    actor: str = Field(default="Sansa", max_length=80)


class ScheduleInput(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    interval_minutes: int = Field(default=60, ge=1, le=10080)
    action_type: str = Field(default="chat", pattern="^(chat|overlay|obs_scene|counter|clip|webhook)$")
    action_payload: dict[str, Any] = Field(default_factory=dict)
    only_live: bool = False
    enabled: bool = True


class IntegrationInput(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    kind: str = Field(default="discord_webhook", pattern="^(discord_webhook|generic_webhook)$")
    config: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = False


class TTSActionInput(BaseModel):
    action: str = Field(pattern="^(approve|reject|play)$")
    note: str = Field(default="", max_length=300)


class TwitchRewardInput(BaseModel):
    title: str = Field(min_length=1, max_length=45)
    cost: int = Field(ge=1)
    prompt: str = Field(default="", max_length=200)
    is_enabled: bool = True
    is_user_input_required: bool = False
    background_color: str = Field(default="#00E5CB", pattern=r"^#[0-9A-Fa-f]{6}$")
    should_redemptions_skip_request_queue: bool = False
    global_cooldown_seconds: int = Field(default=0, ge=0, le=604800)


class TwitchRewardPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=45)
    cost: int | None = Field(default=None, ge=1)
    prompt: str | None = Field(default=None, max_length=200)
    is_enabled: bool | None = None
    is_paused: bool | None = None
    background_color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")


class RedemptionStatusInput(BaseModel):
    reward_id: str
    redemption_id: str
    status: str = Field(pattern="^(FULFILLED|CANCELED)$")


def viewer(payload: Any) -> dict[str, Any]:
    return {"user_id": payload.user_id, "login": payload.login, "display_name": payload.display_name, "points": 0, "level": 1}


def build_power_router(aura: Any, db: Any, settings: Any) -> APIRouter:
    router = APIRouter(prefix="/api/power", tags=["Aura Power Suite"])

    @router.get("/summary")
    async def summary() -> dict[str, Any]:
        return {
            "commands": len(await aura.power.list_commands()),
            "songs": len(await aura.power.song_queue()),
            "bet": await aura.power.active_bet(),
            "streamathon": await aura.power.active_streamathon(),
            "auctions": len(await aura.power.auctions()),
            "integrations": len(await aura.power.integrations()),
        }

    @router.get("/commands")
    async def commands() -> list[dict[str, Any]]:
        return await aura.power.list_commands()

    @router.post("/commands")
    async def create_command(payload: AdvancedCommandInput) -> dict[str, Any]:
        try:
            return await aura.power.save_command(payload.model_dump())
        except Exception as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.put("/commands/{command_id}")
    async def update_command(command_id: int, payload: AdvancedCommandInput) -> dict[str, Any]:
        try:
            return await aura.power.save_command(payload.model_dump(), command_id)
        except Exception as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.delete("/commands/{command_id}")
    async def delete_command(command_id: int) -> dict[str, bool]:
        await aura.power.delete_command(command_id)
        return {"ok": True}

    @router.get("/songs")
    async def songs() -> list[dict[str, Any]]:
        return await aura.power.song_queue()

    @router.post("/songs")
    async def add_song(payload: SongInput) -> dict[str, str]:
        v = viewer(payload)
        db_viewer = await db.get_viewer(user_id=payload.user_id)
        if db_viewer:
            v = db_viewer
        elif payload.user_id == "dashboard":
            v["points"] = 10_000_000
        return {"message": await aura.power.add_song(v, payload.url, payload.title)}

    @router.post("/songs/next")
    async def next_song() -> dict[str, Any]:
        return {"song": await aura.power.next_song()}

    @router.delete("/songs")
    async def clear_songs() -> dict[str, bool]:
        await aura.power.clear_songs()
        return {"ok": True}

    @router.delete("/songs/{song_id}")
    async def remove_song(song_id: int, refund: bool = False) -> dict[str, bool]:
        await aura.power.remove_song(song_id, refund)
        return {"ok": True}

    @router.post("/songs/blacklist")
    async def blacklist_song(payload: SongBlacklistInput) -> dict[str, bool]:
        await aura.power.blacklist_song(payload.value, payload.reason)
        return {"ok": True}

    @router.get("/bets")
    async def bet_state() -> dict[str, Any] | None:
        return await aura.power.active_bet()

    @router.post("/bets")
    async def create_bet(payload: BetInput) -> dict[str, Any]:
        return await aura.power.create_bet(payload.title, payload.options, payload.min_stake, payload.max_stake, payload.duration_minutes)

    @router.post("/bets/entry")
    async def bet_entry(payload: BetEntryInput) -> dict[str, str]:
        v = await db.get_viewer(user_id=payload.user_id) or viewer(payload)
        return {"message": await aura.power.place_bet(v, payload.option_position, payload.stake)}

    @router.post("/bets/resolve")
    async def bet_resolve(payload: BetResolveInput) -> dict[str, Any]:
        try:
            return await aura.power.resolve_bet(payload.option_id)
        except Exception as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.post("/roulette")
    async def roulette(payload: RouletteInput) -> dict[str, str]:
        v = await db.get_viewer(user_id=payload.user_id) or viewer(payload)
        return {"message": await aura.power.roulette(v, payload.stake)}

    @router.get("/inventory/{user_id}")
    async def inventory(user_id: str) -> list[dict[str, Any]]:
        return await aura.power.inventory(user_id)

    @router.get("/items")
    async def items() -> list[dict[str, Any]]:
        return await db.fetchall("SELECT * FROM inventory_items ORDER BY name")

    @router.post("/items/grant")
    async def grant_item(payload: GrantItemInput) -> dict[str, bool]:
        await aura.power.grant_item(payload.user_id, payload.slug, payload.quantity)
        return {"ok": True}

    @router.post("/loot")
    async def loot(payload: LootInput) -> dict[str, str]:
        v = await db.get_viewer(user_id=payload.user_id) or viewer(payload)
        return {"message": await aura.power.loot(v)}

    @router.get("/recipes")
    async def recipes() -> list[dict[str, Any]]:
        return await aura.power.recipes()

    @router.post("/craft")
    async def craft(payload: CraftInput) -> dict[str, str]:
        v = await db.get_viewer(user_id=payload.user_id) or viewer(payload)
        return {"message": await aura.power.craft(v, payload.recipe_id)}

    @router.get("/auctions")
    async def auctions() -> list[dict[str, Any]]:
        return await aura.power.auctions()

    @router.post("/auctions")
    async def create_auction(payload: AuctionInput) -> dict[str, Any]:
        v = await db.get_viewer(user_id=payload.user_id) or viewer(payload)
        try:
            return await aura.power.create_auction(v, payload.item_id, payload.quantity, payload.start_price, payload.minutes)
        except Exception as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.post("/auctions/{auction_id}/bid")
    async def bid(auction_id: int, payload: BidInput) -> dict[str, str]:
        v = await db.get_viewer(user_id=payload.user_id) or viewer(payload)
        return {"message": await aura.power.bid(v, auction_id, payload.amount)}

    @router.get("/streamathon")
    async def streamathon() -> dict[str, Any] | None:
        return await aura.power.active_streamathon()

    @router.post("/streamathon")
    async def start_streamathon(payload: StreamathonInput) -> dict[str, Any]:
        return await aura.power.start_streamathon(payload.title, payload.initial_minutes, {"follow": payload.follow, "sub": payload.sub, "gift": payload.gift, "bits100": payload.bits100})

    @router.post("/streamathon/adjust")
    async def adjust_streamathon(payload: StreamathonAdjustInput) -> dict[str, Any] | None:
        return await aura.power.add_streamathon_time(payload.seconds, payload.reason, payload.actor)

    @router.get("/schedules")
    async def schedules() -> list[dict[str, Any]]:
        return await aura.power.schedules()

    @router.post("/schedules")
    async def create_schedule(payload: ScheduleInput) -> dict[str, Any]:
        return await aura.power.save_schedule(payload.model_dump())

    @router.put("/schedules/{schedule_id}")
    async def update_schedule(schedule_id: int, payload: ScheduleInput) -> dict[str, Any]:
        return await aura.power.save_schedule(payload.model_dump(), schedule_id)

    @router.delete("/schedules/{schedule_id}")
    async def delete_schedule(schedule_id: int) -> dict[str, bool]:
        await db.execute("DELETE FROM schedules WHERE id=?", (schedule_id,))
        return {"ok": True}

    @router.get("/integrations")
    async def integrations() -> list[dict[str, Any]]:
        return await aura.power.integrations()

    @router.post("/integrations")
    async def save_integration(payload: IntegrationInput) -> dict[str, Any]:
        return await aura.power.save_integration(payload.name, payload.kind, payload.config, payload.enabled)

    @router.post("/integrations/{name}/test")
    async def test_integration(name: str) -> dict[str, bool]:
        try:
            await aura.power.test_integration(name)
            return {"ok": True}
        except Exception as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.post("/tts/{row_id}/action")
    async def tts_action(row_id: int, payload: TTSActionInput) -> dict[str, Any] | None:
        return await aura.power.tts_action(row_id, payload.action, payload.note)

    @router.get("/security/events")
    async def security_events(limit: int = 100) -> list[dict[str, Any]]:
        return await aura.power.security_events(limit)

    @router.post("/security/test-follow-guard")
    async def test_follow_guard(count: int = 10) -> list[dict[str, Any]]:
        return await aura.power.test_follow_guard(count)

    @router.get("/analytics")
    async def analytics(days: int = 30) -> dict[str, Any]:
        return await aura.power.analytics(days)

    @router.get("/media")
    async def media() -> list[dict[str, Any]]:
        return await db.fetchall("SELECT * FROM media_assets ORDER BY id DESC")

    @router.post("/media")
    async def upload_media(file: UploadFile = File(...)) -> dict[str, Any]:
        settings.media_dir.mkdir(parents=True, exist_ok=True)
        original = Path(file.filename or "asset.bin").name
        suffix = Path(original).suffix.lower()
        allowed = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp3", ".wav", ".ogg", ".mp4", ".webm"}
        if suffix not in allowed:
            raise HTTPException(400, "Format refusé. Images, GIF, audio et vidéo uniquement.")
        data = await file.read()
        if len(data) > 25 * 1024 * 1024:
            raise HTTPException(400, "Fichier limité à 25 Mo.")
        stored = f"{secrets.token_hex(12)}{suffix}"
        path = settings.media_dir / stored
        path.write_bytes(data)
        mime = file.content_type or mimetypes.guess_type(original)[0] or "application/octet-stream"
        kind = "image" if mime.startswith("image/") else "audio" if mime.startswith("audio/") else "video"
        public_path = f"/media/{stored}"
        row_id = await db.execute("INSERT INTO media_assets(filename,stored_name,kind,mime_type,size_bytes,public_path,created_at) VALUES(?,?,?,?,?,?,?)", (original, stored, kind, mime, len(data), public_path, utcnow()))
        return await db.fetchone("SELECT * FROM media_assets WHERE id=?", (row_id,)) or {}

    @router.delete("/media/{asset_id}")
    async def delete_media(asset_id: int) -> dict[str, bool]:
        row = await db.fetchone("SELECT * FROM media_assets WHERE id=?", (asset_id,))
        if row:
            path = settings.media_dir / row["stored_name"]
            if path.exists():
                path.unlink()
            await db.execute("DELETE FROM media_assets WHERE id=?", (asset_id,))
        return {"ok": True}

    @router.get("/twitch/rewards")
    async def twitch_rewards() -> list[dict[str, Any]]:
        try:
            return await aura.twitch.get_custom_rewards()
        except Exception as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.post("/twitch/rewards")
    async def create_twitch_reward(payload: TwitchRewardInput) -> dict[str, Any]:
        try:
            return await aura.twitch.create_custom_reward(payload.model_dump())
        except Exception as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.patch("/twitch/rewards/{reward_id}")
    async def update_twitch_reward(reward_id: str, payload: TwitchRewardPatch) -> dict[str, Any]:
        try:
            return await aura.twitch.update_custom_reward(reward_id, payload.model_dump(exclude_none=True))
        except Exception as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.delete("/twitch/rewards/{reward_id}")
    async def delete_twitch_reward(reward_id: str) -> dict[str, bool]:
        try:
            await aura.twitch.delete_custom_reward(reward_id)
            return {"ok": True}
        except Exception as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.post("/twitch/redemptions/status")
    async def redemption_status(payload: RedemptionStatusInput) -> dict[str, Any]:
        try:
            return await aura.twitch.update_redemption_status(payload.reward_id, payload.redemption_id, payload.status)
        except Exception as exc:
            raise HTTPException(400, str(exc)) from exc

    return router
