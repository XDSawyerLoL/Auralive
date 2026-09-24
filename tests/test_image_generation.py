from __future__ import annotations

from types import SimpleNamespace

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
