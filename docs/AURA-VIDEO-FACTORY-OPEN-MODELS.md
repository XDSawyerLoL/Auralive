# AURA Video Factory + Open Model Specialists

## Video Factory

AURA adapts the useful workflow contract of MoneyPrinterTurbo without vendoring its code:

```text
topic / script
  -> search terms
  -> free or local media
  -> voice
  -> subtitles
  -> music
  -> render
  -> task status / output
```

The Cloud capability uses the MoneyPrinterTurbo-compatible API contract:

- `POST /api/v1/videos`
- `GET /api/v1/tasks/{task_id}`

MoneyPrinterTurbo is MIT-licensed. AURA's adapter is independent code and can also target another backend that implements the same small contract.

In `AURA_ZERO_COST_MODE=true`, the factory is disabled unless the operator explicitly confirms the backend is zero-cost/self-hosted. Media sources are limited to `local`, `pexels`, `pixabay`, or `coverr`.

MoneyPrinterTurbo can automatically cross-post a completed video when its upload service is configured with `auto_upload`. AURA therefore also requires `AURA_VIDEO_FACTORY_AUTO_PUBLISH_DISABLED_CONFIRMED=true` before it enables rendering. This confirmation means the connected MoneyPrinter instance has auto-upload disabled. AURA's adapter never asks MoneyPrinter to publish.

When API authentication is enabled, the adapter uses MoneyPrinterTurbo's `X-API-Key` header contract.

## Qwen3.5-9B Abliterated

Catalog key: `qwen3.5-9b-abliterated`.

This model is intentionally restricted to explicit divergent roles such as `redteam`, `creative`, and `brainstorm`. It is not eligible for `tools`, `security`, `evolution`, or operator authority because the published model deliberately removes refusal behavior.

AURA's policy and capability gates remain authoritative. The model is a specialist proposal generator, never the safety boundary.

## Kimi K3

Catalog key: `kimi-k3`.

Kimi K3 is registered as a frontier remote profile for multimodal, long-context, reasoning, research, code and critic roles. Its scale makes automatic local installation inappropriate for ordinary machines, so AURA only recognizes it when a compatible worker/provider exposes it.

## Existing gpt-oss

`gpt-oss-20b` was already present in AURA's constellation before this change and remains the practical open-weight reasoning/tools specialist for capable local or private infrastructure.
