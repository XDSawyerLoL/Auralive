# AURA autonomy phase II — mission leasing
Date: 2026-10-12

* Database migration 14: MySQL atomic leases bound to mission UUIDs, DB-clock expiry, renewable with unique per-claim tokens.
* Scheduler rotates eligible missions and skips leased ones, allowing several Node instances to process distinct missions cooperatively. No local PC is required.
* One mission step can acquire only one initiative via atomic compare-and-set.
* Command Center releases the lease on success or failure. Tasks hold the lease until their first initiative execution finishes.
* Remaining limitation: lease TTL is 300s, and no heartbeat renew occurs during a long-running step. The compare-and-set gate prevents a second initiative from binding, but pathological long-running work needs duration-bound lease renewal and eventual cancellation of abandoned queued duplicates.
* Validate MySQL migration on staging, long-running timeouts, duplicate jobs, and multi-instance contention before production.
