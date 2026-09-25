import { DASHBOARD_SCRIPT } from './dashboard-runtime.js';

export const DASHBOARD_HTML = String.raw`<!doctype html>
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
  opacity:.12;
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
.metric{position:relative;overflow:hidden;border:1px solid rgba(157,181,255,.15);border-radius:16px;background:linear-gradient(180deg,rgba(19,27,45,.94),rgba(9,14,25,.92));padding:12px 14px;display:flex;align-items:center;gap:12px;min-height:78px;box-shadow:inset 0 1px rgba(255,255,255,.035),0 10px 26px rgba(0,0,0,.15)}
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
.panel{position:relative;border:1px solid rgba(150,174,245,.16);border-radius:18px;background:linear-gradient(180deg,rgba(15,21,35,.96),rgba(8,12,21,.95));backdrop-filter:blur(24px);box-shadow:inset 0 1px rgba(255,255,255,.035),0 16px 44px rgba(0,0,0,.22);overflow:hidden;transform:translateZ(0)}
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
.next-action{display:flex;gap:12px;align-items:flex-start;padding:13px;border:1px solid rgba(154,108,255,.16);border-radius:14px;background:linear-gradient(135deg,rgba(154,108,255,.1),rgba(90,110,255,.05))}.next-orb{width:42px;height:42px;border-radius:50%;border:1px solid rgba(154,108,255,.45);display:grid;place-items:center;color:#c4b5ff;box-shadow:0 0 25px rgba(154,108,255,.18);flex:0 0 auto}.next-copy{font-size:10px;line-height:1.45}.confidence{font-size:8px;color:var(--muted);margin-top:14px}.command-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:0 0 10px}.command-stat{border:1px solid rgba(157,181,255,.12);border-radius:10px;background:rgba(255,255,255,.025);padding:8px 9px;min-width:0}.command-stat span{display:block;color:var(--muted2);font-size:7px;text-transform:uppercase;letter-spacing:.08em}.command-stat strong{display:block;margin-top:3px;font-size:10px;color:#edf2ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.command-stat strong.good{color:var(--green)}.command-stat strong.warn{color:var(--gold)}.memory-row{display:grid;grid-template-columns:auto 1fr;gap:8px}.memory-date{font-size:8px;color:var(--muted2)}.memory-text{font-size:9px;line-height:1.35}.empty{padding:14px;text-align:center;border:1px dashed var(--line);border-radius:11px;color:var(--muted);font-size:9px}
.auth-drawer{position:fixed;inset:0;display:none;z-index:50;background:rgba(2,4,9,.72);backdrop-filter:blur(12px);align-items:center;justify-content:center;padding:18px}.auth-drawer.open{display:flex}.auth-box{width:min(460px,100%);border:1px solid var(--line);border-radius:20px;background:#0d1321;padding:20px;box-shadow:0 30px 100px rgba(0,0,0,.45)}.auth-box h3{margin:0 0 7px;font-size:16px}.auth-box p{margin:0 0 13px;color:var(--muted);font-size:10px;line-height:1.45}.auth-row{display:flex;gap:8px}.auth-row input{flex:1;border:1px solid var(--line);background:#070b13;color:white;border-radius:12px;padding:10px 11px;outline:none}.primary{border:0;border-radius:11px;background:linear-gradient(135deg,#9368ff,#624ee8);color:white;padding:9px 12px;font-weight:650}.secondary{border:1px solid var(--line);border-radius:11px;background:rgba(255,255,255,.035);color:#ccd4e5;padding:9px 12px}
.emotion-strip{
  display:grid;grid-template-columns:minmax(180px,.72fr) minmax(0,2.28fr);gap:12px;
  margin:0 0 13px;border:1px solid rgba(154,108,255,.20);border-radius:18px;
  background:linear-gradient(135deg,rgba(74,49,128,.24),rgba(13,19,33,.96) 52%,rgba(10,15,26,.96));
  padding:16px 18px;box-shadow:inset 0 1px rgba(255,255,255,.045),0 14px 34px rgba(0,0,0,.18)
}
.emotion-main{display:flex;align-items:center;gap:12px;min-width:0}
.emotion-orb{width:54px;height:54px;border-radius:50%;flex:0 0 auto;background:radial-gradient(circle at 38% 32%,#fff 0 6%,#bca8ff 17%,#744ee6 46%,#151125 72%);box-shadow:0 0 30px rgba(154,108,255,.32)}
.emotion-kicker{font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:#9faac1}
.emotion-mood{font-size:26px;font-weight:760;line-height:1.02;margin-top:4px;text-transform:capitalize;letter-spacing:-.02em}
.emotion-reason{font-size:11px;color:var(--muted);margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.emotion-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;align-items:center}
.emotion-cell{min-width:0}
.emotion-label{display:flex;justify-content:space-between;gap:6px;font-size:9px;color:#aeb9cf;margin-bottom:5px}
.emotion-label strong{color:#edf1ff;font-size:10px}
.emotion-bar{height:6px;border-radius:999px;background:rgba(255,255,255,.065);overflow:hidden}
.emotion-bar span{display:block;height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#7c5cff,#63e4ee);transition:width .65s cubic-bezier(.2,.7,.2,1)}
.setup-banner{display:none;margin-bottom:14px;border:1px solid rgba(255,201,106,.22);background:linear-gradient(135deg,rgba(255,201,106,.08),rgba(154,108,255,.06));border-radius:16px;padding:12px 14px;color:#eadfca;font-size:10px;line-height:1.5}.setup-banner.show{display:block}.setup-title{font-size:12px;font-weight:700;color:#ffd991;margin-bottom:5px}.setup-list{margin:7px 0 0;padding-left:18px;color:#b9c3d8}.mobile-tabs{display:none}
@media(max-width:1180px){
  .metrics{grid-template-columns:repeat(3,1fr)}
  .workspace{grid-template-columns:1fr;grid-template-rows:auto;grid-template-areas:"chat" "map" "side" "bottom"}
  .right-stack{grid-column:auto;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:none}
  .chat-panel{min-height:520px}.map-panel{min-height:520px}.map-wrap{min-height:520px}
  .bottom-grid{grid-template-columns:1fr 1fr}.bottom-grid .panel:first-child{grid-column:1/-1}.title{white-space:normal}
}
@media(max-width:820px){
  html{font-size:16px}
  body{font-size:16px}
  .shell{width:100%;max-width:none;padding:12px max(12px,env(safe-area-inset-right)) 24px max(12px,env(safe-area-inset-left))}
  .topbar{align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:12px}.identity{width:100%}.identity-copy{display:block;padding-left:0}.logo{font-size:32px}.logo-dash{display:none}.title{font-size:18px;line-height:1.15}.subtitle{font-size:13px;line-height:1.35}
  .top-actions{width:100%;margin-left:0;justify-content:flex-start;gap:8px;flex-wrap:wrap}.pill{font-size:12px;padding:9px 11px}.clock{display:none}.mode-btn{display:none}
  .emotion-strip{grid-template-columns:1fr;padding:14px;margin-bottom:10px}.emotion-main{gap:13px}.emotion-orb{width:58px;height:58px}.emotion-kicker{font-size:11px}.emotion-mood{font-size:26px}.emotion-reason{font-size:13px;white-space:normal;line-height:1.35}.emotion-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 10px}.emotion-label{font-size:11px}.emotion-label strong{font-size:12px}.emotion-bar{height:8px}
  .metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.metric{min-height:82px;padding:11px;gap:10px}.ring{width:46px;height:46px}.ring span{font-size:16px}.metric-value{font-size:19px}.metric-label{font-size:12px}.metric-trend{font-size:10px}
  .workspace{grid-template-columns:minmax(0,1fr);gap:11px}.panel{border-radius:15px}.panel-head{padding:13px;min-height:48px}.panel-title{font-size:15px}.panel-meta{font-size:11px}.panel-body{padding:13px}
  .chat-panel{min-height:70svh}.chat-body{padding:10px}.messages{min-height:48svh;padding:8px 6px 14px;gap:14px}.msg{font-size:15px;line-height:1.5;max-width:88%;padding:12px 13px}.who{font-size:10px}
  .quick{gap:8px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none}.quick::-webkit-scrollbar{display:none}.quick button{font-size:13px;min-height:40px;flex:0 0 auto}
  .composer{gap:8px}.composer textarea{font-size:16px;min-height:52px;line-height:1.35}.composer .voice,.composer .send{width:48px;height:48px;flex:0 0 48px}
  .map-panel{min-height:370px}.map-wrap{min-height:370px}.organism-hud{font-size:12px}.map-foot{max-width:88%;font-size:11px}.legend{display:none}
  .right-stack{grid-column:auto;grid-template-columns:1fr}.bottom-grid{grid-template-columns:1fr}.bottom-grid .panel:first-child{grid-column:auto}.title{white-space:normal}
  .thought-card,.work-list,.intent-list,.activity-list,.memory-list,.next-copy{font-size:14px;line-height:1.45}.command-stat span{font-size:9px}.command-stat strong{font-size:12px}
}
@media(max-width:480px){
  .shell{padding:10px 10px calc(22px + env(safe-area-inset-bottom))}.logo{font-size:30px}.title{font-size:18px}.subtitle{font-size:13px}
  .top-actions .pill{flex:1 1 calc(50% - 8px);justify-content:center;min-width:0;font-size:12px}
  .metrics{grid-template-columns:1fr 1fr}.metric{min-height:88px;padding:12px}.metric-copy{overflow:hidden}
  .metric-label{font-size:13px}.metric-value{font-size:21px}.metric-trend{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .emotion-strip{padding:15px}.emotion-grid{grid-template-columns:1fr 1fr}.emotion-mood{font-size:28px}.emotion-reason{font-size:14px}
  .chat-panel{min-height:74svh}.messages{min-height:51svh}.msg{max-width:88%;font-size:16px;line-height:1.52}.msg.user{margin-right:28px}.msg.aura{margin-left:28px}
  .composer{position:sticky;bottom:max(6px,env(safe-area-inset-bottom));z-index:8;padding:8px;border:1px solid rgba(160,180,240,.12);border-radius:16px;background:rgba(8,12,21,.94);backdrop-filter:blur(18px)}
  .composer textarea{font-size:16px;min-height:54px}
  .command-stats{grid-template-columns:1fr 1fr}.command-stat:last-child{grid-column:1/-1}
  .map-panel,.map-wrap{min-height:315px}
}
@media(max-width:410px){
  .top-actions .pill{flex-basis:100%}
  .metrics{grid-template-columns:1fr}.metric{min-height:74px}
  .emotion-grid{grid-template-columns:1fr}.emotion-cell{padding:2px 0}
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
      <div class="pill"><span id="voiceDot" class="live-dot"></span><span id="voiceText">Mairaiy…</span></div>
      <div class="pill"><span id="evolutionDot" class="live-dot"></span><span id="evolutionText">Évolution…</span></div>
      <div class="clock"><div id="clockDate" class="date">—</div><div id="clockTime" class="time">—</div></div>
      <button class="mode-btn" id="modeBtn">⌁ Mode évolutif</button>
    </div>
  </header>

  <section class="setup-banner" id="setupBanner"><div class="setup-title">Configuration AURA requise</div><div id="setupSummary">Le serveur web fonctionne, mais le noyau persistant n’est pas encore actif.</div><ul class="setup-list" id="setupIssues"></ul></section>

  <section class="emotion-strip" aria-label="État émotionnel AURA">
    <div class="emotion-main">
      <div class="emotion-orb" id="emotionOrb" aria-hidden="true"></div>
      <div>
        <div class="emotion-kicker">État émotionnel</div>
        <div class="emotion-mood" id="emotionMood">En réveil</div>
        <div class="emotion-reason" id="emotionReason">Lecture de l’état interne…</div>
      </div>
    </div>
    <div class="emotion-grid">
      <div class="emotion-cell"><div class="emotion-label"><span>Stabilité</span><strong id="emotion-stability-value">—</strong></div><div class="emotion-bar"><span id="emotion-stability"></span></div></div>
      <div class="emotion-cell"><div class="emotion-label"><span>Clarté</span><strong id="emotion-clarity-value">—</strong></div><div class="emotion-bar"><span id="emotion-clarity"></span></div></div>
      <div class="emotion-cell"><div class="emotion-label"><span>Attachement</span><strong id="emotion-attachment-value">—</strong></div><div class="emotion-bar"><span id="emotion-attachment"></span></div></div>
      <div class="emotion-cell"><div class="emotion-label"><span>Curiosité</span><strong id="emotion-curiosity-value">—</strong></div><div class="emotion-bar"><span id="emotion-curiosity"></span></div></div>
      <div class="emotion-cell"><div class="emotion-label"><span>Rêve</span><strong id="emotion-dream-value">—</strong></div><div class="emotion-bar"><span id="emotion-dream"></span></div></div>
      <div class="emotion-cell"><div class="emotion-label"><span>Silence</span><strong id="emotion-silence-value">—</strong></div><div class="emotion-bar"><span id="emotion-silence"></span></div></div>
    </div>
  </section>

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
          <div class="msg aura"><span class="who">AURA</span>Je charge mon état, ma mémoire et mes intentions.</div>
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
        <div class="map-foot"><strong id="focusLabel" style="color:#dcd4ff">Focus :</strong> <span id="focusStatement">chargement de l’état</span></div>
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
        <div class="panel-body"><div class="thought-card" id="dominantThought">Chargement de la pensée dominante…</div></div>
      </section>
      <section class="panel">
        <div class="panel-head"><span>▣</span><div class="panel-title">Travail en cours</div><div class="spacer"></div><div class="panel-meta" id="workMeta">—</div></div>
        <div class="panel-body"><div class="work-list" id="workList"><div class="empty">Chargement…</div></div></div>
      </section>
      <section class="panel">
        <div class="panel-head"><span>◎</span><div class="panel-title">Intentions actives</div></div>
        <div class="panel-body"><div class="intent-list" id="intentList"><div class="empty">Chargement…</div></div></div>
      </section>
    </aside>

    <section class="bottom-grid">
    <section class="panel">
      <div class="panel-head"><span>◴</span><div class="panel-title">Ce qu’elle fait maintenant</div><div class="spacer"></div><div class="panel-meta" id="activityLive">En temps réel</div></div>
      <div class="panel-body"><div class="activity-list" id="activityList"><div class="empty">Chargement…</div></div></div>
    </section>
    <section class="panel">
      <div class="panel-head"><span>⌘</span><div class="panel-title">Centre de commande</div><div class="spacer"></div><div class="panel-meta" id="commandState">Initialisation</div></div>
      <div class="panel-body">
        <div class="command-stats">
          <div class="command-stat"><span>Flotte</span><strong id="commandFleet">—</strong></div>
          <div class="command-stat"><span>Autonomie</span><strong id="commandMode">—</strong></div>
          <div class="command-stat"><span>Initiatives</span><strong id="commandCount">—</strong></div>
        </div>
        <div class="next-action"><div class="next-orb">→</div><div class="next-copy" id="nextAction">Aucune initiative calculée.</div></div>
        <div class="confidence">Priorité / confiance : <span id="confidenceValue">—</span></div>
        <div class="progress"><span id="confidenceBar" style="width:0%"></span></div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head"><span>◫</span><div class="panel-title">Mémoire et leçons</div><div class="spacer"></div><div class="panel-meta" id="memoryMeta">—</div></div>
      <div class="panel-body"><div class="memory-list" id="memoryList"><div class="empty">Chargement…</div></div></div>
    </section>
  </section>
  </main>
</div>

<script>${DASHBOARD_SCRIPT}</script>
</body>
</html>`;
