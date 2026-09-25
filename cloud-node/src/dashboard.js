export const DASHBOARD_HTML = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#070a12">
<title>AURA — Interface de conscience opérationnelle</title>
<style>
:root{
  color-scheme:dark;
  --bg:#060810;--bg2:#090d18;--panel:rgba(13,18,31,.78);--panel2:rgba(18,25,42,.72);
  --line:rgba(164,184,255,.13);--line2:rgba(255,255,255,.07);
  --text:#f6f8ff;--muted:#8f9bb3;--muted2:#65718a;
  --violet:#9a6cff;--violet2:#6f4fff;--cyan:#59e0ef;--blue:#6da7ff;
  --green:#60e6ad;--gold:#ffc96a;--pink:#f178d6;--red:#ff758d;
}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
html{background:#04060c}
body{
  position:relative;
  min-height:100vh;
  overflow-x:hidden;
  -webkit-font-smoothing:antialiased;
  background:
    radial-gradient(1200px 700px at 18% -12%,rgba(109,72,255,.28),transparent 66%),
    radial-gradient(980px 620px at 88% 2%,rgba(29,112,255,.20),transparent 68%),
    radial-gradient(720px 520px at 56% 46%,rgba(95,48,184,.09),transparent 70%),
    linear-gradient(180deg,#070a12 0%,#04060c 100%);
}
body::before{
  content:"";
  position:fixed;
  inset:0;
  pointer-events:none;
  opacity:.22;
  background-image:
    radial-gradient(circle at 12% 18%,rgba(255,255,255,.75) 0 1px,transparent 1.4px),
    radial-gradient(circle at 78% 27%,rgba(135,181,255,.7) 0 1px,transparent 1.4px),
    radial-gradient(circle at 44% 76%,rgba(198,168,255,.7) 0 1px,transparent 1.4px);
  background-size:190px 190px,270px 270px,340px 340px;
  mix-blend-mode:screen;
}
button,input,textarea{font:inherit}
button{cursor:pointer}
button:disabled{opacity:.5;cursor:not-allowed}
::selection{background:rgba(154,108,255,.35)}
.shell{max-width:1920px;margin:0 auto;padding:18px 22px 22px;min-height:100vh}
.topbar{display:flex;align-items:center;gap:20px;margin-bottom:14px;min-height:58px}
.identity{display:flex;align-items:center;gap:14px;min-width:0}
.logo{font-size:42px;letter-spacing:.25em;font-weight:260;line-height:1;text-shadow:0 0 34px rgba(205,192,255,.23);white-space:nowrap}
.logo-dash{display:inline-block;margin-left:2px;letter-spacing:0;color:#a8b2cc;font-weight:220}
.identity-copy{min-width:0;padding-left:2px}
.title{font-size:24px;line-height:1.04;font-weight:480;letter-spacing:.01em;white-space:nowrap}
.subtitle{font-size:12px;color:var(--muted);margin-top:6px}
.top-actions{margin-left:auto;display:flex;align-items:center;gap:10px}
.pill{display:flex;align-items:center;gap:8px;border:1px solid var(--line);background:rgba(16,23,39,.72);padding:9px 12px;border-radius:999px;font-size:11px;color:#cbd4e8;backdrop-filter:blur(16px)}
.live-dot{width:7px;height:7px;border-radius:50%;background:var(--gold);box-shadow:0 0 14px currentColor}
.live-dot.good{background:var(--green)}.live-dot.bad{background:var(--red)}
.clock{padding:0 16px;border-left:1px solid var(--line);border-right:1px solid var(--line);text-align:right;min-width:106px}
.clock .date{font-size:10px;color:var(--muted)}.clock .time{font-size:18px;font-weight:650;margin-top:2px}
.mode-btn,.icon-btn{border:1px solid rgba(154,108,255,.32);background:rgba(70,45,125,.22);color:#e5dcff;border-radius:999px;padding:9px 13px;font-size:11px}
.icon-btn{padding:9px 12px;border-color:var(--line);background:rgba(16,23,39,.7)}
.metrics{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:13px}
.metric{position:relative;overflow:hidden;border:1px solid rgba(157,181,255,.17);border-radius:16px;background:linear-gradient(180deg,rgba(21,30,51,.88),rgba(9,14,25,.80));padding:12px 14px;display:flex;align-items:center;gap:12px;min-height:78px;box-shadow:inset 0 1px rgba(255,255,255,.045),0 18px 46px rgba(0,0,0,.17)}
.metric::after{content:"";position:absolute;inset:auto -25% -55% 35%;height:90px;background:radial-gradient(circle,var(--metric-glow,rgba(154,108,255,.14)),transparent 70%)}
.ring{width:47px;height:47px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto;background:conic-gradient(var(--metric-color,var(--violet)) calc(var(--pct,0)*1%),rgba(255,255,255,.07) 0);position:relative;box-shadow:0 0 20px var(--metric-shadow,rgba(154,108,255,.12))}
.ring::before{content:"";position:absolute;inset:5px;border-radius:50%;background:#0b101c;border:1px solid rgba(255,255,255,.05)}
.ring span{position:relative;z-index:1;font-size:15px;font-weight:700}
.metric-copy{min-width:0}.metric-label{font-size:11px;color:#cdd4e4}.metric-value{font-size:20px;font-weight:700;margin-top:2px}.metric-trend{font-size:9px;color:var(--muted);margin-top:1px}
.workspace{
  display:grid;
  grid-template-columns:minmax(290px,.92fr) minmax(610px,2.08fr) minmax(330px,1.04fr);
  grid-template-rows:minmax(470px,1fr) auto;
  grid-template-areas:
    "chat map side"
    "chat bottom bottom";
  gap:13px;
  align-items:stretch;
}
.panel{position:relative;border:1px solid rgba(150,174,245,.15);border-radius:16px;background:linear-gradient(180deg,rgba(13,19,33,.91),rgba(7,11,20,.87));backdrop-filter:blur(20px);box-shadow:inset 0 1px rgba(255,255,255,.025),0 20px 64px rgba(0,0,0,.20);overflow:hidden}
.panel::before{content:"";position:absolute;left:10%;right:10%;top:0;height:1px;background:linear-gradient(90deg,transparent,rgba(185,199,255,.14),transparent);pointer-events:none}
.panel-head{display:flex;align-items:center;gap:9px;padding:13px 14px;border-bottom:1px solid rgba(255,255,255,.055);min-height:45px}
.panel-title{font-size:14px;font-weight:650;letter-spacing:.005em}.panel-head .spacer{flex:1}.panel-meta{font-size:9px;color:var(--muted)}
.panel-body{padding:14px}
.chat-panel{grid-area:chat;display:flex;flex-direction:column;min-height:0}
.chat-body{display:flex;flex:1;min-height:0;flex-direction:column;padding:12px}
.messages{display:flex;flex-direction:column;gap:12px;overflow:auto;min-height:360px;max-height:none;padding:7px 8px 14px}
.msg{position:relative;max-width:88%;padding:12px 13px;border:1px solid rgba(154,177,242,.10);border-radius:14px;font-size:11px;line-height:1.55;background:linear-gradient(135deg,rgba(25,34,56,.72),rgba(14,20,34,.70));box-shadow:inset 0 1px rgba(255,255,255,.025)}
.msg.user{align-self:flex-end;margin-right:34px;background:linear-gradient(135deg,rgba(108,78,223,.20),rgba(71,108,208,.10));border-color:rgba(137,103,255,.21)}
.msg.aura{align-self:flex-start;margin-left:34px}
.msg.aura::before,.msg.user::before{content:"";position:absolute;top:9px;width:24px;height:24px;border-radius:50%;border:1px solid rgba(154,108,255,.48);box-shadow:0 0 18px rgba(137,99,255,.28)}
.msg.aura::before{left:-34px;background:radial-gradient(circle at 40% 35%,#efeaff 0 5%,#a78aff 18%,#5435a2 46%,#0a0d18 72%)}
.msg.user::before{right:-34px;background:radial-gradient(circle at 45% 34%,#eaf4ff 0 7%,#8398bb 22%,#2b3548 50%,#090d16 74%)}
.msg .who{display:block;font-size:9px;color:var(--muted);margin-bottom:6px}.msg.aura .who{color:#c7b7ff}
.quick{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 10px}.quick button{border:1px solid var(--line);background:rgba(255,255,255,.025);color:#b9c3d7;border-radius:999px;padding:7px 9px;font-size:9px}
.composer{margin-top:auto;display:flex;gap:8px;align-items:flex-end}.composer textarea{resize:none;min-height:46px;max-height:112px;flex:1;border-radius:13px;border:1px solid var(--line);background:rgba(2,5,10,.45);color:var(--text);padding:11px 12px;outline:none;font-size:11px}.composer textarea:focus{border-color:rgba(154,108,255,.5);box-shadow:0 0 0 3px rgba(154,108,255,.08)}
.send,.voice{width:43px;height:43px;border-radius:13px;border:1px solid var(--line);display:grid;place-items:center;color:white}.send{background:linear-gradient(135deg,#8a60ff,#5d4ae9);border:0}.voice{background:rgba(255,255,255,.04)}
.map-panel{grid-area:map;position:relative;min-height:0;display:flex;flex-direction:column}.map-wrap{position:relative;isolation:isolate;flex:1;min-height:470px;overflow:hidden;background:radial-gradient(circle at 52% 47%,rgba(112,65,211,.26),transparent 25%),radial-gradient(circle at 50% 50%,rgba(40,104,184,.12),transparent 57%),linear-gradient(180deg,rgba(8,12,24,.12),rgba(4,7,13,.28))}
.map-wrap::before{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background-image:radial-gradient(circle,rgba(255,255,255,.44) 0 1px,transparent 1.4px);background-size:47px 47px;opacity:.13;mask-image:radial-gradient(circle at center,#000 12%,transparent 78%)}
#nebulaFx,#particleFx{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
#nebulaFx{z-index:0;filter:saturate(1.35) contrast(1.04)}
#particleFx{z-index:2;mix-blend-mode:screen}
.aurora-vignette{position:absolute;inset:-12%;z-index:2;pointer-events:none;mix-blend-mode:screen;background:radial-gradient(circle at 50% 49%,rgba(185,140,255,.12),transparent 19%),radial-gradient(circle at 47% 52%,rgba(74,224,255,.075),transparent 32%),radial-gradient(circle at 57% 42%,rgba(255,171,91,.045),transparent 35%);animation:auraVignette 7.5s ease-in-out infinite}
#attentionMap{position:absolute;inset:0;z-index:3;width:100%;height:100%;overflow:visible}
#core{transform-box:fill-box;transform-origin:center;will-change:transform}
.core-link{filter:drop-shadow(0 0 5px currentColor)}
.energy-pulse{fill:none;pointer-events:none;stroke-linecap:round;filter:url(#glow);animation:energyFlow 4.6s linear infinite}
.web-link{animation:webDrift 9s linear infinite}
.aura-node{transform-box:fill-box;transform-origin:center;will-change:transform}
@keyframes auraVignette{0%,100%{opacity:.72;transform:scale(.98) rotate(-1deg)}50%{opacity:1;transform:scale(1.055) rotate(1deg)}}
@keyframes energyFlow{from{stroke-dashoffset:0}to{stroke-dashoffset:-170}}
@keyframes webDrift{from{stroke-dashoffset:0}to{stroke-dashoffset:-90}}
@keyframes auraSpeakingLight{0%,100%{opacity:.72;filter:saturate(1.2) brightness(1)}35%{opacity:1;filter:saturate(1.8) brightness(1.35)}65%{opacity:.86;filter:saturate(1.5) brightness(1.18)}}
body.aura-speaking .aurora-vignette{animation:auraSpeakingLight .58s ease-in-out infinite}
body.aura-speaking #core{filter:url(#coreBloom) drop-shadow(0 0 22px rgba(177,128,255,.85)) drop-shadow(0 0 42px rgba(78,222,255,.34))}
body.aura-speaking .energy-pulse{animation-duration:1.6s}
@media(prefers-reduced-motion:reduce){.aurora-vignette,.energy-pulse,.web-link{animation:none!important}}
.map-toolbar{display:flex;gap:6px}.map-toolbar button{border:1px solid var(--line);background:rgba(255,255,255,.025);color:#b8c1d5;border-radius:999px;padding:6px 9px;font-size:9px}
.legend{position:absolute;right:14px;bottom:13px;background:rgba(7,10,18,.78);border:1px solid var(--line);border-radius:12px;padding:10px 11px;font-size:8px;color:#aab5ca;backdrop-filter:blur(12px);display:grid;gap:5px}.legend-row{display:flex;align-items:center;gap:7px}.legend-line{width:22px;height:2px;border-radius:4px;background:linear-gradient(90deg,var(--violet),#fff)}.legend-line.rise{background:linear-gradient(90deg,var(--cyan),#fff)}.legend-line.stable{background:rgba(255,255,255,.3)}
.map-foot{position:absolute;left:15px;bottom:14px;max-width:55%;font-size:9px;color:var(--muted);line-height:1.45;padding:8px 10px;border-radius:10px;background:rgba(7,10,18,.6);border:1px solid rgba(255,255,255,.05)}
.right-stack{grid-area:side;display:grid;gap:12px;grid-template-rows:auto minmax(178px,1fr) auto}.thought-card{padding:13px;border:1px solid rgba(255,201,106,.17);border-radius:14px;background:linear-gradient(135deg,rgba(255,201,106,.08),rgba(154,108,255,.07));font-size:12px;line-height:1.48;color:#f2e0b9;min-height:74px}
.work-list,.intent-list,.memory-list,.activity-list{display:grid;gap:8px}.work-row,.intent-row,.memory-row,.activity-row{border:1px solid var(--line2);background:rgba(255,255,255,.02);border-radius:11px;padding:9px 10px}
.work-top,.intent-top{display:flex;gap:8px;align-items:flex-start}.work-title,.intent-title{font-size:10px;line-height:1.35;flex:1}.badge{font-size:8px;border-radius:999px;padding:3px 7px;border:1px solid var(--line);color:#cbd4e8;white-space:nowrap}.badge.high{color:#ffda93;border-color:rgba(255,201,106,.24);background:rgba(255,201,106,.07)}.badge.medium{color:#b9cbff;border-color:rgba(109,167,255,.24);background:rgba(109,167,255,.06)}
.progress{height:4px;margin-top:7px;background:rgba(255,255,255,.06);border-radius:999px;overflow:hidden}.progress span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--violet),var(--cyan))}
.bottom-grid{grid-area:bottom;display:grid;grid-template-columns:5fr 3.25fr 4.25fr;gap:13px;margin-top:0}.bottom-grid .panel{min-height:188px}
.activity-row{display:grid;grid-template-columns:48px 1fr auto;align-items:center;gap:7px;padding:7px 9px}.activity-time{font-size:8px;color:var(--muted2)}.activity-title{font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.activity-kind{font-size:8px;color:#aab6ce;border:1px solid var(--line);padding:3px 6px;border-radius:999px}
.next-action{display:flex;gap:12px;align-items:flex-start;padding:13px;border:1px solid rgba(154,108,255,.16);border-radius:14px;background:linear-gradient(135deg,rgba(154,108,255,.1),rgba(90,110,255,.05))}.next-orb{width:42px;height:42px;border-radius:50%;border:1px solid rgba(154,108,255,.45);display:grid;place-items:center;color:#c4b5ff;box-shadow:0 0 25px rgba(154,108,255,.18);flex:0 0 auto}.next-copy{font-size:10px;line-height:1.45}.confidence{font-size:8px;color:var(--muted);margin-top:14px}.memory-row{display:grid;grid-template-columns:auto 1fr;gap:8px}.memory-date{font-size:8px;color:var(--muted2)}.memory-text{font-size:9px;line-height:1.35}.empty{padding:14px;text-align:center;border:1px dashed var(--line);border-radius:11px;color:var(--muted);font-size:9px}
.auth-drawer{position:fixed;inset:0;display:none;z-index:50;background:rgba(2,4,9,.72);backdrop-filter:blur(12px);align-items:center;justify-content:center;padding:18px}.auth-drawer.open{display:flex}.auth-box{width:min(460px,100%);border:1px solid var(--line);border-radius:20px;background:#0d1321;padding:20px;box-shadow:0 30px 100px rgba(0,0,0,.45)}.auth-box h3{margin:0 0 7px;font-size:16px}.auth-box p{margin:0 0 13px;color:var(--muted);font-size:10px;line-height:1.45}.auth-row{display:flex;gap:8px}.auth-row input{flex:1;border:1px solid var(--line);background:#070b13;color:white;border-radius:12px;padding:10px 11px;outline:none}.primary{border:0;border-radius:11px;background:linear-gradient(135deg,#9368ff,#624ee8);color:white;padding:9px 12px;font-weight:650}.secondary{border:1px solid var(--line);border-radius:11px;background:rgba(255,255,255,.035);color:#ccd4e5;padding:9px 12px}
.setup-banner{display:none;margin-bottom:14px;border:1px solid rgba(255,201,106,.22);background:linear-gradient(135deg,rgba(255,201,106,.08),rgba(154,108,255,.06));border-radius:16px;padding:12px 14px;color:#eadfca;font-size:10px;line-height:1.5}.setup-banner.show{display:block}.setup-title{font-size:12px;font-weight:700;color:#ffd991;margin-bottom:5px}.setup-list{margin:7px 0 0;padding-left:18px;color:#b9c3d8}.mobile-tabs{display:none}
@media(max-width:1180px){
  .metrics{grid-template-columns:repeat(3,1fr)}
  .workspace{grid-template-columns:1fr;grid-template-rows:auto;grid-template-areas:"chat" "map" "side" "bottom"}
  .right-stack{grid-column:auto;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:none}
  .chat-panel{min-height:520px}.map-panel{min-height:520px}.map-wrap{min-height:520px}
  .bottom-grid{grid-template-columns:1fr 1fr}.bottom-grid .panel:first-child{grid-column:1/-1}.title{white-space:normal}
}
@media(max-width:820px){
  .shell{padding:12px 10px 24px}.topbar{align-items:flex-start;flex-wrap:wrap}.identity{width:100%}.identity-copy{display:block;padding-left:0}.logo{font-size:28px}.logo-dash{display:none}.title{font-size:15px}.subtitle{font-size:10px}.top-actions{width:100%;margin-left:0;justify-content:space-between}.clock{display:none}.mode-btn{display:none}
  .metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.metric{min-height:66px;padding:9px}.ring{width:38px;height:38px}.metric-value{font-size:15px}.metric-label{font-size:10px}.metric-trend{font-size:8px}
  .workspace{grid-template-columns:1fr}.chat-panel{min-height:520px}.map-panel{min-height:520px}.map-wrap{min-height:520px}.right-stack{grid-column:auto;grid-template-columns:1fr}
  .bottom-grid{grid-template-columns:1fr}.bottom-grid .panel:first-child{grid-column:auto}.map-foot{max-width:72%}.legend{display:none}.title{white-space:normal}
}
</style>
</head>
<body>
<div class="shell">
  <header class="topbar">
    <div class="identity">
      <div class="logo">AURA <span class="logo-dash">—</span></div>
      <div class="identity-copy">
        <div class="title">Interface de conscience opérationnelle</div>
        <div class="subtitle">Parler, observer, comprendre ses priorités</div>
      </div>
    </div>
    <div class="top-actions">
      <div class="pill"><span id="liveDot" class="live-dot"></span><span id="liveText">Connexion…</span></div>
      <div class="clock"><div id="clockDate" class="date">—</div><div id="clockTime" class="time">—</div></div>
      <button class="mode-btn" id="modeBtn">⌁ Mode évolutif⌄</button>
      <button class="icon-btn" id="authBtn">Privé · hors connexion</button>
    </div>
  </header>

  <section class="setup-banner" id="setupBanner"><div class="setup-title">Configuration AURA requise</div><div id="setupSummary">Le serveur web fonctionne, mais le noyau persistant n’est pas encore actif.</div><ul class="setup-list" id="setupIssues"></ul></section>

  <section class="metrics">
    <div class="metric" style="--metric-color:#60e6ad;--metric-glow:rgba(96,230,173,.16)"><div class="ring" id="ring-energy"><span>⚡</span></div><div class="metric-copy"><div class="metric-label">Énergie</div><div class="metric-value" id="metric-energy">—</div><div class="metric-trend" id="trend-energy">état interne</div></div></div>
    <div class="metric" style="--metric-color:#9a6cff;--metric-glow:rgba(154,108,255,.18)"><div class="ring" id="ring-curiosity"><span>∞</span></div><div class="metric-copy"><div class="metric-label">Curiosité</div><div class="metric-value" id="metric-curiosity">—</div><div class="metric-trend" id="trend-curiosity">état interne</div></div></div>
    <div class="metric" style="--metric-color:#ff758d;--metric-glow:rgba(255,117,141,.15)"><div class="ring" id="ring-pressure"><span>↗</span></div><div class="metric-copy"><div class="metric-label">Pression</div><div class="metric-value" id="metric-pressure">—</div><div class="metric-trend" id="trend-pressure">état interne</div></div></div>
    <div class="metric" style="--metric-color:#6da7ff;--metric-glow:rgba(109,167,255,.16)"><div class="ring" id="ring-continuity"><span>◫</span></div><div class="metric-copy"><div class="metric-label">Continuité</div><div class="metric-value" id="metric-continuity">—</div><div class="metric-trend" id="trend-continuity">mémoire temporelle</div></div></div>
    <div class="metric" style="--metric-color:#ffc96a;--metric-glow:rgba(255,201,106,.15)"><div class="ring" id="ring-introspection"><span>◉</span></div><div class="metric-copy"><div class="metric-label">Introspection</div><div class="metric-value" id="metric-introspection">—</div><div class="metric-trend" id="trend-introspection">réflexion</div></div></div>
    <div class="metric" style="--metric-color:#59e0ef;--metric-glow:rgba(89,224,239,.15)"><div class="ring" id="ring-reactivity"><span>⌁</span></div><div class="metric-copy"><div class="metric-label">Réactivité</div><div class="metric-value" id="metric-reactivity">—</div><div class="metric-trend" id="trend-reactivity">réponse</div></div></div>
  </section>

  <main class="workspace">
    <section class="panel chat-panel">
      <div class="panel-head"><span>◱</span><div class="panel-title">Dialogue</div><div class="spacer"></div><div class="panel-meta" id="chatState">AURA</div></div>
      <div class="chat-body">
        <div class="messages" id="messages">
          <div class="msg aura"><span class="who">AURA</span>Je suis en train de charger mon état. Connecte l’accès privé pour voir mes intentions, ma mémoire et mon activité complète.</div>
        </div>
        <div class="quick">
          <button data-prompt="Fais-moi un point sur ce que tu fais maintenant.">Que fais-tu maintenant ?</button>
          <button data-prompt="Quel est ton prochain objectif prioritaire ?">Quel est le prochain jalon ?</button>
          <button data-prompt="Quels sont les risques ou tensions que tu détectes actuellement ?">Quels sont les risques ?</button>
        </div>
        <div class="composer">
          <button class="voice" id="voiceBtn" title="Parler">⌁</button>
          <textarea id="message" placeholder="Parler à AURA…"></textarea>
          <button class="send" id="send" title="Envoyer">➜</button>
        </div>
      </div>
    </section>

    <section class="panel map-panel">
      <div class="panel-head"><span>◉</span><div class="panel-title">Carte d’intérêt</div><div class="spacer"></div><div class="map-toolbar"><button id="refreshMap">Vue dynamique</button></div></div>
      <div class="map-wrap" id="livingMap">
        <canvas id="nebulaFx" aria-hidden="true"></canvas>
        <canvas id="particleFx" aria-hidden="true"></canvas>
        <div class="aurora-vignette" aria-hidden="true"></div>
        <svg id="attentionMap" viewBox="0 0 900 650" aria-label="Carte d'intérêt AURA">
          <defs>
            <radialGradient id="coreGrad"><stop offset="0" stop-color="#ffffff"/><stop offset=".12" stop-color="#d9c9ff"/><stop offset=".34" stop-color="#8d65ff"/><stop offset=".68" stop-color="#2d1b5e"/><stop offset="1" stop-color="#080b15"/></radialGradient>
            <filter id="glow"><feGaussianBlur stdDeviation="7" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            <filter id="soft"><feGaussianBlur stdDeviation="2.4"/></filter>
            <filter id="coreBloom" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="13" result="blur1"/><feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur2"/><feMerge><feMergeNode in="blur1"/><feMergeNode in="blur2"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            <radialGradient id="coreAura"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset=".14" stop-color="#e6d9ff" stop-opacity=".92"/><stop offset=".34" stop-color="#a16fff" stop-opacity=".92"/><stop offset=".62" stop-color="#5e36d6" stop-opacity=".75"/><stop offset="1" stop-color="#17112d" stop-opacity=".1"/></radialGradient>
          </defs>
          <g opacity=".28" stroke="#8b7fd0" fill="none">
            <ellipse cx="450" cy="325" rx="330" ry="198" stroke-dasharray="3 9"/>
            <ellipse cx="450" cy="325" rx="270" ry="250" transform="rotate(-22 450 325)" stroke-dasharray="2 11"/>
            <ellipse cx="450" cy="325" rx="360" ry="118" transform="rotate(18 450 325)" stroke-dasharray="3 12"/>
          </g>
          <g id="flowLinks"></g>
          <g id="energyPulses"></g>
          <g id="interestNodes"></g>
          <g id="core" filter="url(#coreBloom)">
            <circle cx="450" cy="325" r="118" fill="#8f6bff" opacity=".055"/>
            <circle cx="450" cy="325" r="101" fill="none" stroke="#8f6bff" opacity=".22" stroke-width="1.2" stroke-dasharray="2 11"/>
            <circle cx="450" cy="325" r="86" fill="none" stroke="#68dff1" opacity=".16" stroke-width=".9" stroke-dasharray="1 13"/>
            <circle cx="450" cy="325" r="74" fill="url(#coreAura)" stroke="rgba(255,255,255,.48)" stroke-width="1.7"/>
            <circle cx="450" cy="325" r="54" fill="none" stroke="rgba(225,211,255,.34)" stroke-width="1"/>
            <circle cx="429" cy="302" r="8" fill="#ffffff" opacity=".48" filter="url(#soft)"/>
            <text x="450" y="331" fill="#f8f4ff" font-size="22" text-anchor="middle" letter-spacing="5">AURA</text>
          </g>
        </svg>
        <div class="organism-hud"><i id="organismDot"></i><span id="organismMood">organisme en réveil</span></div>
        <div class="map-foot"><strong id="focusLabel" style="color:#dcd4ff">Focus :</strong> <span id="focusStatement">connexion privée requise</span></div>
        <div class="legend">
          <div class="legend-row"><span class="legend-line"></span>Flux d’attention actuel</div>
          <div class="legend-row"><span class="legend-line rise"></span>Intérêt croissant</div>
          <div class="legend-row"><span class="legend-line stable"></span>Intérêt stable</div>
        </div>
      </div>
    </section>

    <aside class="right-stack">
      <section class="panel">
        <div class="panel-head"><span>◉</span><div class="panel-title">Pensée dominante</div></div>
        <div class="panel-body"><div class="thought-card" id="dominantThought">Connexion privée requise pour afficher la pensée dominante.</div></div>
      </section>
      <section class="panel">
        <div class="panel-head"><span>▣</span><div class="panel-title">Travail en cours</div><div class="spacer"></div><div class="panel-meta" id="workMeta">—</div></div>
        <div class="panel-body"><div class="work-list" id="workList"><div class="empty">Accès privé requis.</div></div></div>
      </section>
      <section class="panel">
        <div class="panel-head"><span>◎</span><div class="panel-title">Intentions actives</div></div>
        <div class="panel-body"><div class="intent-list" id="intentList"><div class="empty">Accès privé requis.</div></div></div>
      </section>
    </aside>

    <section class="bottom-grid">
    <section class="panel">
      <div class="panel-head"><span>◴</span><div class="panel-title">Ce qu’elle fait maintenant</div><div class="spacer"></div><div class="panel-meta" id="activityLive">En temps réel</div></div>
      <div class="panel-body"><div class="activity-list" id="activityList"><div class="empty">Accès privé requis.</div></div></div>
    </section>
    <section class="panel">
      <div class="panel-head"><span>✦</span><div class="panel-title">Prochaine action probable</div></div>
      <div class="panel-body">
        <div class="next-action"><div class="next-orb">→</div><div class="next-copy" id="nextAction">Aucune action calculée.</div></div>
        <div class="confidence">Confiance estimée : <span id="confidenceValue">—</span></div>
        <div class="progress"><span id="confidenceBar" style="width:0%"></span></div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head"><span>◫</span><div class="panel-title">Mémoire et leçons</div><div class="spacer"></div><div class="panel-meta" id="memoryMeta">—</div></div>
      <div class="panel-body"><div class="memory-list" id="memoryList"><div class="empty">Accès privé requis.</div></div></div>
    </section>
  </section>
  </main>
</div>

<div class="auth-drawer" id="authDrawer">
  <div class="auth-box">
    <h3>Accès privé AURA</h3>
    <p>Le token reste dans <code>sessionStorage</code> de cet onglet. Sur mobile, un nouvel onglet ou une fermeture du navigateur peut nécessiter de le reconnecter. Il permet d’afficher intentions, pensée dominante, mémoire, activité et carte d’intérêt complète.</p>
    <div class="auth-row"><input id="token" type="password" autocomplete="off" placeholder="AURA_CLOUD_TOKEN"><button class="primary" id="saveToken">Connecter</button></div>
    <div style="display:flex;gap:8px;margin-top:10px"><button class="secondary" id="logoutToken">Déconnecter</button><button class="secondary" id="closeAuth">Fermer</button></div>
  </div>
</div>

<script>
const $ = function(id){ return document.getElementById(id); };
let token = sessionStorage.getItem('aura_token') || '';
let lastSoul = null;
let lastAttention = null;
let livingScene = null;
$('token').value = token;

function escapeHtml(value){
  return String(value == null ? '' : value).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function headers(json){
  const h={};
  if(json) h['Content-Type']='application/json';
  if(token) h.Authorization='Bearer '+token;
  return h;
}
async function api(path,options){
  options=options||{};
  const response=await fetch(path,Object.assign({},options,{headers:Object.assign({},headers(Boolean(options.body)),options.headers||{})}));
  const text=await response.text();
  let data={};
  try{data=text?JSON.parse(text):{};}catch(_){data={error:text||'Réponse invalide'};}
  if(!response.ok){
    const err=new Error(data.error||('Erreur '+response.status)); err.status=response.status; err.data=data; throw err;
  }
  return data;
}
function pct(v){return Math.max(0,Math.min(100,Math.round((Number(v)||0)*100)));}
function metric(id,value,active=true){
  if(!active){$('metric-'+id).textContent='—';$('ring-'+id).style.setProperty('--pct',0);$('trend-'+id).textContent='en attente du noyau';return;}
  const p=pct(value);
  $('metric-'+id).textContent=p+'%';
  $('ring-'+id).style.setProperty('--pct',p);
  if(lastSoul && lastSoul[id] != null){
    const delta=(Number(value)||0)-Number(lastSoul[id]||0);
    $('trend-'+id).textContent=delta>.015?'↗ en hausse':delta<-.015?'↘ en baisse':'• stable';
  }
}
function setLive(ok,text){$('liveDot').className='live-dot '+(ok?'good':'bad');$('liveText').textContent=text;}
function setPrivateState(connected){
  $('authBtn').textContent=connected?'Privé · connecté':'Privé · hors connexion';
  $('authBtn').title=connected?'Accès privé actif':'Appuyer pour reconnecter AURA';
}
function fmtTime(value){
  if(!value) return '—';
  const d=new Date(value); if(Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
}
function fmtDate(value){
  if(!value) return '—';
  const d=new Date(value); if(Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'});
}
function updateClock(){
  const d=new Date();
  $('clockDate').textContent=d.toLocaleDateString('fr-FR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
  $('clockTime').textContent=d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
}
function priorityLabel(v){
  const p=Number(v)||0;
  return p>=.72?['Haute','high']:p>=.48?['Moyenne','medium']:['Basse',''];
}
function renderIntentions(rows){
  if(!rows || !rows.length){$('intentList').innerHTML='<div class="empty">Aucune intention active.</div>';return;}
  $('intentList').innerHTML=rows.slice(0,4).map(function(r,i){
    const tag=priorityLabel(r.priority);
    return '<div class="intent-row"><div class="intent-top"><span style="font-size:9px;color:#7d88a1">'+(i+1)+'</span><div class="intent-title">'+escapeHtml(r.statement)+'</div><span class="badge '+tag[1]+'">'+tag[0]+'</span></div></div>';
  }).join('');
}
function renderWork(rows){
  if(!rows || !rows.length){$('workList').innerHTML='<div class="empty">Aucun travail déclaré.</div>';return;}
  $('workMeta').textContent=rows.length+' actifs';
  $('workList').innerHTML=rows.slice(0,5).map(function(r){
    const p=pct(r.priority);
    return '<div class="work-row"><div class="work-top"><div class="work-title">'+escapeHtml(r.title)+'</div><span class="badge">'+escapeHtml(r.kind)+'</span></div><div class="progress"><span style="width:'+p+'%"></span></div></div>';
  }).join('');
}
function renderLessons(rows){
  if(!rows || !rows.length){$('memoryList').innerHTML='<div class="empty">Aucune leçon enregistrée.</div>';return;}
  $('memoryMeta').textContent=rows.length+' récentes';
  $('memoryList').innerHTML=rows.slice(0,5).map(function(r){
    return '<div class="memory-row"><div class="memory-date">'+escapeHtml(fmtDate(r.updated_at))+'</div><div class="memory-text">'+escapeHtml(r.content)+'</div></div>';
  }).join('');
}
function renderActivity(rows){
  if(!rows || !rows.length){$('activityList').innerHTML='<div class="empty">Aucune activité récente.</div>';return;}
  $('activityList').innerHTML=rows.slice(0,7).map(function(r){
    return '<div class="activity-row"><div class="activity-time">'+escapeHtml(fmtTime(r.created_at))+'</div><div class="activity-title">'+escapeHtml(r.title||r.content||r.kind)+'</div><div class="activity-kind">'+escapeHtml(r.kind||'activité')+'</div></div>';
  }).join('');
}
const nodeLayout={
  stability:{x:205,y:190,color:'#60e6ad'},
  learning:{x:455,y:112,color:'#a478ff'},
  studio:{x:700,y:190,color:'#6da7ff'},
  horizon:{x:755,y:355,color:'#ffc96a'},
  automation:{x:650,y:500,color:'#59e0ef'},
  memory:{x:450,y:535,color:'#ffc96a'},
  evolution:{x:250,y:500,color:'#f178d6'},
  watch:{x:145,y:355,color:'#6da7ff'}
};
function renderMap(data){
  if(!data || !Array.isArray(data.nodes)) return;
  lastAttention=data;
  $('focusStatement').textContent=data.focus_statement||'Aucune intention dominante.';
  const svgNS='http://www.w3.org/2000/svg';
  const links=$('flowLinks'); const nodes=$('interestNodes'); const pulses=$('energyPulses');
  links.innerHTML=''; nodes.innerHTML=''; pulses.innerHTML='';

  const visibleNodes=data.nodes.filter(function(n){return Boolean(nodeLayout[n.id]);});
  visibleNodes.forEach(function(n,i){
    [1,2].forEach(function(offset){
      const other=visibleNodes[(i+offset)%visibleNodes.length];
      if(!other || other===n) return;
      if(offset===2 && i%2) return;
      const a=nodeLayout[n.id]; const b=nodeLayout[other.id];
      const web=document.createElementNS(svgNS,'path');
      const bend=(i%2===0?1:-1)*(18+offset*8);
      const mx=(a.x+b.x)/2+(b.y-a.y)*.035*bend/8;
      const my=(a.y+b.y)/2-(b.x-a.x)*.035*bend/8;
      web.setAttribute('d','M '+a.x+' '+a.y+' Q '+mx+' '+my+' '+b.x+' '+b.y);
      web.setAttribute('class','web-link');
      web.setAttribute('fill','none');
      web.setAttribute('stroke',offset===1?a.color:'#7b78c8');
      web.setAttribute('stroke-width',offset===1?'1.15':'.75');
      web.setAttribute('opacity',offset===1?'.16':'.085');
      web.setAttribute('stroke-dasharray',offset===1?'2 8':'1 12');
      links.appendChild(web);
    });
  });

  data.nodes.forEach(function(n){
    const pos=nodeLayout[n.id]; if(!pos) return;
    const intensity=Math.max(.18,Math.min(1,Number(n.score)||0));
    const line=document.createElementNS(svgNS,'path');
    const midX=(450+pos.x)/2+(pos.y-325)*.09;
    const midY=(325+pos.y)/2-(pos.x-450)*.07;
    line.setAttribute('d','M 450 325 Q '+midX+' '+midY+' '+pos.x+' '+pos.y);
    line.setAttribute('class','core-link');
    line.setAttribute('fill','none'); line.setAttribute('stroke',pos.color);
    line.setAttribute('stroke-width',String(1.2+intensity*3.8));
    line.setAttribute('opacity',String(.16+intensity*.54));
    line.setAttribute('stroke-dasharray',n.dominant?'0':(n.trend==='rising'?'7 8':'3 11'));
    if(n.dominant) line.setAttribute('filter','url(#glow)');
    links.appendChild(line);

    const pulse=document.createElementNS(svgNS,'path');
    pulse.setAttribute('class','energy-pulse');
    pulse.setAttribute('d',line.getAttribute('d'));
    pulse.setAttribute('stroke',pos.color);
    pulse.setAttribute('stroke-width',String(1.1+intensity*1.5));
    pulse.setAttribute('stroke-dasharray',n.dominant?'3 17':'2 22');
    pulse.setAttribute('opacity',String(.40+intensity*.46));
    pulse.style.animationDuration=String(5.8-intensity*2.2)+'s';
    pulse.style.animationDelay=String(-intensity*2.7)+'s';
    $('energyPulses').appendChild(pulse);

    const g=document.createElementNS(svgNS,'g');
    const scale=.78+intensity*.58;
    g.setAttribute('class','aura-node');
    g.setAttribute('data-node-id',n.id);
    g.setAttribute('data-base-x',String(pos.x));
    g.setAttribute('data-base-y',String(pos.y));
    g.setAttribute('data-scale',String(scale));
    g.setAttribute('data-phase',String((n.id.length*0.73)+(intensity*2.4)));
    g.setAttribute('transform','translate('+pos.x+' '+pos.y+') scale('+scale+')');
    const halo=document.createElementNS(svgNS,'circle'); halo.setAttribute('r',String(35+intensity*16)); halo.setAttribute('fill',pos.color); halo.setAttribute('opacity',String(.035+intensity*.07)); halo.setAttribute('filter','url(#soft)');
    const orbit=document.createElementNS(svgNS,'ellipse'); orbit.setAttribute('rx','43'); orbit.setAttribute('ry','18'); orbit.setAttribute('fill','none'); orbit.setAttribute('stroke',pos.color); orbit.setAttribute('opacity',String(.18+intensity*.34)); orbit.setAttribute('transform','rotate('+(n.id.length*13%60-30)+')');
    const circle=document.createElementNS(svgNS,'circle'); circle.setAttribute('r','24'); circle.setAttribute('fill',pos.color); circle.setAttribute('fill-opacity',String(.17+intensity*.25)); circle.setAttribute('stroke',pos.color); circle.setAttribute('stroke-width',n.dominant?'2.2':'1.2'); circle.setAttribute('filter','url(#glow)');
    const core=document.createElementNS(svgNS,'circle'); core.setAttribute('r','8'); core.setAttribute('fill',pos.color); core.setAttribute('opacity',String(.55+intensity*.45));
    g.appendChild(halo);g.appendChild(orbit);g.appendChild(circle);g.appendChild(core);
    nodes.appendChild(g);

    const label=document.createElementNS(svgNS,'text'); label.setAttribute('x',String(pos.x+38)); label.setAttribute('y',String(pos.y-3)); label.setAttribute('fill','#eef2ff'); label.setAttribute('font-size','13'); label.setAttribute('font-weight','600'); label.textContent=n.label; nodes.appendChild(label);
    const sub=document.createElementNS(svgNS,'text'); sub.setAttribute('x',String(pos.x+38)); sub.setAttribute('y',String(pos.y+13)); sub.setAttribute('fill','#77849d'); sub.setAttribute('font-size','9'); sub.textContent=n.subtitle+' · '+Math.round(intensity*100)+'%'; nodes.appendChild(sub);
  });
}
function initLivingAuraScene(){
  if(livingScene) return livingScene;
  const wrap=$('livingMap');
  const nebula=$('nebulaFx');
  const particles=$('particleFx');
  const svg=$('attentionMap');
  if(!wrap||!nebula||!particles||!svg) return null;
  const nctx=nebula.getContext('2d');
  const pctx=particles.getContext('2d');
  const reduceMotion=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene={w:0,h:0,dpr:1,time:0,raf:0,dust:[],sparks:[],running:true,organism:{}};

  function rand(min,max){return min+Math.random()*(max-min);}
  function seed(){
    const mobile=window.innerWidth<820;
    const dustCount=reduceMotion?36:(mobile?92:185);
    const sparkCount=reduceMotion?8:(mobile?18:34);
    scene.dust=Array.from({length:dustCount},function(_,i){
      return {x:Math.random(),y:Math.random(),r:rand(.35,1.55),vx:rand(-.000045,.000045),vy:rand(-.000035,.000035),a:rand(.12,.72),phase:rand(0,Math.PI*2),hue:i%5};
    });
    scene.sparks=Array.from({length:sparkCount},function(){
      return {angle:rand(0,Math.PI*2),radius:rand(.12,.44),speed:rand(.00005,.00016),size:rand(.7,2.2),phase:rand(0,Math.PI*2)};
    });
  }

  function resize(){
    const rect=wrap.getBoundingClientRect();
    scene.w=Math.max(320,Math.floor(rect.width));
    scene.h=Math.max(360,Math.floor(rect.height));
    scene.dpr=Math.min(window.devicePixelRatio||1,1.55);
    [nebula,particles].forEach(function(canvas){
      canvas.width=Math.floor(scene.w*scene.dpr);
      canvas.height=Math.floor(scene.h*scene.dpr);
      canvas.style.width=scene.w+'px';
      canvas.style.height=scene.h+'px';
    });
    nctx.setTransform(scene.dpr,0,0,scene.dpr,0,0);
    pctx.setTransform(scene.dpr,0,0,scene.dpr,0,0);
  }

  function glow(x,y,r,color,alpha){
    const g=nctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,color.replace('ALPHA',String(alpha)));
    g.addColorStop(.28,color.replace('ALPHA',String(alpha*.56)));
    g.addColorStop(.68,color.replace('ALPHA',String(alpha*.13)));
    g.addColorStop(1,color.replace('ALPHA','0'));
    nctx.fillStyle=g;
    nctx.fillRect(x-r,y-r,r*2,r*2);
  }

  function drawNebula(t){
    nctx.clearRect(0,0,scene.w,scene.h);
    nctx.globalCompositeOperation='screen';
    const o=scene.organism||{};
    const tension=Number(o.tension||0);
    const curiosity=Number(o.curiosite||0);
    const stability=Number(o.stabilite||0);
    const dream=Number(o.pression_de_reve||0);
    const fatigue=Number(o.fatigue_cognitive||0);
    const attachment=Number(o.attachement||0);
    const cx=scene.w*.5, cy=scene.h*.50;
    const tempo=.00042+tension*.00038+(1-fatigue)*.00008;
    const breath=.5+.5*Math.sin(t*tempo);
    glow(cx+Math.sin(t*.00022)*28,cy+Math.cos(t*.00018)*20,Math.max(scene.w,scene.h)*(.28+dream*.06),'rgba(141,84,255,ALPHA)',.14+.10*dream+.055*breath);
    glow(cx-scene.w*.22+Math.sin(t*.00013)*55,cy-scene.h*.18,scene.w*.24,'rgba(55,235,210,ALPHA)',.055+.12*curiosity);
    glow(cx+scene.w*.25,cy-scene.h*.16+Math.cos(t*.00017)*34,scene.w*.25,'rgba(76,135,255,ALPHA)',.055+.095*stability);
    glow(cx+scene.w*.29+Math.cos(t*.00011)*34,cy+scene.h*.19,scene.w*.20,'rgba(255,185,82,ALPHA)',.035+.09*attachment);
    glow(cx-scene.w*.25,cy+scene.h*.21+Math.sin(t*.00015)*30,scene.w*.20,'rgba(245,86,196,ALPHA)',.035+.15*tension);
    glow(cx,cy,Math.min(scene.w,scene.h)*(.15+.08*stability),'rgba(205,185,255,ALPHA)',.05+.08*(1-fatigue));
    nctx.globalCompositeOperation='source-over';
  }

  function drawParticles(t){
    pctx.clearRect(0,0,scene.w,scene.h);
    pctx.globalCompositeOperation='screen';
    const colors=['207,219,255','157,119,255','102,227,239','255,201,106','96,230,173'];
    scene.dust.forEach(function(d){
      const o=scene.organism||{};const motion=.55+Number(o.curiosite||0)*.75-Number(o.fatigue_cognitive||0)*.25;
      if(!reduceMotion){d.x+=d.vx*motion;d.y+=d.vy*motion;}
      if(d.x<-.02)d.x=1.02;if(d.x>1.02)d.x=-.02;if(d.y<-.02)d.y=1.02;if(d.y>1.02)d.y=-.02;
      const pulse=.46+.54*Math.sin(t*.00125+d.phase)*.5+.27;
      const a=Math.max(.04,d.a*pulse);
      pctx.beginPath();
      pctx.fillStyle='rgba('+colors[d.hue]+','+a+')';
      pctx.arc(d.x*scene.w,d.y*scene.h,d.r*(.7+pulse*.65),0,Math.PI*2);
      pctx.fill();
    });

    const cx=scene.w*.5,cy=scene.h*.50;
    scene.sparks.forEach(function(s){
      const o=scene.organism||{};const orbit=.65+Number(o.curiosite||0)*.85+Number(o.tension||0)*.35;
      if(!reduceMotion)s.angle+=s.speed*16.6*orbit;
      const wobble=1+Math.sin(t*.0008+s.phase)*.07;
      const rr=Math.min(scene.w,scene.h)*s.radius*wobble;
      const x=cx+Math.cos(s.angle)*rr;
      const y=cy+Math.sin(s.angle)*rr*.66;
      const a=.20+.56*(.5+.5*Math.sin(t*.002+s.phase));
      const g=pctx.createRadialGradient(x,y,0,x,y,10+s.size*4);
      g.addColorStop(0,'rgba(226,217,255,'+a+')');
      g.addColorStop(.22,'rgba(148,102,255,'+(a*.68)+')');
      g.addColorStop(1,'rgba(148,102,255,0)');
      pctx.fillStyle=g;pctx.fillRect(x-18,y-18,36,36);
    });
    pctx.globalCompositeOperation='source-over';
  }

  function animateSvg(t){
    const core=$('core');
    if(core){
      const o=scene.organism||{};
      const tension=Number(o.tension||0), stability=Number(o.stabilite||0), fatigue=Number(o.fatigue_cognitive||0);
      const amp=.026+tension*.055+(1-stability)*.018;
      const speed=.0009+tension*.0012+(1-fatigue)*.00025;
      const pulse=reduceMotion?1:(1+Math.sin(t*speed)*amp+Math.sin(t*.00041)*.012);
      const rot=reduceMotion?0:Math.sin(t*(.00011+tension*.00012))*(1.2+tension*4.2);
      core.setAttribute('transform','translate(450 325) rotate('+rot+') scale('+pulse+') translate(-450 -325)');
    }
    document.querySelectorAll('.aura-node').forEach(function(node,index){
      const bx=Number(node.getAttribute('data-base-x'))||0;
      const by=Number(node.getAttribute('data-base-y'))||0;
      const scale=Number(node.getAttribute('data-scale'))||1;
      const phase=Number(node.getAttribute('data-phase'))||index;
      const dx=reduceMotion?0:Math.sin(t*.00055+phase)*4.5;
      const dy=reduceMotion?0:Math.cos(t*.00047+phase*1.31)*3.8;
      const breathe=reduceMotion?1:(1+Math.sin(t*.0011+phase)*.045);
      node.setAttribute('transform','translate('+(bx+dx)+' '+(by+dy)+') scale('+(scale*breathe)+')');
      node.style.opacity=String(.88+.12*(.5+.5*Math.sin(t*.001+phase)));
    });
  }

  function frame(t){
    if(!scene.running)return;
    scene.time=t;
    drawNebula(t);
    drawParticles(t);
    animateSvg(t);
    scene.raf=requestAnimationFrame(frame);
  }

  seed();resize();
  window.addEventListener('resize',resize,{passive:true});
  if(window.ResizeObserver){new ResizeObserver(resize).observe(wrap);}
  document.addEventListener('visibilitychange',function(){
    scene.running=!document.hidden;
    if(scene.running){cancelAnimationFrame(scene.raf);scene.raf=requestAnimationFrame(frame);}
  });
  scene.raf=requestAnimationFrame(frame);
  livingScene=scene;
  return scene;
}

function renderNext(work,attention){
  const item=(work&&work[0])||null;
  const node=attention&&attention.nodes?attention.nodes.find(function(n){return n.dominant;}):null;
  if(item){$('nextAction').textContent=item.title;const p=pct(item.priority||.6);$('confidenceValue').textContent=p+'%';$('confidenceBar').style.width=p+'%';return;}
  if(node){$('nextAction').textContent='Poursuivre le focus sur '+node.label+'.';const p=pct(node.score);$('confidenceValue').textContent=p+'%';$('confidenceBar').style.width=p+'%';return;}
  $('nextAction').textContent='Observer le système avant de prioriser une nouvelle action.';$('confidenceValue').textContent='—';$('confidenceBar').style.width='0%';
}
async function refresh(){
  try{
    const boot=await api('/api/bootstrap/status');
    setPrivateState(Boolean(token));
    $('setupBanner').classList.toggle('show',!boot.runtime_ready);
    if(!boot.runtime_ready){
      const issues=Array.isArray(boot.issues)?boot.issues:[];
      $('setupIssues').innerHTML=issues.length?issues.map(function(i){return '<li>'+escapeHtml(i.message||i.code||String(i))+'</li>';}).join(''):'<li>Base MySQL ou secrets de production à vérifier.</li>';
      const startup=String(boot.startup_error||'').trim();
      $('setupSummary').textContent=startup
        ? 'Le serveur est en ligne mais le noyau redémarre automatiquement : '+startup
        : 'L’interface est en ligne, mais le noyau attend encore MySQL. Reconnexion automatique en cours.';
    }
    const ks=await api('/api/kernel/status');
    const soul=await api('/api/kernel/soul');
    const organism=(ks&&ks.organism)||(soul&&soul.organism)||{};
    if(livingScene)livingScene.organism=organism;
    $('organismMood').textContent=(organism.mood||'calme')+' · '+((organism.habitat&&organism.habitat.last_activity_label)||organism.active_intention||'présence');
    const mood=String(organism.mood||'calme');
    const moodColors={calme:'#9f78ff',claire:'#6da7ff',curieuse:'#59e0ef',lumineuse:'#ffc96a',tendue:'#ff758d',fatiguée:'#9a8cae',fragile:'#d18cff','préoccupée':'#ff9c8c'};
    $('organismDot').style.background=moodColors[mood]||'#9f78ff';
    $('organismDot').style.boxShadow='0 0 13px '+(moodColors[mood]||'#9f78ff');
    setLive(true,boot.runtime_ready?'En ligne · '+mood:'En ligne · configuration');
    $('chatState').textContent=boot.runtime_ready?'Noyau actif · '+mood:'Diagnostic';
    metric('energy',soul.energy,boot.runtime_ready);metric('curiosity',soul.curiosity,boot.runtime_ready);metric('pressure',soul.pressure,boot.runtime_ready);metric('continuity',soul.continuity,boot.runtime_ready);metric('introspection',soul.introspection,boot.runtime_ready);metric('reactivity',soul.reactivity,boot.runtime_ready);
    if(token){
      $('dominantThought').textContent=(soul.dominant_thought||'Aucune pensée dominante.')+'\n\nÉtat : '+(organism.mood||'calme')+' · intention organique : '+(organism.active_intention||'observer');
    }else{
      $('dominantThought').textContent='Connexion privée requise pour afficher la pensée dominante.';
    }
    lastSoul=Object.assign({},soul);
    if(token && boot.runtime_ready){
      const results=await Promise.all([
        api('/api/kernel/intentions?limit=5'),
        api('/api/kernel/lessons?limit=5'),
        api('/api/kernel/activity?limit=8'),
        api('/api/kernel/work?limit=5'),
        api('/api/kernel/attention')
      ]);
      renderIntentions(results[0]);renderLessons(results[1]);renderActivity(results[2]);renderWork(results[3]);renderMap(results[4]);renderNext(results[3],results[4]);
    }else{
      $('intentList').innerHTML='<div class="empty">Connecte l’accès privé.</div>';
      $('memoryList').innerHTML='<div class="empty">Connecte l’accès privé.</div>';
      $('activityList').innerHTML='<div class="empty">Connecte l’accès privé.</div>';
      $('workList').innerHTML='<div class="empty">Connecte l’accès privé.</div>';
      renderNext([],null);
    }
  }catch(error){
    if(error && error.status===401 && token){
      token='';
      $('token').value='';
      sessionStorage.removeItem('aura_token');
      setPrivateState(false);
      $('chatState').textContent='Accès privé expiré · reconnecte le token';
      $('authDrawer').classList.add('open');
      return;
    }
    setLive(false,'Indisponible');
    $('chatState').textContent=error.message;
  }
}
async function speakAura(text){
  if(!token||!text)return;
  try{
    const out=await api('/api/voice/speak',{
      method:'POST',
      body:JSON.stringify({text:text,context:'aura-cloud-chat',rate:1,pitch:1,volume:1})
    });
    if(!out||!out.audio_base64)return;
    const raw=atob(out.audio_base64);
    const bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    const blob=new Blob([bytes],{type:out.mime_type||'audio/wav'});
    const url=URL.createObjectURL(blob);
    const audio=new Audio(url);
    audio.onplay=function(){document.body.classList.add('aura-speaking');};
    const stop=function(){document.body.classList.remove('aura-speaking');URL.revokeObjectURL(url);};
    audio.onended=stop;audio.onerror=stop;
    await audio.play();
  }catch(error){
    console.debug('Voix AURA locale indisponible',error);
  }
}
async function sendMessage(text){
  text=(text||'').trim();if(!text)return;
  $('messages').insertAdjacentHTML('beforeend','<div class="msg user"><span class="who">VOUS</span>'+escapeHtml(text)+'</div>');
  $('message').value='';
  $('messages').scrollTop=$('messages').scrollHeight;
  try{
    const out=await api('/api/chat',{method:'POST',body:JSON.stringify({text:text,author:'Utilisateur'})});
    $('messages').insertAdjacentHTML('beforeend','<div class="msg aura"><span class="who">AURA</span>'+escapeHtml(out.answer||'')+'</div>');
    $('messages').scrollTop=$('messages').scrollHeight;
    speakAura(out.answer||'');
    refresh();
  }catch(error){
    $('messages').insertAdjacentHTML('beforeend','<div class="msg aura"><span class="who">AURA</span>Je ne peux pas répondre pour le moment : '+escapeHtml(error.message)+'</div>');
  }
}
$('send').onclick=function(){sendMessage($('message').value);};
$('message').addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage($('message').value);}});
document.querySelectorAll('.quick button').forEach(function(btn){btn.onclick=function(){sendMessage(btn.getAttribute('data-prompt'));};});
$('authBtn').onclick=function(){$('authDrawer').classList.add('open');};
$('closeAuth').onclick=function(){$('authDrawer').classList.remove('open');};
$('authDrawer').addEventListener('click',function(e){if(e.target===$('authDrawer'))$('authDrawer').classList.remove('open');});
$('saveToken').onclick=function(){token=$('token').value.trim();if(token)sessionStorage.setItem('aura_token',token);else sessionStorage.removeItem('aura_token');setPrivateState(Boolean(token));$('authDrawer').classList.remove('open');refresh();};
$('logoutToken').onclick=function(){token='';$('token').value='';sessionStorage.removeItem('aura_token');setPrivateState(false);$('authDrawer').classList.remove('open');refresh();};
$('refreshMap').onclick=refresh;
$('modeBtn').onclick=function(){$('authDrawer').classList.add('open');};
$('voiceBtn').onclick=function(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){$('message').placeholder='Reconnaissance vocale non disponible sur ce navigateur.';return;}
  const rec=new SR();rec.lang='fr-FR';rec.interimResults=false;rec.maxAlternatives=1;
  rec.onresult=function(e){$('message').value=e.results[0][0].transcript;};
  rec.start();
};
updateClock();setPrivateState(Boolean(token));initLivingAuraScene();setInterval(updateClock,1000);refresh();setInterval(refresh,8000);
</script>
</body>
</html>`;
