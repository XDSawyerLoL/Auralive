from __future__ import annotations

import asyncio
import importlib.util
from typing import Any


class OpenCapabilities:
    """Adaptateurs optionnels vers des briques open source.

    AURA reste l'autorité de décision. Ces composants ne fournissent que des
    capacités d'observation ou d'exécution bornées par RuntimeOperator.
    """

    VERSION = "aura-open-capabilities-v1"

    def __init__(self, settings: Any):
        self.settings = settings
        self.last_error = ""
        self.last_deep_read = ""
        self.last_browser_task = ""

    @staticmethod
    def _installed(module: str) -> bool:
        try:
            return importlib.util.find_spec(module) is not None
        except (ImportError, AttributeError, ValueError):
            return False

    @property
    def crawl4ai_available(self) -> bool:
        return self._installed("crawl4ai")

    @property
    def browser_use_available(self) -> bool:
        return self._installed("browser_use")

    @property
    def deep_web_enabled(self) -> bool:
        return bool(getattr(self.settings, "aura_runtime_deep_web_enabled", True))

    @property
    def browser_enabled(self) -> bool:
        return bool(getattr(self.settings, "aura_runtime_browser_enabled", False))

    async def deep_read(self, url: str, *, query: str = "") -> dict[str, Any]:
        if not self.deep_web_enabled:
            raise RuntimeError("Lecture Web profonde désactivée")
        if not self.crawl4ai_available:
            raise RuntimeError(
                "Crawl4AI absent. Installe aura_runtime/requirements-open-capabilities.txt"
            )

        from crawl4ai import AsyncWebCrawler

        try:
            async with AsyncWebCrawler() as crawler:
                result = await crawler.arun(url=str(url))
            if not bool(getattr(result, "success", True)):
                raise RuntimeError(
                    str(getattr(result, "error_message", "") or "Crawl4AI n'a pas pu lire la page")
                )
            markdown: Any = getattr(result, "markdown", "")
            raw_markdown = getattr(markdown, "raw_markdown", None)
            if raw_markdown is not None:
                markdown = raw_markdown
            text = str(markdown or "").strip()
            if not text:
                text = str(getattr(result, "cleaned_html", "") or "").strip()
            limit = max(
                2_000,
                min(
                    int(getattr(self.settings, "aura_runtime_deep_web_max_chars", 60_000)),
                    200_000,
                ),
            )
            text = text[:limit]
            self.last_deep_read = str(url)[:1000]
            self.last_error = ""
            return {
                "ok": True,
                "engine": "crawl4ai",
                "url": str(getattr(result, "url", "") or url),
                "query": str(query or "")[:1000],
                "content": text,
                "chars": len(text),
                "read_only": True,
            }
        except Exception as exc:
            self.last_error = f"{exc.__class__.__name__}: {exc}"[:2000]
            raise

    async def browser_task(
        self,
        task: str,
        *,
        allowed_domains: set[str],
        model: str,
        ollama_url: str,
        max_steps: int = 5,
    ) -> dict[str, Any]:
        if not self.browser_enabled:
            raise RuntimeError("Agent navigateur AURA désactivé")
        if not self.browser_use_available:
            raise RuntimeError(
                "Browser Use absent. Installe aura_runtime/requirements-open-capabilities.txt"
            )
        domains = sorted({str(item).strip().casefold() for item in allowed_domains if str(item).strip()})
        if not domains:
            raise PermissionError(
                "browser.task exige AURA_RUNTIME_OPERATOR_DOMAINS: aucune navigation ouverte par défaut"
            )
        mission = str(task or "").strip()
        if not mission:
            raise ValueError("Mission navigateur vide")
        if len(mission) > 8000:
            raise ValueError("Mission navigateur trop longue")

        from browser_use import Agent, Browser, ChatOllama

        browser = Browser(
            headless=True,
            allowed_domains=domains,
        )
        llm = ChatOllama(
            model=str(model or "").strip(),
            host=str(ollama_url or "").strip() or None,
        )
        steps = max(1, min(int(max_steps or 5), 8))
        agent = Agent(
            task=mission,
            llm=llm,
            browser=browser,
            use_vision=False,
        )
        try:
            history = await agent.run(max_steps=steps)
            final = str(history.final_result() or "").strip()
            self.last_browser_task = mission[:1000]
            self.last_error = ""
            return {
                "ok": True,
                "engine": "browser-use+ollama",
                "result": final[:30_000],
                "max_steps": steps,
                "allowed_domains": domains,
                "vision": False,
            }
        except Exception as exc:
            self.last_error = f"{exc.__class__.__name__}: {exc}"[:2000]
            raise
        finally:
            try:
                await asyncio.wait_for(browser.stop(), timeout=10)
            except Exception:
                pass

    def diagnostic(self) -> dict[str, Any]:
        return {
            "version": self.VERSION,
            "crawl4ai": {
                "enabled": self.deep_web_enabled,
                "installed": self.crawl4ai_available,
                "mode": "read-only",
            },
            "browser_use": {
                "enabled": self.browser_enabled,
                "installed": self.browser_use_available,
                "requires_risk": "browser-control",
                "vision": False,
            },
            "last_deep_read": self.last_deep_read,
            "last_browser_task": self.last_browser_task,
            "last_error": self.last_error,
        }
