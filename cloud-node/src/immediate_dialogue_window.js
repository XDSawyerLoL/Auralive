// AURA: bounded immediate dialogue context (not autobiographical recall).
// The current ingress and its preceding turns are retrieved only from the
// already session-scoped SQL query. No cross-session history, no free
// federation and no external provider decides which records are admitted.
const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
export function immediateDialogueWindow(rows=[],currentText='',{
  perceptualBroadcast=false,maxTurns=3,
}={}){
  if(!perceptualBroadcast||!Array.isArray(rows))return [];
  const current=clean(currentText);
  const ordered=rows.filter(r=>r&&['user','assistant'].includes(String(r.role))&&
    /^\d+$/.test(String(r.id??''))&&clean(r.content))
    .slice(0,12).sort((a,b)=>Number(a.id)-Number(b.id));
  const ingress=ordered.findLastIndex(r=>r.role==='user'&&
    clean(r.content)===current);
  // Current-user ingress must exist in the same query. Otherwise no
  // short-term memory is admitted, and the model must not improvise history.
  if(ingress<0)return [];
  const prior=ordered.slice(0,ingress);
  const safeLimit=Math.max(1,Math.min(3,Number(maxTurns)||3));
  return prior.slice(-safeLimit).map(r=>({
    id:r.id,role:r.role,content:clean(r.content).slice(0,550),
    source:'same-session-immediate-turn',
  }));
}
export function mergeConversationViews(selected=[],immediate=[]){
 const m=new Map();
 for(const r of [...(Array.isArray(selected)?selected:[]),
                  ...(Array.isArray(immediate)?immediate:[])]){
  if(!r||!['user','assistant'].includes(String(r.role))||
    !/^\d+$/.test(String(r.id??'')))continue;
  m.set(String(r.id),{id:r.id,role:r.role,
    content:clean(r.content).slice(0,550)});
 }
 return [...m.values()].sort((a,b)=>Number(a.id)-Number(b.id)).slice(-6);
}
