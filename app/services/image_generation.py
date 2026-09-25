from __future__ import annotations

import asyncio
import base64
import json
import logging
import random
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import aiohttp

logger = logging.getLogger(__name__)


class AuraImageService:
    """Génération d'images locale via A1111/Forge ou ComfyUI.

    Aucun fournisseur cloud n'est requis. Les modèles restent remplaçables :
    FLUX.1-schnell, Qwen-Image ou tout checkpoint compatible avec le backend.
    """

    VERSION = "aura-image-local-v1"

    def __init__(self, settings: Any):
        self.settings = settings
        self.session: aiohttp.ClientSession | None = None
        self.output_dir = Path(settings.image_output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.last_backend = ""
        self.last_error = ""
        self.last_file = ""
        self.last_latency_ms = 0
        self.last_model = ""

    async def start(self) -> None:
        if self.session is None:
            self.session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=300)
            )

    async def close(self) -> None:
        if self.session:
            await self.session.close()
            self.session = None

    async def _get_json(self, url: str, timeout: float = 3.0) -> dict[str, Any]:
        await self.start()
        assert self.session is not None
        async with self.session.get(
            url,
            timeout=aiohttp.ClientTimeout(total=timeout),
        ) as response:
            response.raise_for_status()
            payload = await response.json()
        return payload if isinstance(payload, dict) else {}

    async def _a1111_ready(self) -> bool:
        try:
            await self._get_json(f"{self.settings.image_a1111_url}/sdapi/v1/options")
            return True
        except Exception:
            return False

    async def _comfy_ready(self) -> bool:
        try:
            await self._get_json(f"{self.settings.image_comfy_url}/system_stats")
            return True
        except Exception:
            return False

    async def select_backend(self) -> str:
        mode = str(self.settings.image_mode or "auto").casefold()
        if mode == "off":
            return ""
        if mode in {"a1111", "forge"}:
            return "a1111" if await self._a1111_ready() else ""
        if mode == "comfyui":
            return "comfyui" if await self._comfy_ready() else ""
        if await self._a1111_ready():
            return "a1111"
        if await self._comfy_ready():
            return "comfyui"
        return ""

    async def diagnostic(self) -> dict[str, Any]:
        backend = await self.select_backend()
        return {
            "version": self.VERSION,
            "configured_mode": self.settings.image_mode,
            "ready": bool(backend),
            "backend": backend,
            "a1111_url": self.settings.image_a1111_url,
            "comfy_url": self.settings.image_comfy_url,
            "default_model": self.settings.image_default_model,
            "workflow_configured": Path(self.settings.image_comfy_workflow).is_file(),
            "output_dir": str(self.output_dir),
            "last_backend": self.last_backend,
            "last_model": self.last_model,
            "last_file": self.last_file,
            "last_latency_ms": self.last_latency_ms,
            "last_error": self.last_error,
        }

    @staticmethod
    def _safe_dimensions(width: int, height: int) -> tuple[int, int]:
        def safe(value: int) -> int:
            value = max(256, min(int(value), 2048))
            return max(256, int(round(value / 64)) * 64)
        return safe(width), safe(height)

    async def generate(
        self,
        prompt: str,
        *,
        negative_prompt: str = "",
        width: int | None = None,
        height: int | None = None,
        steps: int | None = None,
        seed: int | None = None,
        model: str = "",
    ) -> dict[str, Any]:
        text = " ".join(str(prompt or "").split()).strip()
        if not text:
            raise ValueError("Prompt image vide")
        if len(text) > 6000:
            text = text[:6000]

        backend = await self.select_backend()
        if not backend:
            raise RuntimeError(
                "Aucun moteur d'image local détecté. Lance ComfyUI ou Forge/A1111 sur ce PC."
            )

        w, h = self._safe_dimensions(
            width or self.settings.image_default_width,
            height or self.settings.image_default_height,
        )
        wanted_steps = max(1, min(int(steps or self.settings.image_default_steps), 80))
        wanted_seed = int(seed if seed is not None else random.randint(1, 2**31 - 1))
        explicit_model = bool(str(model or "").strip())
        wanted_model = str(model or self.settings.image_default_model or "").strip()

        started = time.monotonic()
        try:
            if backend == "a1111":
                result = await self._generate_a1111(
                    text,
                    negative_prompt=negative_prompt,
                    width=w,
                    height=h,
                    steps=wanted_steps,
                    seed=wanted_seed,
                    model=wanted_model,
                    strict_model=explicit_model,
                )
            else:
                result = await self._generate_comfyui(
                    text,
                    negative_prompt=negative_prompt,
                    width=w,
                    height=h,
                    steps=wanted_steps,
                    seed=wanted_seed,
                    model=wanted_model,
                )
            actual_model = str(result.pop("actual_model", wanted_model) or wanted_model)
            self.last_latency_ms = round((time.monotonic() - started) * 1000)
            self.last_backend = backend
            self.last_model = actual_model
            self.last_file = str(result.get("path") or "")
            self.last_error = ""
            return {
                "ok": True,
                "backend": backend,
                "model": actual_model,
                "requested_model": wanted_model,
                "prompt": text,
                "negative_prompt": str(negative_prompt or "")[:3000],
                "width": w,
                "height": h,
                "steps": wanted_steps,
                "seed": wanted_seed,
                "latency_ms": self.last_latency_ms,
                **result,
            }
        except Exception as exc:
            self.last_error = f"{exc.__class__.__name__}: {exc}"[:800]
            raise

    async def _generate_a1111(
        self,
        prompt: str,
        *,
        negative_prompt: str,
        width: int,
        height: int,
        steps: int,
        seed: int,
        model: str,
        strict_model: bool = False,
    ) -> dict[str, Any]:
        await self.start()
        assert self.session is not None

        actual_model = model
        if model:
            try:
                async with self.session.post(
                    f"{self.settings.image_a1111_url}/sdapi/v1/options",
                    json={"sd_model_checkpoint": model},
                    timeout=aiohttp.ClientTimeout(total=60),
                ) as response:
                    body = await response.text()
                    if response.status >= 400:
                        if strict_model:
                            raise RuntimeError(
                                f"A1111 refuse le checkpoint {model!r} "
                                f"(HTTP {response.status}): {body[:300]}"
                            )
                        logger.info(
                            "Checkpoint par défaut %r indisponible; conservation du modèle A1111 déjà chargé.",
                            model,
                        )

                options = await self._get_json(
                    f"{self.settings.image_a1111_url}/sdapi/v1/options",
                    timeout=10,
                )
                actual_model = str(options.get("sd_model_checkpoint") or model).strip()
            except Exception as exc:
                if strict_model:
                    raise RuntimeError(
                        f"Impossible d'activer le checkpoint image demandé {model!r}: {exc}"
                    ) from exc
                logger.info(
                    "Sélection du checkpoint par défaut ignorée; utilisation du modèle A1111 courant: %s",
                    exc,
                )
                try:
                    options = await self._get_json(
                        f"{self.settings.image_a1111_url}/sdapi/v1/options",
                        timeout=10,
                    )
                    actual_model = str(options.get("sd_model_checkpoint") or "").strip() or model
                except Exception:
                    actual_model = model

        payload = {
            "prompt": prompt,
            "negative_prompt": str(negative_prompt or "")[:3000],
            "width": width,
            "height": height,
            "steps": steps,
            "seed": seed,
            "batch_size": 1,
            "n_iter": 1,
        }
        async with self.session.post(
            f"{self.settings.image_a1111_url}/sdapi/v1/txt2img",
            json=payload,
            timeout=aiohttp.ClientTimeout(total=300),
        ) as response:
            text = await response.text()
            if response.status >= 400:
                raise RuntimeError(f"A1111 HTTP {response.status}: {text[:500]}")
            data = json.loads(text or "{}")

        images = list(data.get("images") or [])
        if not images:
            raise RuntimeError("Le moteur image n'a renvoyé aucune image")
        raw = str(images[0])
        if "," in raw and raw.lstrip().startswith("data:"):
            raw = raw.split(",", 1)[1]
        binary = base64.b64decode(raw)
        path = self._next_path("png")
        await asyncio.to_thread(path.write_bytes, binary)
        return {
            "path": str(path),
            "filename": path.name,
            "mime_type": "image/png",
            "bytes": len(binary),
            "actual_model": actual_model,
        }

    def _replace_workflow_values(
        self,
        value: Any,
        replacements: dict[str, Any],
    ) -> Any:
        if isinstance(value, dict):
            return {
                key: self._replace_workflow_values(item, replacements)
                for key, item in value.items()
            }
        if isinstance(value, list):
            return [self._replace_workflow_values(item, replacements) for item in value]
        if isinstance(value, str):
            exact = replacements.get(value)
            if exact is not None:
                return exact
            result = value
            for token, replacement in replacements.items():
                if isinstance(replacement, (str, int, float)):
                    result = result.replace(token, str(replacement))
            return result
        return value

    async def _generate_comfyui(
        self,
        prompt: str,
        *,
        negative_prompt: str,
        width: int,
        height: int,
        steps: int,
        seed: int,
        model: str,
    ) -> dict[str, Any]:
        await self.start()
        assert self.session is not None
        workflow_path = Path(self.settings.image_comfy_workflow)
        if not workflow_path.is_file():
            raise RuntimeError(
                "ComfyUI est détecté mais aucun workflow AURA n'est configuré. "
                "Définis AURA_IMAGE_COMFY_WORKFLOW vers un workflow API JSON."
            )
        try:
            workflow = json.loads(workflow_path.read_text(encoding="utf-8"))
        except Exception as exc:
            raise RuntimeError("Workflow ComfyUI AURA invalide") from exc

        replacements = {
            "{{PROMPT}}": prompt,
            "{{NEGATIVE}}": str(negative_prompt or ""),
            "{{WIDTH}}": width,
            "{{HEIGHT}}": height,
            "{{STEPS}}": steps,
            "{{SEED}}": seed,
            "{{MODEL}}": model,
        }
        workflow = self._replace_workflow_values(workflow, replacements)

        async with self.session.post(
            f"{self.settings.image_comfy_url}/prompt",
            json={"prompt": workflow},
            timeout=aiohttp.ClientTimeout(total=30),
        ) as response:
            text = await response.text()
            if response.status >= 400:
                raise RuntimeError(f"ComfyUI HTTP {response.status}: {text[:500]}")
            queued = json.loads(text or "{}")
        prompt_id = str(queued.get("prompt_id") or "")
        if not prompt_id:
            raise RuntimeError("ComfyUI n'a pas renvoyé de prompt_id")

        deadline = time.monotonic() + 300
        image_meta: dict[str, Any] | None = None
        while time.monotonic() < deadline:
            history = await self._get_json(
                f"{self.settings.image_comfy_url}/history/{prompt_id}",
                timeout=10,
            )
            row = history.get(prompt_id) if isinstance(history, dict) else None
            outputs = dict((row or {}).get("outputs") or {})
            for node in outputs.values():
                images = list((node or {}).get("images") or [])
                if images:
                    image_meta = dict(images[0])
                    break
            if image_meta:
                break
            await asyncio.sleep(0.6)

        if not image_meta:
            raise TimeoutError("ComfyUI n'a pas produit l'image dans le délai imparti")

        query = urlencode(
            {
                "filename": str(image_meta.get("filename") or ""),
                "subfolder": str(image_meta.get("subfolder") or ""),
                "type": str(image_meta.get("type") or "output"),
            }
        )
        async with self.session.get(
            f"{self.settings.image_comfy_url}/view?{query}",
            timeout=aiohttp.ClientTimeout(total=30),
        ) as response:
            response.raise_for_status()
            binary = await response.read()
        path = self._next_path("png")
        await asyncio.to_thread(path.write_bytes, binary)
        return {
            "path": str(path),
            "filename": path.name,
            "mime_type": "image/png",
            "bytes": len(binary),
            "prompt_id": prompt_id,
        }

    def _next_path(self, suffix: str) -> Path:
        stamp = time.strftime("%Y%m%d-%H%M%S")
        for index in range(1000):
            extra = f"-{index:03d}" if index else ""
            path = self.output_dir / f"aura-{stamp}{extra}.{suffix}"
            if not path.exists():
                return path
        raise RuntimeError("Impossible d'allouer un nom de fichier image")
