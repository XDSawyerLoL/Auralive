export const BRAIN_READABLE_CSS = String.raw`/* AURA cockpit — readability layer. Applied AFTER the legacy reference stylesheet.
   The normal experience is a conversation, a causal map and a compact status.
   Technical inventory remains accessible through native disclosure panels. */
:root{--text:#f5f1fa;--muted:#b8b0c6;--line:#443452}
html{scroll-behavior:smooth}
body{font-size:15px;line-height:1.5;letter-spacing:normal}
button,input,select,summary{font:inherit}
button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{
 outline:2px solid #9bf6e8;outline-offset:3px
}
.shell{max-width:1920px;margin:auto;padding:14px 18px 28px}
.top{position:relative;top:auto;z-index:9;min-height:70px;padding:10px 16px;gap:16px}
.logo strong{font-size:22px;letter-spacing:0}
.logo small{font-size:11px;letter-spacing:.015em;color:#c0b4cb}
.logo-mark{width:43px;height:43px}
.live{font-size:13px;padding:10px 14px}
.top-btn{font-size:13px;padding:10px 14px;cursor:pointer}
.build-mark{display:none}
.scene-nav{margin:10px 0;gap:7px;padding:6px}
.scene-nav button{font-size:13px;line-height:1.3;min-height:38px;padding:9px 16px}
.intro-details,.module-drawer,.side-details,.diagnostics-details{
 border:1px solid #4a385c;border-radius:12px;background:#100d19;
}
.intro-details{margin:0 0 9px}
.intro-details>summary,.module-drawer>summary,.side-details>summary,.diagnostics-details>summary{
 list-style:none;display:flex;justify-content:space-between;align-items:center;gap:12px;
 min-height:43px;padding:10px 15px;color:#ead9fa;font-size:14px;font-weight:650;
 cursor:pointer;user-select:none
}
.intro-details>summary::after,.module-drawer>summary::after,
.side-details>summary::after,.diagnostics-details>summary::after{
 content:"⌄";font-size:19px;color:#86dcd4;transition:transform .12s
}
.intro-details[open]>summary::after,.module-drawer[open]>summary::after,
.side-details[open]>summary::after,.diagnostics-details[open]>summary::after{
 transform:rotate(180deg)
}
.module-drawer summary span{font-size:12px;font-weight:400;color:#b0a4c0;margin-left:auto}
.hero{margin:0;padding:0 9px 10px;grid-template-columns:1fr 1fr}
.hero-card,.request-card{padding:12px 14px}
.hero-card h1{font-size:19px}
.hero-card p,.request-box p{font-size:13px;line-height:1.55;max-height:none;overflow:visible}
.hero-note{gap:8px}
.pill{font-size:11px;padding:6px 8px}
.request-card h2{font-size:12px}
.request-box label{font-size:11px}
.request-box strong{font-size:15px}
.kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px;margin:0 0 12px}
.kpi{min-width:0;min-height:66px;padding:10px 12px}
.kpi label{font-size:11px;line-height:1.35;letter-spacing:normal}
.kpi strong{font-size:22px;line-height:1.15;margin-top:6px}
.workspace{display:grid;grid-template-columns:minmax(340px,380px) minmax(400px,1fr) minmax(290px,330px);gap:12px;align-items:stretch;margin:0}
.panel{border-radius:12px}
.panel-header{padding:12px 14px;gap:9px}
.panel-header h2{font-size:16px;line-height:1.3;letter-spacing:0;margin:0}
.panel-header small{font-size:12px;color:#aaa3b8}
.dialogue-rail{min-width:0;max-height:none!important;display:flex;flex-direction:column;gap:12px}
.conversation-workspace{display:flex;flex-direction:column;height:clamp(530px,70vh,780px);min-height:530px;overflow:hidden}
.conversation-workspace .panel-header{border-bottom:1px solid #463552}
#chatHistory,#chatHistory.open{
 display:flex;flex:1;min-height:0;max-height:none;flex-direction:column;gap:12px;
 overflow-y:auto;overflow-x:hidden;padding:18px 14px;scrollbar-width:thin
}
#chatHistory:empty::before{
 content:"Commence une conversation. Les réponses apparaîtront ici, tandis que le réseau montrera uniquement les traitements enregistrés.";
 display:block;font-size:15px;line-height:1.65;color:#bfb6cb;max-width:29ch
}
#chatHistory .chat-message,#chatHistory .chat-message.user{
 font-size:15px;line-height:1.65;max-width:94%;width:max-content;padding:13px 15px;
 border-radius:14px;white-space:pre-wrap;overflow-wrap:anywhere;align-self:flex-start
}
#chatHistory .chat-message.user{align-self:flex-end;background:#16343a;border-color:#417c80}
.chat-message small,#chatHistory .chat-message small{
 display:block;font-size:11px;line-height:1.5;letter-spacing:0;margin-bottom:7px;color:#b5eee1
}
.conversation-workspace .chat{
 position:static;transform:none;left:auto;bottom:auto;z-index:auto;
 width:100%;max-width:none;border:0;border-top:1px solid #4a3755;
 box-shadow:none;border-radius:0;background:#151021;padding:14px
}
.conversation-workspace .chat-main{
 display:grid;grid-template-columns:minmax(0,1fr) auto;
 grid-template-rows:auto auto;gap:9px;align-items:center
}
.conversation-workspace .chat-main strong{display:none}
#chatMode{grid-column:1;grid-row:1;width:100%;font-size:13px;min-height:43px;padding:9px 12px}
#chatSend{grid-column:2;grid-row:1;font-size:14px;min-height:43px;padding:10px 18px;cursor:pointer}
#chatInput{
 grid-column:1/-1;grid-row:2;min-height:54px;font-size:15px;padding:13px;
 border-radius:11px
}
#chatExpand{display:none}
.module-drawer{flex:0 0 auto;overflow:hidden}
.module-drawer .modules-panel{height:auto!important;min-height:0!important;border:0;border-radius:0;box-shadow:none}
.module-toolbar{padding:12px;gap:9px}
.module-toolbar .search,.module-toolbar select{font-size:14px;padding:10px 12px;min-height:44px}
.module-toolbar #moduleSummary{font-size:12px;line-height:1.5}
.modules-list{height:320px!important;max-height:320px;overflow:auto;display:block;padding:8px 12px}
.group-label{font-size:12px;padding:11px 6px 6px}
.module-row{width:100%;min-height:48px;padding:10px 9px;gap:9px}
.module-description .name{font-size:14px;line-height:1.35}
.module-description small{font-size:11px;color:#a69eb7}
.module-row .state{font-size:10px;max-width:105px}
.graph-panel{height:clamp(530px,70vh,780px);min-height:530px;display:flex;flex-direction:column}
.graph-top{padding:13px 15px 10px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.graph-top h2{font-size:17px;line-height:1.35}
.graph-top p{font-size:12px;line-height:1.45}
.graph-controls{gap:5px}
.graph-controls button,.graph-controls select{min-height:35px;font-size:12px}
.graph-stage{flex:1;display:flex;flex-direction:column;min-height:0;padding:0 10px 12px}
.graph-canvas{flex:1;min-height:360px;height:auto;border-color:#453953}
.graph-bottom{flex:0 0 auto;min-height:48px;padding:7px 7px 0}
.graph-legend{font-size:11px;line-height:1.45;gap:13px;flex-wrap:wrap}
.graph-caption{font-size:11px;line-height:1.5}
.graph-hud{top:10px;left:10px;right:10px;display:flex;align-items:start;justify-content:space-between}
.graph-floating{font-size:11px;padding:7px 10px;max-width:48%}
.graph-hud .graph-floating:nth-child(3){display:none}
.neural-inspector{display:none!important}
.workspace>.inspector{min-width:0;max-height:clamp(530px,70vh,780px);height:clamp(530px,70vh,780px)!important;overflow:hidden}
.inspector-scroll{height:100%;min-height:0;padding:10px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;scrollbar-width:thin}
.detail-card{padding:13px 14px;border-radius:11px}
.detail-card h3,.inline-head h3{font-size:15px;line-height:1.35}
.causal-card{display:grid;gap:12px}
.truth-chip,#causalStatus{font-size:11px;white-space:normal}
.causal-evidence{font-size:13px;line-height:1.55}
.causal-digest{gap:5px}
.causal-digest>div,.causal-value{padding:9px 0;gap:12px}
.causal-digest span,.causal-value span{font-size:12px;line-height:1.4}
.causal-digest strong,.causal-value strong{font-size:13px;line-height:1.45}
.causal-values{max-height:210px}
.causal-footnote{font-size:11px;line-height:1.5}
#homeostasis-panel{height:auto!important;min-height:0!important;display:block}
#homeostasis-panel .panel-header{padding:12px}
.affect-status{font-size:13px;line-height:1.4;margin:12px 12px 0}
.affect-status strong{font-size:15px}
.somatic-sensors{padding:12px;margin:12px}
.somatic-sensors>div:not(.inline-head){font-size:12px;line-height:1.5}
.somatic-sensors small{font-size:11px}
.metric-list{padding:10px 12px}
.metric-line{grid-template-columns:105px minmax(0,1fr) 43px;gap:9px;padding:7px 0;font-size:12px}
.metric-line strong{font-size:12px}
.track{height:8px}
.affect-bridge{font-size:12px;padding:10px;margin:8px 12px}
#metricTime{font-size:11px}
.side-details{flex:0 0 auto;padding:0 0 8px}
.side-details .detail-card,.side-details .owner{margin:8px 10px}
.side-details .owner p{font-size:12px;line-height:1.5}
.side-details .field-label{font-size:11px}
.side-details .field-value{font-size:13px;line-height:1.5}
.side-details .detail-state{font-size:11px}
.route-step b,.tool-row b{font-size:13px}
.route-step small,.tool-row small{font-size:11px}
.diagnostics-details{margin-top:14px;padding:0 10px 10px}
.diagnostics-details>summary{font-size:15px;min-height:46px}
.lower{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0}
.lower .panel{min-height:0}
.lower .panel-header h2{font-size:14px}
.lower .scroll-list{padding:12px;max-height:250px}
.flow-item b{font-size:13px}
.flow-item small,.event-row small,.activity-entry small{font-size:12px}
.event-row strong,.activity-entry strong{font-size:13px}
.memory-stats .memory-row{font-size:13px}
.runtime-incident{margin:10px 0;padding:15px}
.runtime-incident .incident-main strong{font-size:15px}
.runtime-incident .incident-main p{font-size:13px}
.runtime-incident .incident-main small{font-size:12px}
@media(max-width:1499px){
 .workspace{grid-template-columns:minmax(330px,390px) minmax(0,1fr)}
 .workspace>.inspector{grid-column:1/-1;height:auto!important;max-height:none}
 .inspector-scroll{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start}
 .inspector-scroll>.side-details{grid-column:1/-1}
 .graph-panel,.conversation-workspace{height:clamp(550px,70vh,760px)}
 .kpis{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media(max-width:899px){
 .shell{padding:10px}
 .top{flex-wrap:wrap;min-height:0}
 .logo strong{font-size:20px}
 .workspace{display:flex;flex-direction:column}
 .conversation-workspace{height:470px;min-height:420px}
 .graph-panel{height:600px;min-height:520px}
 .workspace>.inspector{height:auto!important;max-height:none}
 .inspector-scroll{grid-template-columns:1fr}
 .kpis{grid-template-columns:repeat(3,minmax(0,1fr))}
 .hero{grid-template-columns:1fr}
 .lower{grid-template-columns:1fr}
 .module-drawer .modules-list{max-height:290px}
}
@media(max-width:599px){
 .shell{padding:8px}
 .top{padding:9px}
 .logo strong{font-size:17px}
 .logo small{font-size:10px;line-height:1.4}
 .top-actions{width:100%;justify-content:space-between}
 .scene-nav button{padding:8px 12px;font-size:12px}
 .kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
 .kpi strong{font-size:19px}
 .kpi label{font-size:11px}
 .conversation-workspace{height:460px;min-height:410px}
 .graph-panel{height:560px;min-height:500px}
 .graph-top h2{font-size:16px}
 .graph-controls{width:100%;flex-wrap:wrap}
 #graphLens{flex:1;max-width:none;min-width:0}
 #chatHistory .chat-message,#chatHistory .chat-message.user{font-size:14px}
 #chatInput{font-size:16px}
 .graph-legend{font-size:10px}
 .graph-floating{max-width:65%}
 .inspector-scroll{padding:8px}
 .intro-details>summary{font-size:12px}
}
@media(prefers-reduced-motion:reduce){.intro-details>summary::after,.module-drawer>summary::after,.side-details>summary::after,.diagnostics-details>summary::after{transition:none}}

.identity-card{display:grid;gap:11px;border-color:rgba(144,205,210,.35);background:linear-gradient(160deg,#111925,#130e21)}
.identity-priority{padding:11px 13px;margin:0;border-left:3px solid #7be2d2;border-radius:6px;background:rgba(69,153,150,.12);color:#d6f6ed;font-size:14px;line-height:1.5}
.identity-question{font-size:13px;line-height:1.55;color:#d3c4e3;margin:0}
.identity-dimensions{display:grid;gap:1px}
.identity-dimension{display:flex;justify-content:space-between;align-items:baseline;gap:9px;border-bottom:1px solid rgba(174,151,192,.2);padding:9px 0}
.identity-dimension span{font-size:12px;color:#d9d5e5}
.identity-dimension strong{font-size:12px;text-align:right;line-height:1.5;font-variant-numeric:tabular-nums}
.identity-dimension strong.supported{color:#91e5d7}
.identity-dimension strong.uncertain{color:#bdb3cb;font-weight:500}
@media(max-width:1499px){.inspector-scroll{grid-template-columns:repeat(2,minmax(0,1fr))}.identity-card{grid-column:1/-1}}
@media(max-width:899px){.inspector-scroll{grid-template-columns:1fr}.identity-card{grid-column:auto}}

.atlas-details{margin:14px 0 0;border:1px solid #544268;border-radius:13px;background:#110e1a;overflow:hidden}
.atlas-details>summary{padding:15px 18px;cursor:pointer;color:#eddbf9;font-size:15px;font-weight:650;list-style:none}
.atlas-details>summary::after{content:"⌄";float:right;color:#87dfd7}
.atlas-details[open]>summary{border-bottom:1px solid #4d3d5e}
.atlas-details .cog-panel{border:0}
.atlas-details .cog-heading h2{font-size:21px}
.atlas-details .cog-stage{grid-template-columns:minmax(0,1fr) minmax(260px,315px)}
.atlas-details .cog-node .node-title{font-size:15px}
.atlas-details .cog-node.micro .node-title{font-size:12px}
.inner-voice-card{display:grid;gap:11px;border-color:rgba(131,223,201,.27);background:linear-gradient(130deg,#0f1e24,#171020)}
#innerFocus{font-size:14px;line-height:1.5}
#innerDriveScores .identity-dimension{padding:7px 0}
@media(max-width:899px){
  .atlas-details .cog-stage{grid-template-columns:minmax(0,1fr)}
  .atlas-details .cog-side{border-left:0;border-top:1px solid rgba(112,166,188,.23)}
  .atlas-details .cog-heading{flex-wrap:wrap}
  .atlas-details .cog-switch{padding:10px}
}

/* CONNECTOME 04 — deliberate visual hierarchy, architecture is not activity */
.graph-panel{height:clamp(730px,85vh,1040px);min-height:680px;border-color:rgba(105,140,211,.35);background:linear-gradient(145deg,#0d1425 0%,#080e1b 66%,#0b1120 100%);box-shadow:0 18px 65px rgba(0,0,0,.36),0 0 0 1px rgba(148,193,255,.045) inset}
.graph-top{padding:20px 23px 14px;gap:14px;border-bottom:1px solid rgba(112,151,221,.12)}
.graph-top h2{font-size:clamp(21px,2vw,29px);letter-spacing:-.035em;color:#f5f7ff;line-height:1.2;font-weight:720}
.graph-top p{font-size:12px;color:#9fb0cc;max-width:770px;line-height:1.6;margin-top:7px}
.v4-edition{font-size:13px;letter-spacing:.19em;vertical-align:middle;color:#8ea9d5;font-weight:650}
.graph-controls{width:auto;display:flex;justify-content:flex-end;align-items:center;flex-wrap:wrap;gap:7px}
.graph-controls button,.graph-controls select{font-size:12px;min-height:38px;padding:9px 12px;border:1px solid #334766;background:#111d30;color:#d9e8fa;border-radius:9px;transition:background .18s,border-color .18s}
.graph-controls button:hover,.graph-controls select:hover{background:#1a2942;border-color:#88b5ec}
.graph-controls button[aria-pressed=true]{background:rgba(74,121,151,.26);border-color:#6ee3d1;color:#b6fff0}
.graph-controls button:focus-visible,.graph-controls select:focus-visible{outline:2px solid #8bdfed;outline-offset:3px}
.graph-controls #graphFullscreen{color:#e4f9f6;border-color:#37776d}
.graph-v4-readout{padding:11px 21px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;border-bottom:1px solid rgba(105,148,207,.18);background:rgba(5,12,25,.50)}
.graph-v4-readout>span{display:grid;grid-template-columns:12px minmax(0,1fr);grid-template-rows:auto auto;align-items:center;column-gap:8px;padding:3px 15px;min-width:0;border-right:1px solid rgba(109,152,198,.17)}
.graph-v4-readout>span:last-child{border-right:0}
.graph-v4-readout strong{font-weight:680;color:#eef4ff;font-size:14px;letter-spacing:-.02em;white-space:nowrap}
.graph-v4-readout small{grid-column:2;color:#819bb5;font-size:10px;letter-spacing:.02em;margin-top:2px}
.v4-mark{width:7px;height:7px;border-radius:50%;display:inline-block;background:#a696eb;box-shadow:0 0 9px rgba(161,151,255,.34)}
.v4-mark.links{background:#8da8f1}.v4-mark.observed{background:#7ce4d7}.v4-mark.heartbeat{background:#7a8599;box-shadow:none}
.graph-v4-readout #graphV4Live[data-active=yes]{color:#88ffdb}
.graph-v4-readout #graphV4Live[data-active=yes]~small{color:#85c6ba}
.graph-stage{flex:1;min-height:0;padding:10px 13px 11px;display:flex;flex-direction:column}
.graph-canvas{height:auto;flex:1;min-height:510px;border:1px solid rgba(100,143,208,.32);border-radius:13px;background:#070d19;box-shadow:0 0 38px rgba(37,75,151,.10) inset}
.graph-canvas::before,.graph-canvas::after{display:none}
.graph-hud{left:13px;right:13px;top:11px;gap:10px}
.graph-floating{background:rgba(7,15,30,.86);border-color:rgba(116,160,218,.25);color:#a6bad5;font-size:11px;padding:9px 12px;line-height:1.45;border-radius:9px;max-width:46%}
.graph-floating#graphClock{color:#d9e7ff}
.graph-bottom{min-height:65px;padding:10px 10px 0}
.graph-legend{gap:13px;flex-wrap:wrap;color:#a6b9d0;font-size:11px}
.graph-caption{font-size:10px;line-height:1.55;color:#7e94af}
.graph-panel.graph-expanded{position:fixed;inset:10px;z-index:60;width:auto;max-width:none;height:calc(100dvh - 20px)!important;min-height:0;background:#090f1d;box-shadow:0 0 0 9999px rgba(0,0,0,.89),0 20px 100px #000;border-radius:15px}
.graph-panel.graph-expanded .graph-stage{min-height:0;flex:1}
.graph-panel.graph-expanded .graph-canvas{min-height:0;flex:1}
.graph-panel.graph-expanded .graph-bottom{max-height:76px;overflow:auto}
.graph-panel.graph-expanded .graph-top{padding:14px 22px 12px}
@media(max-width:1390px){
 .graph-top{flex-direction:column;align-items:flex-start}
 .graph-controls{width:100%;justify-content:flex-start}
 .graph-panel{height:clamp(700px,84vh,930px)}
}
@media(max-width:899px){
 .graph-panel{height:730px;min-height:630px}
 .graph-v4-readout{grid-template-columns:repeat(2,minmax(0,1fr));padding:8px 12px;row-gap:8px}
 .graph-v4-readout>span{padding:3px 8px}
 .graph-v4-readout>span:nth-child(2){border-right:0}
 .graph-stage{padding:8px}
 .graph-canvas{min-height:405px}
 .graph-top h2{font-size:22px}
 .graph-hud .graph-floating{font-size:10px;max-width:62%}
}
@media(max-width:599px){
 .graph-panel{height:700px;min-height:660px}
 .graph-top{padding:12px}
 .graph-top h2{font-size:20px}
 .graph-controls button,.graph-controls select{min-height:34px;padding:7px;font-size:11px}
 .graph-v4-readout strong{font-size:12px}
 .graph-v4-readout small{font-size:9px}
 .graph-stage{padding:6px}
 .graph-canvas{min-height:380px}
 .graph-floating{font-size:9px;padding:7px}
 .graph-bottom{min-height:86px}
 .graph-legend{gap:6px;font-size:9px}
 .graph-caption{font-size:9px}
 .graph-panel.graph-expanded{inset:3px;height:calc(100dvh - 6px)!important;border-radius:8px}
}

/* Connectome v4 small-screen controls: no collapsed 37px domain selector */
@media(max-width:599px){
 #graphLens{min-width:137px!important;width:137px!important;flex:0 0 137px;max-width:100%}
 .graph-controls{justify-content:flex-start}
 .graph-panel{height:665px;min-height:620px}
 .graph-canvas{min-height:320px}
 .graph-hud{left:8px;right:8px;top:8px;bottom:8px;display:block}
 .graph-hud #graphClock{max-width:85%;display:block}
 .graph-hud #graphHover{position:absolute;bottom:0;right:0;max-width:68%}
}

.lived-history{border:1px solid rgba(118,151,181,.30);border-radius:10px;overflow:hidden;background:rgba(7,19,32,.45)}
.lived-history>summary{padding:11px 12px;cursor:pointer;color:#dbecf7;font-size:12px;font-weight:650;line-height:1.5}
.lived-history>summary:hover,.lived-history>summary:focus-visible{background:rgba(69,107,136,.22);outline-offset:-3px}
.lived-history>p{margin:0;padding:9px 12px;color:#b9c6dd;font-size:12px;line-height:1.5;border-top:1px solid rgba(118,151,181,.22)}
.lived-history>small{display:block;padding:8px 12px;color:#889bad;line-height:1.5}
#livedHistoryList{display:grid;gap:3px;padding:0 10px 10px}
.lived-row{padding:10px 8px;border-bottom:1px solid rgba(115,160,180,.20);display:grid;gap:3px}
.lived-row strong{font-size:12px;color:#e2f6f5;font-weight:650}
.lived-row span{font-size:12px;color:#c8d3e7}
.lived-row small{font-size:11px;color:#8ca0b3}

/* Observatoire v6 : navigation temporelle sur des traces enregistrées */
.trace-console{display:grid;gap:10px;padding:13px 19px 12px;background:linear-gradient(100deg,rgba(15,28,48,.97),rgba(10,20,39,.92));border-bottom:1px solid rgba(102,176,195,.23)}
.trace-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:14px;min-width:0}
.trace-heading{display:flex;align-items:center;gap:12px;min-width:180px;margin-right:auto}
.trace-heading>div{display:grid;gap:3px}
.trace-heading b{font-size:13px;line-height:1.3;letter-spacing:-.01em;color:#eaf7fd}
.trace-heading small{color:#9eb7ce;font-size:11px;line-height:1.4}
.trace-signal{width:10px;height:10px;flex:0 0 10px;border-radius:50%;background:#6e849d;box-shadow:0 0 0 4px rgba(112,146,172,.12)}
.trace-signal[data-mode=replay]{background:#ffcb7e;box-shadow:0 0 0 4px rgba(255,190,122,.12),0 0 13px rgba(255,180,101,.55)}
.trace-signal[data-mode=live]{background:#72edd3;box-shadow:0 0 0 4px rgba(101,238,213,.13)}
.trace-select-label{display:flex;align-items:center;gap:8px;color:#9db3c9;font-size:11px}
.trace-select-label select{min-width:170px;max-width:248px;height:37px;background:#101c30;color:#e3f2fc;border:1px solid #35536a;border-radius:8px;padding:0 9px;font-size:11px}
.trace-transport{display:flex;align-items:center;gap:5px}
.trace-transport button,.trace-transport select{height:37px;border-radius:8px;color:#d8f7f2;border:1px solid #3c6b70;background:#132637;padding:0 11px;font-size:12px;font-weight:600;cursor:pointer}
.trace-transport button:hover:not(:disabled){background:#225264;border-color:#92e8d9}
.trace-transport button:disabled,.trace-rail input:disabled{opacity:.45;cursor:default}
.trace-transport #tracePlay{min-width:92px;border-color:#72d6c8;background:rgba(26,103,100,.22)}
.trace-transport #traceSpeed{color:#e1eafe;min-width:54px}
.trace-rail{display:flex;align-items:center;gap:10px;min-width:0}
.trace-rail input[type=range]{flex:1;min-width:60px;accent-color:#ffc781;height:17px;cursor:pointer}
.trace-rail span{font-variant-numeric:tabular-nums;color:#f2dbb7;font-size:12px;white-space:nowrap;min-width:51px;text-align:right}
.trace-explainer{color:#9eacc7;font-size:11px;line-height:1.6;min-height:17px}
.graph-panel.graph-expanded .trace-console{padding:9px 17px}
.graph-panel.graph-expanded .trace-explainer{font-size:10px}
@media(max-width:1200px){.trace-heading{width:100%;margin-right:0}.trace-select-label{flex:1}.trace-transport{margin-left:auto}}
@media(max-width:600px){
 .trace-console{padding:11px 10px;gap:8px}
 .trace-toolbar{gap:9px}.trace-heading{width:100%}
 .trace-select-label{flex:1 1 100%}.trace-select-label select{flex:1;min-width:0;max-width:none}
 .trace-transport{width:100%;justify-content:space-between;gap:4px}
 .trace-transport button{flex:1}.trace-transport #tracePlay{flex:2}
 .trace-explainer{font-size:10px;min-height:32px}
 .graph-panel{min-height:850px;height:860px}
 .graph-canvas{min-height:330px}
}
`;
