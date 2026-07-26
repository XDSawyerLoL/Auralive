from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from datetime import datetime, timedelta, timezone
from types import MethodType
from typing import Any
from urllib.parse import urlencode

from app.services.twitch import BOT_SCOPES, BROADCASTER_SCOPES

_STATE_MAX_AGE_SECONDS = 15 * 60
_STATE_RETENTION_MINUTES = 30


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _sign_state(secret: str, payload: str) -> str:
    return _b64url(hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest())


def build_signed_state(
    secret: str,
    role: str,
    *,
    issued_at: int | None = None,
    nonce: str | None = None,
) -> str:
    if role not in {"bot", "broadcaster"}:
        raise ValueError("Rôle OAuth inconnu")
    if not secret:
        raise RuntimeError("TWITCH_CLIENT_SECRET est absent")
    timestamp = int(issued_at if issued_at is not None else time.time())
    token = nonce or secrets.token_urlsafe(24)
    payload = f"{role}.{timestamp}.{token}"
    return f"{payload}.{_sign_state(secret, payload)}"


def verify_signed_state(
    secret: str,
    state: str,
    *,
    now: int | None = None,
    max_age_seconds: int = _STATE_MAX_AGE_SECONDS,
) -> str | None:
    try:
        role, timestamp_text, nonce, signature = state.split(".", 3)
        timestamp = int(timestamp_text)
    except (TypeError, ValueError):
        return None
    if role not in {"bot", "broadcaster"} or not nonce or not secret:
        return None
    payload = f"{role}.{timestamp}.{nonce}"
    expected = _sign_state(secret, payload)
    if not hmac.compare_digest(signature, expected):
        return None
    current = int(now if now is not None else time.time())
    age = current - timestamp
    if age < -60 or age > max_age_seconds:
        return None
    return role


def _scopes_for_role(role: str) -> list[str]:
    return list(BOT_SCOPES if role == "bot" else BROADCASTER_SCOPES)


async def _load_persisted_state(db: Any, state: str) -> dict[str, Any] | None:
    row = await db.fetchone("SELECT * FROM oauth_states WHERE state=?", (state,))
    if not row:
        return None
    try:
        row["scopes"] = json.loads(row["scopes"])
    except (TypeError, json.JSONDecodeError):
        row["scopes"] = []
    return row


def install_oauth_resilience(client: Any) -> None:
    """Rend le callback OAuth robuste aux redémarrages et aux doubles retours navigateur."""
    if getattr(client, "_aura_oauth_resilience_installed", False):
        return

    async def build_auth_url(self: Any, role: str) -> str:
        if role not in {"bot", "broadcaster"}:
            raise ValueError("Rôle OAuth inconnu")
        await self.start()
        scopes = _scopes_for_role(role)
        state = build_signed_state(self.settings.twitch_client_secret, role)
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=_STATE_RETENTION_MINUTES)).isoformat()
        await self.db.execute("DELETE FROM oauth_states WHERE created_at < ?", (cutoff,))
        await self.db.save_oauth_state(state, role, scopes)
        query = urlencode(
            {
                "client_id": self.settings.twitch_client_id,
                "redirect_uri": self.settings.twitch_redirect_uri,
                "response_type": "code",
                "scope": " ".join(scopes),
                "state": state,
                "force_verify": "true",
            }
        )
        return f"{self.ID_API}/authorize?{query}"

    async def handle_oauth_callback(self: Any, code: str, state: str) -> str:
        code = str(code or "").strip()
        state = str(state or "").strip()
        if not code:
            raise RuntimeError("Twitch n’a renvoyé aucun code d’autorisation")
        if not state:
            raise RuntimeError("Twitch n’a renvoyé aucun état OAuth")

        await self.start()
        state_row = await _load_persisted_state(self.db, state)
        if state_row:
            role = str(state_row.get("role") or "")
            scopes = list(state_row.get("scopes") or _scopes_for_role(role))
        else:
            role = verify_signed_state(self.settings.twitch_client_secret, state) or ""
            if not role:
                raise RuntimeError(
                    "Lien OAuth périmé ou déjà invalide. Ferme cet onglet, retourne dans Aura Live "
                    "et clique une seule fois sur Reconnecter."
                )
            # Le state signé reste vérifiable même si SQLite a été momentanément indisponible
            # ou si Aura a redémarré entre l’ouverture de Twitch et le retour du navigateur.
            scopes = _scopes_for_role(role)

        assert self.session
        async with self.session.post(
            f"{self.ID_API}/token",
            data={
                "client_id": self.settings.twitch_client_id,
                "client_secret": self.settings.twitch_client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": self.settings.twitch_redirect_uri,
            },
        ) as response:
            payload = await response.json(content_type=None)
            if response.status >= 400:
                detail = payload.get("message") if isinstance(payload, dict) else str(payload)
                raise RuntimeError(f"Échange OAuth Twitch refusé : {detail or response.status}")

        access_token = payload["access_token"]
        user = await self._get_current_user(access_token)
        expected_login = (
            self.settings.twitch_bot_login if role == "bot" else self.settings.twitch_broadcaster_login
        ).lower()
        actual_login = str(user.get("login", "")).lower()
        if expected_login and actual_login != expected_login:
            label = "Mairaiy" if role == "bot" else "SANSAHD"
            raise RuntimeError(
                f"Mauvais compte connecté pour {label}. Compte reçu : "
                f"{user.get('display_name') or actual_login}. Compte attendu : {expected_login}."
            )

        expires_at = int(time.time()) + int(payload.get("expires_in", 0))
        await self.db.save_token(
            role,
            access_token,
            payload.get("refresh_token", ""),
            expires_at,
            payload.get("scope", scopes),
            user["id"],
            user["login"],
            user["display_name"],
        )
        # Le state n’est invalidé qu’après l’enregistrement réussi du jeton. Une erreur réseau
        # intermédiaire ne détruit donc plus la tentative avant que Twitch ait été traité.
        await self.db.execute("DELETE FROM oauth_states WHERE role=?", (role,))
        await self._load_ids()
        if await self.db.get_token("bot") and await self.db.get_token("broadcaster"):
            await self.restart_eventsub()
        return role

    async def oauth_diagnostic(self: Any) -> dict[str, Any]:
        pending = await self.db.fetchall(
            "SELECT role,created_at FROM oauth_states ORDER BY created_at DESC LIMIT 20"
        )
        return {
            "configured": bool(self.settings.twitch_client_id and self.settings.twitch_client_secret),
            "redirect_uri": self.settings.twitch_redirect_uri,
            "pending_states": len(pending),
            "pending": pending,
            "signed_state_enabled": True,
            "state_max_age_seconds": _STATE_MAX_AGE_SECONDS,
        }

    client.build_auth_url = MethodType(build_auth_url, client)
    client.handle_oauth_callback = MethodType(handle_oauth_callback, client)
    client.oauth_diagnostic = MethodType(oauth_diagnostic, client)
    client._aura_oauth_resilience_installed = True
