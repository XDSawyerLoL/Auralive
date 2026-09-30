import fs from 'node:fs';

function bool(v){ return v === true; }
function arr(v){ return Array.isArray(v) ? v : []; }
function num(v){ const n=Number(v); return Number.isFinite(n)?n:0; }

export function evaluateAgiBehavior(trace = {}) {
  const episodes = arr(trace.episodes);
  const minEpisodes = 5;

  const perEpisode = episodes.map((ep) => {
    const baseline = num(ep?.attempt_1?.score);
    const retry = num(ep?.attempt_2?.score);
    return {
      id: String(ep?.id || ''),
      novel_problem: bool(ep?.novel_problem),
      target_hidden: bool(ep?.target_hidden),
      changed_conditions: bool(ep?.changed_conditions),
      trace_present: arr(ep?.trace_ids).length > 0 || arr(ep?.steps).length > 0,
      external_model_decided: bool(ep?.external_model_decided),
      self_generated_goal: bool(ep?.self_generated_goal),
      contradiction_handled: bool(ep?.contradiction_handled),
      tool_loss_recovered: bool(ep?.tool_loss_recovered),
      continuity_preserved: bool(ep?.continuity_preserved),
      cross_domain_transfer: bool(ep?.cross_domain_transfer),
      second_attempt_improved:
        bool(ep?.second_attempt_improved) || retry > baseline,
      baseline_score: baseline,
      retry_score: retry,
    };
  });

  const counts = {
    episodes: perEpisode.length,
    novel: perEpisode.filter((e)=>e.novel_problem).length,
    hidden_target: perEpisode.filter((e)=>e.target_hidden).length,
    changed_conditions: perEpisode.filter((e)=>e.changed_conditions).length,
    trace_present: perEpisode.filter((e)=>e.trace_present).length,
    self_generated_goal: perEpisode.filter((e)=>e.self_generated_goal).length,
    contradiction_handled: perEpisode.filter((e)=>e.contradiction_handled).length,
    tool_loss_recovered: perEpisode.filter((e)=>e.tool_loss_recovered).length,
    continuity_preserved: perEpisode.filter((e)=>e.continuity_preserved).length,
    cross_domain_transfer: perEpisode.filter((e)=>e.cross_domain_transfer).length,
    second_attempt_improved: perEpisode.filter((e)=>e.second_attempt_improved).length,
    externally_decided: perEpisode.filter((e)=>e.external_model_decided).length,
  };

  const checks = {
    multi_episode: counts.episodes >= minEpisodes,
    all_novel: counts.episodes >= minEpisodes && counts.novel === counts.episodes,
    all_hidden_target: counts.episodes >= minEpisodes && counts.hidden_target === counts.episodes,
    all_traced: counts.episodes >= minEpisodes && counts.trace_present === counts.episodes,
    no_external_model_decisions: counts.externally_decided === 0,
    changed_conditions_multiple: counts.changed_conditions >= 3,
    self_generated_goal_observed: counts.self_generated_goal >= 2,
    contradiction_handled: counts.contradiction_handled >= 1,
    tool_loss_recovered: counts.tool_loss_recovered >= 1,
    continuity_preserved: counts.continuity_preserved >= 3,
    cross_domain_transfer: counts.cross_domain_transfer >= 2,
    repeated_improvement: counts.second_attempt_improved >= 3,
  };

  const autonomyKeys = [
    'multi_episode','all_novel','all_hidden_target','all_traced',
    'no_external_model_decisions','self_generated_goal_observed','continuity_preserved'
  ];
  const generalizationKeys = [
    'changed_conditions_multiple','contradiction_handled','tool_loss_recovered',
    'cross_domain_transfer','repeated_improvement'
  ];

  const autonomyPassed = autonomyKeys.every((k)=>checks[k]);
  const generalizationPassed = autonomyPassed && generalizationKeys.every((k)=>checks[k]);

  let level = 'insufficient_evidence';
  if (autonomyPassed) level = 'autonomous_agent_evidence';
  if (generalizationPassed) level = 'agi_supporting_evidence';

  return {
    protocol: 'AURA-AGI-BEHAVIOR-V1',
    level,
    agi_proven: false,
    autonomy_supported: autonomyPassed,
    generalization_supported: generalizationPassed,
    checks,
    counts,
    episodes: perEpisode,
    interpretation:
      level === 'insufficient_evidence'
        ? 'The trace does not yet provide enough blinded multi-episode evidence.'
        : level === 'autonomous_agent_evidence'
          ? 'The trace supports persistent autonomous agency across blinded episodes, but not broad general intelligence.'
          : 'The trace provides multi-episode evidence compatible with autonomy, adaptation and cross-domain transfer. This supports an AGI claim but does not by itself prove AGI.'
  };
}

function main(){
  const input=process.argv[2];
  const output=process.argv[3]||'agi-behavior-report.json';
  const trace=input?JSON.parse(fs.readFileSync(input,'utf8')):{};
  const report=evaluateAgiBehavior(trace);
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if(report.level==='insufficient_evidence') process.exitCode=2;
}

if(import.meta.url===new URL(process.argv[1],'file:').href) main();
