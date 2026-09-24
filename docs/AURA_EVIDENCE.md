# AURA — Evidence dossier

Date: 2026-09-24

This document separates what is **implemented and tested** from what still needs a **live production capture**.

## 1. Persistent internal state ("Soul")

**Claim:** AURA maintains a persistent internal state rather than starting from a blank prompt each time.

**Code evidence:** `cloud-node/src/kernel.js`, method `defaultSoul()` and persistence through `saveSoul()`.

Persisted variables include:
- phase
- cycles
- energy
- curiosity
- pressure
- continuity
- introspection
- openness
- reactivity
- playfulness
- dominant_thought
- current_intention
- born_at / last_tick_at / last_reflection_at

**Persistence evidence:** `cloud-node/src/db.js` creates `aura_soul_state` and the kernel writes the state to MySQL.

**Marketing-safe wording:** "AURA maintains a persistent internal state with dynamic behavioral variables."

Do not describe this as proof of consciousness or real emotion.

## 2. Internal state changes in response to events

**Claim:** AURA's internal variables are not decorative constants; events modify them.

**Code evidence:** `cloud-node/src/kernel.js`, method `observeEvent()`.

Examples implemented:
- HORIZON signal -> curiosity and introspection increase
- emerging HORIZON hypothesis -> pressure can increase
- stream.online -> energy and reactivity increase
- stream.offline -> energy decreases and introspection increases
- cloud chat -> continuity and energy increment

**Marketing-safe wording:** "External events measurably alter AURA's internal state."

## 3. Continuous cognitive cycles

**Claim:** AURA can continue running cognitive cycles between user messages.

**Code evidence:** `cloud-node/src/kernel.js`, methods `start()`, `tick()`, and `runDueRoutines()`.

The kernel timer executes due routines and then an ambient cognitive tick at the configured interval.

The tick updates:
- cycle count
- developmental phase
- energy homeostasis
- pressure decay
- reflection decision

**Marketing-safe wording:** "AURA runs persistent cognitive cycles rather than existing only during a chat request."

## 4. Persistent intentions

**Claim:** AURA stores active intentions with priority and lifecycle.

**Code evidence:** `cloud-node/src/kernel.js`, methods:
- `addIntention()`
- `intentions()`
- `completeIntention()`

**Database evidence:** `cloud-node/src/db.js`, table `aura_intentions`.

**Marketing-safe wording:** "AURA can retain prioritized intentions across sessions."

## 5. Durable learning from outcomes

**Claim:** AURA can learn from repeated operational failures.

**Code evidence:** `cloud-node/src/kernel.js`, method `recordOutcome()`.

Implemented behavior:
- success reduces pressure slightly
- failure increases pressure and introspection
- the failure is stored
- after 3 identical failures, AURA creates a durable lesson
- AURA can create an improvement proposal for the repeated failure

**Database evidence:**
- `aura_outcomes`
- `aura_lessons`
- `aura_improvement_proposals`

**Marketing-safe wording:** "AURA converts repeated execution failures into persistent lessons and improvement proposals."

## 6. Memory consolidation

**Claim:** AURA can persist lessons rather than relying only on conversation history.

**Code evidence:** `cloud-node/src/kernel.js`, method `learn()`.

Lessons have:
- a stable key
- confidence
- evidence count
- source
- created/updated timestamps

Repeated evidence increments the lesson's evidence count.

**Marketing-safe wording:** "AURA stores structured long-term lessons with confidence and evidence counts."

## 7. Multi-agent reasoning

**Claim:** AURA includes multiple specialized agents and can synthesize their outputs.

**Code evidence:** `cloud-node/src/kernel.js`.

Defined roles:
- planner
- research
- dev
- security
- operator
- critic

Methods:
- `runAgent()`
- `swarm()`

The swarm gathers several agent outputs and requests a single synthesis.

**Marketing-safe wording:** "AURA can delegate a problem to specialized agents and synthesize a collective answer."

## 8. Bounded cloud operator

**Claim:** The cloud runtime does not directly control the user's PC.

**Code evidence:** `cloud-node/src/kernel.js`, method `operate()`.

The cloud runtime returns:
- `execution_mode: plan-only`
- `executed: false`
- explicit requirement for Quantic Studio / Automation Studio for execution

**Marketing-safe wording:** "AURA Cloud plans; execution remains behind an explicit local authority boundary."

## 9. HORIZON epistemic guard

**Claim:** AURA distinguishes an emerging hypothesis from a confirmed event.

**Code evidence:** `cloud-node/src/policy.js`, `validateHorizonSignal()`.

An emerging HORIZON signal is rejected unless:
- `epistemic_status = unconfirmed_emerging_event`
- `autonomy_hint = notify_or_verify_only`

