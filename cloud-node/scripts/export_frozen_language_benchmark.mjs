import { LANGUAGE_BENCHMARK } from '../src/language_faculty.js';

// Single source of truth: export AURA's frozen 9 cases, not retyped answers.
const json=LANGUAGE_BENCHMARK.map(item=>({
  id:item.id,
  dimension:item.dimension,
  question:item.question,
  context:item.context||[],
  checks:(item.checks||[]).map(x=>({pattern:x.source,flags:x.flags})),
  excludes:(item.excludes||[]).map(x=>({pattern:x.source,flags:x.flags})),
}));
if(json.length!==9||new Set(json.map(x=>x.dimension)).size!==9){
  throw Error('frozen-fr-conversation-v1 changed; review before benchmarking');
}
process.stdout.write(JSON.stringify(json,null,2)+'\n');
