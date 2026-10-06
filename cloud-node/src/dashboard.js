import { DASHBOARD_SCRIPT } from './dashboard-runtime.js';

export const DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#090807">
<title>AURA — Company OS</title>
<style>
:root{
  color-scheme:dark;
  --bg:#090807;--bg2:#0f0d0d;--panel:rgba(18,16,17,.82);--panel2:rgba(25,21,23,.74);
  --glass:rgba(255,255,255,.035);--line:rgba(255,236,211,.12);--line2:rgba(255,255,255,.065);
  --text:#f8f4ef;--muted:#a59a96;--muted2:#746a68;
  --gold:#ffbf68;--gold2:#ff8f45;--violet:#9b6cff;--pink:#ec5fa9;--green:#5de0aa;--red:#ff6d78;--cream:#f7e4cf;
  --shadow:0 28px 90px rgba(0,0,0,.42);
}
*{box-sizing:border-box}.sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body{
  min-height:100vh;overflow-x:hidden;-webkit-font-smoothing:antialiased;
  background:
    radial-gradient(900px 580px at 50% -10%,rgba(255,154,77,.09),transparent 67%),
    radial-gradient(850px 620px at 18% 38%,rgba(153,90,255,.06),transparent 72%),
    radial-gradient(780px 560px at 88% 55%,rgba(236,95,169,.045),transparent 72%),
    linear-gradient(180deg,#090807 0%,#060606 100%);
}
body::before{
  content:"";position:fixed;inset:0;pointer-events:none;opacity:.18;
  background-image:
    radial-gradient(circle at 15% 22%,rgba(255,214,170,.75) 0 1px,transparent 1.5px),
    radial-gradient(circle at 76% 33%,rgba(194,157,255,.6) 0 1px,transparent 1.4px),
    radial-gradient(circle at 48% 72%,rgba(255,126,177,.5) 0 1px,transparent 1.5px);
  background-size:220px 220px,310px 310px,370px 370px;
}
button,textarea{font:inherit}
button{cursor:pointer}
::selection{background:rgba(255,174,98,.25)}
.shell{max-width:1900px;margin:0 auto;padding:14px 16px 18px}
.topbar{
  min-height:68px;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:18px;
  border:1px solid rgba(255,236,211,.08);border-radius:19px;padding:10px 13px 10px 14px;
  background:linear-gradient(180deg,rgba(17,15,15,.86),rgba(10,9,9,.68));backdrop-filter:blur(24px);
  box-shadow:inset 0 1px rgba(255,255,255,.035),0 16px 40px rgba(0,0,0,.22);position:sticky;top:10px;z-index:25
}
.brand{display:flex;align-items:center;gap:12px;min-width:210px}
.brand-orb{width:38px;height:38px;border-radius:50%;position:relative;flex:0 0 auto;
  background:radial-gradient(circle at 38% 34%,#fff 0 7%,#ffe3be 16%,#ffb25c 33%,#6b351e 59%,#0c0908 73%);
  box-shadow:0 0 18px rgba(255,166,89,.52),0 0 42px rgba(255,137,63,.2)}
.brand-orb::after{content:"";position:absolute;inset:-5px;border:1px solid rgba(255,198,132,.32);border-radius:50%;box-shadow:inset 0 0 12px rgba(255,181,103,.16)}
.brand-name{font-size:21px;font-weight:680;letter-spacing:.28em;line-height:1}
.brand-sub{font-size:9px;color:#bdafa8;letter-spacing:.24em;margin-top:5px;text-transform:uppercase}
.top-nav{display:flex;align-items:center;justify-content:center;gap:4px}
.top-nav span{padding:9px 12px;border-radius:999px;font-size:10px;color:#8e8582;white-space:nowrap}
.top-nav span.active{color:#fff1e2;background:linear-gradient(135deg,rgba(255,170,94,.15),rgba(255,105,67,.06));border:1px solid rgba(255,183,119,.14)}
.command-box{display:flex;align-items:center;gap:8px;min-width:min(460px,34vw)}
.command-box textarea{
  width:100%;height:42px;min-height:42px;max-height:42px;resize:none;overflow:hidden;
  border:1px solid rgba(255,236,211,.12);border-radius:14px;background:rgba(255,255,255,.035);
  color:#f8f4ef;padding:11px 13px;outline:none;font-size:11px;line-height:18px
}
.command-box textarea:focus{border-color:rgba(255,178,105,.35);box-shadow:0 0 0 3px rgba(255,157,77,.07)}
.command-box button{width:42px;height:42px;border-radius:13px;border:1px solid var(--line);display:grid;place-items:center;color:#f8f4ef;background:rgba(255,255,255,.035)}
.command-box .send{border:0;background:linear-gradient(135deg,#ffba63,#d86b46);color:#170d08;font-weight:900}
.status-row{display:flex;align-items:center;gap:7px;margin:11px 2px 12px;overflow:auto;padding-bottom:1px}
.pill{display:flex;align-items:center;gap:7px;border:1px solid rgba(255,236,211,.09);background:rgba(255,255,255,.025);padding:7px 10px;border-radius:999px;font-size:9px;color:#afa39e;white-space:nowrap}
.build-pill{color:#ffe1bd;border-color:rgba(255,186,111,.2);background:rgba(255,173,88,.055);font-weight:700}
.live-dot{width:6px;height:6px;border-radius:50%;background:var(--gold);box-shadow:0 0 12px currentColor}.live-dot.good{background:var(--green)}.live-dot.bad{background:var(--red)}
.clock{margin-left:auto;display:flex;gap:7px;align-items:center;color:#8d817d;font-size:9px}.clock .time{color:#efe5df;font-size:11px;font-weight:700}
.mode-btn{border:1px solid rgba(255,187,118,.16);background:rgba(255,168,89,.06);color:#eecaa8;border-radius:999px;padding:7px 10px;font-size:9px}
.setup-banner{display:none;margin:0 0 12px;border:1px solid rgba(255,191,104,.25);background:rgba(255,179,88,.07);border-radius:15px;padding:11px 13px;color:#ead4bd;font-size:10px;line-height:1.5}.setup-banner.show{display:block}.setup-title{font-size:11px;font-weight:800;color:#ffc984}.setup-list{margin:6px 0 0;padding-left:18px}
.telemetry-rail{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:10px}
.metric{position:relative;min-height:55px;border:1px solid rgba(255,236,211,.075);border-radius:13px;background:rgba(255,255,255,.022);display:flex;align-items:center;gap:9px;padding:8px 10px;overflow:hidden}
.metric::after{content:"";position:absolute;width:70px;height:70px;border-radius:50%;right:-25px;bottom:-40px;background:radial-gradient(circle,var(--metric-color,#ffbf68),transparent 68%);opacity:.08}
.ring{width:33px;height:33px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--metric-color,#ffbf68) calc(var(--pct,0)*1%),rgba(255,255,255,.065) 0);position:relative}
.ring::before{content:"";position:absolute;inset:4px;border-radius:50%;background:#0d0c0c}.ring span{position:relative;font-size:11px}
.metric-label{font-size:8px;color:#867b77;text-transform:uppercase;letter-spacing:.08em}.metric-value{font-size:14px;font-weight:750;margin-top:2px}.metric-trend{display:none}
.dashboard{display:grid;grid-template-columns:294px minmax(620px,1fr) 330px;gap:10px;align-items:stretch}
.left-col,.right-col{display:grid;gap:10px;align-content:start}
.panel{position:relative;border:1px solid rgba(255,236,211,.1);border-radius:18px;background:linear-gradient(180deg,rgba(20,18,18,.88),rgba(11,10,10,.84));box-shadow:inset 0 1px rgba(255,255,255,.035),0 18px 50px rgba(0,0,0,.24);overflow:hidden;backdrop-filter:blur(24px)}
.panel::before{content:"";position:absolute;left:7%;right:7%;top:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,205,157,.14),transparent);pointer-events:none}
.panel-head{display:flex;align-items:center;gap:8px;min-height:43px;padding:11px 13px;border-bottom:1px solid rgba(255,255,255,.045)}
.panel-title{font-size:12px;font-weight:700;color:#eee4de}.panel-meta{font-size:8px;color:#766d69}.spacer{flex:1}
.panel-body{padding:12px}
.emotion-card{min-height:280px}
.emotion-hero{height:88px;position:relative;overflow:hidden;margin:-12px -12px 12px;background:
  radial-gradient(ellipse at 18% 52%,rgba(255,187,94,.32),transparent 25%),
  radial-gradient(ellipse at 72% 45%,rgba(144,89,255,.28),transparent 27%),
  radial-gradient(ellipse at 90% 72%,rgba(236,95,169,.24),transparent 23%)}
.emotion-hero::after{content:"";position:absolute;inset:0;background:
  repeating-radial-gradient(ellipse at 50% 55%,transparent 0 15px,rgba(255,219,184,.06) 16px 17px,transparent 18px 26px);transform:rotate(-8deg) scale(1.2)}
.emotion-main{position:absolute;left:13px;bottom:10px;display:flex;align-items:center;gap:10px;z-index:2}
.emotion-orb{width:38px;height:38px;border-radius:50%;background:radial-gradient(circle at 38% 32%,#fff 0 7%,#ffba68 20%,#7d4633 50%,#12100f 73%);box-shadow:0 0 24px rgba(255,166,89,.35)}
.emotion-kicker{font-size:7px;text-transform:uppercase;letter-spacing:.12em;color:#c2b3ac}.emotion-mood{font-size:19px;font-weight:760;text-transform:capitalize}.emotion-reason{font-size:8px;color:#988d89;margin-top:2px;max-width:205px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.emotion-grid{display:grid;gap:8px}.emotion-cell{display:grid;grid-template-columns:86px 1fr 34px;align-items:center;gap:8px}.emotion-label{display:contents}.emotion-label span{font-size:9px;color:#bdb0aa}.emotion-label strong{grid-column:3;text-align:right;font-size:9px;color:#eee4df}.emotion-bar{grid-column:2;height:4px;border-radius:99px;background:rgba(255,255,255,.06);overflow:hidden}.emotion-bar span{display:block;width:0;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--gold),var(--pink));transition:width .6s ease}
.portfolio-list{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.intent-list,.work-list,.memory-list,.activity-list{display:grid;gap:7px}
.intent-row,.work-row,.memory-row,.activity-row{border:1px solid rgba(255,255,255,.055);border-radius:11px;background:rgba(255,255,255,.022);padding:8px 9px}
.intent-top,.work-top{display:flex;align-items:flex-start;gap:7px}.intent-title,.work-title{font-size:9px;line-height:1.3;flex:1}.badge{font-size:7px;border-radius:99px;padding:3px 6px;border:1px solid rgba(255,236,211,.11);color:#c6b9b3;white-space:nowrap}.badge.online,.badge.healthy{color:#7de8b7;border-color:rgba(93,224,170,.18);background:rgba(93,224,170,.055)}.badge.stale,.badge.waiting{color:#ffc679;border-color:rgba(255,191,104,.2);background:rgba(255,191,104,.055)}.badge.offline,.badge.error,.badge.unhealthy,.badge.degraded{color:#ff8a92;border-color:rgba(255,109,120,.2);background:rgba(255,109,120,.055)}.product-row{min-height:52px}
.memory-date,.activity-time{font-size:7px;color:#6f6662}.memory-text,.activity-title{font-size:9px;line-height:1.35}.activity-kind{font-size:7px;color:#bbada6}
.progress{height:4px;background:rgba(255,255,255,.055);border-radius:99px;overflow:hidden;margin-top:7px}.progress span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--gold),var(--violet))}
.map-panel{min-height:690px;display:flex;flex-direction:column}
.map-wrap{position:relative;isolation:isolate;flex:1;min-height:645px;overflow:hidden;background:
  radial-gradient(circle at 50% 50%,rgba(255,160,77,.115),transparent 17%),
  radial-gradient(circle at 30% 38%,rgba(128,75,255,.10),transparent 27%),
  radial-gradient(circle at 76% 55%,rgba(232,74,164,.085),transparent 27%),
  linear-gradient(180deg,rgba(10,8,8,.6),rgba(4,4,4,.86))}
.map-wrap::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:1;opacity:.22;background-image:
  radial-gradient(circle,rgba(255,228,202,.65) 0 1px,transparent 1.3px),
  radial-gradient(circle,rgba(173,126,255,.6) 0 1px,transparent 1.3px);background-size:52px 52px,87px 87px;mask-image:radial-gradient(circle at center,#000 15%,transparent 88%)}
#nebulaFx,#particleFx{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}#nebulaFx{z-index:0;filter:saturate(1.25) sepia(.08)}#particleFx{z-index:2;mix-blend-mode:screen}
.aurora-vignette{position:absolute;inset:-12%;z-index:2;pointer-events:none;mix-blend-mode:screen;background:
  radial-gradient(circle at 50% 50%,rgba(255,174,87,.15),transparent 20%),
  radial-gradient(circle at 30% 40%,rgba(153,90,255,.10),transparent 31%),
  radial-gradient(circle at 72% 55%,rgba(236,95,169,.085),transparent 30%);animation:auraVignette 7s ease-in-out infinite}
#attentionMap{position:absolute;inset:0;z-index:3;width:100%;height:100%}#core{transform-box:fill-box;transform-origin:center;will-change:transform}.core-link{filter:drop-shadow(0 0 6px currentColor)}.energy-pulse{fill:none;stroke-linecap:round;filter:url(#glow);animation:energyFlow 4.2s linear infinite}.web-link{animation:webDrift 8s linear infinite}.aura-node{transform-box:fill-box;transform-origin:center;will-change:transform}
@keyframes auraVignette{0%,100%{opacity:.7;transform:scale(.98)}50%{opacity:1;transform:scale(1.05)}}@keyframes energyFlow{from{stroke-dashoffset:0}to{stroke-dashoffset:-170}}@keyframes webDrift{from{stroke-dashoffset:0}to{stroke-dashoffset:-90}}
body.aura-speaking .aurora-vignette{animation-duration:.65s}body.aura-speaking #core{filter:url(#coreBloom) drop-shadow(0 0 24px rgba(255,169,84,.75))}
.map-toolbar button{border:1px solid rgba(255,201,150,.12);background:rgba(255,255,255,.025);color:#a99c97;border-radius:99px;padding:6px 9px;font-size:8px}
.map-badge{position:absolute;top:13px;right:13px;z-index:6;border:1px solid rgba(93,224,170,.16);background:rgba(7,18,14,.58);color:#bcefd9;border-radius:11px;padding:8px 10px;font-size:8px;backdrop-filter:blur(12px)}.map-badge b{color:#5de0aa}
.organism-hud{position:absolute;left:14px;top:14px;z-index:6;display:flex;align-items:center;gap:7px;font-size:8px;color:#a59a96;background:rgba(7,7,7,.58);border:1px solid rgba(255,255,255,.06);padding:7px 9px;border-radius:10px;backdrop-filter:blur(10px)}.organism-hud i{width:6px;height:6px;border-radius:50%;background:var(--violet)}
.map-foot{position:absolute;left:14px;bottom:14px;z-index:6;max-width:58%;font-size:9px;color:#9f938f;line-height:1.45;padding:8px 10px;border-radius:10px;background:rgba(7,7,7,.65);border:1px solid rgba(255,255,255,.055);backdrop-filter:blur(10px)}.legend{position:absolute;right:14px;bottom:14px;z-index:6;display:grid;gap:5px;font-size:7px;color:#807571;padding:8px 9px;border-radius:10px;background:rgba(7,7,7,.58);border:1px solid rgba(255,255,255,.055)}.legend-row{display:flex;align-items:center;gap:6px}.legend-line{width:18px;height:2px;border-radius:2px;background:linear-gradient(90deg,var(--gold),var(--pink))}.legend-line.rise{background:linear-gradient(90deg,var(--violet),#fff)}.legend-line.stable{background:rgba(255,255,255,.28)}
.system-card .command-stats{display:grid;grid-template-columns:1fr 1fr;gap:7px}.command-stat{border:1px solid rgba(255,255,255,.055);border-radius:11px;background:rgba(255,255,255,.022);padding:9px}.command-stat span{display:block;font-size:7px;color:#716865;text-transform:uppercase;letter-spacing:.08em}.command-stat strong{display:block;font-size:12px;margin-top:4px}.command-stat strong.good{color:var(--green)}.command-stat strong.warn{color:var(--gold)}
.company-score{display:flex;align-items:center;gap:13px;margin-bottom:10px}.score-ring{width:78px;height:78px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--green) 0 82%,rgba(255,255,255,.06) 82%);position:relative;box-shadow:0 0 25px rgba(93,224,170,.14)}.score-ring::before{content:"";position:absolute;inset:7px;border-radius:50%;background:#0e0d0d;border:1px solid rgba(255,255,255,.05)}.score-ring strong{position:relative;font-size:18px}.score-copy{font-size:9px;color:#8e837f;line-height:1.5}.score-copy b{display:block;color:#d8cec9;font-size:10px}
.next-action{border:1px solid rgba(255,179,98,.10);border-radius:12px;background:linear-gradient(135deg,rgba(255,171,87,.06),rgba(155,92,255,.04));padding:9px;font-size:9px;line-height:1.4;margin-top:9px}.next-orb{display:none}.confidence{font-size:7px;color:#736966;margin-top:7px}
.bottom-proof{display:grid;grid-template-columns:1.65fr 1fr;gap:10px;margin-top:10px}.proof-panel,.chat-panel{min-height:220px}
.proof-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.proof-grid .activity-list{max-height:190px;overflow:auto}
.secondary{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:10px}.secondary .panel{min-height:205px}
.messages{display:flex;flex-direction:column;gap:8px;max-height:160px;overflow:auto}.msg{max-width:88%;font-size:9px;line-height:1.45;padding:8px 9px;border-radius:11px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.025)}.msg.user{align-self:flex-end;background:rgba(255,170,91,.065);border-color:rgba(255,177,103,.1)}.msg.aura{align-self:flex-start}.who{display:block;font-size:7px;color:#786d69;margin-bottom:4px}.msg.aura .who{color:#e6b98f}
.quick{display:none}.chat-body{padding:11px}
.thought-card{border:1px solid rgba(255,184,112,.1);border-radius:11px;background:rgba(255,169,86,.035);padding:9px;font-size:9px;line-height:1.45;color:#d6c5b8;margin-bottom:7px}.empty{padding:12px;text-align:center;border:1px dashed rgba(255,255,255,.07);border-radius:10px;color:#766d69;font-size:8px}
.download-panel{margin-top:10px}.download-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.download-card{display:flex;align-items:center;gap:9px;border:1px solid rgba(255,255,255,.055);border-radius:11px;padding:9px;background:rgba(255,255,255,.018)}.download-icon{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:rgba(255,171,88,.07);color:#f0bf8b}.download-copy{flex:1}.download-copy strong{font-size:9px}.download-copy span{display:block;font-size:7px;color:#776d69;margin-top:2px}.download-btn{text-decoration:none;color:#f4d0aa;font-size:8px;border:1px solid rgba(255,184,112,.14);border-radius:8px;padding:7px 8px}
@media(max-width:1280px){.top-nav{display:none}.command-box{min-width:380px}.dashboard{grid-template-columns:260px minmax(520px,1fr) 290px}.telemetry-rail{grid-template-columns:repeat(3,1fr)}}
@media(max-width:980px){.topbar{grid-template-columns:1fr auto}.command-box{grid-column:1/-1;grid-row:2;min-width:0}.dashboard{grid-template-columns:1fr}.map-panel{order:-1;min-height:580px}.map-wrap{min-height:535px}.left-col,.right-col{grid-template-columns:1fr 1fr}.bottom-proof,.secondary{grid-template-columns:1fr}.telemetry-rail{grid-template-columns:repeat(3,1fr)}}
@media(max-width:680px){.shell{padding:9px}.topbar{top:5px}.brand{min-width:0}.brand-name{font-size:17px}.status-row{margin-top:8px}.telemetry-rail{grid-template-columns:repeat(2,1fr)}.left-col,.right-col{grid-template-columns:1fr}.map-panel{min-height:510px}.map-wrap{min-height:465px}.portfolio-list{grid-template-columns:1fr}.download-grid{grid-template-columns:1fr}.bottom-proof{grid-template-columns:1fr}.secondary{grid-template-columns:1fr}.legend{display:none}.map-foot{max-width:80%}}
@media(max-width:480px){.command-box textarea{font-size:16px}.msg{font-size:15px}.chat-panel{min-height:56svh}.map-panel{min-height:460px}.map-wrap{min-height:415px}.panel-title{font-size:13px}.intent-title,.work-title,.memory-text,.activity-title{font-size:11px}.telemetry-rail{grid-template-columns:1fr 1fr}.status-row{scrollbar-width:none}}
</style>
</head>
<body data-aura-ui="company-os-premium-1">
<div class="shell"><div class="sr-only" aria-hidden="true">Interface de conscience opérationnelle · Carte d’intérêt</div>
  <header class="topbar">
    <div class="brand">
      <div class="brand-orb" aria-hidden="true"></div>
      <div><div class="brand-name">AURA</div><div class="brand-sub">Company OS</div></div>
    </div>
    <nav class="top-nav" aria-label="Navigation">
      <span class="active">Vue d’ensemble</span><span>Intelligence</span><span>Workstreams</span><span>Produits</span><span>Connaissance</span><span>Systèmes</span>
    </nav>
    <div class="command-box">
      <button id="voiceBtn" title="Parler à AURA">◉</button>
      <textarea id="message" rows="1" placeholder="Demander quelque chose à AURA…"></textarea>
      <button class="send" id="send" title="Envoyer">➜</button>
    </div>
  </header>

  <div class="status-row">
    <div class="pill build-pill">AURA · COMPANY OS</div>
    <div class="pill"><span id="liveDot" class="live-dot"></span><span id="liveText">Connexion…</span></div>
    <div class="pill"><span id="voiceDot" class="live-dot"></span><span id="voiceText">Mairaiy…</span></div>
    <div class="pill"><span id="languageDot" class="live-dot"></span><span id="languageText">Dialogue…</span></div>
    <div class="pill"><span id="evolutionDot" class="live-dot"></span><span id="evolutionText">Évolution…</span></div>
    <div class="clock"><span id="clockDate">—</span><span id="clockTime" class="time">—</span></div>
    <button class="mode-btn" id="modeBtn">Actualiser</button>
  </div>

  <section class="setup-banner" id="setupBanner"><div class="setup-title">Configuration AURA requise</div><div id="setupSummary">Le serveur fonctionne, le noyau se prépare.</div><ul class="setup-list" id="setupIssues"></ul></section>

  <section class="telemetry-rail" aria-label="Télémétrie AURA">
    <div class="metric" style="--metric-color:#5de0aa"><div class="ring" id="ring-energy"><span>⚡</span></div><div><div class="metric-label">Énergie</div><div class="metric-value" id="metric-energy">—</div><div class="metric-trend" id="trend-energy"></div></div></div>
    <div class="metric" style="--metric-color:#9b6cff"><div class="ring" id="ring-curiosity"><span>∞</span></div><div><div class="metric-label">Curiosité</div><div class="metric-value" id="metric-curiosity">—</div><div class="metric-trend" id="trend-curiosity"></div></div></div>
    <div class="metric" style="--metric-color:#ec5fa9"><div class="ring" id="ring-pressure"><span>↗</span></div><div><div class="metric-label">Pression</div><div class="metric-value" id="metric-pressure">—</div><div class="metric-trend" id="trend-pressure"></div></div></div>
    <div class="metric" style="--metric-color:#ffbf68"><div class="ring" id="ring-continuity"><span>◫</span></div><div><div class="metric-label">Continuité</div><div class="metric-value" id="metric-continuity">—</div><div class="metric-trend" id="trend-continuity"></div></div></div>
    <div class="metric" style="--metric-color:#f7e4cf"><div class="ring" id="ring-introspection"><span>◉</span></div><div><div class="metric-label">Introspection</div><div class="metric-value" id="metric-introspection">—</div><div class="metric-trend" id="trend-introspection"></div></div></div>
    <div class="metric" style="--metric-color:#ff8f45"><div class="ring" id="ring-reactivity"><span>⌁</span></div><div><div class="metric-label">Réactivité</div><div class="metric-value" id="metric-reactivity">—</div><div class="metric-trend" id="trend-reactivity"></div></div></div>
  </section>

  <main class="dashboard">
    <aside class="left-col">
      <section class="panel emotion-card">
        <div class="panel-head"><div class="panel-title">État émotionnel</div><div class="spacer"></div><div class="panel-meta">● Live</div></div>
        <div class="panel-body">
          <div class="emotion-hero"><div class="emotion-main"><div class="emotion-orb" id="emotionOrb"></div><div><div class="emotion-kicker">Organisme</div><div class="emotion-mood" id="emotionMood">Réveil</div><div class="emotion-reason" id="emotionReason">Lecture de l’état…</div></div></div></div>
          <div class="emotion-grid">
            <div class="emotion-cell"><div class="emotion-label"><span>Stabilité</span><strong id="emotion-stability-value">—</strong></div><div class="emotion-bar"><span id="emotion-stability"></span></div></div>
            <div class="emotion-cell"><div class="emotion-label"><span>Clarté</span><strong id="emotion-clarity-value">—</strong></div><div class="emotion-bar"><span id="emotion-clarity"></span></div></div>
            <div class="emotion-cell"><div class="emotion-label"><span>Curiosité</span><strong id="emotion-curiosity-value">—</strong></div><div class="emotion-bar"><span id="emotion-curiosity"></span></div></div>
            <div class="emotion-cell"><div class="emotion-label"><span>Agency</span><strong id="emotion-agency-value">—</strong></div><div class="emotion-bar"><span id="emotion-agency"></span></div></div>
            <div class="emotion-cell"><div class="emotion-label"><span>Confiance</span><strong id="emotion-confidence-value">—</strong></div><div class="emotion-bar"><span id="emotion-confidence"></span></div></div>
            <div class="emotion-cell"><div class="emotion-label"><span>Engagement</span><strong id="emotion-engagement-value">—</strong></div><div class="emotion-bar"><span id="emotion-engagement"></span></div></div>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head"><div class="panel-title">Produits Quantic</div><div class="spacer"></div><div class="panel-meta" id="portfolioMeta">Temps réel</div></div>
        <div class="panel-body"><div class="portfolio-list intent-list" id="portfolioList"><div class="empty">Lecture du portefeuille…</div></div></div>
      </section>

      <section class="panel">
        <div class="panel-head"><div class="panel-title">Intentions actives</div></div>
        <div class="panel-body"><div class="intent-list" id="intentList"><div class="empty">Chargement…</div></div></div>
      </section>
    </aside>

    <section class="panel map-panel">
      <div class="panel-head"><div class="panel-title">Quantic Sillage · Cognition en direct</div><div class="spacer"></div><div class="map-toolbar"><button id="refreshMap">Recentrer</button></div></div>
      <div class="map-wrap" id="livingMap">
        <canvas id="nebulaFx" aria-hidden="true"></canvas>
        <canvas id="particleFx" aria-hidden="true"></canvas>
        <div class="aurora-vignette" aria-hidden="true"></div>
        <svg id="attentionMap" viewBox="0 0 900 650" aria-label="Carte neuronale AURA">
          <defs>
            <radialGradient id="coreGrad"><stop offset="0" stop-color="#ffffff"/><stop offset=".10" stop-color="#fff2dd"/><stop offset=".30" stop-color="#ffbf68"/><stop offset=".62" stop-color="#b45d31"/><stop offset="1" stop-color="#0b0908"/></radialGradient>
            <radialGradient id="coreAura"><stop offset="0" stop-color="#ffffff" stop-opacity=".98"/><stop offset=".13" stop-color="#fff0d9" stop-opacity=".95"/><stop offset=".36" stop-color="#ffb75e" stop-opacity=".92"/><stop offset=".68" stop-color="#d56a42" stop-opacity=".74"/><stop offset="1" stop-color="#1c0f0b" stop-opacity=".08"/></radialGradient>
            <filter id="glow"><feGaussianBlur stdDeviation="7" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            <filter id="soft"><feGaussianBlur stdDeviation="2.4"/></filter>
            <filter id="coreBloom" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="13" result="blur1"/><feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur2"/><feMerge><feMergeNode in="blur1"/><feMergeNode in="blur2"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>
          <g opacity=".20" stroke="#c58f70" fill="none">
            <ellipse cx="450" cy="325" rx="330" ry="198" stroke-dasharray="3 9"/>
            <ellipse cx="450" cy="325" rx="270" ry="250" transform="rotate(-22 450 325)" stroke-dasharray="2 11"/>
            <ellipse cx="450" cy="325" rx="360" ry="118" transform="rotate(18 450 325)" stroke-dasharray="3 12"/>
          </g>
          <g id="flowLinks"></g><g id="energyPulses"></g><g id="interestNodes"></g>
          <g id="core" filter="url(#coreBloom)">
            <circle cx="450" cy="325" r="122" fill="#ffae5d" opacity=".045"/>
            <circle cx="450" cy="325" r="102" fill="none" stroke="#ffb467" opacity=".18" stroke-width="1.2" stroke-dasharray="2 11"/>
            <circle cx="450" cy="325" r="84" fill="none" stroke="#d18fff" opacity=".14" stroke-width=".9" stroke-dasharray="1 13"/>
            <circle cx="450" cy="325" r="72" fill="url(#coreAura)" stroke="rgba(255,236,211,.5)" stroke-width="1.6"/>
            <circle cx="450" cy="325" r="53" fill="none" stroke="rgba(255,239,222,.28)" stroke-width="1"/>
            <circle cx="429" cy="302" r="8" fill="#fff" opacity=".46" filter="url(#soft)"/>
            <text x="450" y="331" fill="#fff8ef" font-size="22" text-anchor="middle" letter-spacing="5">AURA</text>
          </g>
        </svg>
        <div class="map-badge"><b>●</b> Carte cognitive · temps réel</div>
        <div class="organism-hud"><i id="organismDot"></i><span id="organismMood">organisme en réveil</span></div>
        <div class="map-foot"><strong style="color:#f0c9a2">Focus :</strong> <span id="focusStatement">chargement de l’état</span></div>
        <div class="legend"><div class="legend-row"><span class="legend-line"></span>signal actif</div><div class="legend-row"><span class="legend-line rise"></span>traitement / apprentissage</div><div class="legend-row"><span class="legend-line stable"></span>source externe</div></div>
      </div>
    </section>

    <aside class="right-col">
      <section class="panel system-card">
        <div class="panel-head"><div class="panel-title">Santé du système</div><div class="spacer"></div><div class="panel-meta" id="commandState">Initialisation</div></div>
        <div class="panel-body">
          <div class="company-score"><div class="score-ring"><strong id="commandCompany">—</strong></div><div class="score-copy"><b>Entreprise agentique</b>Score calculé à partir des preuves runtime, des produits connectés et des workstreams.</div></div>
          <div class="command-stats">
            <div class="command-stat"><span>Flotte</span><strong id="commandFleet">—</strong></div>
            <div class="command-stat"><span>Autonomie</span><strong id="commandMode">—</strong></div>
            <div class="command-stat"><span>Initiatives</span><strong id="commandCount">—</strong></div>
            <div class="command-stat"><span>État dialogue</span><strong id="chatState">AURA</strong></div>
          </div>
          <div class="next-action"><div class="next-orb">→</div><div id="nextAction">Aucune initiative calculée.</div></div>
          <div class="confidence">Priorité / confiance : <span id="confidenceValue">—</span></div><div class="progress"><span id="confidenceBar" style="width:0%"></span></div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head"><div class="panel-title">Workstreams actifs</div><div class="spacer"></div><div class="panel-meta" id="workMeta">—</div></div>
        <div class="panel-body"><div class="work-list" id="workList"><div class="empty">Lecture des workstreams…</div></div></div>
      </section>

      <section class="panel">
        <div class="panel-head"><div class="panel-title">Pensée dominante</div></div>
        <div class="panel-body"><div class="thought-card" id="dominantThought">Chargement…</div><div class="thought-card" id="continuityState">Continuité autonome : vérification…</div></div>
      </section>
    </aside>
  </main>

  <section class="bottom-proof">
    <section class="panel proof-panel">
      <div class="panel-head"><div class="panel-title">Preuve de travail</div><div class="spacer"></div><div class="panel-meta" id="receiptMeta">Reçus persistés</div></div>
      <div class="panel-body proof-grid">
        <div><div style="font-size:8px;color:#756b67;margin-bottom:7px">REÇUS OPÉRATIONNELS</div><div class="activity-list" id="receiptList"><div class="empty">Lecture du journal…</div></div></div>
        <div><div style="font-size:8px;color:#756b67;margin-bottom:7px">ACTIVITÉ COGNITIVE</div><div class="activity-list" id="activityList"><div class="empty">Lecture de l’activité…</div></div></div>
      </div>
    </section>

    <section class="panel chat-panel">
      <div class="panel-head"><div class="panel-title">Conversation avec AURA</div><div class="spacer"></div><div class="panel-meta">Le chat est aussi accessible en haut</div></div>
      <div class="chat-body"><div class="messages" id="messages"><div class="msg aura"><span class="who">AURA</span>Je charge mon état, ma mémoire et mes intentions.</div></div><div class="quick"></div></div>
    </section>
  </section>

  <section class="secondary">
    <section class="panel"><div class="panel-head"><div class="panel-title">Curiosité active</div><div class="spacer"></div><div class="panel-meta" id="curiosityMeta">—</div></div><div class="panel-body"><div class="intent-list" id="curiosityList"><div class="empty">Aucune question récente.</div></div></div></section>
    <section class="panel"><div class="panel-head"><div class="panel-title">Veille autonome</div><div class="spacer"></div><div class="panel-meta" id="scoutMeta">—</div></div><div class="panel-body"><div class="intent-list" id="scoutList"><div class="empty">Premier scan en préparation.</div></div></div></section>
    <section class="panel"><div class="panel-head"><div class="panel-title">Mémoire et leçons</div><div class="spacer"></div><div class="panel-meta" id="memoryMeta">—</div></div><div class="panel-body"><div class="memory-list" id="memoryList"><div class="empty">Chargement…</div></div></div></section>
  </section>

  <section class="panel download-panel">
    <div class="panel-head"><div class="panel-title">Télécharger Quantic Glide</div><div class="spacer"></div><div class="panel-meta">Applications officielles</div></div>
    <div class="panel-body"><div class="download-grid">
      <div class="download-card"><div class="download-icon">▣</div><div class="download-copy"><strong>Windows x64</strong><span>Version stable · AURA intégrée</span></div><a class="download-btn" href="/downloads/glide/windows">Télécharger .exe</a></div>
      <div class="download-card"><div class="download-icon">◈</div><div class="download-copy"><strong>Android</strong><span>Version mobile privée</span></div><a class="download-btn" href="/downloads/glide/android">Télécharger .apk</a></div>
    </div></div>
  </section>

  <div style="display:none" aria-hidden="true">
    <span id="emotion-attachment"></span><span id="emotion-attachment-value"></span>
    <span id="emotion-satisfaction"></span><span id="emotion-satisfaction-value"></span>
    <span id="emotion-frustration"></span><span id="emotion-frustration-value"></span>
    <span id="emotion-social"></span><span id="emotion-social-value"></span>
    <span id="emotion-dream"></span><span id="emotion-dream-value"></span>
    <span id="emotion-silence"></span><span id="emotion-silence-value"></span>
  </div>
</div>
<script>${DASHBOARD_SCRIPT}</script>
</body>
</html>`;
