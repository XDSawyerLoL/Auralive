from __future__ import annotations

import hashlib
import re
import unicodedata
from collections import defaultdict, deque
from dataclasses import dataclass
from time import monotonic

from app.database import Database

URL_RE = re.compile(r"(?:https?://)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})(?:/\S*)?", re.I)
OBFUSCATED_DOMAIN_RE = re.compile(
    r"\b([a-z0-9-]{2,})\s*(?:\.|\[\s*dot\s*\]|\(\s*dot\s*\)|\s+dot\s+)\s*([a-z]{2,})\b",
    re.I,
)
REPEAT_RE = re.compile(r"(.)\1{10,}", re.I)
COMMERCIAL_VIEWER_RE = re.compile(
    r"\b(?:ai\s+)?(?:buy|get|gain|free|cheap|boost|increase|more)?\s*"
    r"(?:viewers?|followers?|follows?|subs?|subscribers?)\b"
    r".{0,50}\b(?:stream|channel|twitch|live|promo|promotion|bot|service|website|site)\b"
    r"|\b(?:stream|channel|twitch|live)\b.{0,50}\b"
    r"(?:viewers?|followers?|follows?|subs?|subscribers?)\b",
    re.I,
)
KNOWN_PROMO_MARKERS = (
    "ai viewers",
    "buy viewers",
    "get viewers",
    "free viewers",
    "cheap viewers",
    "boost your stream",
    "grow your stream",
    "increase viewers",
    "more viewers",
    "viewer bot",
    "view bot",
    "stream promotion",
)
DEFAULT_BLOCKED_DOMAINS = {
    "streamboo.com",
}
ZERO_WIDTH_RE = re.compile(r"[\u200b-\u200f\u2060\ufeff]")


@dataclass(slots=True)
class ModerationDecision:
    blocked: bool = False
    reason: str = ""
    timeout_seconds: int = 0
    severity: str = "info"
    fingerprint: str = ""


