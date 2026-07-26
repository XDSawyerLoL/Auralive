from __future__ import annotations

import random
import secrets

from app.database import Database


class GamesModule:
    FISH = [
        ("une vieille chaussette", 0),
        ("un petit maquereau", 12),
        ("un coffre plein d'Écumes", 35),
        ("un thon particulièrement susceptible", 22),
        ("une botte de Sansa", 5),
        ("la perle du Spot", 80),
    ]

    def __init__(self, db: Database):
        self.db = db

    async def fish(self, viewer: dict) -> str:
        item, reward = secrets.choice(self.FISH)
        if reward:
            balance = await self.db.adjust_points(viewer["user_id"], reward, "mini-jeu pêche")
            return f"{viewer['display_name']} remonte {item} : +{reward} Écumes. Solde : {balance}."
        return f"{viewer['display_name']} remonte {item}. Aura préfère ne pas commenter."

    async def duel(self, challenger: dict, target_login: str) -> str:
        target = await self.db.get_viewer(login=target_login.lstrip("@"))
        if not target:
            return "Je ne connais pas encore cette cible. Elle doit d'abord écrire dans le chat."
        if target["user_id"] == challenger["user_id"]:
            return "Se battre contre soi-même, c'est profond, mais pas rentable."
        wager = 10
        if challenger["points"] < wager or target["points"] < wager:
            return f"Chaque combattant doit posséder au moins {wager} Écumes."
        winner, loser = random.sample([challenger, target], 2)
        await self.db.adjust_points(winner["user_id"], wager, "victoire duel")
        await self.db.adjust_points(loser["user_id"], -wager, "défaite duel")
        return (
            f"Duel terminé : {winner['display_name']} terrasse {loser['display_name']} "
            f"et récupère {wager} Écumes."
        )
