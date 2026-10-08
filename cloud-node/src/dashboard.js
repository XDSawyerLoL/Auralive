import { DASHBOARD_SCRIPT } from './dashboard-runtime.js';

export const DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#080706">
<title>AURA</title>
<style>
:root{
  color-scheme:dark;
  --bg:#080706;--panel:rgba(17,15,15,.90);--line:rgba(255,237,218,.09);
  --text:#f7f2ed;--muted:#978c87;--gold:#ffb566;--violet:#9b6cff;--pink:#e85f9f;
  --green:#5de0aa;--red:#ff6d78;
}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body{min-height:100vh;background:radial-gradient(900px 600px at 78% 10%,rgba(255,168,87,.07),transparent 70%),linear-gradient(180deg,#090807,#050505)}
button,textarea{font:inherit}
button{cursor:pointer}
.shell{max-width:1480px;margin:0 auto;padding:12px}
.topbar{height:58px;display:flex;align-items:center;gap:12px;padding:8px 11px;border:1px solid var(--line);border-radius:17px;background:rgba(13,11,11,.88);backdrop-filter:blur(18px);position:sticky;top:8px;z-index:20}
.brand{display:flex;align-items:center;gap:10px}.brand-orb{width:34px;height:34px;border-radius:50%;background:radial-gradient(circle at 38% 32%,#fff 0 8%,#ffe2bf 17%,#ffad5a 34%,#5b2e1e 62%,#0a0807 75%);box-shadow:0 0 22px rgba(255,168,87,.38)}.brand-name{font-size:18px;font-weight:780;letter-spacing:.22em}.brand-sub{font-size:7px;color:#8f837d;letter-spacing:.14em;text-transform:uppercase;margin-top:2px}
.top-spacer{flex:1}.status-compact{display:flex;align-items:center;gap:7px}.status-compact .pill:nth-child(n+3){display:none}
.pill{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.02);font-size:8px;color:#ada19b;white-space:nowrap}
.live-dot{width:6px;height:6px;border-radius:50%;background:var(--gold);box-shadow:0 0 9px currentColor}.live-dot.good{background:var(--green)}.live-dot.warn{background:var(--gold)}.live-dot.bad{background:var(--red)}
.clock{display:none}.icon-btn{border:1px solid var(--line);background:rgba(255,255,255,.025);color:#cfc3bd;border-radius:9px;padding:7px 9px;font-size:8px}
.setup-banner{display:none;margin-top:8px;padding:10px 12px;border:1px solid rgba(255,181,93,.20);border-radius:13px;background:rgba(255,169,78,.05);font-size:9px;color:#d8c4b5}.setup-banner.show{display:block}.setup-title{font-weight:800;color:#ffc17d}.setup-list{margin:5px 0 0;padding-left:16px}
.main{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:10px;margin-top:10px;min-height:calc(100vh - 92px)}
.panel{border:1px solid var(--line);border-radius:20px;background:linear-gradient(180deg,rgba(18,16,16,.94),rgba(9,8,8,.91));box-shadow:inset 0 1px rgba(255,255,255,.03),0 20px 60px rgba(0,0,0,.26);overflow:hidden}
.chat{display:flex;flex-direction:column;min-height:calc(100vh - 92px)}
.chat-head{display:flex;align-items:center;gap:8px;padding:13px 15px;border-bottom:1px solid rgba(255,255,255,.045)}
.chat-title{font-size:13px;font-weight:760}.chat-sub{font-size:8px;color:#7d726d}.chat-head-state{margin-left:auto;font-size:8px;color:#998d87}
.messages{flex:1;display:flex;flex-direction:column;gap:11px;padding:18px;overflow:auto;background:radial-gradient(circle at 50% 0,rgba(255,171,86,.025),transparent 38%)}
.msg{max-width:78%;font-size:15px;line-height:1.6;padding:11px 13px;border-radius:16px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.05)}
.msg.user{align-self:flex-end;background:rgba(255,171,87,.07);border-color:rgba(255,184,108,.11)}.msg.aura{align-self:flex-start}.who{display:block;font-size:7px;color:#776b66;letter-spacing:.08em;margin-bottom:5px}.msg.aura .who{color:#e1b88e}
.composer{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;padding:12px;border-top:1px solid rgba(255,255,255,.045);background:rgba(9,8,8,.97)}
.composer textarea{width:100%;min-height:58px;max-height:150px;resize:vertical;border:1px solid rgba(255,236,211,.11);border-radius:15px;background:rgba(255,255,255,.03);color:#f8f3ee;padding:14px 15px;outline:none;font-size:16px;line-height:1.4}.composer textarea:focus{border-color:rgba(255,178,105,.30);box-shadow:0 0 0 3px rgba(255,157,77,.05)}
.composer button{width:48px;height:48px;align-self:end;border-radius:13px;border:1px solid var(--line);display:grid;place-items:center;background:rgba(255,255,255,.03);color:#eee2dc}.composer .send{border:0;background:linear-gradient(135deg,#ffb867,#d86b46);color:#160c07;font-weight:900}
.chat-hint{padding:0 12px 10px;color:#655c58;font-size:7px;background:rgba(9,8,8,.97)}
.side{display:flex;flex-direction:column;gap:10px}
.aura-card{min-height:340px}.side-head{display:flex;align-items:center;gap:8px;padding:11px 12px;border-bottom:1px solid rgba(255,255,255,.045)}.side-head strong{font-size:11px}.side-head span{font-size:8px;color:#776d68}
.map-wrap{position:relative;height:290px;overflow:hidden;isolation:isolate;background:radial-gradient(circle at 50% 50%,rgba(255,167,82,.10),transparent 23%),radial-gradient(circle at 32% 40%,rgba(155,108,255,.075),transparent 32%),linear-gradient(180deg,rgba(10,8,8,.66),rgba(4,4,4,.94))}
#nebulaFx,#particleFx{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}#nebulaFx{z-index:0}#particleFx{z-index:2;mix-blend-mode:screen}#attentionMap{position:absolute;inset:0;z-index:3;width:100%;height:100%}
#core{transform-box:fill-box;transform-origin:center}.energy-pulse{fill:none;stroke-linecap:round;filter:url(#glow);animation:energyFlow 4.2s linear infinite}.web-link{animation:webDrift 8s linear infinite}.aura-node{transform-box:fill-box;transform-origin:center}@keyframes energyFlow{from{stroke-dashoffset:0}to{stroke-dashoffset:-170}}@keyframes webDrift{from{stroke-dashoffset:0}to{stroke-dashoffset:-90}}
body.aura-speaking #core{filter:url(#coreBloom) drop-shadow(0 0 20px rgba(255,169,84,.65))}
.organism-hud,.map-foot,.map-badge{position:absolute;z-index:6;border:1px solid rgba(255,255,255,.055);background:rgba(7,7,7,.64);backdrop-filter:blur(12px);border-radius:9px;font-size:7px}.organism-hud{left:10px;top:10px;display:flex;align-items:center;gap:6px;padding:6px 8px;color:#b3a7a1}.organism-hud i{width:6px;height:6px;border-radius:50%;background:var(--violet)}.map-badge{right:10px;top:10px;padding:6px 8px;color:#bdebd8}.map-badge b{color:var(--green)}.map-foot{left:10px;right:10px;bottom:10px;padding:7px 8px;color:#998c86;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mini-card{padding:13px}.mini-label{font-size:7px;color:#746a66;text-transform:uppercase;letter-spacing:.10em}.mini-value{font-size:15px;font-weight:760;line-height:1.3;margin-top:6px}.mini-copy{font-size:8px;color:#918680;line-height:1.45;margin-top:5px}.emotion-line{display:flex;align-items:center;gap:9px}.emotion-orb{width:31px;height:31px;border-radius:50%;background:radial-gradient(circle at 38% 32%,#fff 0 7%,#ffb86b 20%,#7d4633 50%,#12100f 73%);box-shadow:0 0 18px rgba(255,166,89,.24)}
.details{margin-top:auto}.details summary{list-style:none;cursor:pointer;padding:11px 12px;font-size:8px;color:#897e78}.details summary::-webkit-details-marker{display:none}.details-body{display:grid;gap:7px;padding:0 10px 10px}.tech{border:1px solid rgba(255,255,255,.05);border-radius:10px;padding:8px;background:rgba(255,255,255,.015);font-size:8px}
.hidden-data{display:none!important}
.intent-list,.work-list,.memory-list,.activity-list{display:grid;gap:5px}.intent-row,.work-row,.memory-row,.activity-row{border:1px solid rgba(255,255,255,.05);border-radius:8px;padding:6px;background:rgba(255,255,255,.015)}.intent-title,.work-title,.memory-text,.activity-title{font-size:7px}.memory-date,.activity-time,.activity-kind,.badge{font-size:6px;color:#6f6662}
.progress{height:3px;background:rgba(255,255,255,.05);border-radius:999px;overflow:hidden}.progress span{display:block;height:100%;background:linear-gradient(90deg,var(--gold),var(--violet))}
.sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
@media(max-width:900px){.main{grid-template-columns:1fr}.side{order:-1}.aura-card{min-height:250px}.map-wrap{height:220px}.chat{min-height:72svh}.side .mini-card:nth-of-type(n+3){display:none}}
@media(max-width:640px){.shell{padding:7px}.topbar{height:54px;padding:7px 9px}.brand-sub{display:none}.status-compact .pill:nth-child(n+2){display:none}.main{margin-top:7px}.side{display:block}.aura-card{margin-bottom:7px}.mini-card{display:none}.chat{min-height:calc(100svh - 68px)}.messages{padding:13px}.msg{font-size:15px;max-width:92%}.composer textarea{font-size:16px}.map-wrap{height:165px}.organism-hud,.map-badge{display:none}.map-foot{font-size:7px}}
</style>
</head>
<body data-aura-ui="minimal-conversation-v2">
<div class="shell">
  <div class="sr-only" aria-hidden="true">Company OS · AURA vivante · Parler à AURA · Produits Quantic · Workstreams actifs · Preuve de travail · Mémoire et leçons · Télémétrie · Homeostasie</div>

  <header class="topbar">
    <div class="brand"><div class="brand-orb"></div><div><div class="brand-name">AURA</div><div class="brand-sub">Company OS</div></div></div>
    <div class="top-spacer"></div>
    <div class="status-compact">
      <div class="pill"><span id="liveDot" class="live-dot"></span><span id="liveText">Connexion…</span></div>
      <div class="pill"><span id="languageDot" class="live-dot"></span><span id="languageText">Dialogue…</span></div>
      <div class="pill"><span id="voiceDot" class="live-dot"></span><span id="voiceText">Mairaiy…</span></div>
      <div class="pill"><span id="evolutionDot" class="live-dot"></span><span id="evolutionText">Évolution…</span></div>
    </div>
    <div class="clock"><span id="clockDate">—</span><span id="clockTime">—</span></div>
    <button class="icon-btn" id="modeBtn">↻</button>
  </header>

  <section class="setup-banner" id="setupBanner"><div class="setup-title">AURA se reconnecte</div><div id="setupSummary">Initialisation…</div><ul id="setupIssues" class="setup-list"></ul></section>

  <main class="main">
    <section class="panel chat">
      <div class="chat-head"><div><div class="chat-title">Parler à AURA</div><div class="chat-sub">Conversation principale</div></div><div id="chatState" class="chat-head-state">Connexion…</div></div>
      <div class="messages" id="messages"><div class="msg aura"><span class="who">AURA</span>Je charge mon état, ma mémoire et mes intentions.</div></div>
      <div class="composer">
        <button id="voiceBtn" title="Dicter">◉</button>
        <textarea id="message" rows="2" placeholder="Écris à AURA…"></textarea>
        <button id="send" class="send" title="Envoyer">➜</button>
      </div>
      <div class="chat-hint">Entrée pour envoyer · Maj+Entrée pour aller à la ligne</div>
      <div class="quick"></div>
    </section>

    <aside class="side">
      <section class="panel aura-card">
        <div class="side-head"><strong>AURA vivante</strong><span id="organismMood">réveil</span><div class="top-spacer"></div><button id="refreshMap" class="icon-btn">↺</button></div>
        <div class="map-wrap" id="livingMap">
          <canvas id="nebulaFx"></canvas><canvas id="particleFx"></canvas>
          <svg id="attentionMap" viewBox="0 0 900 650">
            <defs>
              <radialGradient id="coreAura"><stop offset="0" stop-color="#fff"/><stop offset=".14" stop-color="#fff0da"/><stop offset=".38" stop-color="#ffb665"/><stop offset=".72" stop-color="#a54f31"/><stop offset="1" stop-color="#1c0f0b" stop-opacity=".08"/></radialGradient>
              <filter id="glow"><feGaussianBlur stdDeviation="7" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
              <filter id="soft"><feGaussianBlur stdDeviation="2.4"/></filter>
              <filter id="coreBloom" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="12" result="blur1"/><feMerge><feMergeNode in="blur1"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            </defs>
            <g id="flowLinks"></g><g id="energyPulses"></g><g id="interestNodes"></g>
            <g id="core" filter="url(#coreBloom)"><circle cx="450" cy="325" r="96" fill="none" stroke="#ffb467" opacity=".15" stroke-dasharray="2 11"/><circle cx="450" cy="325" r="68" fill="url(#coreAura)" stroke="rgba(255,236,211,.42)" stroke-width="1.4"/><text x="450" y="331" fill="#fff8ef" font-size="22" text-anchor="middle" letter-spacing="5">AURA</text></g>
          </svg>
          <div class="organism-hud"><i id="organismDot"></i><span>homeostasie active</span></div>
          <div class="map-badge"><b>●</b> live</div>
          <div class="map-foot"><span id="focusStatement">chargement du focus…</span></div>
        </div>
      </section>

      <section class="panel mini-card">
        <div class="mini-label">Ce qu’elle fait</div>
        <div id="nextAction" class="mini-value">Lecture de l’activité…</div>
        <div class="mini-copy">Priorité / confiance : <span id="confidenceValue">—</span></div>
        <div class="progress"><span id="confidenceBar" style="width:0%"></span></div>
      </section>

      <section class="panel mini-card">
        <div class="mini-label">État</div>
        <div class="emotion-line"><div id="emotionOrb" class="emotion-orb"></div><div><div id="emotionMood" class="mini-value">Réveil</div><div id="emotionReason" class="mini-copy">Lecture de l’état…</div></div></div>
      </section>

      <details class="panel details">
        <summary>Détails techniques</summary>
        <div class="details-body">
          <div class="tech">Entreprise agentique : <strong id="commandCompany">—</strong></div>
          <div class="tech">État : <span id="commandState">—</span> · flotte <span id="commandFleet">—</span> · mode <span id="commandMode">—</span> · <span id="commandCount">—</span></div>
          <div class="tech"><div id="dominantThought">Chargement…</div><div id="continuityState">Continuité…</div></div>
          <div class="tech"><div id="portfolioMeta">—</div><div id="portfolioList" class="intent-list"></div></div>
          <div class="tech"><div id="workMeta">—</div><div id="workList" class="work-list"></div></div>
          <div class="tech"><div id="receiptMeta">—</div><div id="receiptList" class="activity-list"></div></div>
          <div class="tech"><div id="memoryMeta">—</div><div id="memoryList" class="memory-list"></div></div>
          <div class="tech"><div id="curiosityMeta">—</div><div id="curiosityList" class="intent-list"></div></div>
          <div class="tech"><div id="scoutMeta">—</div><div id="scoutList" class="intent-list"></div></div>
          <div class="tech"><div id="intentList" class="intent-list"></div><div id="activityList" class="activity-list"></div></div>
        </div>
      </details>
    </aside>
  </main>

  <div class="hidden-data" aria-hidden="true">
    <span id="metric-energy"></span><span id="trend-energy"></span><span id="ring-energy"></span>
    <span id="metric-curiosity"></span><span id="trend-curiosity"></span><span id="ring-curiosity"></span>
    <span id="metric-pressure"></span><span id="trend-pressure"></span><span id="ring-pressure"></span>
    <span id="metric-continuity"></span><span id="trend-continuity"></span><span id="ring-continuity"></span>
    <span id="metric-introspection"></span><span id="trend-introspection"></span><span id="ring-introspection"></span>
    <span id="metric-reactivity"></span><span id="trend-reactivity"></span><span id="ring-reactivity"></span>
  </div>
</div>
<script>${DASHBOARD_SCRIPT}</script>
</body>
</html>`;
