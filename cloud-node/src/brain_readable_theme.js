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
`;
