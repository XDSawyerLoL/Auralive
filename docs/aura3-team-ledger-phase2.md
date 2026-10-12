# AURA — multi-agent execution ledger
Persistent agent roles: planner, research, dev, security, operator, critic. MySQL migration 16 stores mission ID, hash of task, backend, status and latency. It intentionally excludes the sensitive task and response content. Unavailable models are recorded as blocked rather than success. Kernel status surfaces these metrics.

The team scheduler still uses the existing bounded parallel `swarm()` call; persistence adds traceability, not independent reasoning capability. No added paid API or system executables. Needs staged MySQL upgrade and production smoke.
