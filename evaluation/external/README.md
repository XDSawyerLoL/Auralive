# AURA external evaluation campaign

This directory separates AURA's internal AGI-relevant battery from external evidence.

The frozen subject for this campaign is commit `916f8c2ac5830fa969ab5716f2251db017e53879`, also referenced by branch `freeze/aura-external-2026-09-28`. The evaluation harness may evolve, but the AURA source being measured must not change during this campaign.

## Evidence levels

1. **Public reproducible** — public tasks with public answers, useful for diagnosis and reproducibility but vulnerable to benchmark contamination.
2. **Private / hidden** — official private sets where AURA cannot inspect answers before evaluation.
3. **Independent third party** — execution and scoring controlled by an evaluator outside the AURA project.

No internal or public-only result is sufficient to label AURA an AGI.

## ARC-AGI-2

The automated workflow checks out the official `arcprize/ARC-AGI-2` repository at the pinned commit in `freeze.json`, checks out frozen AURA separately, and evaluates all 120 files in `data/evaluation`.

The adapter uses the frozen native grid program inducer. It emits at most two candidate outputs per test input and reports both exact task accuracy and per-test-input accuracy. A low score is a valid result and must not fail CI merely because it is low.

Do not tune frozen AURA on the public evaluation score. Improvements belong to a later campaign with a new freeze.

## GAIA

GAIA is intentionally gated. The project must not mirror its validation/test material into this repository. Once the repository owner has accepted the dataset conditions and supplies access through an appropriate secret or local environment, a runner can consume the gated dataset without committing questions, attachments, or answers.

The official test answers remain private, so leaderboard/official scoring is the meaningful evidence.

## SWE-bench Verified

The official Docker harness is pinned in `freeze.json`. Full Verified evaluation needs substantially more disk and memory than a standard GitHub-hosted runner. AURA must generate patches from the frozen agent, and those patches must be scored by the official harness without manual repair.

Use a dedicated x86_64 Docker runner with at least the resource envelope recommended by SWE-bench. Store predictions and harness reports as artifacts; do not edit patches after seeing test results.

## ARC-AGI-3

Use the official ARC Prize agent framework/toolkit pinned in `freeze.json`. Remote play requires the official platform key; competition/private evaluation must remain outside this repository. The adapter must expose frozen AURA as an agent without game-specific rules.

## METR time horizon

METR's public repository contains the analysis methodology, but a time-horizon result requires a suite of tasks with human completion-time estimates and AURA success/failure observations. Once external task runs exist, feed the untouched run records into the pinned METR analysis rather than inventing a horizon from AURA's internal virtual-duration tests.

## Integrity rules

- Frozen AURA SHA is recorded before public external evaluation.
- Evaluation datasets and harnesses are pinned where possible.
- Public and private scores are never conflated.
- Failures and zero scores are retained.
- No benchmark-specific patch to frozen AURA is allowed in this campaign.
- Any improved AURA version starts a new freeze and a new campaign.
