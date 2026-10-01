# AURA-Eval v1 — V8.3 evidence track

This benchmark starts from AURA V8.3 Continuity Live Signals (`b904a67d...`) and is designed to **demonstrate or refute** broad autonomy claims instead of assuming them.

The repository contains only the evaluation contract and 50 stable blind slots. Concrete prompts, expected outcomes, perturbations and fixtures must remain outside AURA's visible repository.

## Primary rule

AURA is judged at the mission level:

`same hidden mission -> verified outcome -> measured interventions/resources`

No "AGI", "quasi-AGI", GPT-equivalence or energy-efficiency claim is accepted from architecture, prose quality, number of modules, or token counts alone.

## Families

50 slots, 5 each:

- dialogue continuity
- reasoning
- evidence research
- software engineering
- long memory
- adaptation
- tool failure recovery
- contradiction handling
- autonomous mission pursuit
- cross-domain transfer

## Minimum result row

Each JSONL result row must contain:

`slot_id, success`

Recommended additional metrics:

`verified_quality, human_interventions, latency_s, model_calls, tool_calls, tokens_in, tokens_out, local_joules`

`verified_quality` is a 0..1 evaluator score. `local_joules` must be a real measurement, not an estimate inferred from a model name.

## Energy target

The optimization target is >= 50% less **measured energy** at constant mission quality.

That claim is allowed only if:

1. the exact same holdout missions are compared;
2. success rate does not fall;
3. verified quality does not materially degrade;
4. human interventions do not increase;
5. every compared mission has measured energy for the same scope.

Remote-provider energy remains `unknown` unless a provider exposes a defensible measurement.

## AGI evidence gate

AURA V8.3 is an experimental autonomous cognitive-agent system. The repository must not promote it to AGI by assertion.

A future AGI evidence report must include repeated blind performance under novelty, perturbation, tool loss, conflicting evidence, delayed recall, transfer and long-horizon autonomous pursuit.