class ModerationModule:
    def __init__(self, db: Database):
        self.db = db
        self.recent: dict[str, deque[tuple[float, str]]] = defaultdict(
            lambda: deque(maxlen=8)
        )
        self.promo_signatures: dict[str, deque[tuple[float, str]]] = defaultdict(
            lambda: deque(maxlen=50)
        )

    async def evaluate(
        self,
        user_id: str,
        text: str,
        badges: list[dict],
        is_broadcaster: bool,
        *,
        link_permitted: bool = False,
    ) -> ModerationDecision:
        if is_broadcaster or self._is_privileged(badges):
            return ModerationDecision()

        normalized = self.normalize_text(text)
        lowered = normalized.casefold().strip()

        promo = await self._commercial_spam_decision(user_id, normalized)
        if promo.blocked:
            return promo

        banned_words = await self.db.get_setting("moderation.banned_words", [])
        if any(
            str(word).casefold() in lowered
            for word in banned_words
            if str(word).strip()
        ):
            return ModerationDecision(
                True,
                "mot interdit",
                60,
                "warning",
                self._fingerprint(lowered),
            )

        links_enabled = bool(await self.db.get_setting("moderation.links", True))
        link_match = URL_RE.search(normalized)
        if links_enabled and link_match and not link_permitted:
            domain = self._clean_domain(link_match.group(1))
            allowed = [
                self._clean_domain(str(item))
                for item in await self.db.get_setting(
                    "moderation.allowed_domains", []
                )
            ]
            if not any(
                domain == item or domain.endswith("." + item)
                for item in allowed
                if item
            ):
                timeout = int(
                    await self.db.get_setting("moderation.timeout_seconds", 30)
                )
                return ModerationDecision(
                    True,
                    "lien non autorisé",
                    timeout,
                    "warning",
                    self._fingerprint(domain),
                )

        emergency = bool(
            await self.db.get_setting("moderation.emergency_mode", False)
        )
        if emergency and len(normalized) > 240:
            return ModerationDecision(
                True,
                "mode urgence : message trop long",
                120,
                "warning",
                self._fingerprint(lowered),
            )

        letters = [char for char in normalized if char.isalpha()]
        caps_ratio = float(
            await self.db.get_setting("moderation.caps_ratio", 0.78)
        )
        if len(letters) >= 12:
            ratio = sum(char.isupper() for char in letters) / len(letters)
            if ratio >= caps_ratio:
                return ModerationDecision(
                    True,
                    "abus de majuscules",
                    15,
                    "info",
                    self._fingerprint(lowered),
                )

        if REPEAT_RE.search(normalized):
            return ModerationDecision(
                True,
                "caractères répétés",
                15,
                "info",
                self._fingerprint(lowered),
            )

        now = monotonic()
        history = self.recent[user_id]
        history.append((now, lowered))
        recent_same = [
            item
            for timestamp, item in history
            if now - timestamp < 12 and item == lowered
        ]
        recent_total = [
            item for timestamp, item in history if now - timestamp < 6
        ]
        if len(recent_same) >= 3 or len(recent_total) >= 6:
            return ModerationDecision(
                True,
                "spam",
                30,
                "warning",
                self._fingerprint(lowered),
            )

        return ModerationDecision()

    async def _commercial_spam_decision(
        self, user_id: str, normalized: str
    ) -> ModerationDecision:
        if not bool(
            await self.db.get_setting(
                "moderation.commercial_spam.enabled", True
            )
        ):
            return ModerationDecision()

        lowered = normalized.casefold()
        domains = {
            self._clean_domain(match.group(1))
            for match in URL_RE.finditer(normalized)
        }
        configured = {
            self._clean_domain(str(item))
            for item in await self.db.get_setting(
                "moderation.commercial_spam.blocked_domains",
                sorted(DEFAULT_BLOCKED_DOMAINS),
            )
            if str(item).strip()
        }
        blocked_domain = next(
            (
                domain
                for domain in domains
                if any(
                    domain == item or domain.endswith("." + item)
                    for item in configured
                    if item
                )
            ),
            "",
        )

        marker = next(
            (item for item in KNOWN_PROMO_MARKERS if item in lowered),
            "",
        )
        viewer_promo = bool(COMMERCIAL_VIEWER_RE.search(lowered))
        suspicious = bool(blocked_domain or marker or viewer_promo)
        if not suspicious:
            return ModerationDecision()

        signature_source = blocked_domain or marker or self._compact_promo_text(lowered)
        fingerprint = self._fingerprint(signature_source)
        probable_evasion = self._record_signature(
            fingerprint, user_id
        )
        timeout = int(
            await self.db.get_setting(
                "moderation.commercial_spam.timeout_seconds",
                1_209_600,
            )
        )
        timeout = max(60, min(timeout, 1_209_600))
        reason = (
            "spam commercial coordonné / contournement probable"
            if probable_evasion
            else "spam commercial de faux viewers"
        )
        return ModerationDecision(
            True,
            reason,
            timeout,
            "critical",
            fingerprint,
        )

    def _record_signature(self, fingerprint: str, user_id: str) -> bool:
        now = monotonic()
        history = self.promo_signatures[fingerprint]
        while history and now - history[0][0] > 21_600:
            history.popleft()
        known_users = {seen_user for _, seen_user in history}
        history.append((now, user_id))
        return bool(known_users and user_id not in known_users)

    @classmethod
    def normalize_text(cls, text: str) -> str:
        value = ZERO_WIDTH_RE.sub("", str(text))
        value = unicodedata.normalize("NFKC", value)
        value = re.sub(r"(?i)\bhxxps?://", "https://", value)
        value = re.sub(r"(?i)\s*(?:\[dot\]|\(dot\)|\bdot\b)\s*", ".", value)
        value = OBFUSCATED_DOMAIN_RE.sub(
            lambda match: f"{match.group(1)}.{match.group(2)}",
            value,
        )
        value = re.sub(r"\s*\.\s*", ".", value)
        return " ".join(value.split())

    @staticmethod
    def _clean_domain(value: str) -> str:
        domain = str(value).casefold().strip()
        if domain.startswith("www."):
            domain = domain[4:]
        return domain.rstrip(".,;:!?)]}")

    @staticmethod
    def _compact_promo_text(value: str) -> str:
        words = re.findall(r"[a-z0-9]+", value.casefold())
        useful = [
            word
            for word in words
            if word
            in {
                "ai",
                "buy",
                "get",
                "free",
                "cheap",
                "boost",
                "viewers",
                "viewer",
                "followers",
                "follower",
                "stream",
                "twitch",
                "promotion",
                "promo",
                "bot",
            }
        ]
        return " ".join(useful[:12]) or value[:120]

    @staticmethod
    def _fingerprint(value: str) -> str:
        return hashlib.sha256(value.encode("utf-8", errors="ignore")).hexdigest()[:16]

    @staticmethod
    def _is_privileged(badges: list[dict]) -> bool:
        names = {badge.get("set_id") for badge in badges}
        return bool(names & {"moderator", "vip", "broadcaster"})