**Automated test:** `cloud-node/test/policy.test.js`.

**Marketing-safe wording:** "AURA preserves uncertainty labels instead of treating every prediction as a fact."

## 10. AURA Evolution phase 1

**Claim:** AURA contains a continuous improvement research loop.

**Code evidence:** `cloud-node/src/evolution.js`.

Implemented:
- periodic Evolution cycles
- GitHub release/commit research
- npm dependency research
- configured HTTPS research URLs
- allowlisted domains
- Internet content explicitly treated as untrusted data
- diagnosis of whether a change is worth investigating
- independent canary records

Current limits:
- auto-submit: OFF
- auto-merge: OFF

**Marketing-safe wording:** "AURA can continuously research and diagnose possible improvements while automated code promotion remains disabled."

Do not claim that the Node cloud runtime autonomously rewrites and deploys itself in production.

## 11. Independent canary gate

**Claim:** AURA's future promotion path includes an independent canary gate.

**Code evidence:** `cloud-node/src/evolution.js` and `cloud-node/src/policy.js`.

Canary readiness requires:
- passed = true
- minimum observation count reached

**Automated test:** `cloud-node/test/policy.test.js`.

## 12. Resilient Hostinger gateway

**Claim:** The public Node gateway can stay online even if the full AURA/Fastify runtime is unavailable.

**Code evidence:** `cloud-node/server.js`.

Architecture:
- public native Node gateway: `0.0.0.0:3000`
- internal AURA/Fastify: `127.0.0.1:3001`
- gateway reverse-proxies requests to AURA
- if internal runtime is unavailable, gateway serves a diagnostic response instead of an application-level 503

**Automated tests:** `cloud-node/test/bootstrap.test.js`.

Successful CI run for commit:
`bb6bbe601a487176b132c439e42d6067d99fcbfe`

Run:
- AURA Cloud Node validation #24 — success
- Quantic Studio validation #273 — success
- Package AURA Cloud Node Hostinger #15 — success

Node test result:
- 8 tests
- 8 passed
- 0 failed

Explicit tested scenarios:
- "native gateway stays online even when full runtime is disabled" — PASS
- "gateway proxies to AURA dashboard without MySQL" — PASS

PR #66 was merged into `main`.
Merge commit:
`4e5f3d52a034c52dc869be04ce067f7ab5270d54`

## 13. What still needs a live production capture

The repository and CI prove implementation and automated behavior. For marketing material, capture the following directly from the deployed Hostinger instance:

1. `/`
   - AURA dashboard visible
2. `/__aura_gateway`
   - `gateway_ready: true`
   - `runtime_ready: true` when the internal runtime is healthy
3. `/healthz`
   - HTTP 200
4. `/api/kernel/status`
   - runtime version
   - started state
   - phase
   - counters
5. `/api/kernel/soul`
   - public Soul values
6. A before/after capture of one controlled event changing a Soul variable
7. A controlled repeated-failure demo showing a new durable lesson after the threshold
8. A multi-agent/swarm result
9. HORIZON status once connected
10. Evolution status once the private runtime is configured

## 14. Suggested LinkedIn proof sequence

### Proof 01 — "It is alive between prompts"
Show:
- dashboard
- cycles increasing
- timestamp of last tick

Claim:
"AURA continues to run cognitive cycles even when nobody is chatting with it."

### Proof 02 — "Its internal state changes"
Show:
- before event: energy / curiosity / pressure
- after a controlled event: changed values

Claim:
"AURA's internal state is coupled to what happens around it."

### Proof 03 — "It learns from failure"
Show:
- three controlled identical failures
- new lesson / evidence count

Claim:
"Repeated operational failures become persistent lessons."

### Proof 04 — "It has persistent intentions"
Show:
- active intention
- restart/session change
- same intention still present

Claim:
"An objective survives the conversation that created it."

### Proof 05 — "Multiple agents, one decision"
Show:
- planner / research / dev / security / critic outputs
- final synthesis

Claim:
"AURA does not rely on a single reasoning role."

### Proof 06 — "We test failure, not only success"
Show GitHub CI:
- 8 tests / 8 pass / 0 fail
- native gateway survives full runtime disabled
- gateway proxies without MySQL

Claim:
"We deliberately test how AURA behaves when parts of itself fail."

---

## Evidence quality labels

Use these labels in public material:

- **LIVE PROOF** — observed on the deployed production URL
- **AUTOMATED TEST** — reproduced by CI
- **CODE IMPLEMENTED** — present in the public repository
- **ROADMAP** — not yet demonstrated

Never label roadmap behavior as already autonomous or production-proven.
