from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services.image_generation import AuraImageService


def settings(tmp_path):
    return SimpleNamespace(
        image_output_dir=tmp_path / "images",
        image_mode="off",
        image_a1111_url="http://127.0.0.1:7860",
        image_comfy_url="http://127.0.0.1:8188",
        image_default_width=1024,
        image_default_height=1024,
        image_default_steps=8,
        image_default_model="FLUX.1-schnell",
        image_comfy_workflow=tmp_path / "workflow.json",
    )


def test_image_dimensions_are_bounded_and_aligned(tmp_path):
    service = AuraImageService(settings(tmp_path))
    assert service._safe_dimensions(1001, 2070) == (1024, 2048)
    assert service._safe_dimensions(1, 1) == (256, 256)


def test_comfy_workflow_placeholders_are_replaced(tmp_path):
    service = AuraImageService(settings(tmp_path))
    workflow = {
        "1": {
            "inputs": {
                "text": "{{PROMPT}}",
                "width": "{{WIDTH}}",
                "model": "{{MODEL}}",
            }
        }
    }
    replaced = service._replace_workflow_values(
        workflow,
        {"{{PROMPT}}": "galaxie", "{{WIDTH}}": 1024, "{{MODEL}}": "flux.safetensors"},
    )
    assert replaced["1"]["inputs"]["text"] == "galaxie"
    assert replaced["1"]["inputs"]["width"] == 1024
    assert replaced["1"]["inputs"]["model"] == "flux.safetensors"


class _FakeResponse:
    def __init__(self, status: int, text: str = ""):
        self.status = status
        self._text = text

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def text(self):
        return self._text


class _RejectingSession:
    def post(self, *args, **kwargs):
        return _FakeResponse(404, "checkpoint not found")


@pytest.mark.asyncio
async def test_a1111_rejected_explicit_checkpoint_aborts_generation(tmp_path):
    service = AuraImageService(settings(tmp_path))
    service.session = _RejectingSession()

    with pytest.raises(RuntimeError, match="checkpoint image demandé"):
        await service._generate_a1111(
            "galaxie",
            negative_prompt="",
            width=512,
            height=512,
            steps=4,
            seed=42,
            model="missing-checkpoint.safetensors",
        )
