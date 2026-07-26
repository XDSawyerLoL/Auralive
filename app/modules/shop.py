from __future__ import annotations

import json
from typing import Any

from app.database import Database


class ShopModule:
    def __init__(self, db: Database):
        self.db = db

    async def listing(self) -> list[dict[str, Any]]:
        return await self.db.fetchall(
            "SELECT id,name,description,cost,action_type,action_payload FROM shop_items WHERE enabled=1 ORDER BY cost"
        )

    async def buy(self, viewer: dict, item_id: int) -> tuple[str, dict[str, Any] | None]:
        item = await self.db.fetchone(
            "SELECT * FROM shop_items WHERE id=? AND enabled=1", (item_id,)
        )
        if not item:
            return "Cet objet n'existe pas sur le Spot.", None
        if int(viewer["points"]) < int(item["cost"]):
            return (
                f"Il te faut {item['cost']} Écumes. Tu n'en as que {viewer['points']}.",
                None,
            )
        balance = await self.db.adjust_points(
            viewer["user_id"], -int(item["cost"]), f"achat: {item['name']}"
        )
        event = {
            "type": "shop_purchase",
            "viewer": viewer["display_name"],
            "item": item["name"],
            "action_type": item["action_type"],
            "payload": json.loads(item["action_payload"]),
        }
        return (
            f"{viewer['display_name']} achète « {item['name']} ». Solde : {balance} Écumes.",
            event,
        )
