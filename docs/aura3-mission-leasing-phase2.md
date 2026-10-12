# AURA autonomy phase II — mission leasing and truthful outcomes
Date: 2026-10-12

- MySQL atomic lease acquisition/release/renewal for each active mission, database-clock TTL and unique fencing tokens.
- Cooperative scheduling rotates all eligible projects, and skips concurrently leased missions. No PC is required for safe Cloud Workspace operations.
- Renew the lease while a mission initiative is dispatched. Each mission step is also bound via compare-and-set to one initiative. Note: this is not an exactly-once guarantee for arbitrary side effects after network partitions; durable capability receipts are still required.
- The shared outcome_truth classifier is merged from the tested #198 work into this feature branch, rejecting plan-only and failed payloads, including worker transports marked complete.
- Command Center permits typed Cloud Workspace operators without a local bridge, but no unrestricted host shell; plan-only responses remain waiting.
- Native Reflex decisions for real initiatives are tracked by explicit decision ID in the existing outcome ledger and the new v15 observation table.
- This feature PR is stacked on #199 and overlaps #198; merge order must be coordinated to avoid duplicate classifier changes.
- Needs all CI green and real staging MySQL/multiple Node instances with failover before production merge.
