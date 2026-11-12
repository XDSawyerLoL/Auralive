#!/usr/bin/env node
// Hostinger Cron Jobs fallback: one authenticated wake-and-work request.
// Requires AURA_PUBLIC_BASE_URL + AURA_CLOUD_TOKEN via --env-file.
// Does not send credentials in query parameters or print them.
const origin=String(process.env.AURA_PUBLIC_BASE_URL||'').trim();
const secret=String(process.env.AURA_CLOUD_TOKEN||'').trim();
if(!origin||!secret){
 console.error('AURA CRON: AURA_PUBLIC_BASE_URL et AURA_CLOUD_TOKEN requis');
 process.exitCode=2;
}else{
 try{
  const url=new URL('/api/cron/continuity',origin);
  if(url.protocol!=='https:')throw Error('AURA CRON: HTTPS requis');
  const response=await fetch(url,{method:'POST',
    headers:{'Authorization':'Bearer '+secret,'Accept':'application/json'},
    signal:AbortSignal.timeout(25000)});
  const body=await response.json().catch(()=>({ok:false,reason:'invalid-response'}));
  if(!response.ok||body.ok!==true){
   console.error('AURA CRON: route indisponible · HTTP '+response.status+
     ' · '+String(body.reason||'kernel-unavailable').slice(0,90));
   process.exitCode=1;
  }else{
   console.log('AURA CRON:',body.skipped?'cycle non nécessaire':'cycle exécuté',
     '· nombre sauvegardé',Number(body.background_cycles)||0);
  }
 }catch(err){
  console.error('AURA CRON: échec de connexion ou temporisation · '+
    String(err?.name||'unknown').slice(0,40));
  process.exitCode=1;
 }
}
