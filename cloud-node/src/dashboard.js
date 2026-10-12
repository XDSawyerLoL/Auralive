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
#nebulaFx,#particleFx{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}#nebulaFx{z-index:0}#particleFx{z-index:2;mix-blend-mode:screen}.aurora-vignette{position:absolute;inset:-12%;z-index:1;pointer-events:none;mix-blend-mode:screen;background:radial-gradient(circle at 50% 50%,rgba(255,170,87,.10),transparent 24%),radial-gradient(circle at 32% 42%,rgba(155,108,255,.06),transparent 34%)}#attentionMap{position:absolute;inset:0;z-index:3;width:100%;height:100%}
#core{transform-box:fill-box;transform-origin:center}.energy-pulse{fill:none;stroke-linecap:round;filter:url(#glow);animation:energyFlow 4.2s linear infinite}.web-link{animation:webDrift 8s linear infinite}.aura-node{transform-box:fill-box;transform-origin:center}@keyframes energyFlow{from{stroke-dashoffset:0}to{stroke-dashoffset:-170}}@keyframes webDrift{from{stroke-dashoffset:0}to{stroke-dashoffset:-90}}
body.aura-speaking #core{filter:url(#coreBloom) drop-shadow(0 0 20px rgba(255,169,84,.65))}
.organism-hud,.map-foot,.map-badge{position:absolute;z-index:6;border:1px solid rgba(255,255,255,.055);background:rgba(7,7,7,.64);backdrop-filter:blur(12px);border-radius:9px;font-size:7px}.organism-hud{left:10px;top:10px;display:flex;align-items:center;gap:6px;padding:6px 8px;color:#b3a7a1}.organism-hud i{width:6px;height:6px;border-radius:50%;background:var(--violet)}.map-badge{right:10px;top:10px;padding:6px 8px;color:#bdebd8}.map-badge b{color:var(--green)}.map-foot{left:10px;right:10px;bottom:10px;padding:7px 8px;color:#998c86;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mini-card{padding:13px}.mini-label{font-size:7px;color:#746a66;text-transform:uppercase;letter-spacing:.10em}.mini-value{font-size:15px;font-weight:760;line-height:1.3;margin-top:6px}.mini-copy{font-size:8px;color:#918680;line-height:1.45;margin-top:5px}.emotion-line{display:flex;align-items:center;gap:9px}.emotion-orb{width:31px;height:31px;border-radius:50%;background:radial-gradient(circle at 38% 32%,#fff 0 7%,#ffb86b 20%,#7d4633 50%,#12100f 73%);box-shadow:0 0 18px rgba(255,166,89,.24)}
.details{margin-top:auto}.details summary{list-style:none;cursor:pointer;padding:11px 12px;font-size:8px;color:#897e78}.details summary::-webkit-details-marker{display:none}.details-body{display:grid;gap:7px;padding:0 10px 10px}.tech{border:1px solid rgba(255,255,255,.05);border-radius:10px;padding:8px;background:rgba(255,255,255,.015);font-size:8px}
.hidden-data{display:none!important}
.intent-list,.work-list,.memory-list,.activity-list{display:grid;gap:5px}.intent-row,.work-row,.memory-row,.activity-row{border:1px solid rgba(255,255,255,.05);border-radius:8px;padding:6px;background:rgba(255,255,255,.015)}.intent-title,.work-title,.memory-text,.activity-title{font-size:7px}.memory-date,.activity-time,.activity-kind,.badge{font-size:6px;color:#6f6662}
.progress{height:3px;background:rgba(255,255,255,.05);border-radius:999px;overflow:hidden}.progress span{display:block;height:100%;background:linear-gradient(90deg,var(--gold),var(--violet))}
.language-card{padding:12px 13px;display:grid;gap:8px}
.language-head{display:flex;justify-content:space-between;align-items:center;gap:12px}
.language-head strong{font-size:11px;font-weight:700}.language-score{color:var(--gold);font-size:17px;font-weight:750;font-variant-numeric:tabular-nums}
.language-track{height:8px;border-radius:999px;background:rgba(255,255,255,.07);overflow:hidden}
.language-fill{height:100%;width:0%;border-radius:inherit;background:linear-gradient(90deg,#ffb566,#d78ff6);transition:width .9s ease}
.language-details{display:flex;justify-content:space-between;gap:9px;font-size:9px;color:var(--muted)}
.language-details span{min-width:0}.language-details span:last-child{text-align:right}
.language-help{margin:0;padding:8px 9px;border-radius:9px;background:rgba(238,162,94,.08);font-size:10px;color:var(--muted);line-height:1.4}.language-help[hidden]{display:none}
.sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
@media(max-width:900px){.main{grid-template-columns:1fr}.side{order:-1}.aura-card{min-height:250px}.map-wrap{height:220px}.chat{min-height:72svh}.side .mini-card:nth-of-type(n+3){display:none}}
@media(max-width:640px){.shell{padding:7px}.topbar{height:54px;padding:7px 9px}.brand-sub{display:none}.status-compact .pill:nth-child(n+2){display:none}.main{margin-top:7px}.side{display:block}.aura-card{margin-bottom:7px}.mini-card{display:none}.chat{min-height:calc(100svh - 68px)}.messages{padding:13px}.msg{font-size:15px;max-width:92%}.composer textarea{font-size:16px}.map-wrap{height:165px}.organism-hud,.map-badge{display:none}.map-foot{font-size:7px}}

/* AURA 3.1 — immersive, readable operational cockpit. */
:root{--bg:#090809;--panel:rgba(17,14,18,.91);--line:rgba(253,214,180,.13);--text:#fff6f1;--muted:#b7a4a0;--gold:#ffc68b;--violet:#b898ff;--pink:#ff879e}
body{background:radial-gradient(960px 760px at 73% -10%,rgba(193,94,148,.15),transparent 68%),radial-gradient(720px 660px at -4% 50%,rgba(209,125,90,.085),transparent 62%),linear-gradient(145deg,#110c13,#080708 65%,#0b080a);background-attachment:fixed}
.shell{max-width:1660px;padding:20px 22px 30px}
.topbar{height:72px;border-radius:24px;padding:12px 21px;background:rgba(18,14,19,.68);box-shadow:0 16px 70px rgba(0,0,0,.28);top:12px}
.brand-orb{width:43px;height:43px;background:radial-gradient(circle at 33% 24%,#fff 0 5%,#ffe1be 13%,#ffa46e 29%,#a04a75 50%,#271532 76%,#140f18 100%);box-shadow:0 0 32px rgba(237,120,156,.22),inset 0 -6px 18px rgba(54,19,42,.4)}
.brand-name{font-size:22px;letter-spacing:.28em;font-weight:720}
.brand-sub{font-size:9px;letter-spacing:.21em;color:#bc9d9b}
.pill{font-size:11px;padding:9px 12px;border:1px solid rgba(255,255,255,.085);background:rgba(255,255,255,.025)}
.status-compact .pill:nth-child(n+3){display:flex}
.icon-btn{font-size:12px;padding:9px 12px;border-radius:13px}
.aura-intro{display:flex;align-items:end;justify-content:space-between;gap:16px;padding:32px 8px 20px}
.intro-caption{display:inline-block;letter-spacing:.2em;text-transform:uppercase;font-size:10px;color:#e0ab8f}
.aura-intro h1{margin:8px 0 9px;line-height:1.07;letter-spacing:-.055em;font-weight:580;font-size:clamp(28px,3.3vw,48px)}
.aura-intro h1 em{font-style:normal;color:#f4b8b7}
.intro-copy{margin:0;font-size:13px;color:#ac9b9e;line-height:1.5}
.build-version{font-size:11px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.028);border-radius:20px;padding:12px 15px;color:#b8a8ae;white-space:nowrap}
.status-rail{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0 0 16px}
.rail-item{border:1px solid rgba(255,255,255,.075);border-radius:18px;background:linear-gradient(140deg,rgba(34,25,34,.75),rgba(14,11,15,.83));padding:14px 17px;display:flex;align-items:center;gap:13px;min-height:74px}
.rail-sigil{width:36px;height:36px;flex:none;border-radius:13px;display:grid;place-items:center;background:rgba(255,188,145,.08);color:#ffd6ac;font-size:19px}
.rail-label{font-size:10px;text-transform:uppercase;letter-spacing:.11em;color:#a58d91}
.rail-value{font-size:13px;color:#f9ebe8;font-weight:640;margin-top:5px}
.main{grid-template-columns:minmax(0,1fr) minmax(340px,450px);gap:18px;margin-top:0;min-height:calc(100svh - 290px)}
.panel{border-radius:26px;background:linear-gradient(150deg,rgba(32,23,30,.83),rgba(12,10,14,.95) 70%);box-shadow:inset 0 1px rgba(255,255,255,.045),0 22px 70px rgba(0,0,0,.22)}
.chat{min-height:calc(100svh - 288px)}
.chat-head{padding:22px 25px;border-bottom-color:rgba(255,255,255,.065)}
.chat-title{font-size:19px;letter-spacing:-.025em}
.chat-sub{font-size:11px;color:#ad9399;margin-top:5px}
.chat-head-state{font-size:11px}
.messages{padding:28px;gap:18px;background:radial-gradient(circle at 60% 0%,rgba(255,155,117,.047),transparent 42%)}
.msg{max-width:81%;font-size:15px;line-height:1.68;padding:16px 19px;border-radius:22px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.023)}
.msg.user{background:linear-gradient(130deg,rgba(236,148,117,.16),rgba(176,91,128,.11));border-color:rgba(255,180,157,.13);border-bottom-right-radius:8px}
.msg.aura{border-bottom-left-radius:8px}
.msg.service-msg{max-width:92%;border-color:rgba(255,177,131,.25);background:rgba(237,145,85,.055);color:#f9d2b0}
.who{font-size:10px;letter-spacing:.14em;color:#ad9b9c;margin-bottom:8px}
.msg.aura .who{color:#ffcb9d}
.composer{padding:17px 20px;gap:12px;background:rgba(12,9,14,.83)}
.composer textarea{min-height:64px;border-radius:20px;background:rgba(255,255,255,.038);font-size:16px;padding:17px 18px}
.composer button{width:53px;height:53px;border-radius:16px;font-size:20px}
.composer .send{background:linear-gradient(135deg,#ffcca0,#ed9c89 55%,#de89ad);box-shadow:0 7px 24px rgba(234,133,128,.19)}
.chat-hint{font-size:10px;color:#827079;background:rgba(12,9,14,.83);padding:0 20px 13px}
.side{gap:12px}
.aura-card{min-height:unset}
.side-head{padding:17px 17px}
.side-head strong{font-size:15px}.side-head span{font-size:11px}
.map-wrap{height:380px;background:radial-gradient(circle at 50% 47%,rgba(237,126,117,.16),transparent 28%),radial-gradient(circle at 66% 30%,rgba(145,88,177,.12),transparent 52%),linear-gradient(140deg,#170c17,#090709 85%)}
.organism-hud,.map-badge,.map-foot{font-size:10px;padding:9px 12px;border-radius:12px}
.engine-panel{padding:19px;display:grid;gap:13px;border-color:rgba(255,192,148,.14)}
.engine-kicker{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:10px;color:#bda2a5;letter-spacing:.1em;text-transform:uppercase}
.engine-chip{font-size:10px;letter-spacing:0;text-transform:none;border-radius:100px;padding:5px 9px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.035)}
.engine-title{font-size:18px;font-weight:700;line-height:1.25}
.engine-description{font-size:12px;line-height:1.6;color:#b9a7ad}
.engine-row{display:flex;gap:12px;align-items:center;justify-content:space-between;font-size:11px;color:#a999a0}
.engine-progress{height:6px;background:rgba(255,255,255,.07);overflow:hidden;border-radius:100px}
.engine-progress>span{display:block;height:100%;width:0%;background:linear-gradient(90deg,#e99990,#ffcf8a,#af8fdf);transition:width .5s ease}
.engine-panel[data-state="ready"]{border-color:rgba(107,233,177,.3)}
.engine-panel[data-state="blocked"]{border-color:rgba(255,145,127,.29)}
.engine-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#8f7f85;font-size:10px}
.engine-foot button{border:1px solid rgba(255,255,255,.11);background:rgba(255,255,255,.035);color:#edddd9;border-radius:10px;padding:8px 11px;font-size:11px}
.language-card{padding:17px;gap:10px}
.language-head strong{font-size:13px}.language-score{font-size:20px}
.language-details{font-size:11px}
.language-help{font-size:11px}
.mini-card{padding:17px}.mini-label{font-size:10px}.mini-value{font-size:16px}.mini-copy{font-size:11px}
.details summary{padding:14px 18px;font-size:11px}
@media(max-width:1100px){.main{grid-template-columns:minmax(0,1fr) 360px}.status-compact .pill:nth-child(n+3){display:none}}
@media(max-width:900px){.shell{padding:12px}.aura-intro{padding:22px 4px 17px}.main{grid-template-columns:minmax(0,1fr)}.side{display:grid;grid-template-columns:1fr 1fr;order:0}.aura-card{grid-row:span 2}.map-wrap{height:330px}.chat{min-height:65svh}.side .mini-card:nth-of-type(n+3){display:block}}
@media(max-width:640px){.shell{padding:8px}.topbar{height:62px;padding:9px 12px;top:5px;border-radius:19px}.brand-name{font-size:19px}.aura-intro{padding:22px 6px 15px}.aura-intro h1{font-size:30px}.intro-copy{font-size:12px}.build-version{display:none}.status-rail{grid-template-columns:1fr 1fr;gap:8px}.rail-item{min-height:70px;padding:11px}.rail-item:last-child{grid-column:1 / -1}.rail-value{font-size:12px}.main{gap:9px}.chat{min-height:calc(100svh - 68px)}.chat-head{padding:16px}.messages{padding:14px;gap:12px}.msg{font-size:15px;max-width:92%;padding:13px 15px}.composer{padding:10px}.composer textarea{font-size:16px}.chat-hint{padding:0 12px 10px}.side{grid-template-columns:1fr;gap:9px}.map-wrap{height:250px}.organism-hud,.map-badge{display:flex}.map-foot{font-size:10px}.engine-panel{padding:15px}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.001ms!important;transition-duration:.001ms!important}}

</style>
</head>
<body data-aura-ui="immersive-cognition-v3">
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

  <section class="aura-intro" aria-label="Présentation AURA 3.1">
    <div><span class="intro-caption">Intelligence native · Quantic Sillage</span>
      <h1>Une présence qui <em>réfléchit.</em></h1>
      <p class="intro-copy">Mémoire, missions et raisonnement continus. Capacités vérifiées en temps réel.</p>
    </div>
    <span id="serverRevision" class="build-version">Version serveur : vérification…</span>
  </section>
  <section class="status-rail" aria-label="État des trois fonctions centrales">
    <div class="rail-item"><span class="rail-sigil">✺</span><div><div class="rail-label">Noyau cognitif</div><div id="railBrain" class="rail-value">Vérification…</div></div></div>
    <div class="rail-item"><span class="rail-sigil">◈</span><div><div class="rail-label">Langage vivant</div><div id="railLanguage" class="rail-value">Vérification…</div></div></div>
    <div class="rail-item"><span class="rail-sigil">⟡</span><div><div class="rail-label">Missions autonomes</div><div id="railMissions" class="rail-value">Vérification…</div></div></div>
  </section>
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
          <canvas id="nebulaFx"></canvas><canvas id="particleFx"></canvas><div class="aurora-vignette" aria-hidden="true"></div>
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

      <section class="panel engine-panel" id="enginePanel" data-state="loading" aria-label="Moteur français réel">
        <div class="engine-kicker"><span>FACULTÉ LINGUISTIQUE · INFÉRENCE LOCALE</span><span class="engine-chip" id="engineChip">Diagnostic</span></div>
        <div class="engine-title" id="engineTitle">Connexion au moteur de français…</div>
        <div class="engine-description" id="engineDescription">Lecture de l’installation et de sa disponibilité réelle sur le serveur.</div>
        <div class="engine-progress" aria-label="Étape de préparation du moteur"><span id="engineProgress"></span></div>
        <div class="engine-row"><span id="engineStage">État en attente</span><span id="engineCost">Modèle libre · aucun coût par requête</span></div>
        <div class="engine-foot"><span id="engineRevision">Révision moteur —</span><button type="button" id="engineRefresh">Actualiser l’état</button></div>
      </section>
      <section class="panel language-card" aria-label="Progression mesurée du français">
        <div class="language-head"><strong>Apprentissage du français</strong><span class="language-score" id="languageScore">—</span></div>
        <div class="language-track" id="languageTrack" role="progressbar" aria-label="Évaluation du langage" aria-valuemin="0" aria-valuemax="100" aria-valuetext="Pas encore évalué"><div class="language-fill" id="languageProgressBar"></div></div>
        <div class="language-details"><span id="languageTrend">Premier test en attente</span><span id="languageTestDate">Tests comparables · 9 tâches</span></div>
        <p class="language-help" id="languageSetupHelp" hidden></p>
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
    <span id="emotion-stability"></span><span id="emotion-stability-value"></span>
    <span id="emotion-clarity"></span><span id="emotion-clarity-value"></span>
    <span id="emotion-attachment"></span><span id="emotion-attachment-value"></span>
    <span id="emotion-curiosity"></span><span id="emotion-curiosity-value"></span>
    <span id="emotion-engagement"></span><span id="emotion-engagement-value"></span>
    <span id="emotion-confidence"></span><span id="emotion-confidence-value"></span>
    <span id="emotion-agency"></span><span id="emotion-agency-value"></span>
    <span id="emotion-satisfaction"></span><span id="emotion-satisfaction-value"></span>
    <span id="emotion-frustration"></span><span id="emotion-frustration-value"></span>
    <span id="emotion-social"></span><span id="emotion-social-value"></span>
    <span id="emotion-dream"></span><span id="emotion-dream-value"></span>
    <span id="emotion-silence"></span><span id="emotion-silence-value"></span>
    <span>Énergie Curiosité Pression Continuité Introspection Réactivité État d’AURA Entreprise agentique Afficher les détails techniques</span>
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
