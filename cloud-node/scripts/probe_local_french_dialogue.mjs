// Run on the target Linux host with an installed GGUF/llama-server.
// --install permits ONLY the hash-pinned optional provisioner. NEVER remote APIs.
// A local result is not a Hostinger result unless run on Hostinger itself.
import {writeFile} from 'node:fs/promises';
import {embeddedLanguageRuntime,cgroupMemorySnapshot,embeddedStartupBudget}
 from '../src/embedded_language.js';
import {LOCAL_FRENCH_PROBES,scoreLocalFrenchProbe,summarizeLocalFrenchProbes}
 from '../src/native_local_french_benchmark.js';
import {sanitizeNativeFrenchGeneration} from '../src/native_local_generation_quality.js';
if(process.env.AURA_LOCAL_LANGUAGE_ONLY!=='true'){
 console.error('Refusing probe without AURA_LOCAL_LANGUAGE_ONLY=true');
 process.exit(2);
}
const canInstall=process.argv.includes('--install');
const outputArg=process.argv.find(x=>x.startsWith('--output='));
const output=outputArg?outputArg.slice('--output='.length):'';
const report={
 schema:'aura-real-gguf-french-probe-v1',
 executed_on_host:process.env.AURA_PROBE_HOST_LABEL||'unverified-host',
 actual_gguf_inference:false,
 no_remote_ai:true,
 environment:{
   before:cgroupMemorySnapshot(),
   startup_budget:embeddedStartupBudget(),
 },
 model:embeddedLanguageRuntime.status().version,
 results:[],failure:null,
};
const ready=await embeddedLanguageRuntime.start({allowProvision:canInstall});
if(!ready){
 report.failure=embeddedLanguageRuntime.status().failure_code||'local-model-not-ready';
}else{
 report.actual_gguf_inference=true;
 for(const probe of LOCAL_FRENCH_PROBES){
  const before=process.memoryUsage().rss;
  const started=performance.now();
  const raw=await embeddedLanguageRuntime.generate(
   probe.prompt,
   'Tu es AURA. Réponds en français naturel, sobrement, en une phrase. '
   +'Tu ne dois pas inventer un souvenir, ni dire qu’un événement conditionnel ou futur est réalisé. '
   +'Lorsque les faits sont insuffisants, dis-le clairement. /no_think',
   150
  );
  const answer=sanitizeNativeFrenchGeneration(raw);
  const result=scoreLocalFrenchProbe(answer,probe);
  report.results.push({id:probe.id,category:probe.category,
   ...result,
   answer:answer||null,
   duration_ms:Math.round(performance.now()-started),
   process_rss_mib:Math.round(Math.max(before,process.memoryUsage().rss)/1048576),
  });
 }
 report.summary=summarizeLocalFrenchProbes(report.results);
 report.environment.after=cgroupMemorySnapshot();
}
report.verified_abi_and_rss=Boolean(ready);
if(output){
 const target=new URL(output,'file://'+process.cwd()+'/');
 await writeFile(target,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
}
console.log(JSON.stringify(report,null,2));
if(!ready||report.results.some(x=>!x.passed))process.exitCode=1;
