# AURA 3.0 — Native P0 integration slice (2026-10-12)

This PR integrates three **bounded** architectural patterns with the existing Node 22 runtime; no third-party source is copied and no third-party runtime is added.

1. **Reflex (Jev/System One-inspired)**: fast typed tier routing with a conservative risk/novelty escalation gate, wired into ActiveInferenceEngine. This is a heuristic guard, **not Jev**, not a learned calibrated classifier, and not AGI.
2. **Organization (Paperclip-inspired)**: cooperative round-robin across the active long-horizon mission set, retaining priority at the first selection. Cursor advances only when a mission is dispatched. This mitigates single-mission starvation in one process; it is **not simultaneous mission execution or atomic multi-instance leasing**.
3. **Memory (Claude-Mem-inspired)**: retrieval of up to six deduplicated, relevance-ranked context notes from the same session, using the existing MySQL table. No embedding service, paid API, cross-session privacy leak, or weight training.

Original reference implementations: https://github.com/PaperclipAI/paperclip (MIT), https://github.com/thedotmack/claude-mem (Apache-2.0). Jev model/API is **not bundled or used**.

## Safety, scope and next gates
- No schema migration, external credentials, paid provider, deployment or effectful new operation.
- Existing model-routing risk/cost policy and typed Fabric permissions remain authoritative.
- Verify `cd cloud-node && npm run check:package && npm test` plus PR CI.
- Test real deployment and long-horizon crash/concurrency behavior before declaring production readiness.
- Next increments: durable/atomic per-service leases across processes, provenance-aware long-term memory consolidation, held-out decision calibration, outcome receipts / proofs (PR #198).
