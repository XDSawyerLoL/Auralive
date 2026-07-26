from __future__ import annotations

import re
from collections import defaultdict, deque
from dataclasses import dataclass
from time import monotonic

from app.database import Database

URL_RE = re.compile(r"(?:https?://)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})(?:/\S*)?", re.I)
REPEAT_RE = re.compile(r"(.)\1{10,}", re.I)


@dataclass(slots=True)
class ModerationDecision:
    blocked: bool = False
    reason: str = ""
    timeout_seconds: int = 0


class ModerationModule:
    def __init__(self, db: Database):
        self.db = db
        self.recent: dict[str, deque[tuple[float, str]]] = defaultdict(lambda: deque(maxlen=8))

    async def evaluate(self, user_id: str, text: str, badges: list[dict], is_broadcaster: bool, *, link_permitted: bool = False) -> ModerationDecision:
        if is_broadcaster or self._is_privileged(badges):
            return ModerationDecision()

        lowered = text.lower().strip()
        banned_words = await self.db.get_setting("moderation.banned_words", [])
        if any(str(word).lower() in lowered for word in banned_words if str(word).strip()):
            return ModerationDecision(True, "mot interdit", 60)

        links_enabled = bool(await self.db.get_setting("moderation.links", True))
        link_match = URL_RE.search(text)
        if links_enabled and link_match and not link_permitted:
            domain = link_match.group(1).lower().lstrip("www.")
            allowed = [str(item).lower().lstrip("www.") for item in await self.db.get_setting("moderation.allowed_domains", [])]
            if not any(domain == item or domain.endswith("." + item) for item in allowed):
                timeout = int(await self.db.get_setting("moderation.timeout_seconds", 30))
                return ModerationDecision(True, "lien non autorisé", timeout)

        emergency = bool(await self.db.get_setting("moderation.emergency_mode", False))
        if emergency and len(text) > 240:
            return ModerationDecision(True, "mode urgence : message trop long", 120)

        letters = [char for char in text if char.isalpha()]
        caps_ratio = float(await self.db.get_setting("moderation.caps_ratio", 0.78))
        if len(letters) >= 12:
            ratio = sum(char.isupper() for char in letters) / len(letters)
            if ratio >= caps_ratio:
                return ModerationDecision(True, "abus de majuscules", 15)

        if REPEAT_RE.search(text):
            return ModerationDecision(True, "caractères répétés", 15)

        now = monotonic()
        history = self.recent[user_id]
        history.append((now, lowered))
        recent_same = [item for timestamp, item in history if now - timestamp < 12 and item == lowered]
        recent_total = [item for timestamp, item in history if now - timestamp < 6]
        if len(recent_same) >= 3 or len(recent_total) >= 6:
            return ModerationDecision(True, "spam", 30)

        return ModerationDecision()

    @staticmethod
    def _is_privileged(badges: list[dict]) -> bool:
        names = {badge.get("set_id") for badge in badges}
        return bool(names & {"moderator", "vip", "broadcaster"})
