export const DASHBOARD_HTML = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#080b14">
<title>AURA Cloud</title>
<style>
:root{
  color-scheme:dark;
  --bg:#070912;--panel:rgba(17,22,38,.78);--panel2:rgba(25,31,50,.68);
  --line:rgba(255,255,255,.09);--text:#f4f6fb;--muted:#98a2b8;
  --accent:#8c66ff;--cyan:#4fd8d4;--green:#52d694;--amber:#ffc768;--red:#ff6d80;
}
*{box-sizing:border-box} body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;background:
radial-gradient(circle at 20% -10%,rgba(124,84,255,.25),transparent 34rem),
radial-gradient(circle at 90% 0,rgba(45,196,190,.12),transparent 30rem),var(--bg);color:var(--text)}
button,input,textarea{font:inherit} button{cursor:pointer}
.shell{max-width:1180px;margin:auto;padding:22px 18px 60px}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}
.brand{display:flex;align-items:center;gap:12px}.orb{width:42px;height:42px;border-radius:50%;background:
radial-gradient(circle at 35% 32%,#fff 0 4%,#bca8ff 9%,#7650ff 35%,#20144d 68%,#080b14 75%);
box-shadow:0 0 34px rgba(140,102,255,.45)}
h1{font-size:21px;margin:0;letter-spacing:.08em}.sub{font-size:12px;color:var(--muted);margin-top:3px}
.pill{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);background:var(--panel);padding:8px 11px;border-radius:999px;font-size:12px}
.dot{width:8px;height:8px;border-radius:50%;background:var(--amber);box-shadow:0 0 12px currentColor}
.dot.good{background:var(--green)}.dot.bad{background:var(--red)}
.grid{display:grid;grid-template-columns:repeat(12,1fr);gap:14px}
.card{border:1px solid var(--line);background:linear-gradient(180deg,var(--panel),rgba(11,14,25,.78));backdrop-filter:blur(18px);
border-radius:20px;padding:18px;box-shadow:0 16px 50px rgba(0,0,0,.22)}
.hero{grid-column:span 8}.auth{grid-column:span 4}.state{grid-column:span 7}.systems{grid-column:span 5}
.chat{grid-column:span 7}.activity{grid-column:span 5}
.card h2{font-size:14px;margin:0 0 14px;color:#dfe4ef;font-weight:650}.big{font-size:34px;font-weight:720;letter-spacing:-.04em;margin:3px 0 4px}
.muted{color:var(--muted)}.small{font-size:12px}.hero-row{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
.notice{margin-top:14px;padding:12px 14px;border-radius:14px;background:rgba(255,199,104,.08);border:1px solid rgba(255,199,104,.2);color:#ffe2ac;font-size:13px;line-height:1.45}
.notice.good{background:rgba(82,214,148,.08);border-color:rgba(82,214,148,.22);color:#bff6d8}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px}.kpi{background:var(--panel2);border:1px solid var(--line);border-radius:14px;padding:12px}
.kpi b{display:block;font-size:20px;margin-top:4px}.bars{display:grid;gap:11px}.bar-head{display:flex;justify-content:space-between;font-size:12px;color:#cbd2df}
.track{height:7px;border-radius:999px;background:rgba(255,255,255,.07);overflow:hidden}.fill{height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--accent),var(--cyan))}
.system-list{display:grid;gap:9px}.system{display:flex;justify-content:space-between;align-items:center;padding:11px 12px;border:1px solid var(--line);border-radius:13px;background:rgba(255,255,255,.025)}
.system strong{font-size:13px}.status{font-size:11px;color:var(--muted)}
.token-row{display:flex;gap:8px}.token-row input,.chatbox textarea{width:100%;background:rgba(0,0,0,.2);border:1px solid var(--line);color:var(--text);border-radius:12px;padding:11px 12px;outline:none}
.token-row input:focus,.chatbox textarea:focus{border-color:rgba(140,102,255,.6)}
.btn{border:0;border-radius:12px;padding:10px 14px;background:linear-gradient(135deg,#8d67ff,#6944e6);color:white;font-weight:650}
.btn.secondary{background:rgba(255,255,255,.06);border:1px solid var(--line)}.chatbox{display:grid;gap:10px}.messages{height:286px;overflow:auto;display:grid;align-content:start;gap:9px;padding-right:4px}
.msg{max-width:88%;padding:10px 12px;border-radius:14px;font-size:13px;line-height:1.45;background:rgba(255,255,255,.055);border:1px solid var(--line)}
.msg.user{margin-left:auto;background:rgba(140,102,255,.14);border-color:rgba(140,102,255,.26)}
.msg.aura{margin-right:auto}.composer{display:flex;gap:8px}.composer textarea{resize:none;min-height:44px;max-height:110px}
.list{display:grid;gap:9px}.item{padding:11px 12px;border-radius:13px;border:1px solid var(--line);background:rgba(255,255,255,.025)}
.item b{display:block;font-size:12px;margin-bottom:4px}.item span{font-size:12px;color:var(--muted);line-height:1.4}
.empty{padding:18px;text-align:center;color:var(--muted);font-size:12px;border:1px dashed var(--line);border-radius:14px}
@media(max-width:850px){.hero,.auth,.state,.systems,.chat,.activity{grid-column:span 12}.kpis{grid-template-columns:repeat(2,1fr)}.hero-row{display:block}.top{align-items:flex-start}}
</style>
</head>
<body>
<div class="shell">
  <header class="top">
    <div class="brand"><div class="orb"></div><div><h1>AURA CLOUD</h1><div class="sub">Proto-organisme logiciel · Node.js / Hostinger</div></div></div>
    <div class="pill"><span id="liveDot" class="dot"></span><span id="liveText">Connexion…</span></div>
  </header>

  <main class="grid">
    <section class="card hero">
      <div class="hero-row">
        <div><div class="small muted">ÉTAT GLOBAL</div><div class="big" id="phase">Initialisation</div><div class="muted small" id="runtimeText">Vérification du noyau…</div></div>
        <div class="pill"><span>Cycles</span><strong id="cycles">—</strong></div>
      </div>
      <div id="notice" class="notice">Connexion au runtime AURA Cloud…</div>
      <div class="kpis">
        <div class="kpi"><span class="small muted">Mémoire</span><b id="lessonsCount">—</b></div>
        <div class="kpi"><span class="small muted">Intentions</span><b id="intentionsCount">—</b></div>
        <div class="kpi"><span class="small muted">Réflexions</span><b id="reflectionsCount">—</b></div>
        <div class="kpi"><span class="small muted">Évolution</span><b id="evolutionPhase">—</b></div>
      </div>
    </section>

    <section class="card auth">
      <h2>Accès privé</h2>
      <div class="small muted" style="margin-bottom:10px">Le token reste uniquement dans cet onglet.</div>
      <div class="token-row"><input id="token" type="password" autocomplete="off" placeholder="AURA_CLOUD_TOKEN"><button class="btn" id="saveToken">Activer</button></div>
      <button class="btn secondary" id="refresh" style="margin-top:10px;width:100%">Actualiser l’état</button>
    </section>

    <section class="card state">
      <h2>État interne</h2>
      <div class="bars" id="bars"></div>
      <div class="item" style="margin-top:14px"><b>Intention actuelle</b><span id="intention">Connexion privée requise pour afficher l’intention.</span></div>
      <div class="item" style="margin-top:9px"><b>Pensée dominante</b><span id="thought">Connexion privée requise pour afficher la pensée dominante.</span></div>
    </section>

    <section class="card systems">
      <h2>Systèmes</h2>
      <div class="system-list">
        <div class="system"><strong>MySQL</strong><span class="status" id="dbStatus">—</span></div>
        <div class="system"><strong>Noyau Soul</strong><span class="status" id="kernelStatus">—</span></div>
        <div class="system"><strong>IA</strong><span class="status" id="aiStatus">—</span></div>
        <div class="system"><strong>HORIZON</strong><span class="status" id="horizonStatus">—</span></div>
        <div class="system"><strong>AURA Evolution</strong><span class="status" id="evolutionStatus">—</span></div>
        <div class="system"><strong>Quantic Studio</strong><span class="status" id="studioStatus">API prête</span></div>
      </div>
    </section>

    <section class="card chat">
      <h2>Parler à AURA</h2>
      <div class="chatbox">
        <div class="messages" id="messages"><div class="msg aura">AURA Cloud attend le démarrage du noyau.</div></div>
        <div class="composer"><textarea id="message" placeholder="Écris à AURA…"></textarea><button class="btn" id="send">Envoyer</button></div>
      </div>
    </section>

    <section class="card activity">
      <h2>Diagnostic</h2>
      <div class="list" id="issues"><div class="empty">Chargement…</div></div>
      <h2 style="margin-top:18px">Dernières réflexions</h2>
      <div class="list" id="reflections"><div class="empty">Accès privé requis.</div></div>
    </section>
  </main>
</div>
<script>
const $ = (id) => document.getElementById(id);
let token = sessionStorage.getItem('aura_token') || '';
$('token').value = token;

function headers(json=true){
  const h = {};
  if(json) h['Content-Type']='application/json';
  if(token) h.Authorization='Bearer '+token;
  return h;
}
async function api(path, options={}){
  const response = await fetch(path,{...options,headers:{...headers(Boolean(options.body)),...(options.headers||{})}});
  const text = await response.text();
  let data={}; try{data=text?JSON.parse(text):{};}catch{data={error:text||'Réponse invalide'};}
  if(!response.ok) throw Object.assign(new Error(data.error||'Erreur '+response.status),{status:response.status,data});
  return data;
}
function val(v){return Math.max(0,Math.min(1,Number(v)||0))}
function bar(label,value){
  const pct=Math.round(val(value)*100);
  return '<div><div class="bar-head"><span>'+label+'</span><strong>'+pct+'%</strong></div><div class="track"><div class="fill" style="width:'+pct+'%"></div></div></div>';
}
function setLive(ok,text){$('liveDot').className='dot '+(ok?'good':'bad');$('liveText').textContent=text}
function renderIssues(items){
  $('issues').innerHTML = items?.length ? items.map(i=>'<div class="item"><b>'+escapeHtml(i.code||'configuration')+'</b><span>'+escapeHtml(i.message||String(i))+'</span></div>').join('') : '<div class="empty">Aucun problème de configuration détecté.</div>';
}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

async function refresh(){
  try{
    const boot=await api('/api/bootstrap/status');
    setLive(true,boot.runtime_ready?'AURA active':'Serveur actif');
    $('dbStatus').textContent=boot.db_ready?'Connecté':'À configurer';
    $('kernelStatus').textContent=boot.runtime_ready?'Actif':'En attente';
    $('studioStatus').textContent=boot.runtime_ready?'Sync disponible':'API en attente';
    renderIssues(boot.issues||[]);
    $('notice').className='notice '+(boot.runtime_ready?'good':'');
    $('notice').textContent=boot.runtime_ready?'AURA Cloud fonctionne. Le noyau persistant est démarré.':'Le serveur fonctionne, mais le noyau attend sa configuration. Consulte le diagnostic à droite.';
    $('runtimeText').textContent=boot.runtime_ready?'Mémoire persistante et cycles cognitifs actifs':'Mode diagnostic sécurisé : aucune perte silencieuse de données';

    const ks=await api('/api/kernel/status');
    $('phase').textContent=ks.phase || (ks.started?'Active':'En attente');
    $('lessonsCount').textContent=ks.counts?.lessons ?? '—';
    $('intentionsCount').textContent=ks.counts?.intentions ?? '—';
    $('reflectionsCount').textContent=ks.counts?.reflections ?? '—';
    $('aiStatus').textContent=ks.ai_enabled?'Connectée':'Non configurée';

    const soul=await api('/api/kernel/soul');
    $('cycles').textContent=soul.cycles ?? '—';
    $('phase').textContent=soul.phase || $('phase').textContent;
    $('bars').innerHTML=[
      bar('Énergie',soul.energy),bar('Curiosité',soul.curiosity),bar('Pression',soul.pressure),
      bar('Continuité',soul.continuity),bar('Introspection',soul.introspection),
      bar('Ouverture',soul.openness),bar('Réactivité',soul.reactivity),bar('Exploration',soul.playfulness)
    ].join('');
    $('intention').textContent=soul.current_intention || (token?'Aucune intention active.':'Connexion privée requise pour afficher l’intention.');
    $('thought').textContent=soul.dominant_thought || (token?'Aucune pensée dominante.':'Connexion privée requise pour afficher la pensée dominante.');

    const hz=await api('/api/horizon/status');
    $('horizonStatus').textContent=hz.enabled?(hz.started?'Actif':'Configuré'):'Désactivé';

    if(token && boot.runtime_ready){
      try{
        const ev=await api('/api/evolution/status');
        $('evolutionStatus').textContent=ev.enabled?'Phase 1 active':'Désactivée';
        $('evolutionPhase').textContent=ev.phase?.replace('phase1-','P1 ') || '—';
        const refs=await api('/api/kernel/reflections?limit=4');
        $('reflections').innerHTML=refs.length?refs.map(r=>'<div class="item"><b>'+escapeHtml(r.title)+'</b><span>'+escapeHtml(r.summary)+'</span></div>').join(''):'<div class="empty">Aucune réflexion enregistrée.</div>';
      }catch(e){$('evolutionStatus').textContent='Verrouillée'}
    }else{
      $('evolutionStatus').textContent='Accès privé';
      $('evolutionPhase').textContent='P1';
    }
  }catch(error){
    setLive(false,'Indisponible');
    $('notice').className='notice';
    $('notice').textContent='Impossible de joindre AURA Cloud : '+error.message;
  }
}

$('saveToken').onclick=()=>{token=$('token').value.trim(); if(token) sessionStorage.setItem('aura_token',token); else sessionStorage.removeItem('aura_token'); refresh()};
$('refresh').onclick=refresh;
$('send').onclick=async()=>{
  const text=$('message').value.trim(); if(!text)return;
  $('messages').insertAdjacentHTML('beforeend','<div class="msg user">'+escapeHtml(text)+'</div>');
  $('message').value='';
  try{
    const out=await api('/api/chat',{method:'POST',body:JSON.stringify({text,author:'Utilisateur'})});
    $('messages').insertAdjacentHTML('beforeend','<div class="msg aura">'+escapeHtml(out.answer||'')+'</div>');
  }catch(error){
    $('messages').insertAdjacentHTML('beforeend','<div class="msg aura">AURA indisponible : '+escapeHtml(error.message)+'</div>');
  }
  $('messages').scrollTop=$('messages').scrollHeight;
};
$('message').addEventListener('keydown',(e)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('send').click()}});
refresh();
setInterval(refresh,15000);
</script>
</body>
</html>`;
