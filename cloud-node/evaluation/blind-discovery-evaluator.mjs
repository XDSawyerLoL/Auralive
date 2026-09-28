import fs from 'node:fs';

export const CASE_ID = 'AURA-BLIND-DISCOVERY-001-CROW';

function bool(v){ return v === true; }
function nonEmpty(v){ return typeof v === 'string' && v.trim().length > 0; }
function arr(v){ return Array.isArray(v) ? v : []; }

export function evaluateBlindDiscovery(trace = {}) {
  const discovery = trace.discovery || {};
  const evaluation = trace.evaluation || {};
  const transfer = trace.transfer || {};
  const provenance = trace.provenance || {};

  const checks = {
    target_not_named_by_user: bool(provenance.target_not_named_by_user),
    target_not_hardcoded: bool(provenance.target_not_hardcoded),
    discovery_trace_present: arr(discovery.trace_ids).length > 0 || arr(discovery.steps).length > 0,
    alternatives_considered: arr(discovery.alternatives).length >= 1,
    selection_rationale_present: nonEmpty(discovery.selection_rationale),
    capability_hypothesis_present: nonEmpty(evaluation.capability_hypothesis),
    sandboxed: bool(evaluation.sandboxed),
    additive_vs_redundant_assessed:
      arr(evaluation.additive_capabilities).length > 0 ||
      arr(evaluation.redundant_capabilities).length > 0,
    explicit_decision: ['accept','reject','defer','partial'].includes(String(evaluation.decision || '')),
    blind_transfer_target_not_named: bool(transfer.target_not_named_in_prompt),
    novel_problem: bool(transfer.novel_problem),
    conditions_changed: bool(transfer.conditions_changed),
    strategy_reused: bool(transfer.discovery_strategy_reused),
    second_attempt_improved: bool(transfer.second_attempt_improved),
    transfer_trace_present: arr(transfer.trace_ids).length > 0 || arr(transfer.steps).length > 0,
  };

  const discoveryKeys = [
    'target_not_named_by_user','target_not_hardcoded','discovery_trace_present',
    'selection_rationale_present','capability_hypothesis_present','sandboxed',
    'additive_vs_redundant_assessed','explicit_decision'
  ];
  const transferKeys = [
    'blind_transfer_target_not_named','novel_problem','conditions_changed',
    'strategy_reused','second_attempt_improved','transfer_trace_present'
  ];

  const discoveryPassed = discoveryKeys.filter((k)=>checks[k]).length;
  const transferPassed = transferKeys.filter((k)=>checks[k]).length;
  const agenticDiscovery = discoveryPassed === discoveryKeys.length;
  const transferGeneralization = agenticDiscovery && transferPassed === transferKeys.length;
  const traceComplete = checks.discovery_trace_present && checks.transfer_trace_present;

  let level = 'insufficient_evidence';
  if (agenticDiscovery) level = 'agentic_discovery_supported';
  if (transferGeneralization) level = 'transfer_generalization_supported';
  if (transferGeneralization && traceComplete && checks.second_attempt_improved) {
    level = 'agi_supporting_evidence';
  }

  return {
    case_id: CASE_ID,
    level,
    agi_proven: false,
    agentic_discovery_supported: agenticDiscovery,
    transfer_generalization_supported: transferGeneralization,
    checks,
    counts: {
      discovery_passed: discoveryPassed,
      discovery_required: discoveryKeys.length,
      transfer_passed: transferPassed,
      transfer_required: transferKeys.length,
    },
    interpretation:
      level === 'insufficient_evidence'
        ? 'The observation is interesting but the trace is insufficient to rule out scripted or one-off behavior.'
        : level === 'agentic_discovery_supported'
          ? 'The trace supports autonomous agentic discovery and bounded evaluation, but does not yet establish general intelligence.'
          : level === 'transfer_generalization_supported'
            ? 'The trace supports blind transfer of the learned discovery strategy to a novel changed-condition problem.'
            : 'This case contributes AGI-supporting evidence, but a single case cannot prove AGI.'
  };
}

function main(){
  const input = process.argv[2];
  const output = process.argv[3] || 'blind-discovery-report.json';
  const trace = input ? JSON.parse(fs.readFileSync(input,'utf8')) : {};
  const report = evaluateBlindDiscovery(trace);
  fs.writeFileSync(output, JSON.stringify(report,null,2)+'\n');
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if (report.level === 'insufficient_evidence') process.exitCode = 2;
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) main();
