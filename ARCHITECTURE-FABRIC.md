# AURA Fabric 2.0 — Internet as a reasoning and execution substrate

Status: implementation branch

## Goal

AURA must not try to memorize the Web inside one language model. The model is a replaceable
compiler/critic. AURA owns the persistent state, the task graph, the capability policy, the
evidence ledger, execution history, and learning loop.

The target loop is:

```
intent
  -> hypotheses
  -> typed DAG
  -> capability routing
  -> parallel execution
  -> evidence / result verification
  -> contradiction handling
  -> revised DAG when needed
  -> bounded action
  -> outcome
  -> durable learning
```

## The four layers

### 1. Meta-reasoning compiler

The planner emits a typed DAG, not arbitrary shell commands and not raw production code.

Each task declares:

- a stable capability id;
- dependencies;
- structured input;
- expected output kind;
- verification requirement;
- cost and latency budgets;
- an evidence policy where factual claims are involved.

The LLM may propose the graph. Deterministic code validates the graph, checks cycles,
enforces budgets and decides whether an execution is admissible. A critic can reject or
re-plan results, but does not get authority to expand the execution policy.

This keeps GPT, Gemini, Qwen, DeepSeek, Hermes or another future model replaceable.

### 2. Capability Fabric

Internet is treated as a bus of typed capabilities, not as a browser.

A capability has a manifest:

```json
{
  "id": "web.research",
  "transport": "local|edge-http|studio-bridge",
  "trust": 0.0,
  "latency_ms": 0,
  "cost_microunits": 0,
  "tags": ["research", "web"],
  "side_effects": false
}
```

The router selects a capability from requirements, trust, observed reliability, cost and
latency. Unknown Web pages may provide data/evidence but never become execution capabilities
automatically.

Remote execution is only allowed through authenticated capability endpoints. The protocol does
not expose an arbitrary remote shell.

### 3. Rust swarm scheduler

A separate Rust engine, `engine/aura-fabric`, executes DAG waves concurrently and returns
structured node outcomes. It is deliberately separated from the Quantic Studio broadcast
engine.

The Rust scheduler is responsible for:

- dependency resolution;
- high-concurrency fan-out;
- retries/backoff policy;
- node time budgets;
- cancellation;
- quorum aggregation;
- execution metrics.

The Cloud control plane can run a JavaScript fallback scheduler while the Rust engine becomes
the preferred high-throughput data plane.

### 4. Distributed memory

Memory has three distinct jobs and must not collapse into one vector database:

1. **Authoritative ledger** — MySQL: evidence, provenance, decisions, outcomes, permissions.
2. **Semantic routing index** — Cloudflare Vectorize or another vector adapter: fast nearest
   capability/source retrieval.
3. **Local/offline mirror** — sqlite-vec in Quantic Studio when local semantic recall is useful.

Vector similarity is a routing hint, never a truth score.

## Edge strategy

First-class edge adapter: Cloudflare.

Intended primitives:

- Workers for small stateless transforms and API fan-out;
- Workflows for durable multi-step remote execution;
- Queues for asynchronous fan-out/backpressure;
- Durable Objects for strongly consistent coordination/state;
- Vectorize for semantic routing memory;
- precompiled Wasm kernels for deterministic transforms.

Fastly Compute is a compatible secondary Wasm edge adapter. AWS Lambda/Lambda@Edge can be an
adapter for workloads already living in AWS, but is not the default fabric substrate.

## Wasm policy

AURA does **not** upload arbitrary LLM-generated code straight to production edge nodes.

The safe path is:

```
LLM proposes typed operation
  -> deterministic compiler selects/generates candidate
  -> static policy scan
  -> sandbox tests
  -> resource budget
  -> signed immutable kernel
  -> capability registry
  -> execution
```

For common operations, AURA uses prebuilt Wasm kernels. Novel generated kernels enter the same
sandbox/CI/canary path as AURA Evolution before they can become executable capabilities.

## Critical evaluation loop

A result can be:

- verified;
- partially supported;
- contested;
- unverified;
- failed.

External factual claims require provenance. Contradictory evidence triggers another DAG branch
instead of being silently averaged away. Results are evaluated on source independence,
recency, primary-source proximity, observed reliability and task-specific relevance.

The command center must not take an externally-dependent irreversible action from an
`unverified` or `contested` result.

## Non-goals

- no arbitrary Internet shell;
- no unauthenticated remote workers;
- no Web page can grant itself permissions;
- no vector result is treated as fact;
- no single proprietary LLM owns AURA's cognition;
- no vendor is mandatory for the architecture.

## Initial implementation milestones

1. Typed DAG + deterministic validation.
2. Capability registry + routing.
3. JavaScript parallel executor as control-plane fallback.
4. Rust swarm scheduler.
5. Cloudflare edge adapter with capability discovery.
6. Vector routing adapter.
7. Command-center integration.
8. Signed Wasm kernel promotion pipeline.
