# AURA Browser Compute Peer

This directory is the browser-side client for AURA Compute Mesh.

It intentionally contains **no remote-code execution path**. The peer understands only task
kinds compiled into the client. AURA cannot send JavaScript, Python or arbitrary Wasm and ask
the browser to execute it.

## WebGPU / SLM path

`peer.js` provides the Mesh protocol client and opt-in lifecycle.

`webllm-adapter.js` accepts an already imported, version-pinned WebLLM module and exposes a
minimal SLM adapter. The host application is responsible for importing or self-hosting the
approved WebLLM bundle.

Recommended production flow:

1. self-host a pinned WebLLM build under a Quantic-controlled origin;
2. publish its SHA-256/SRI value with the release;
3. import that exact artifact in the Quantic web client;
4. construct `WebLlmAdapter`;
5. pass it to `AuraMeshBrowserPeer`;
6. start only after explicit user opt-in.

Example:

```js
import * as webllm from "/vendor/webllm-0.2.85.js";
import { AuraMeshBrowserPeer } from "./peer.js";
import { createWebLlmAdapter } from "./webllm-adapter.js";

const llm = createWebLlmAdapter(webllm, {
  modelId: "YOUR_APPROVED_SMALL_MODEL",
});

await llm.load();
const peer = new AuraMeshBrowserPeer({
  baseUrl: "https://your-aura-cloud.example",
  llmAdapter: llm,
});
await peer.start();
```

## Privacy

Public browser peers receive only tasks classified `public`.

Private tasks may be routed only to a trusted Quantic peer authenticated by the AURA machine
token. Tasks classified `secret` or `local` never enter Compute Mesh.

The peer token is kept in process memory by the reference client. It is not a Quantic identity
credential and grants no action authority.

## Current task kinds

- `llm.chat` — only when an approved local SLM adapter is loaded;
- `mesh.hash.sha256` — deterministic quorum test;
- `mesh.benchmark` — lightweight capability/latency measurement.

Future signed Wasm kernels must be promoted through AURA's signed-kernel registry before a
browser client adds an executor for them.
