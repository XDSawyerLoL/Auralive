import { DASHBOARD_SCRIPT } from './dashboard-runtime.js';

export const DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#090807">
<title>AURA</title>
<style>
:root{
  color-scheme:dark;
  --bg:#080706;--panel:rgba(18,16,16,.84);--panel2:rgba(27,23,22,.68);
  --line:rgba(255,237,218,.10);--text:#f8f3ee;--muted:#a49a95;
  --gold:#ffb566;--violet:#9b6cff;--pink:#e85f9f;--green:#5de0aa;--red:#ff6d78;
}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body{
  min-height:100vh;overflow-x:hidden;
  background:
    radial-gradient(900px 620px at 50% -10%,rgba(255,162,78,.08),transparent 70%),
    radial-gradient(780px 620px at 15% 55%,rgba(155,108,255,.055),transparent 72%),
    linear-gradient(180deg,#090807,#050505);
}
button,textarea{font:inherit}
button{cursor:pointer}
.shell{max-width:1600px;margin:0 auto;padding:14px}
.panel{
  border:1px solid var(--line);border-radius:20px;background:linear-gradient(180deg,rgba(20,18,18,.90),rgba(10,9,9,.86));
  box-shadow:inset 0 1px rgba(255,255,255,.035),0 22px 70px rgba(0,0,0,.28);overflow:hidden
}
.topbar{
  display:flex;align-items:center;gap:14px;min-height:64px;padding:10px 14px;margin-bottom:10px;
  border:1px solid var(--line);border-radius:18px;background:rgba(14,12,12,.82);backdrop-filter:blur(20px)
}
.brand{display:flex;align-items:center;gap:11px}
.brand-orb{width:38px;height:38px;border-radius:50%;background:radial-gradient(circle at 38% 32%,#fff 0 7%,#ffe4c3 16%,#ffad5a 34%,#5c2d1d 61%,#0a0807 74%);box-shadow:0 0 20px rgba(255,168,87,.42)}
.brand-name{font-size:20px;font-weight:760;letter-spacing:.24em}
.brand-sub{font-size:8px;color:#9f918a;letter-spacing:.18em;text-transform:uppercase;margin-top:3px}
.top-status{margin-left:auto;display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end}
.pill{display:flex;align-items:center;gap:6px;padding:7px 9px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.025);font-size:9px;color:#b4aaa5;white-space:nowrap}
.live-dot{width:6px;height:6px;border-radius:50%;background:var(--gold);box-shadow:0 0 10px currentColor}.live-dot.good{background:var(--green)}.live-dot.warn{background:var(--gold)}.live-dot.bad{background:var(--red)}
.clock{font-size:9px;color:#8f827d;display:flex;gap:5px}.clock .time{color:#eee3dd;font-weight:700}
.icon-btn{border:1px solid var(--line);background:rgba(255,255,255,.025);color:#d8ccc6;border-radius:10px;padding:7px 9px;font-size:9px}
.setup-banner{display:none;margin-bottom:10px;border:1px solid rgba(255,181,93,.22);background:rgba(255,169,78,.06);border-radius:14px;padding:10px 12px;font-size:10px;color:#e1cdbd}.setup-banner.show{display:block}.setup-title{font-weight:800;color:#ffc17d}.setup-list{margin:6px 0 0;padding-left:18px}

.hero{
  display:grid;grid-template-columns:minmax(0,1.1fr) minmax(430px,.9fr);gap:10px;align-items:stretch
}
.map-panel,.chat-panel{min-height:690px}
.panel-head{display:flex;align-items:center;gap:8px;min-height:44px;padding:11px 13px;border-bottom:1px solid rgba(255,255,255,.045)}
.panel-title{font-size:12px;font-weight:720}.panel-meta{font-size:8px;color:#776d68}.spacer{flex:1}
.map-wrap{
  position:relative;height:645px;overflow:hidden;isolation:isolate;
  background:
    radial-gradient(circle at 50% 48%,rgba(255,167,82,.10),transparent 19%),
    radial-gradient(circle at 30% 38%,rgba(155,108,255,.09),transparent 29%),
    radial-gradient(circle at 72% 54%,rgba(232,95,159,.075),transparent 30%),
    linear-gradient(180deg,rgba(10,8,8,.7),rgba(4,4,4,.92))
}
#nebulaFx,#particleFx{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}#nebulaFx{z-index:0}#particleFx{z-index:2;mix-blend-mode:screen}
.aurora-vignette{position:absolute;inset:-12%;z-index:2;pointer-events:none;mix-blend-mode:screen;background:radial-gradient(circle at 50% 50%,rgba(255,170,87,.14),transparent 20%),radial-gradient(circle at 30% 40%,rgba(155,108,255,.08),transparent 31%),radial-gradient(circle at 72% 56%,rgba(232,95,159,.07),transparent 30%)}
#attentionMap{position:absolute;inset:0;z-index:3;width:100%;height:100%}
#core{transform-box:fill-box;transform-origin:center}.energy-pulse{fill:none;stroke-linecap:round;filter:url(#glow);animation:energyFlow 4.2s linear infinite}.web-link{animation:webDrift 8s linear infinite}.aura-node{transform-box:fill-box;transform-origin:center}
@keyframes energyFlow{from{stroke-dashoffset:0}to{stroke-dashoffset:-170}}@keyframes webDrift{from{stroke-dashoffset:0}to{stroke-dashoffset:-90}}
body.aura-speaking #core{filter:url(#coreBloom) drop-shadow(0 0 22px rgba(255,169,84,.68))}
.organism-hud,.map-foot,.map-badge{
  position:absolute;z-index:6;border:1px solid rgba(255,255,255,.055);background:rgba(7,7,7,.62);backdrop-filter:blur(12px);border-radius:10px;font-size:8px
}
.organism-hud{left:13px;top:13px;display:flex;align-items:center;gap:7px;padding:7px 9px;color:#b6aaa4}.organism-hud i{width:6px;height:6px;border-radius:50%;background:var(--violet)}
.map-badge{right:13px;top:13px;padding:7px 9px;color:#bdebd8}.map-badge b{color:var(--green)}
.map-foot{left:13px;bottom:13px;max-width:72%;padding:8px 10px;color:#9f938d;line-height:1.4}

.chat-panel{display:flex;flex-direction:column}
.chat-head-state{font-size:9px;color:#a79b95}
.messages{
  flex:1;display:flex;flex-direction:column;gap:10px;padding:16px;overflow:auto;min-height:0;max-height:none;
  background:radial-gradient(circle at 50% 0,rgba(255,171,86,.035),transparent 35%)
}
.msg{max-width:86%;font-size:14px;line-height:1.55;padding:11px 13px;border-radius:15px;border:1px solid rgba(255,255,255,.055);background:rgba(255,255,255,.025)}
.msg.user{align-self:flex-end;background:rgba(255,171,87,.07);border-color:rgba(255,186,112,.10)}
.msg.aura{align-self:flex-start}.who{display:block;font-size:8px;color:#776c67;margin-bottom:5px;letter-spacing:.08em}.msg.aura .who{color:#e2b68d}
.composer{
  display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;padding:12px;border-top:1px solid rgba(255,255,255,.045);background:rgba(10,9,9,.94)
}
.composer textarea{
  width:100%;min-height:54px;max-height:140px;resize:vertical;border:1px solid rgba(255,236,211,.11);border-radius:14px;background:rgba(255,255,255,.03);
  color:#f8f3ee;padding:14px 14px;outline:none;font-size:15px;line-height:1.4
}
.composer textarea:focus{border-color:rgba(255,178,105,.32);box-shadow:0 0 0 3px rgba(255,157,77,.06)}
.composer button{width:48px;height:48px;align-self:end;border-radius:13px;border:1px solid var(--line);display:grid;place-items:center;background:rgba(255,255,255,.03);color:#eee2dc}
.composer .send{border:0;background:linear-gradient(135deg,#ffb867,#d86b46);color:#160c07;font-weight:900}
.chat-hint{padding:0 12px 10px;color:#716661;font-size:8px;background:rgba(10,9,9,.94)}

.essentials{display:grid;grid-template-columns:1.1fr .9fr .9fr;gap:10px;margin-top:10px}
.essential-card{padding:13px}
.essential-label{font-size:8px;color:#766c67;text-transform:uppercase;letter-spacing:.10em;margin-bottom:7px}
.essential-value{font-size:17px;font-weight:760;line-height:1.2}
.essential-copy{font-size:9px;color:#9c918c;line-height:1.45;margin-top:6px}
.score-line{display:flex;align-items:center;gap:10px}.score-circle{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(93,224,170,.15);background:rgba(93,224,170,.05);color:#82e6bb;font-weight:800}
.emotion-mini{display:flex;align-items:center;gap:9px}.emotion-orb{width:34px;height:34px;border-radius:50%;background:radial-gradient(circle at 38% 32%,#fff 0 7%,#ffb86b 20%,#7d4633 50%,#12100f 73%);box-shadow:0 0 20px rgba(255,166,89,.28)}
#emotionReason{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}

details.advanced{margin-top:10px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.015);overflow:hidden}
details.advanced>summary{list-style:none;cursor:pointer;padding:13px 15px;font-size:10px;color:#b9ada7;display:flex;align-items:center;justify-content:space-between}
details.advanced>summary::-webkit-details-marker{display:none}
.advanced-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;padding:0 10px 10px}
.advanced-card{border:1px solid rgba(255,255,255,.055);border-radius:13px;background:rgba(255,255,255,.018);padding:10px;min-height:150px}
.advanced-title{font-size:9px;font-weight:750;margin-bottom:8px}.advanced-meta{font-size:7px;color:#776d68;margin-left:auto}
.intent-list,.work-list,.memory-list,.activity-list{display:grid;gap:6px}.intent-row,.work-row,.memory-row,.activity-row{border:1px solid rgba(255,255,255,.05);border-radius:9px;background:rgba(255,255,255,.018);padding:7px 8px}
.intent-top,.work-top{display:flex;gap:6px}.intent-title,.work-title,.memory-text,.activity-title{font-size:8px;line-height:1.35;flex:1}.badge{font-size:7px;border-radius:999px;padding:2px 5px;border:1px solid rgba(255,255,255,.08);color:#b9aea8}.memory-date,.activity-time,.activity-kind{font-size:7px;color:#6e6460}
.empty{font-size:8px;color:#746a66;padding:9px;border:1px dashed rgba(255,255,255,.06);border-radius:9px;text-align:center}
.telemetry-rail{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}.metric{border:1px solid rgba(255,255,255,.05);border-radius:10px;padding:7px;background:rgba(255,255,255,.015)}.ring{display:none}.metric-label{font-size:7px;color:#776d68;text-transform:uppercase}.metric-value{font-size:11px;font-weight:700;margin-top:2px}.metric-trend{display:none}
.emotion-details{display:grid;grid-template-columns:1fr 1fr;gap:6px}.emotion-cell,.emotion-chip{font-size:8px}.emotion-bar,.emotion-chip-track{height:3px;background:rgba(255,255,255,.05);border-radius:99px;overflow:hidden}.emotion-bar span,.emotion-chip-track i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--gold),var(--violet))}
.emotion-label{display:flex;justify-content:space-between;gap:6px}.emotion-chip span{display:block;color:#756b66}.emotion-chip strong{display:block;margin:3px 0}
.thought-card{font-size:8px;line-height:1.4;color:#b5a8a0;border:1px solid rgba(255,255,255,.05);border-radius:9px;padding:8px;background:rgba(255,255,255,.015);margin-bottom:6px}
.progress{height:3px;border-radius:99px;background:rgba(255,255,255,.05);overflow:hidden}.progress span{display:block;height:100%;background:linear-gradient(90deg,var(--gold),var(--violet))}
.sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}

@media(max-width:980px){
  .hero{grid-template-columns:1fr}.map-panel{min-height:480px}.map-wrap{height:440px}.chat-panel{min-height:620px}.essentials{grid-template-columns:1fr 1fr}.advanced-grid{grid-template-columns:1fr 1fr}
}
@media(max-width:640px){
  .shell{padding:8px}.topbar{padding:9px}.brand-name{font-size:17px}.brand-sub{display:none}.top-status .pill:nth-of-type(n+3){display:none}
  .hero{gap:8px}.map-panel{min-height:390px}.map-wrap{height:350px}.chat-panel{min-height:68svh}.msg{font-size:15px;max-width:92%}
  .composer textarea{font-size:16px;min-height:58px}.essentials{grid-template-columns:1fr}.advanced-grid{grid-template-columns:1fr}.telemetry-rail{grid-template-columns:repeat(3,1fr)}
}
</style>
</head>
<body data-aura-ui="chat-first-v1">
<div class="shell">
  <div class="sr-only" aria-hidden="true">Interface de conscience opérationnelle · Carte d’intérêt · Company OS · Produits Quantic · Santé du système · Workstreams actifs · Preuve de travail · Mémoire et leçons · Télécharger Quantic Glide · Windows x64 · Android · Télécharger .exe · Télécharger .apk</div>

  <header class="topbar">
    <div class="brand"><div class="brand-orb"></div><div><div class="brand-name">AURA</div><div class="brand-sub">Company OS</div></div></div>
    <div class="top-status">
      <div class="pill"><span id="liveDot" class="live-dot"></span><span id="liveText">Connexion…</span></div>
      <div class="pill"><span id="voiceDot" class="live-dot"></span><span id="voiceText">Mairaiy…</span></div>
      <div class="pill"><span id="languageDot" class="live-dot"></span><span id="languageText">Dialogue…</span></div>
      <div class="pill"><span id="evolutionDot" class="live-dot"></span><span id="evolutionText">Évolution…</span></div>
      <div class="clock"><span id="clockDate">—</span><span id="clockTime" class="time">—</span></div>
      <button class="icon-btn" id="modeBtn">Actualiser</button>
    </div>
  </header>

  <section class="setup-banner" id="setupBanner"><div class="setup-title">Configuration AURA requise</div><div id="setupSummary">Le serveur fonctionne, le noyau se prépare.</div><ul class="setup-list" id="setupIssues"></ul></section>

  <main class="hero">
    <section class="panel map-panel">
      <div class="panel-head"><div class="panel-title">AURA vivante</div><div class="spacer"></div><button class="icon-btn" id="refreshMap">Recentrer</button></div>
      <div class="map-wrap" id="livingMap">
        <canvas id="nebulaFx"></canvas><canvas id="particleFx"></canvas><div class="aurora-vignette"></div>
        <svg id="attentionMap" viewBox="0 0 900 650" aria-label="Carte cognitive AURA">
          <defs>
            <radialGradient id="coreAura"><stop offset="0" stop-color="#fff"/><stop offset=".14" stop-color="#fff0da"/><stop offset=".38" stop-color="#ffb665"/><stop offset=".72" stop-color="#a54f31"/><stop offset="1" stop-color="#1c0f0b" stop-opacity=".08"/></radialGradient>
            <filter id="glow"><feGaussianBlur stdDeviation="7" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            <filter id="coreBloom" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="12" result="blur1"/><feMerge><feMergeNode in="blur1"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>
          <g id="flowLinks"></g><g id="energyPulses"></g><g id="interestNodes"></g>
          <g id="core" filter="url(#coreBloom)">
            <circle cx="450" cy="325" r="104" fill="none" stroke="#ffb467" opacity=".18" stroke-dasharray="2 11"/>
            <circle cx="450" cy="325" r="74" fill="url(#coreAura)" stroke="rgba(255,236,211,.45)" stroke-width="1.5"/>
            <text x="450" y="331" fill="#fff8ef" font-size="22" text-anchor="middle" letter-spacing="5">AURA</text>
          </g>
        </svg>
        <div class="organism-hud"><i id="organismDot"></i><span id="organismMood">organisme en réveil</span></div>
        <div class="map-badge"><b>●</b> temps réel</div>
        <div class="map-foot"><strong>Focus :</strong> <span id="focusStatement">chargement de l’état</span></div>
      </div>
    </section>

    <section class="panel chat-panel">
      <div class="panel-head"><div class="panel-title">Parler à AURA</div><div class="spacer"></div><div id="chatState" class="chat-head-state">Connexion…</div></div>
      <div class="messages" id="messages"><div class="msg aura"><span class="who">AURA</span>Je charge mon état, ma mémoire et mes intentions.</div></div>
      <div class="composer">
        <button id="voiceBtn" title="Dicter">◉</button>
        <textarea id="message" rows="2" placeholder="Écris à AURA…"></textarea>
        <button class="send" id="send" title="Envoyer">➜</button>
      </div>
      <div class="chat-hint">Entrée pour envoyer · Maj+Entrée pour aller à la ligne</div>
      <div class="quick"></div>
    </section>
  </main>

  <section class="essentials">
    <div class="panel essential-card">
      <div class="essential-label">Ce qu’elle fait maintenant</div>
      <div class="essential-value" id="nextAction">Lecture de l’activité…</div>
      <div class="essential-copy">Priorité / confiance : <span id="confidenceValue">—</span></div>
      <div class="progress"><span id="confidenceBar" style="width:0%"></span></div>
    </div>
    <div class="panel essential-card">
      <div class="essential-label">État d’AURA</div>
      <div class="emotion-mini"><div class="emotion-orb" id="emotionOrb"></div><div><div class="essential-value" id="emotionMood">Réveil</div><div class="essential-copy" id="emotionReason">Lecture de l’état…</div></div></div>
    </div>
    <div class="panel essential-card">
      <div class="essential-label">Entreprise agentique</div>
      <div class="score-line"><div class="score-circle"><span id="commandCompany">—</span></div><div><div class="essential-value" id="commandState">Initialisation</div><div class="essential-copy"><span id="commandFleet">—</span> · <span id="commandMode">—</span> · <span id="commandCount">—</span></div></div></div>
    </div>
  </section>

  <details class="advanced">
    <summary><span>Afficher les détails techniques</span><span>＋</span></summary>
    <div class="advanced-grid">
      <div class="advanced-card">
        <div class="advanced-title">Homeostasie</div>
        <div class="emotion-details">
          <div class="emotion-cell"><div class="emotion-label"><span>Stabilité</span><strong id="emotion-stability-value">—</strong></div><div class="emotion-bar"><span id="emotion-stability"></span></div></div>
          <div class="emotion-cell"><div class="emotion-label"><span>Clarté</span><strong id="emotion-clarity-value">—</strong></div><div class="emotion-bar"><span id="emotion-clarity"></span></div></div>
          <div class="emotion-cell"><div class="emotion-label"><span>Curiosité</span><strong id="emotion-curiosity-value">—</strong></div><div class="emotion-bar"><span id="emotion-curiosity"></span></div></div>
          <div class="emotion-cell"><div class="emotion-label"><span>Agency</span><strong id="emotion-agency-value">—</strong></div><div class="emotion-bar"><span id="emotion-agency"></span></div></div>
          <div class="emotion-cell"><div class="emotion-label"><span>Confiance</span><strong id="emotion-confidence-value">—</strong></div><div class="emotion-bar"><span id="emotion-confidence"></span></div></div>
          <div class="emotion-cell"><div class="emotion-label"><span>Engagement</span><strong id="emotion-engagement-value">—</strong></div><div class="emotion-bar"><span id="emotion-engagement"></span></div></div>
          <div class="emotion-chip"><span>Satisfaction</span><strong id="emotion-satisfaction-value">—</strong><div class="emotion-chip-track"><i id="emotion-satisfaction"></i></div></div>
          <div class="emotion-chip"><span>Frustration</span><strong id="emotion-frustration-value">—</strong><div class="emotion-chip-track"><i id="emotion-frustration"></i></div></div>
          <div class="emotion-chip"><span>Relation</span><strong id="emotion-attachment-value">—</strong><div class="emotion-chip-track"><i id="emotion-attachment"></i></div></div>
          <div class="emotion-chip"><span>Curiosité sociale</span><strong id="emotion-social-value">—</strong><div class="emotion-chip-track"><i id="emotion-social"></i></div></div>
          <div class="emotion-chip"><span>Rêve</span><strong id="emotion-dream-value">—</strong><div class="emotion-chip-track"><i id="emotion-dream"></i></div></div>
          <div class="emotion-chip"><span>Silence</span><strong id="emotion-silence-value">—</strong><div class="emotion-chip-track"><i id="emotion-silence"></i></div></div>
        </div>
      </div>
      <div class="advanced-card"><div class="advanced-title">Produits Quantic <span class="advanced-meta" id="portfolioMeta">—</span></div><div id="portfolioList" class="intent-list"><div class="empty">Lecture…</div></div></div>
      <div class="advanced-card"><div class="advanced-title">Workstreams <span class="advanced-meta" id="workMeta">—</span></div><div id="workList" class="work-list"><div class="empty">Lecture…</div></div></div>
      <div class="advanced-card"><div class="advanced-title">Preuves <span class="advanced-meta" id="receiptMeta">—</span></div><div id="receiptList" class="activity-list"><div class="empty">Lecture…</div></div></div>
      <div class="advanced-card"><div class="advanced-title">Intentions</div><div id="intentList" class="intent-list"><div class="empty">Lecture…</div></div></div>
      <div class="advanced-card"><div class="advanced-title">Activité</div><div id="activityList" class="activity-list"><div class="empty">Lecture…</div></div></div>
      <div class="advanced-card"><div class="advanced-title">Mémoire <span class="advanced-meta" id="memoryMeta">—</span></div><div id="memoryList" class="memory-list"><div class="empty">Lecture…</div></div></div>
      <div class="advanced-card"><div class="advanced-title">Curiosité <span class="advanced-meta" id="curiosityMeta">—</span></div><div id="curiosityList" class="intent-list"><div class="empty">Lecture…</div></div></div>
      <div class="advanced-card"><div class="advanced-title">Veille <span class="advanced-meta" id="scoutMeta">—</span></div><div id="scoutList" class="intent-list"><div class="empty">Lecture…</div></div></div>
      <div class="advanced-card"><div class="advanced-title">Pensée dominante</div><div id="dominantThought" class="thought-card">Chargement…</div><div id="continuityState" class="thought-card">Continuité autonome…</div></div>
      <div class="advanced-card">
        <div class="advanced-title">Télémétrie</div>
        <div class="telemetry-rail">
          <div class="metric"><div id="ring-energy" class="ring"></div><div><div class="metric-label">Énergie</div><div id="metric-energy" class="metric-value">—</div><div id="trend-energy" class="metric-trend"></div></div></div>
          <div class="metric"><div id="ring-curiosity" class="ring"></div><div><div class="metric-label">Curiosité</div><div id="metric-curiosity" class="metric-value">—</div><div id="trend-curiosity" class="metric-trend"></div></div></div>
          <div class="metric"><div id="ring-pressure" class="ring"></div><div><div class="metric-label">Pression</div><div id="metric-pressure" class="metric-value">—</div><div id="trend-pressure" class="metric-trend"></div></div></div>
          <div class="metric"><div id="ring-continuity" class="ring"></div><div><div class="metric-label">Continuité</div><div id="metric-continuity" class="metric-value">—</div><div id="trend-continuity" class="metric-trend"></div></div></div>
          <div class="metric"><div id="ring-introspection" class="ring"></div><div><div class="metric-label">Introspection</div><div id="metric-introspection" class="metric-value">—</div><div id="trend-introspection" class="metric-trend"></div></div></div>
          <div class="metric"><div id="ring-reactivity" class="ring"></div><div><div class="metric-label">Réactivité</div><div id="metric-reactivity" class="metric-value">—</div><div id="trend-reactivity" class="metric-trend"></div></div></div>
        </div>
      </div>
    </div>
  </details>
</div>
<script>${DASHBOARD_SCRIPT}</script>
</body>
</html>`;
