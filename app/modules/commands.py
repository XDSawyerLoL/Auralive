from __future__ import annotations

import asyncio
import re
from collections import defaultdict
from time import monotonic
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.core.orchestrator import AuraOrchestrator


class CommandModule:
    def __init__(self, orchestrator: "AuraOrchestrator"):
        self.aura = orchestrator
        self.cooldowns: dict[tuple[str, str], float] = defaultdict(float)

    async def handle(self, viewer: dict[str, Any], text: str, event: dict[str, Any]) -> bool:
        if not text.startswith("!"):
            return False
        parts = text.strip().split(maxsplit=1)
        command = parts[0].lower()
        argument = parts[1].strip() if len(parts) > 1 else ""

        builtins = {
            "!aura": self._aura,
            "!mairaiy": self._aura,
            "!ecume": self._points,
            "!écume": self._points,
            "!niveau": self._level,
            "!top": self._top,
            "!peche": self._fish,
            "!pêche": self._fish,
            "!duel": self._duel,
            "!boutique": self._shop,
            "!acheter": self._buy,
            "!memoire": self._memory,
            "!mémoire": self._memory,
            "!oublie-moi": self._forget,
            "!clip": self._clip,
            "!quote": self._quote,
            "!obs": self._obs,
            "!join": self._queue_join,
            "!leave": self._queue_leave,
            "!queue": self._queue_show,
            "!next": self._queue_next,
            "!concours": self._giveaway,
            "!tirage": self._giveaway_draw,
            "!vote": self._vote,
            "!sondage": self._poll,
            "!tts": self._tts,
            "!win": self._win,
            "!death": self._death,
            "!fail": self._fail,
            "!compteurs": self._counters,
            "!sr": self._song_request,
            "!songrequest": self._song_request,
            "!musique": self._song_queue,
            "!song": self._song_queue,
            "!skip": self._song_skip,
            "!pari": self._bet_status,
            "!mise": self._bet_place,
            "!bet": self._bet_place,
            "!roulette": self._roulette,
            "!inventaire": self._inventory,
            "!inventory": self._inventory,
            "!loot": self._loot,
            "!recettes": self._recipes,
            "!craft": self._craft,
            "!encheres": self._auctions,
            "!enchères": self._auctions,
            "!bid": self._bid,
            "!streamathon": self._streamathon,
        }
        giveaway = await self.aura.engagement.active_giveaway()
        if giveaway and command == str(giveaway.get("keyword", "!concours")).lower():
            if self._cooldown(viewer["user_id"], command, 8):
                return True
            await self._giveaway(viewer, argument, event)
            return True

        handler = builtins.get(command)
        if handler:
            if self._cooldown(viewer["user_id"], command, 8):
                return True
            await handler(viewer, argument, event)
            return True

        custom = await self.aura.db.fetchone(
            "SELECT * FROM commands WHERE name=? AND enabled=1", (command,)
        )
        if custom:
            if not self._allowed(custom["min_role"], event):
                return True
            if self._cooldown(viewer["user_id"], command, int(custom["cooldown_seconds"])):
                return True
            response = custom["response"].format(
                user=viewer["display_name"],
                points=viewer["points"],
                level=viewer["level"],
                messages=viewer["message_count"],
            )
            await self.aura.say(response)
            return True
        return False

    def _cooldown(self, user_id: str, command: str, seconds: int) -> bool:
        key = (user_id, command)
        now = monotonic()
        if now < self.cooldowns[key]:
            return True
        self.cooldowns[key] = now + seconds
        return False

    async def _aura(self, viewer: dict, argument: str, event: dict) -> None:
        prompt = argument or "Présente-toi rapidement."
        asyncio.create_task(
            self.aura.answer_ai(viewer, prompt, event.get("message_id"), direct=True),
            name=f"mairaiy-command-{viewer['user_id']}",
        )

    async def _points(self, viewer: dict, argument: str, event: dict) -> None:
        await self.aura.say(f"{viewer['display_name']} possède {viewer['points']} Écumes.")

    async def _level(self, viewer: dict, argument: str, event: dict) -> None:
        await self.aura.say(f"{viewer['display_name']} est niveau {viewer['level']} avec {viewer['xp']} XP.")

    async def _top(self, viewer: dict, argument: str, event: dict) -> None:
        top = await self.aura.db.top_viewers(5)
        if not top:
            await self.aura.say("Le classement est encore vide.")
            return
        line = " — ".join(
            f"{index}. {row['display_name']} ({row['points']})"
            for index, row in enumerate(top, 1)
        )
        await self.aura.say(f"Classement de la communauté : {line}")

    async def _fish(self, viewer: dict, argument: str, event: dict) -> None:
        await self.aura.say(await self.aura.games.fish(viewer))

    async def _duel(self, viewer: dict, argument: str, event: dict) -> None:
        if not argument:
            await self.aura.say("Usage : !duel @pseudo")
            return
        await self.aura.say(await self.aura.games.duel(viewer, argument.split()[0]))

    async def _shop(self, viewer: dict, argument: str, event: dict) -> None:
        items = await self.aura.shop.listing()
        listing = " | ".join(f"{item['id']}: {item['name']} ({item['cost']})" for item in items)
        await self.aura.say(f"Cabane du Spot — {listing}. Achat : !acheter numéro")

    async def _buy(self, viewer: dict, argument: str, event: dict) -> None:
        if not argument.isdigit():
            await self.aura.say("Usage : !acheter numéro")
            return
        message, overlay_event = await self.aura.shop.buy(viewer, int(argument))
        await self.aura.say(message)
        if overlay_event:
            await self.aura.overlay.emit(overlay_event)

    async def _memory(self, viewer: dict, argument: str, event: dict) -> None:
        choice = argument.lower()
        if choice in {"oui", "on", "active"}:
            await self.aura.memory.set_opt_in(viewer["user_id"], True)
            await self.aura.say(f"Mémoire communautaire activée pour {viewer['display_name']}.")
        elif choice in {"non", "off", "desactive", "désactive"}:
            await self.aura.memory.set_opt_in(viewer["user_id"], False)
            await self.aura.say(f"Mémoire effacée et désactivée pour {viewer['display_name']}.")
        else:
            state = "active" if viewer["memory_opt_in"] else "désactivée"
            await self.aura.say(f"Mémoire de {viewer['display_name']} : {state}. Usage : !memoire oui/non")

    async def _forget(self, viewer: dict, argument: str, event: dict) -> None:
        await self.aura.memory.set_opt_in(viewer["user_id"], False)
        await self.aura.say(f"C'est fait, {viewer['display_name']}. Les souvenirs enregistrés ont été supprimés.")

    async def _clip(self, viewer: dict, argument: str, event: dict) -> None:
        try:
            await self.aura.twitch.create_clip()
            await self.aura.say("Clip demandé. Twitch le prépare dans le gestionnaire de clips.")
        except Exception as exc:
            await self.aura.say(f"Impossible de créer le clip : {exc}")

    async def _quote(self, viewer: dict, argument: str, event: dict) -> None:
        if argument.lower().startswith("add "):
            if not self._allowed("mod", event):
                return
            text = argument[4:].strip()
            if not text:
                return
            await self.aura.db.execute(
                "INSERT INTO quotes(text,author,added_by,created_at) VALUES(?,?,?,datetime('now'))",
                (text, "Sansa", viewer["display_name"]),
            )
            await self.aura.say("Citation ajoutée aux archives du Spot.")
            return
        rows = await self.aura.db.fetchall("SELECT * FROM quotes ORDER BY RANDOM() LIMIT 1")
        if rows:
            quote = rows[0]
            await self.aura.say(f"« {quote['text']} » — {quote['author']}")
        else:
            await self.aura.say("Aucune citation pour le moment. Un mod peut utiliser !quote add texte")

    async def _obs(self, viewer: dict, argument: str, event: dict) -> None:
        if not self._allowed("mod", event):
            return
        match = re.match(r"scene\s+(.+)", argument, re.I)
        if match:
            try:
                await self.aura.obs.set_scene(match.group(1).strip())
                await self.aura.say("Scène OBS changée.")
            except Exception as exc:
                await self.aura.say(f"OBS refuse la commande : {exc}")
        else:
            await self.aura.say("Usage modérateur : !obs scene Nom de la scène")

    async def _queue_join(self, viewer: dict, argument: str, event: dict) -> None:
        await self.aura.say(await self.aura.engagement.queue_join(viewer, argument))

    async def _queue_leave(self, viewer: dict, argument: str, event: dict) -> None:
        await self.aura.say(await self.aura.engagement.queue_leave(viewer))

    async def _queue_show(self, viewer: dict, argument: str, event: dict) -> None:
        entries = await self.aura.engagement.queue_list()
        if not entries:
            await self.aura.say("La file de jeu est vide.")
            return
        await self.aura.say("File du Spot : " + " — ".join(f"{row['position']}. {row['display_name']}" for row in entries[:8]))

    async def _queue_next(self, viewer: dict, argument: str, event: dict) -> None:
        if not self._allowed("mod", event):
            return
        entry = await self.aura.engagement.queue_next()
        await self.aura.say(f"À toi de jouer, {entry['display_name']} !" if entry else "La file est vide.")
        if entry:
            await self.aura.overlay.emit({"type": "queue_next", "viewer": entry["display_name"], "message": "À toi de jouer !"})

    async def _giveaway(self, viewer: dict, argument: str, event: dict) -> None:
        await self.aura.say(await self.aura.engagement.enter_giveaway(viewer))

    async def _giveaway_draw(self, viewer: dict, argument: str, event: dict) -> None:
        if not self._allowed("mod", event):
            return
        result = await self.aura.engagement.draw_giveaway()
        if not result:
            await self.aura.say("Aucun concours n'est ouvert.")
        elif not result["winner"]:
            await self.aura.say("Le concours est fermé, mais personne n'avait participé.")
        else:
            name = result["winner"]["display_name"]
            await self.aura.say(f"Tirage terminé : {name} remporte « {result['giveaway']['title']} » !")
            await self.aura.overlay.emit({"type": "giveaway_winner", "viewer": name, "message": result["giveaway"]["title"]})

    async def _vote(self, viewer: dict, argument: str, event: dict) -> None:
        await self.aura.say(
            "Les sondages Aura sont des sondages Twitch natifs : vote directement dans la carte de sondage affichée par Twitch."
        )

    async def _poll(self, viewer: dict, argument: str, event: dict) -> None:
        try:
            poll = await self.aura.twitch.active_poll()
        except Exception as exc:
            await self.aura.say(f"Impossible de lire le sondage Twitch : {exc}")
            return
        if not poll:
            await self.aura.say("Aucun sondage Twitch n'est ouvert.")
            return
        options = " | ".join(
            f"{index}. {item.get('title', '')} ({item.get('votes', 0)})"
            for index, item in enumerate(poll.get("choices", []), start=1)
        )
        await self.aura.say(
            f"{poll.get('title', 'Sondage')} — {options}. Vote directement dans l'encart Twitch."
        )

    async def _tts(self, viewer: dict, argument: str, event: dict) -> None:
        message = await self.aura.engagement.enqueue_tts(viewer, argument)
        await self.aura.say(message)
        if message.endswith("ajouté à la file."):
            await self.aura.push_next_tts()

    async def _win(self, viewer: dict, argument: str, event: dict) -> None:
        await self._change_counter("wins", 1, event)

    async def _death(self, viewer: dict, argument: str, event: dict) -> None:
        await self._change_counter("deaths", 1, event)

    async def _fail(self, viewer: dict, argument: str, event: dict) -> None:
        await self._change_counter("fails", 1, event)

    async def _change_counter(self, slug: str, delta: int, event: dict) -> None:
        if not self._allowed("mod", event):
            return
        counter = await self.aura.engagement.counter_change(slug, delta)
        if counter:
            await self.aura.say(f"{counter['label']} : {counter['value']}")
            await self.aura.overlay.emit({"type": "counter", "slug": slug, "label": counter["label"], "value": counter["value"]})

    async def _counters(self, viewer: dict, argument: str, event: dict) -> None:
        counters = await self.aura.engagement.counters()
        await self.aura.say("Compteurs : " + " — ".join(f"{row['label']} {row['value']}" for row in counters))


    async def _song_request(self, viewer: dict, argument: str, event: dict) -> None:
        await self.aura.say(await self.aura.power.add_song(viewer, argument))

    async def _song_queue(self, viewer: dict, argument: str, event: dict) -> None:
        queue = await self.aura.power.song_queue()
        if not queue:
            await self.aura.say("La file musicale est vide.")
            return
        current = next((row for row in queue if row["status"] == "playing"), None)
        waiting = [row for row in queue if row["status"] == "queued"]
        parts = []
        if current:
            parts.append(f"En cours : {current['title']} demandé par {current['display_name']}")
        if waiting:
            parts.append("À suivre : " + " | ".join(f"{index}. {row['title']}" for index, row in enumerate(waiting[:4], 1)))
        await self.aura.say(" — ".join(parts))

    async def _song_skip(self, viewer: dict, argument: str, event: dict) -> None:
        if not self._allowed("mod", event):
            return
        song = await self.aura.power.next_song()
        await self.aura.say(f"Lecture : {song['title']}." if song else "La file musicale est terminée.")

    async def _bet_status(self, viewer: dict, argument: str, event: dict) -> None:
        bet = await self.aura.power.active_bet()
        if not bet:
            await self.aura.say("Aucun pari en Écumes n'est ouvert.")
            return
        options = " | ".join(f"{row['position']}. {row['label']} ({row['pool']} Écumes)" for row in bet["options"])
        await self.aura.say(f"Pari : {bet['title']} — {options}. Mise : !mise numéro montant")

    async def _bet_place(self, viewer: dict, argument: str, event: dict) -> None:
        parts = argument.split()
        if len(parts) < 2 or not parts[0].isdigit() or not parts[1].isdigit():
            await self.aura.say("Usage : !mise numéro montant")
            return
        await self.aura.say(await self.aura.power.place_bet(viewer, int(parts[0]), int(parts[1])))

    async def _roulette(self, viewer: dict, argument: str, event: dict) -> None:
        stake = int(argument) if argument.isdigit() else 10
        await self.aura.say(await self.aura.power.roulette(viewer, stake))

    async def _inventory(self, viewer: dict, argument: str, event: dict) -> None:
        rows = await self.aura.power.inventory(viewer["user_id"])
        if not rows:
            await self.aura.say(f"{viewer['display_name']} n'a encore aucun objet. Essaie !loot.")
            return
        await self.aura.say(f"Inventaire de {viewer['display_name']} : " + " | ".join(f"{row['icon']} {row['name']} x{row['quantity']}" for row in rows[:8]))

    async def _loot(self, viewer: dict, argument: str, event: dict) -> None:
        await self.aura.say(await self.aura.power.loot(viewer))

    async def _recipes(self, viewer: dict, argument: str, event: dict) -> None:
        rows = await self.aura.power.recipes()
        await self.aura.say("Recettes : " + " | ".join(f"{row['id']}. {row['name']}" for row in rows) + ". Craft : !craft numéro")

    async def _craft(self, viewer: dict, argument: str, event: dict) -> None:
        if not argument.isdigit():
            await self.aura.say("Usage : !craft numéro")
            return
        await self.aura.say(await self.aura.power.craft(viewer, int(argument)))

    async def _auctions(self, viewer: dict, argument: str, event: dict) -> None:
        rows = await self.aura.power.auctions()
        if not rows:
            await self.aura.say("Aucune enchère ouverte.")
            return
        await self.aura.say("Enchères : " + " | ".join(f"{row['id']}. {row['icon']} {row['item_name']} x{row['quantity']} — {max(row['start_price'], row['highest_bid'])} Écumes" for row in rows[:5]))

    async def _bid(self, viewer: dict, argument: str, event: dict) -> None:
        parts = argument.split()
        if len(parts) < 2 or not parts[0].isdigit() or not parts[1].isdigit():
            await self.aura.say("Usage : !bid numéro montant")
            return
        await self.aura.say(await self.aura.power.bid(viewer, int(parts[0]), int(parts[1])))

    async def _streamathon(self, viewer: dict, argument: str, event: dict) -> None:
        row = await self.aura.power.active_streamathon()
        if not row:
            await self.aura.say("Aucun Streamathon actif.")
            return
        seconds = int(row['remaining_seconds'])
        hours, remainder = divmod(seconds, 3600)
        minutes, secs = divmod(remainder, 60)
        await self.aura.say(f"{row['title']} : {hours:02d}:{minutes:02d}:{secs:02d} restantes.")

    @staticmethod
    def _allowed(role: str, event: dict) -> bool:
        if role == "everyone":
            return True
        badges = {badge.get("set_id") for badge in event.get("badges", [])}
        if role == "subscriber":
            return bool(badges & {"subscriber", "founder", "moderator", "broadcaster"})
        if role in {"mod", "moderator"}:
            return bool(badges & {"moderator", "broadcaster"})
        if role == "broadcaster":
            return "broadcaster" in badges
        return False
