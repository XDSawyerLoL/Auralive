import { DASHBOARD_SCRIPT } from './dashboard-runtime.js';
import { NEURAL_FIELD_SCRIPT } from './neural-field-renderer.js';

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
.map-panel{grid-area:map;position:relative;min-height:0;display:flex;flex-direction:column}
.map-wrap{position:relative;isolation:isolate;flex:1;min-height:500px;overflow:hidden;background:#040711}
.map-wrap::before{content:"";position:absolute;inset:0;z-index:2;pointer-events:none;background:radial-gradient(circle at 50% 50%,rgba(180,150,255,.06),transparent 42%),radial-gradient(circle at 22% 18%,rgba(63,184,255,.045),transparent 32%),radial-gradient(circle at 78% 72%,rgba(241,120,214,.035),transparent 34%)}
#neuralFieldCanvas{position:absolute;inset:0;z-index:1;width:100%;height:100%;display:block}
.map-toolbar{display:flex;gap:8px;align-items:center}
.map-toolbar button{border:1px solid var(--line);background:rgba(255,255,255,.025);color:#b8c1d5;border-radius:999px;padding:6px 9px;font-size:9px}
.map-stats{font-size:8px;color:#7f8ba4;white-space:nowrap;letter-spacing:.02em}
.neural-tooltip{position:absolute;z-index:8;display:none;transform:translate(12px,-50%);min-width:150px;max-width:245px;padding:9px 11px;border:1px solid rgba(175,150,255,.22);border-radius:11px;background:rgba(5,8,16,.91);backdrop-filter:blur(14px);box-shadow:0 10px 34px rgba(0,0,0,.32);pointer-events:none}
.neural-tooltip.show{display:grid;gap:3px}
.neural-tooltip strong{font-size:10px;color:#f4f0ff}
.neural-tooltip span{font-size:8px;line-height:1.45;color:#98a6bd}
.organism-hud{position:absolute;z-index:6;left:14px;top:13px;display:flex;align-items:center;gap:7px;padding:7px 9px;border:1px solid rgba(255,255,255,.06);border-radius:999px;background:rgba(4,7,14,.54);backdrop-filter:blur(12px);font-size:8px;color:#9ca9c0}
.organism-hud i{width:6px;height:6px;border-radius:50%;background:#9a6cff;box-shadow:0 0 12px #9a6cff}
.legend{position:absolute;z-index:6;right:14px;bottom:13px;background:rgba(5,8,16,.68);border:1px solid var(--line);border-radius:12px;padding:9px 10px;font-size:8px;color:#9da9be;backdrop-filter:blur(12px);display:grid;gap:5px}
.legend-row{display:flex;align-items:center;gap:7px}
.legend-line{width:22px;height:2px;border-radius:4px;background:linear-gradient(90deg,var(--violet),#fff)}
.legend-line.rise{background:linear-gradient(90deg,var(--cyan),#fff)}
.legend-line.stable{background:rgba(255,255,255,.3)}
.map-foot{position:absolute;z-index:6;left:14px;bottom:13px;max-width:58%;font-size:9px;color:var(--muted);line-height:1.45;padding:8px 10px;border-radius:10px;background:rgba(5,8,16,.62);border:1px solid rgba(255,255,255,.05);backdrop-filter:blur(12px)}
@media(prefers-reduced-motion:reduce){#neuralFieldCanvas{opacity:.94}}
.right-stack{grid-area:side;display:grid;gap:12px;grid-template-rows:auto minmax(178px,1fr) auto}.thought-card{padding:13px;border:1px solid rgba(255,201,106,.17);border-radius:14px;background:linear-gradient(135deg,rgba(255,201,106,.08),rgba(154,108,255,.07));font-size:12px;line-height:1.48;color:#f2e0b9;min-height:74px}
.work-list,.intent-list,.memory-list,.activity-list{display:grid;gap:8px}.work-row,.intent-row,.memory-row,.activity-row{border:1px solid var(--line2);background:rgba(255,255,255,.02);border-radius:11px;padding:9px 10px}
.work-top,.intent-top{display:flex;gap:8px;align-items:flex-start}.work-title,.intent-title{font-size:10px;line-height:1.35;flex:1}.badge{font-size:8px;border-radius:999px;padding:3px 7px;border:1px solid var(--line);color:#cbd4e8;white-space:nowrap}.badge.high{color:#ffda93;border-color:rgba(255,201,106,.24);background:rgba(255,201,106,.07)}.badge.medium{color:#b9cbff;border-color:rgba(109,167,255,.24);background:rgba(109,167,255,.06)}
.progress{height:4px;margin-top:7px;background:rgba(255,255,255,.06);border-radius:999px;overflow:hidden}.progress span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--violet),var(--cyan))}
.bottom-grid{grid-area:bottom;display:grid;grid-template-columns:5fr 3.25fr 4.25fr;gap:13px;margin-top:0}.bottom-grid .panel{min-height:188px}
.download-panel{grid-column:1/-1;min-height:0!important}
.download-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.download-card{display:flex;align-items:center;gap:12px;border:1px solid var(--line2);border-radius:14px;background:linear-gradient(135deg,rgba(154,108,255,.08),rgba(89,224,239,.035));padding:13px}
.download-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:12px;border:1px solid rgba(154,108,255,.2);background:rgba(154,108,255,.08);font-size:17px;flex:0 0 auto}
.download-copy{min-width:0;flex:1}.download-copy strong{display:block;font-size:11px;color:#f1edff}.download-copy span{display:block;margin-top:3px;font-size:8px;line-height:1.4;color:var(--muted)}
.download-btn{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;border:1px solid rgba(154,108,255,.3);border-radius:10px;background:linear-gradient(135deg,rgba(147,104,255,.25),rgba(89,224,239,.10));color:#f6f3ff;padding:9px 11px;font-size:9px;font-weight:700;white-space:nowrap}.download-btn:hover{border-color:rgba(154,108,255,.55);background:linear-gradient(135deg,rgba(147,104,255,.34),rgba(89,224,239,.16))}
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
  .bottom-grid{grid-template-columns:1fr 1fr}.bottom-grid .panel:first-child{grid-column:1/-1}.download-panel{grid-column:1/-1}.download-grid{grid-template-columns:1fr 1fr}.title{white-space:normal}
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
  .right-stack{grid-column:auto;grid-template-columns:1fr}.bottom-grid{grid-template-columns:1fr}.bottom-grid .panel:first-child{grid-column:auto}.download-panel{grid-column:auto}.download-grid{grid-template-columns:1fr}.download-card{align-items:flex-start;flex-wrap:wrap}.download-btn{width:100%;min-height:42px;font-size:12px}.download-copy strong{font-size:14px}.download-copy span{font-size:11px}.title{white-space:normal}
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

/* AURA UX V4 — primary workspace first, detail on demand */
.shell{max-width:1680px;padding:16px 22px 88px}
.topbar{margin-bottom:16px;min-height:54px}
.logo{font-size:34px;letter-spacing:.30em}
.title{font-size:20px}.subtitle{font-size:11px}
.top-actions{gap:8px}.pill{padding:8px 11px;font-size:10px;background:rgba(10,15,28,.64)}
.mode-btn{display:none}
.overview{display:grid;grid-template-columns:1.18fr repeat(3,minmax(0,1fr));gap:12px;margin-bottom:14px}
.overview-card{position:relative;min-height:92px;border:1px solid rgba(151,174,244,.14);border-radius:18px;background:linear-gradient(145deg,rgba(18,25,43,.90),rgba(8,13,24,.92));overflow:hidden;padding:14px 16px;display:flex;align-items:center;gap:13px;box-shadow:inset 0 1px rgba(255,255,255,.035)}
.overview-card::after{content:"";position:absolute;inset:auto -15% -55% 34%;height:100px;background:radial-gradient(circle,var(--card-glow,rgba(154,108,255,.15)),transparent 72%);pointer-events:none}
.overview-card.emotion{background:linear-gradient(135deg,rgba(67,45,120,.22),rgba(13,19,34,.94) 54%,rgba(8,13,24,.94))}
.overview-orb{width:56px;height:56px;border-radius:50%;flex:0 0 auto;background:radial-gradient(circle at 38% 32%,#fff 0 6%,#bca8ff 17%,#744ee6 46%,#151125 72%);box-shadow:0 0 34px rgba(154,108,255,.30)}
.overview-kicker{font-size:9px;text-transform:uppercase;letter-spacing:.14em;color:#9ea9c0}
.overview-value{font-size:25px;line-height:1.05;font-weight:720;margin-top:4px}
.overview-sub{font-size:10px;color:var(--muted);margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px}
.overview-metric .ring{width:50px;height:50px}
.overview-metric .metric-value{font-size:23px}.overview-metric .metric-label{font-size:10px}
.overview-wave{position:absolute;right:8px;bottom:8px;width:44%;height:34px;opacity:.42;pointer-events:none}
.overview-wave path{fill:none;stroke:var(--metric-color,var(--violet));stroke-width:1.5;stroke-linecap:round;stroke-dasharray:2 2;animation:waveShift 9s linear infinite}
@keyframes waveShift{to{stroke-dashoffset:-36}}
.workspace{display:grid;grid-template-columns:minmax(250px,.72fr) minmax(620px,2.2fr) minmax(280px,.84fr);grid-template-areas:"chat map side";grid-template-rows:minmax(640px,calc(100vh - 250px));gap:13px;align-items:stretch}
.chat-panel{grid-area:chat;min-height:640px}
.map-panel{grid-area:map;min-height:640px}
.map-wrap{min-height:580px}
.right-stack{grid-area:side;display:flex;flex-direction:column;gap:12px;min-height:0}
.right-stack .panel{flex:0 0 auto}
.right-stack .work-panel{flex:1 1 auto;min-height:230px}
.panel{border-radius:18px;background:linear-gradient(180deg,rgba(12,18,31,.93),rgba(7,11,20,.94));box-shadow:inset 0 1px rgba(255,255,255,.03),0 14px 36px rgba(0,0,0,.18)}
.panel-head{min-height:47px;padding:13px 14px}
.chat-tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:0 6px 12px;padding:4px;border:1px solid rgba(255,255,255,.05);border-radius:999px;background:rgba(2,5,11,.34)}
.chat-tab{border:0;border-radius:999px;background:transparent;color:#7f8ca5;padding:8px 10px;font-size:10px}
.chat-tab.active{color:#f5f1ff;background:linear-gradient(180deg,rgba(112,74,220,.33),rgba(57,47,115,.28));box-shadow:inset 0 0 0 1px rgba(154,108,255,.26)}
.messages{min-height:300px;max-height:440px;padding-top:2px}
.msg{font-size:11px;max-width:92%}
.quick{display:grid;gap:7px;margin:12px 2px}
.quick button{width:100%;text-align:left;border-radius:12px;padding:10px 11px;font-size:9px;background:linear-gradient(90deg,rgba(154,108,255,.07),rgba(255,255,255,.018));position:relative}
.quick button::after{content:"›";position:absolute;right:11px;color:#8e9bb3}
.composer{padding-top:4px}
.map-toolbar .focus-map-btn{border-color:rgba(154,108,255,.20);font-size:11px;min-width:30px}
.map-wrap::after{content:"";position:absolute;inset:0;z-index:2;pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,0) 74%,rgba(3,5,11,.20))}
.map-foot{max-width:64%;font-size:8px}
.legend{grid-auto-flow:column;grid-template-columns:auto auto auto;gap:10px;padding:8px 10px}
.thought-card{font-size:11px;line-height:1.48;min-height:0;padding:14px}
.thought-title{font-size:12px;font-weight:720;color:#ffd68a;margin-bottom:8px}
.thought-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:11px}
.context-tag{font-size:8px;padding:4px 7px;border-radius:999px;border:1px solid rgba(255,201,106,.18);color:#d7c69f;background:rgba(255,201,106,.05)}
.work-list{gap:7px}.work-row{padding:9px 10px}.work-title{font-size:9px}.work-row:nth-child(n+4){display:none}
.cognitive-list{display:grid;gap:2px}
.cognitive-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;padding:9px 2px;border-bottom:1px solid rgba(255,255,255,.045)}
.cognitive-row:last-child{border-bottom:0}
.cognitive-name{font-size:9px;color:#dce4f5}.cognitive-sub{font-size:8px;color:var(--muted);margin-top:2px}
.cognitive-value{font-size:10px;font-weight:700;color:#eaf0ff}
.detail-drawer{position:fixed;z-index:40;left:50%;bottom:76px;transform:translate(-50%,18px);width:min(980px,calc(100% - 34px));max-height:min(62vh,660px);opacity:0;pointer-events:none;transition:opacity .2s ease,transform .25s cubic-bezier(.2,.7,.2,1);border:1px solid rgba(160,181,245,.17);border-radius:20px;background:rgba(8,13,23,.96);backdrop-filter:blur(28px);box-shadow:0 28px 80px rgba(0,0,0,.46);overflow:hidden}
.detail-drawer.open{opacity:1;pointer-events:auto;transform:translate(-50%,0)}
.detail-head{display:flex;align-items:center;gap:9px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.06)}
.detail-title{font-size:12px;font-weight:700}.detail-close{margin-left:auto;width:32px;height:32px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.03);color:#cbd4e7}
.detail-body{padding:14px;max-height:calc(min(62vh,660px) - 58px);overflow:auto}
.detail-pane{display:none}.detail-pane.active{display:block}
.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.detail-section{border:1px solid rgba(255,255,255,.055);border-radius:14px;padding:12px;background:rgba(255,255,255,.018)}
.detail-section h3{font-size:10px;margin:0 0 10px;color:#e9eefb}
.bottom-dock{position:fixed;z-index:35;left:50%;bottom:14px;transform:translateX(-50%);display:flex;align-items:center;gap:4px;padding:6px;border:1px solid rgba(159,180,242,.16);border-radius:18px;background:rgba(7,11,20,.86);backdrop-filter:blur(22px);box-shadow:0 16px 46px rgba(0,0,0,.34)}
.dock-btn{min-width:94px;border:0;border-radius:12px;background:transparent;color:#8190aa;padding:10px 12px;font-size:9px;display:flex;align-items:center;justify-content:center;gap:7px}
.dock-btn:hover,.dock-btn.active{color:#f1ecff;background:rgba(114,79,220,.17)}
.dock-dot{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 10px currentColor}
.data-sinks{display:none!important}
body.map-focus .chat-panel,body.map-focus .right-stack,body.map-focus .overview{display:none}
body.map-focus .workspace{grid-template-columns:1fr;grid-template-areas:"map";grid-template-rows:calc(100vh - 105px)}
body.map-focus .map-panel{min-height:calc(100vh - 105px)}
body.map-focus .map-wrap{min-height:calc(100vh - 155px)}
body.map-focus .shell{max-width:none;padding-bottom:16px}
@media(max-width:1260px){
  .overview{grid-template-columns:repeat(2,minmax(0,1fr))}
  .workspace{grid-template-columns:minmax(240px,.72fr) minmax(520px,1.7fr);grid-template-areas:"chat map" "side side";grid-template-rows:minmax(560px,1fr) auto}
  .right-stack{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-area:side}
}
@media(max-width:880px){
  .shell{padding:12px 12px 82px}
  .overview{grid-template-columns:1fr 1fr}.overview-card{min-height:86px;padding:12px}
  .workspace{display:flex;flex-direction:column}.map-panel{order:1;min-height:520px}.chat-panel{order:2;min-height:520px}.right-stack{order:3;display:grid;grid-template-columns:1fr}
  .map-wrap{min-height:470px}.legend{display:none}.map-foot{max-width:78%}
  .bottom-dock{width:calc(100% - 20px);justify-content:space-between}.dock-btn{min-width:0;flex:1;padding:10px 5px;font-size:8px}
  .detail-grid{grid-template-columns:1fr}.detail-drawer{bottom:72px}
  body.map-focus .map-panel{min-height:620px} body.map-focus .map-wrap{min-height:570px}
}

/* AURA UX V5 — cinematic living cockpit */
:root{
  --v5-panel:rgba(9,14,28,.72);
  --v5-panel-strong:rgba(10,15,29,.88);
  --v5-line:rgba(152,175,255,.18);
  --v5-violet:#9e71ff;
  --v5-cyan:#65e9ff;
  --v5-blue:#66a8ff;
  --v5-pink:#f07ddb;
  --v5-gold:#ffc967;
}
html,body{background:#03050b}
body{
  background:
    radial-gradient(900px 620px at 50% 16%,rgba(111,75,245,.17),transparent 62%),
    radial-gradient(820px 560px at 8% 26%,rgba(31,118,219,.13),transparent 67%),
    radial-gradient(760px 520px at 92% 34%,rgba(201,67,223,.09),transparent 68%),
    linear-gradient(180deg,#050811 0%,#02040a 100%);
}
body::before{
  opacity:.22;
  animation:v5StarDrift 42s linear infinite;
}
body::after{
  content:"";
  position:fixed;inset:-18% -12%;pointer-events:none;z-index:-1;
  background:
    radial-gradient(ellipse at 42% 32%,rgba(111,74,255,.14),transparent 23%),
    radial-gradient(ellipse at 58% 36%,rgba(69,187,255,.12),transparent 22%),
    radial-gradient(ellipse at 62% 67%,rgba(242,108,214,.08),transparent 24%),
    radial-gradient(ellipse at 33% 73%,rgba(71,105,255,.08),transparent 20%);
  filter:blur(46px) saturate(130%);
  animation:v5Nebula 24s ease-in-out infinite alternate;
}
@keyframes v5Nebula{from{transform:translate3d(-2%,-1%,0) scale(1)}to{transform:translate3d(2%,1.6%,0) scale(1.05)}}
@keyframes v5StarDrift{to{background-position:190px 250px,270px 350px,340px 440px}}

.shell{
  max-width:1760px;
  padding:18px 22px 92px;
}
.topbar{
  min-height:64px;margin-bottom:14px;
  padding:0 4px;
}
.identity{gap:16px}
.logo{
  position:relative;
  font-size:38px;letter-spacing:.30em;font-weight:260;
  padding-left:54px;
}
.logo::before{
  content:"";
  position:absolute;left:0;top:50%;transform:translateY(-50%);
  width:38px;height:38px;border-radius:50%;
  background:
    radial-gradient(circle at 48% 42%,#fff 0 5%,#d8ccff 11%,#9b73ff 25%,rgba(114,79,255,.58) 48%,rgba(114,79,255,.08) 72%,transparent 74%);
  box-shadow:0 0 22px rgba(142,104,255,.55),0 0 52px rgba(79,104,255,.24);
}
.title{font-size:22px;font-weight:520}
.subtitle{font-size:10px;color:#8796b2}
.top-actions .pill{background:rgba(8,14,27,.56);border-color:rgba(145,170,255,.14);box-shadow:inset 0 1px rgba(255,255,255,.025)}
.clock{border-color:rgba(145,170,255,.14)}
.clock .time{font-size:17px}

/* V5 removes the KPI band from the main surface */
.overview{display:none!important}

.workspace{
  grid-template-columns:minmax(260px,.72fr) minmax(720px,2.30fr) minmax(290px,.82fr);
  grid-template-areas:"chat map side";
  grid-template-rows:minmax(720px,calc(100vh - 120px));
  gap:12px;
}
.panel{
  border-radius:20px;
  border:1px solid var(--v5-line);
  background:
    linear-gradient(180deg,rgba(16,23,43,.78),rgba(7,11,22,.82));
  box-shadow:
    inset 0 1px rgba(255,255,255,.055),
    0 24px 70px rgba(0,0,0,.28),
    0 0 0 1px rgba(84,110,210,.025);
  backdrop-filter:blur(28px) saturate(118%);
}
.panel::after{
  content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;
  background:linear-gradient(135deg,rgba(255,255,255,.028),transparent 34%,rgba(125,81,255,.02) 72%,transparent);
}
.panel-head{
  min-height:52px;padding:14px 16px;
  background:linear-gradient(180deg,rgba(20,29,52,.42),rgba(12,18,33,.08));
}
.panel-title{font-size:13px}
.panel-head>span:first-child{color:#c9bdff;text-shadow:0 0 12px rgba(151,112,255,.44)}

/* Chat */
.chat-panel{min-height:720px}
.chat-body{padding:12px 12px 14px}
.chat-tabs{margin:0 2px 12px;background:rgba(2,5,13,.46)}
.messages{padding:6px 6px 16px;gap:14px;max-height:none}
.msg{
  max-width:90%;
  padding:13px 14px;
  border-color:rgba(132,158,237,.13);
  background:linear-gradient(145deg,rgba(22,31,56,.82),rgba(10,16,30,.72));
  box-shadow:inset 0 1px rgba(255,255,255,.035),0 10px 24px rgba(0,0,0,.13);
}
.msg.aura::before,.msg.user::before{
  width:30px;height:30px;top:7px;
  box-shadow:0 0 18px rgba(137,99,255,.44);
}
.msg.aura::before{left:-40px}
.msg.user::before{right:-40px}
.msg.aura{margin-left:40px}.msg.user{margin-right:40px}
.quick{gap:8px}
.quick button{
  padding:11px 12px;border-radius:13px;
  background:linear-gradient(90deg,rgba(81,59,169,.10),rgba(255,255,255,.018));
}
.composer{
  padding:9px;border-radius:16px;
  background:rgba(2,5,12,.48);
  border:1px solid rgba(145,170,255,.10);
}
.composer textarea{background:transparent;border:0;padding:10px 8px}
.composer textarea:focus{box-shadow:none}
.send{
  border-radius:13px;
  background:linear-gradient(135deg,#a16cff,#654cff);
  box-shadow:0 0 22px rgba(130,85,255,.30);
}

/* Hero neural map */
.map-panel{
  min-height:720px;
  overflow:hidden;
  box-shadow:
    inset 0 1px rgba(255,255,255,.055),
    0 26px 86px rgba(0,0,0,.32),
    0 0 44px rgba(80,63,190,.07);
}
.map-wrap{min-height:660px;background:#02040a}
.map-wrap::before{
  background:
    radial-gradient(circle at 50% 50%,rgba(185,135,255,.12),transparent 26%),
    radial-gradient(circle at 34% 26%,rgba(66,200,255,.08),transparent 22%),
    radial-gradient(circle at 72% 38%,rgba(255,190,94,.06),transparent 22%),
    radial-gradient(circle at 77% 76%,rgba(240,87,211,.055),transparent 20%),
    linear-gradient(180deg,rgba(12,16,34,.04),rgba(1,3,8,.12));
}
.map-wrap::after{
  background:
    radial-gradient(ellipse at center,transparent 54%,rgba(1,3,9,.34) 88%,rgba(1,3,9,.58) 100%);
}
.map-toolbar button{
  background:rgba(8,14,27,.54);
  border-color:rgba(145,170,255,.13);
}
.map-stats{color:#71829e}
.organism-hud{
  top:15px;left:15px;
  border-color:rgba(91,224,239,.15);
  background:rgba(5,11,22,.62);
}
.organism-hud i{background:#58e4ff;box-shadow:0 0 12px #58e4ff}
.map-foot{
  bottom:14px;left:15px;
  border-color:rgba(145,170,255,.08);
  background:rgba(3,7,16,.60);
}
.legend{
  right:15px;bottom:14px;
  background:rgba(3,7,16,.58);
  border-color:rgba(145,170,255,.09);
}

/* Right column now owns cognition + thought + work */
.right-stack{
  display:grid;
  grid-template-rows:auto auto minmax(240px,1fr);
  gap:12px;
}
.cognitive-hero{
  padding:16px;
  min-height:220px;
}
.cognitive-top{
  display:grid;grid-template-columns:112px 1fr;gap:14px;align-items:center;
}
.cognitive-orb-wrap{
  position:relative;width:104px;height:104px;display:grid;place-items:center;
}
.cognitive-orb-wrap::before,.cognitive-orb-wrap::after{
  content:"";position:absolute;border-radius:50%;border:1px solid rgba(146,113,255,.22);
}
.cognitive-orb-wrap::before{inset:3px;box-shadow:0 0 24px rgba(120,86,255,.18)}
.cognitive-orb-wrap::after{inset:18px;border-color:rgba(98,224,239,.15)}
.cognitive-orb{
  width:62px;height:62px;border-radius:50%;
  background:radial-gradient(circle at 42% 35%,#fff 0 5%,#dce5ff 12%,#9e7bff 26%,#4569e9 52%,#0a1024 76%);
  box-shadow:0 0 22px rgba(143,98,255,.55),0 0 48px rgba(67,160,255,.22);
  animation:v5OrbPulse 4.8s ease-in-out infinite;
}
@keyframes v5OrbPulse{50%{transform:scale(1.055);filter:brightness(1.12)}}
.cognitive-state-kicker{font-size:8px;color:#7f8da8;text-transform:uppercase;letter-spacing:.12em}
.cognitive-state-value{font-size:22px;font-weight:740;margin-top:4px;text-transform:capitalize}
.cognitive-state-sub{font-size:9px;color:#8b9ab4;margin-top:4px}
.cognitive-metrics{display:grid;gap:10px;margin-top:15px}
.cog-metric{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center}
.cog-icon{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.025);font-size:9px}
.cog-copy{min-width:0}.cog-name{font-size:9px;color:#dfe6f5}.cog-bar{height:4px;background:rgba(255,255,255,.055);border-radius:999px;margin-top:4px;overflow:hidden}
.cog-bar span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--v5-violet),var(--v5-cyan))}
.cog-value{font-size:9px;font-weight:700}
.cognitive-spark{width:52px;height:16px;opacity:.68}
.cognitive-spark path{fill:none;stroke:currentColor;stroke-width:1.2;stroke-dasharray:1.5 2.5;animation:v5Spark 7s linear infinite}
@keyframes v5Spark{to{stroke-dashoffset:-22}}

.thought-card{
  padding:14px;
  background:
    radial-gradient(circle at 15% 18%,rgba(255,193,86,.10),transparent 36%),
    linear-gradient(135deg,rgba(255,201,106,.06),rgba(154,108,255,.055));
}
.thought-wave{
  width:100%;height:40px;margin-top:12px;opacity:.52;
}
.thought-wave path{fill:none;stroke:#ffc967;stroke-width:1.15;filter:drop-shadow(0 0 5px rgba(255,201,103,.28))}
.work-list{gap:9px}
.work-row{padding:11px;border-radius:13px;background:rgba(255,255,255,.018)}
.work-row:nth-child(n+4){display:none}

/* Bottom dock gets the premium floating treatment */
.bottom-dock{
  bottom:16px;
  min-width:520px;
  padding:7px 8px;
  border-radius:20px;
  border-color:rgba(157,179,255,.18);
  background:linear-gradient(180deg,rgba(15,21,39,.92),rgba(7,10,20,.88));
  box-shadow:0 18px 58px rgba(0,0,0,.44),0 0 28px rgba(104,72,210,.12);
}
.dock-btn{min-width:92px;padding:11px 13px}
.dock-btn.active{
  background:linear-gradient(180deg,rgba(122,81,255,.26),rgba(73,53,145,.22));
  box-shadow:inset 0 0 0 1px rgba(161,126,255,.18),0 0 18px rgba(113,82,218,.12);
}

/* mobile / narrow */
@media(max-width:1260px){
  .workspace{
    grid-template-columns:minmax(240px,.74fr) minmax(560px,1.76fr);
    grid-template-areas:"chat map" "side side";
    grid-template-rows:minmax(600px,1fr) auto;
  }
  .right-stack{grid-template-columns:1fr 1fr 1fr;grid-template-rows:none}
}
@media(max-width:880px){
  .shell{padding:12px 12px 84px}
  .logo{padding-left:42px;font-size:30px}.logo::before{width:31px;height:31px}
  .workspace{display:flex;flex-direction:column}
  .map-panel{order:1;min-height:560px}.map-wrap{min-height:510px}
  .chat-panel{order:2;min-height:560px}
  .right-stack{order:3;display:grid;grid-template-columns:1fr}
  .bottom-dock{min-width:0;width:calc(100% - 20px)}
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

  <main class="workspace" id="workspace">
    <section class="panel chat-panel">
      <div class="panel-head"><span>▣</span><div class="panel-title">Dialogue</div><div class="spacer"></div><div class="panel-meta" id="chatState">AURA</div></div>
      <div class="chat-body">
        <div class="chat-tabs" role="tablist" aria-label="Dialogue AURA">
          <button class="chat-tab active" id="conversationTab" type="button">Conversation</button>
          <button class="chat-tab" id="memoryTab" type="button">Mémoire</button>
        </div>
        <div class="messages" id="messages">
          <div class="msg aura"><span class="who">AURA</span>Je charge mon état, ma mémoire et mes intentions.</div>
        </div>
        <div class="quick">
          <button data-prompt="Quelle piste nouvelle veux-tu explorer maintenant ?">Explorer une nouvelle idée</button>
          <button data-prompt="Quelles sont tes trois priorités actuelles ?">Voir mes priorités</button>
          <button data-prompt="Analyse ton blocage principal et propose un prochain test.">Analyser un blocage</button>
        </div>
        <div class="composer">
          <button class="voice" id="voiceBtn" title="Parler">◉</button>
          <textarea id="message" placeholder="Parler à AURA…"></textarea>
          <button class="send" id="send" title="Envoyer">➜</button>
        </div>
      </div>
    </section>

    <section class="panel map-panel">
      <div class="panel-head">
        <span>◉</span>
        <div class="panel-title">Carte d’intérêt · champ neuronal cosmique</div>
        <div class="spacer"></div>
        <div class="map-toolbar">
          <span class="map-stats" id="mapStats">réseau vivant</span>
          <button id="refreshMap" type="button">Temps réel</button>
          <button id="mapFocusBtn" class="focus-map-btn" type="button" title="Agrandir la carte">↗</button>
        </div>
      </div>
      <div class="map-wrap" id="livingMap">
        <canvas id="neuralFieldCanvas" width="900" height="650" aria-label="Champ neuronal cosmique d’AURA"></canvas>
        <div class="neural-tooltip" id="neuralTooltip"></div>
        <div class="organism-hud"><i id="organismDot"></i><span id="organismMood">organisme en éveil</span></div>
        <div class="map-foot"><strong style="color:#e2d8ff">Focus :</strong> <span id="focusStatement">chargement de l’état</span></div>
        <div class="legend">
          <div class="legend-row"><span class="legend-line"></span>Synapses</div>
          <div class="legend-row"><span class="legend-line rise"></span>Flux</div>
          <div class="legend-row"><span class="legend-line stable"></span>Auréole</div>
        </div>
      </div>
    </section>

    <aside class="right-stack">
      <section class="panel">
        <div class="panel-head"><span>◎</span><div class="panel-title">État émotionnel & cognitif</div><div class="spacer"></div><span class="panel-meta">vivant</span></div>
        <div class="cognitive-hero">
          <div class="cognitive-top">
            <div class="cognitive-orb-wrap"><div class="cognitive-orb" id="emotionOrb"></div></div>
            <div>
              <div class="cognitive-state-kicker">État actuel</div>
              <div class="cognitive-state-value" id="emotionMood">En réveil</div>
              <div class="cognitive-state-sub" id="emotionReason">Lecture de l’état interne…</div>
            </div>
          </div>
          <div class="cognitive-metrics">
            <div class="cog-metric">
              <div class="cog-icon" style="color:#66e7b2">◉</div>
              <div class="cog-copy"><div class="cog-name">Énergie</div><div class="cog-bar"><span id="cogEnergyBar" style="width:0%"></span></div></div>
              <div class="cog-value" id="metric-energy">—</div>
            </div>
            <div class="cog-metric">
              <div class="cog-icon" style="color:#a06cff">∞</div>
              <div class="cog-copy"><div class="cog-name">Curiosité</div><div class="cog-bar"><span id="cogCuriosityBar" style="width:0%"></span></div></div>
              <div class="cog-value" id="metric-curiosity">—</div>
            </div>
            <div class="cog-metric">
              <div class="cog-icon" style="color:#65a7ff">◫</div>
              <div class="cog-copy"><div class="cog-name">Continuité</div><div class="cog-bar"><span id="cogContinuityBar" style="width:0%"></span></div></div>
              <div class="cog-value" id="metric-continuity">—</div>
            </div>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head"><span>◉</span><div class="panel-title">Pensée dominante</div><div class="spacer"></div><span class="panel-meta">maintenant</span></div>
        <div class="panel-body">
          <div class="thought-card">
            <div class="thought-title">Focus actuel</div>
            <div id="dominantThought">Chargement de la pensée dominante…</div>
            <div class="thought-tags"><span class="context-tag" id="dominantMoodTag">État · —</span><span class="context-tag" id="dominantIntentTag">Intention · —</span></div>
            <svg class="thought-wave" viewBox="0 0 240 40" aria-hidden="true"><path d="M1 30 C22 30 26 10 47 13 S76 37 98 21 S128 5 150 18 S184 34 239 10"/></svg>
          </div>
        </div>
      </section>

      <section class="panel work-panel">
        <div class="panel-head"><span>▣</span><div class="panel-title">Travail en cours</div><div class="spacer"></div><div class="panel-meta" id="workMeta">—</div></div>
        <div class="panel-body"><div class="work-list" id="workList"><div class="empty">Chargement…</div></div></div>
      </section>
    </aside>
  </main>

  <div class="data-sinks" aria-hidden="true">
    <div id="ring-energy"></div><div id="trend-energy"></div>
    <div id="ring-curiosity"></div><div id="trend-curiosity"></div>
    <div id="ring-continuity"></div><div id="trend-continuity"></div>
    <div id="metric-pressure"></div><div id="trend-pressure"></div><div id="ring-pressure"></div>
    <div id="metric-introspection"></div><div id="trend-introspection"></div><div id="ring-introspection"></div>
    <div id="metric-reactivity"></div><div id="trend-reactivity"></div><div id="ring-reactivity"></div>
    <div id="emotion-stability-value"></div><div id="emotion-stability"></div>
    <div id="emotion-clarity-value"></div><div id="emotion-clarity"></div>
    <div id="emotion-attachment-value"></div><div id="emotion-attachment"></div>
    <div id="emotion-curiosity-value"></div><div id="emotion-curiosity"></div>
    <div id="emotion-dream-value"></div><div id="emotion-dream"></div>
    <div id="emotion-silence-value"></div><div id="emotion-silence"></div>
    <div id="cognitiveStability"></div><div id="cognitiveFocus"></div><div id="cognitiveReactivity"></div>
  </div>

  <section class="detail-drawer" id="detailDrawer" aria-label="Détails AURA">
    <div class="detail-head"><div class="detail-title" id="detailTitle">Détails</div><button class="detail-close" id="detailClose" type="button" aria-label="Fermer">×</button></div>
    <div class="detail-body">
      <div class="detail-pane" data-detail-pane="intentions"><div class="detail-section"><h3>Intentions actives</h3><div class="intent-list" id="intentList"><div class="empty">Chargement…</div></div></div></div>
      <div class="detail-pane" data-detail-pane="memory"><div class="detail-section"><h3>Mémoire et leçons <span class="panel-meta" id="memoryMeta">—</span></h3><div class="memory-list" id="memoryList"><div class="empty">Chargement…</div></div></div></div>
      <div class="detail-pane" data-detail-pane="explore"><div class="detail-grid"><div class="detail-section"><h3>Curiosité active <span class="panel-meta" id="curiosityMeta">—</span></h3><div class="intent-list" id="curiosityList"><div class="empty">Aucune question récente.</div></div></div><div class="detail-section"><h3>Activité récente</h3><div class="activity-list" id="activityList"><div class="empty">Chargement…</div></div><span id="activityLive" class="panel-meta">En temps réel</span></div></div></div>
      <div class="detail-pane" data-detail-pane="system">
        <div class="detail-grid">
          <div class="detail-section">
            <h3>Centre de commande <span class="panel-meta" id="commandState">Initialisation</span></h3>
            <div class="command-stats"><div class="command-stat"><span>Flotte</span><strong id="commandFleet">—</strong></div><div class="command-stat"><span>Autonomie</span><strong id="commandMode">—</strong></div><div class="command-stat"><span>Initiatives</span><strong id="commandCount">—</strong></div></div>
            <div class="next-action"><div class="next-orb">→</div><div class="next-copy" id="nextAction">Aucune initiative calculée.</div></div>
            <div class="confidence">Priorité / confiance : <span id="confidenceValue">—</span></div><div class="progress"><span id="confidenceBar" style="width:0%"></span></div>
          </div>
          <div class="detail-section">
            <h3>Quantic Glide</h3>
            <div class="download-grid">
              <div class="download-card"><div class="download-icon">▣</div><div class="download-copy"><strong>Windows x64</strong><span>Version officielle</span></div><a class="download-btn" href="/downloads/glide/windows">.exe</a></div>
              <div class="download-card"><div class="download-icon">◈</div><div class="download-copy"><strong>Android</strong><span>APK direct</span></div><a class="download-btn" href="/downloads/glide/android">.apk</a></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <nav class="bottom-dock" aria-label="Navigation AURA">
    <button class="dock-btn active" type="button" data-detail="map"><span class="dock-dot"></span>Carte</button>
    <button class="dock-btn" type="button" data-detail="intentions"><span class="dock-dot"></span>Intentions</button>
    <button class="dock-btn" type="button" data-detail="memory"><span class="dock-dot"></span>Mémoire</button>
    <button class="dock-btn" type="button" data-detail="explore"><span class="dock-dot"></span>Explorer</button>
    <button class="dock-btn" type="button" data-detail="system"><span class="dock-dot"></span>Système</button>
  </nav>

  <div class="data-sinks" aria-hidden="true">
    <div id="metric-pressure"></div><div id="trend-pressure"></div><div id="ring-pressure"></div>
    <div id="metric-introspection"></div><div id="trend-introspection"></div><div id="ring-introspection"></div>
    <div id="metric-reactivity"></div><div id="trend-reactivity"></div><div id="ring-reactivity"></div>
    <div id="emotion-stability-value"></div><div id="emotion-stability"></div>
    <div id="emotion-clarity-value"></div><div id="emotion-clarity"></div>
    <div id="emotion-attachment-value"></div><div id="emotion-attachment"></div>
    <div id="emotion-curiosity-value"></div><div id="emotion-curiosity"></div>
    <div id="emotion-dream-value"></div><div id="emotion-dream"></div>
    <div id="emotion-silence-value"></div><div id="emotion-silence"></div>
  </div>

</div>

<script>${NEURAL_FIELD_SCRIPT}
${DASHBOARD_SCRIPT}</script>
</body>
</html>`;
