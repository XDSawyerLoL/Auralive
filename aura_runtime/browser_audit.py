"""Deterministic SWAPP browser audit; no LLM, credentials, clicks or form posting."""
from __future__ import annotations
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable
from urllib.parse import urlparse

DEFAULT_ROUTES = ("/", "/actus", "/twitch")
ALLOWED_ROUTES = frozenset(("/", "/actus", "/twitch", "/social", "/tv", "/vnhz"))
PUBLIC_HOST = "swapp.tv"
VIEWPORTS = {"desktop": {"width": 1440, "height": 900}, "mobile": {"width": 390, "height": 844}}

def audit_target_url(value: str) -> str:
    """Allow only public HTTPS SWAPP routes with no injected parameters."""
    parsed = urlparse(str(value or "").strip())
    try:
        port = parsed.port
    except ValueError as error:
        raise PermissionError("Port invalide") from error
    if parsed.scheme != "https" or parsed.hostname != PUBLIC_HOST or port not in (None, 443):
        raise PermissionError("Audit réservé aux pages HTTPS de swapp.tv")
    if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ALLOWED_ROUTES:
        raise PermissionError("Route ou paramètre SWAPP interdit")
    return f"https://{PUBLIC_HOST}{parsed.path}"

def grade_navigation(*, requested_path: str, final_url: str, status: int | None,
                     title: str, body_visible: bool, screenshot_digest: str,
                     page_errors: list[str]) -> dict[str, Any]:
    problems = []
    try:
        final = audit_target_url(final_url)
    except (PermissionError, ValueError):
        final = ""
        problems.append("navigation-hors-domaine-ou-route")
    if final != f"https://{PUBLIC_HOST}{requested_path}":
        problems.append("redirection-vers-une-autre-page")
    if status is None or not 200 <= status < 400:
        problems.append("http-echec-ou-absence-de-reponse")
    if not str(title or "").strip():
        problems.append("titre-absent")
    if not body_visible:
        problems.append("contenu-invisible")
    if len(screenshot_digest) != 64 or any(c not in "0123456789abcdef" for c in screenshot_digest):
        problems.append("capture-non-verifiee")
    if page_errors:
        problems.append("exception-javascript")
    return {"ok": not problems, "problems": problems}

async def audit_public_pages(
    routes: list[str] | tuple[str, ...] = DEFAULT_ROUTES, *,
    network_validator: Callable[[str], Awaitable[str]],
    artifacts_dir: Path,
    browser_engine: str = "chromium",
) -> dict[str, Any]:
    """Open a bounded public page set, screenshot and prove outcomes locally."""
    from playwright.async_api import async_playwright
    if browser_engine not in {"chromium", "firefox", "webkit"}:
        raise ValueError("Moteur navigateur non autorisé")
    wanted = list(routes)
    if not wanted or len(wanted) > 5 or len(set(wanted)) != len(wanted):
        raise ValueError("De 1 à 5 routes SWAPP distinctes requises")
    urls = [audit_target_url(f"https://{PUBLIC_HOST}{route}") for route in wanted]
    output = Path(artifacts_dir).resolve()
    output.mkdir(parents=True, exist_ok=True)
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    rows = []
    async with async_playwright() as pw:
        browser = await getattr(pw, browser_engine).launch(headless=True)
        try:
            for viewport_name, viewport in VIEWPORTS.items():
                context = await browser.new_context(
                    viewport=viewport, service_workers="block", accept_downloads=False,
                    permissions=[], ignore_https_errors=False,
                )
                try:
                    async def guarded_request(route):
                        request = route.request
                        scheme = urlparse(request.url).scheme.casefold()
                        if scheme not in {"http", "https"}:
                            await route.continue_()
                            return
                        if request.method.upper() not in {"GET", "HEAD", "OPTIONS"}:
                            await route.abort()
                            return
                        try:
                            await network_validator(request.url)
                            if request.is_navigation_request():
                                audit_target_url(request.url)
                        except Exception:
                            await route.abort()
                            return
                        await route.continue_()
                    await context.route("**/*", guarded_request)
                    for requested_url, requested_path in zip(urls, wanted):
                        page = await context.new_page()
                        errors = []
                        page.on("pageerror", lambda exc: errors.append(str(exc)[:240]))
                        status = None
                        title = ""
                        final_url = ""
                        body_visible = False
                        screenshot_digest = ""
                        screenshot_file = ""
                        try:
                            await network_validator(requested_url)
                            response = await page.goto(requested_url, wait_until="domcontentloaded", timeout=16000)
                            status = response.status if response is not None else None
                            final_url = page.url
                            title = (await page.title())[:160]
                            body_visible = bool(await page.locator("body").is_visible())
                            filename = f"{run_id}-{viewport_name}-{requested_path.strip('/') or 'home'}.png"
                            image = await page.screenshot(full_page=False, timeout=6000)
                            screenshot_digest = hashlib.sha256(image).hexdigest()
                            destination = output / filename
                            destination.write_bytes(image)
                            screenshot_file = str(destination)
                        except Exception as exc:
                            errors.append(f"navigation: {type(exc).__name__}: {str(exc)[:120]}")
                        finally:
                            await page.close()
                        verdict = grade_navigation(
                            requested_path=requested_path, final_url=final_url,
                            status=status, title=title, body_visible=body_visible,
                            screenshot_digest=screenshot_digest, page_errors=errors,
                        )
                        rows.append({
                            "route": requested_path, "viewport": viewport_name,
                            "http_status": status, "title": title, "final_url": final_url,
                            "screenshot_sha256": screenshot_digest, "screenshot_file": screenshot_file,
                            "errors": errors[:4], **verdict,
                        })
                finally:
                    await context.close()
        finally:
            await browser.close()
    passed = sum(1 for row in rows if row["ok"])
    return {
        "ok": passed == len(rows) and bool(rows), "executed": True,
        "status": "completed" if passed == len(rows) and rows else "failed",
        "operation": "public-browser-audit", "targets": urls,
        "checks_passed": passed, "checks_total": len(rows),
        "cost_microunits": 0, "artifacts_directory": str(output), "checks": rows,
    }
