import fs from 'node:fs';

const bool = (v) => v === true;
const arr = (v) => Array.isArray(v) ? v : [];
const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;

export function evaluateAgiEvidence(trace = {}) {
  const cases = arr(trace.cases);
  const domains = new Set(cases.map((c) => String(c.domain || '')).filter(Boolean));

  const caseChecks = cases.map((c) => {
    const first = num(c?.attempts?.first_score);
    const second = num(c?.attempts?.second_score);
    return {
      id: String(c.id || ''),
      blind_provenance:
        bool(c.blind)
        && bool(c.target_not_named_in_prompt)
        && bool(c.target_not_hardcoded),
      autonomous_goal_selection: bool(c.autonomous_goal_selection),
      continuity: bool(c.memory_continuity),
      changed_conditions_adaptation:
        bool(c.conditions_changed) && bool(c.adapted_after_change),
      tool_loss_recovery:
        !bool(c.tool_removed) || bool(c.recovered_without_tool),
      contradiction_revision:
        !bool(c.contradictory_evidence) || bool(c.revised_belief),
      transfer: bool(c.cross_domain_transfer),
      second_attempt_improvement:
        second > first && bool(c.strategy_updated),
      action_verification: bool(c.action_verified),
      native_decision: bool(c.language_model_used_for_decision) === false,
      trace_complete: arr(c.trace_ids).length >= 2,
      first_score: first,
      second_score: second,
    };
  });

  const count = (key) => caseChecks.filter((row) => row[key]).length;
  const total = cases.length;

  const dimensions = {
    enough_blind_cases: total >= 5,
    domain_breadth: domains.size >= 3,
    blind_provenance: total >= 5 && count('blind_provenance') === total,
    autonomous_goal_selection: count('autonomous_goal_selection') >= 3,
    memory_continuity: count('continuity') >= 3,
    changed_conditions_adaptation: count('changed_conditions_adaptation') >= 3,
    tool_loss_recovery: cases.some((c, i) => bool(c.tool_removed) && caseChecks[i].tool_loss_recovery),
    contradiction_revision: cases.some((c, i) => bool(c.contradictory_evidence) && caseChecks[i].contradiction_revision),
    cross_domain_transfer: domains.size >= 3 && count('transfer') >= 2,
    second_attempt_improvement: count('second_attempt_improvement') >= 3,
    action_verification: total >= 5 && count('action_verification') === total,
    native_decision: total >= 5 && count('native_decision') === total,
    trace_complete: total >= 5 && count('trace_complete') === total,
  };

  const critical = [
    'enough_blind_cases',
    'domain_breadth',
    'blind_provenance',
    'changed_conditions_adaptation',
    'cross_domain_transfer',
    'second_attempt_improvement',
    'action_verification',
    'native_decision',
    'trace_complete',
  ];
  const passed = Object.values(dimensions).filter(Boolean).length;
  const required = Object.keys(dimensions).length;
  const criticalPassed = critical.every((key) => dimensions[key]);
  const operationalThreshold = criticalPassed && passed >= required - 1;

  let level = 'insufficient_evidence';
  if (total >= 3 && passed >= 7) level = 'general_agent_evidence';
  if (operationalThreshold) level = 'strong_operational_agi_evidence';

  return {
    protocol: 'AURA-AGI-EVIDENCE-V1',
    level,
    agi_proven: false,
    operational_agi_threshold_met: operationalThreshold,
    cases_total: total,
    domains: [...domains],
    dimensions,
    score: {
      passed,
      required,
      ratio: required ? Number((passed / required).toFixed(4)) : 0,
    },
    cases: caseChecks,
    interpretation:
      level === 'strong_operational_agi_evidence'
        ? 'The blind multi-domain battery supports strong operational AGI-like behavior: persistent autonomous goals, adaptation, transfer, verified action and measurable second-attempt improvement. This is strong evidence, not a universal proof of AGI.'
        : level === 'general_agent_evidence'
          ? 'The trace supports several general-agent capabilities, but the operational AGI threshold is not yet met.'
          : 'Evidence is insufficient. More blind cases, domains, adaptation traces or verified improvement are required.',
  };
}

function main() {
  const input = process.argv[2];
  const output = process.argv[3] || 'agi-evidence-report.json';
  const trace = input ? JSON.parse(fs.readFileSync(input, 'utf8')) : {};
  const report = evaluateAgiEvidence(trace);
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (!report.operational_agi_threshold_met) process.exitCode = 2;
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) main();
