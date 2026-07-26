from __future__ import annotations

from datetime import datetime, timezone

from app.database import Database


class LoyaltyModule:
    def __init__(self, db: Database):
        self.db = db

    async def on_message(self, viewer: dict) -> dict:
        cooldown = int(await self.db.get_setting("loyalty.cooldown_seconds", 60))
        last = viewer.get("last_point_at")
        now = datetime.now(timezone.utc)
        if last:
            try:
                previous = datetime.fromisoformat(last)
                if (now - previous).total_seconds() < cooldown:
                    return viewer
            except ValueError:
                pass

        points = int(await self.db.get_setting("loyalty.points_per_message", 5))
        xp = int(await self.db.get_setting("loyalty.xp_per_message", 8))
        return await self.db.award_activity(viewer["user_id"], points, xp, now.isoformat())
