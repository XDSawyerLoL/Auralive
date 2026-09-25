# AURA Compute Mesh 2.1

## Objective

AURA must gain compute capacity when more voluntary nodes join the network, without making any
single model, GPU fleet or datacenter the owner of its cognition.

The architecture separates four planes:

1. **Meta-core** — AURA owns intent, memory, evidence, planning, permissions and learning.
2. **Capability Fabric** — typed routing across Web/API/Edge/Studio/Mesh capabilities.
3. **Compute Mesh** — volunteer read/compute nodes with reputation, quorum and data-class gates.
4. **Action Plane** — authenticated local/owned systems only. Public peers never receive action authority.

## Data classes

| Class | Public peer | Trusted Quantic peer | Local AURA |
|---|---:|---:|---:|
| public | yes | yes | yes |
| private | no | yes | yes |
| secret | no | no | yes |
| local | no | no | yes |

A public peer can never escalate its own trust tier. A Quantic Studio worker is marked trusted
only because registration is authenticated with the existing AURA Cloud machine token.

## Task federation

A task declares:

- task kind;
- data class;
- required capability tags;
- optional model hint;
- replica count;
- quorum;
- consensus mode;
- deadline.

The coordinator chooses peers from observed reputation, reliability, agreement rate, latency,
WebGPU availability and warm-model availability.

Three consensus modes exist:

- **exact** — deterministic tasks require identical result hashes from a quorum;
- **multi-agent** — independent model outputs are retained separately for AURA's critic/synthesizer;
- **any** — first/best sufficiently trusted result may satisfy a low-risk task.

A failed/stale lease is rebalanced onto another compatible peer before the task is failed.

## Mixture of Agents

AURA's MoA engine uses independent roles rather than pretending that one large prompt is an
ensemble. Initial roles are analyst, critic and builder. More domain experts can be registered
through the same typed capability system.

The synthesizer does not majority-vote. It receives independent outputs, preserves disagreements,
identifies unresolved questions and emits an explicit confidence value.

If no volunteer peer is available, the same role can run through AURA's existing model
constellation. The architecture therefore degrades gracefully instead of becoming unavailable.

## Browser WebGPU target

The browser peer protocol is intentionally narrow:

- opt-in only;
- no arbitrary JavaScript/Wasm supplied by a remote prompt;
- model inference through an approved browser runtime such as WebLLM/Transformers.js/ONNX Runtime Web;
- only advertised task kinds may be claimed;
- no secrets;
- no side effects;
- peer identity expires quickly when heartbeats stop.

A browser peer should download model weights from the model source/CDN directly. AURA Cloud
coordinates jobs and receives compact results; it does not proxy model weights or raw Web corpora.

## Quantic Studio peers

Quantic Studio already has the local AURA model constellation. It registers as a trusted Mesh
peer and can execute private LLM expert tasks. This gives AURA a real distributed SLM path before
the browser WebGPU client reaches mass deployment.

## Predictive routing

Every successful or failed task updates:

- reliability;
- agreement with deterministic quorum;
- reputation;
- observed latency;
- successful/failed job counts;
- models currently warm on the node.

The routing score is therefore empirical and evolves with use. AURA learns *where* useful
computation lives rather than re-discovering it on every request.

## Signed Wasm kernels

Generated code is never sent directly to peers or edge nodes.

Promotion path:

```
candidate operation
 -> local compile
 -> WebAssembly validation
 -> import allowlist
 -> deterministic tests
 -> resource budget
 -> SHA-256 content hash
 -> Ed25519 signature by an approved release key
 -> immutable kernel registry
 -> capability publication
```

The verifier rejects:

- unknown signing keys;
- signature mismatch;
- hash mismatch;
- invalid Wasm;
- undeclared imports;
- kernels declaring side effects;
- oversized modules.

The private signing key is not stored in AURA Cloud.

## Economic model

The architecture minimizes central inference cost but does not claim physically free compute.
Electricity, bandwidth, storage and free-tier limits still exist. The key property is different:
**central cost does not have to scale linearly with total inference demand** when users contribute
their own trusted/local/browser compute.

## Remaining production milestones

1. Ship the opt-in browser WebGPU peer as a version-pinned, self-hosted artifact.
2. Add semantic-quality scoring for non-deterministic peer outputs.
3. Add coordinator federation so Mesh control does not depend on one Cloud instance.
4. Promote prebuilt deterministic operations into signed Wasm kernels.
5. Add a vector routing adapter for semantic nearest-capability lookup.
6. Add adversarial/Byzantine peer tests and abuse throttling before opening public join broadly.
