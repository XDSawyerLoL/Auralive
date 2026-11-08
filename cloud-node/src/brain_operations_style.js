export const BRAIN_OPERATIONS_CSS = String.raw`
:root{
  --bg:#06080d;
  --panel:#0d1118;
  --panel2:#10151e;
  --line:#24303b;
  --line2:#304150;
  --text:#ecf4f8;
  --muted:#8fa0ad;
  --cyan:#63e6d8;
  --cyan2:#87f4ea;
  --violet:#b09dff;
  --amber:#ecb07f;
  --rose:#f19f9b;
  --green:#7ce4be;
  --shadow:0 20px 50px rgba(0,0,0,.45);
  --radius:14px;
  color-scheme:dark;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:radial-gradient(circle at 20% 0%,rgba(18,41,55,.28),transparent 35%),radial-gradient(circle at 85% 10%,rgba(88,50,103,.25),transparent 30%),linear-gradient(180deg,#05070b,#0a0f15 25%,#05070b 100%);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
a{color:inherit;text-decoration:none}
button,input{font:inherit}
.shell{padding:12px 12px 118px;max-width:1820px;margin:0 auto}
.top{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border:1px solid var(--line);background:linear-gradient(180deg,#101720,#0c121a);border-radius:18px;box-shadow:var(--shadow);position:sticky;top:10px;z-index:8;backdrop-filter:blur(10px)}
.logo{display:flex;align-items:center;gap:12px;min-width:0}
.logo-mark{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:radial-gradient(circle at 30% 30%,#fbffff,#7ff5e0 38%,#143b3d 70%,#0c1017);border:1px solid #3e605e;box-shadow:0 0 28px rgba(99,230,216,.28)}
.logo strong{display:block;font-size:15px;letter-spacing:.08em}
.logo small{display:block;color:var(--muted);font-size:10px;letter-spacing:.16em;text-transform:uppercase}
.top-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.top-btn{padding:9px 12px;border-radius:10px;border:1px solid var(--line2);background:#111b24;color:#dcecf1}
.top-btn.primary{background:linear-gradient(180deg,#1b3637,#122228);border-color:#2f6762;color:#bffbee}
.live{display:flex;align-items:center;gap:8px;padding:8px 11px;border-radius:999px;border:1px solid #304454;background:#0d141c;color:#d7eaf2;font-size:11px;white-space:nowrap}
.live i{width:8px;height:8px;border-radius:50%;background:#7f8c97;box-shadow:0 0 0 0 transparent}
.live[data-state="active"] i{background:var(--cyan);box-shadow:0 0 10px rgba(99,230,216,.95)}
.live[data-state="error"] i{background:#ea7a6b;box-shadow:0 0 10px rgba(234,122,107,.95)}
.hero{display:grid;grid-template-columns:1.3fr 1fr;gap:10px;margin-top:10px}
.hero-card,.request-card,.panel{border:1px solid var(--line);background:linear-gradient(180deg,#0f151d,#0a0f16);border-radius:16px;box-shadow:var(--shadow)}
.hero-card{padding:14px 16px;overflow:hidden;position:relative}
.hero-card:before{content:"";position:absolute;inset:-20% 40% auto -10%;height:220px;background:radial-gradient(circle,rgba(106,228,221,.16),transparent 65%);pointer-events:none}
.hero-card h1{margin:0 0 6px;font-size:26px;letter-spacing:-.03em}
.hero-card p{margin:0;color:#a7b7c1;max-width:900px;line-height:1.6;font-size:13px}
.hero-note{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.pill{padding:6px 10px;border-radius:999px;border:1px solid #2d3d4d;background:#0f1720;color:#b8cad6;font-size:10px;letter-spacing:.08em;text-transform:uppercase}
.request-card{padding:14px 16px;display:grid;gap:10px}
.request-card h2{margin:0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#b9c8d2}
.request-main{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.request-box{border:1px solid #26333f;background:#0b1219;border-radius:12px;padding:10px;min-height:86px}
.request-box label{display:block;color:#87a0af;font-size:10px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px}
.request-box strong{display:block;font-size:18px}
.request-box p{margin:0;color:#dce7ed;line-height:1.5;font-size:12px}
.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-top:10px}
.kpi{border:1px solid var(--line);background:linear-gradient(180deg,#111822,#0b1118);border-radius:12px;padding:11px 12px;min-height:76px}
.kpi label{display:block;color:#8ea1ae;font-size:10px;letter-spacing:.08em;text-transform:uppercase}
.kpi strong{display:block;margin-top:8px;font-size:20px;font-weight:760;letter-spacing:-.04em;font-variant-numeric:tabular-nums}
.kpi:nth-child(2) strong,.kpi:nth-child(4) strong{color:var(--cyan2)}
.kpi:nth-child(5) strong{color:#f4c88f}
.workspace{display:grid;grid-template-columns:300px minmax(0,1fr) 360px;gap:10px;margin-top:10px;align-items:start}
.panel{overflow:hidden;min-width:0}
.panel-header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-bottom:1px solid #1f2933;background:linear-gradient(180deg,#111922,#0d131a)}
.panel-header h2{margin:0;font-size:12px;letter-spacing:.14em;text-transform:uppercase}
.panel-header small{color:#8899a4;font-size:10px}
.panel-body{padding:12px}
.rail{display:grid;gap:10px}
.modules-panel,.inspector{min-height:780px;display:flex;flex-direction:column}
.search{width:100%;padding:11px 12px;background:#0a1017;color:#e4eef2;border:1px solid #2a3744;border-radius:10px;outline:0;font-size:12px}
.modules-list,.inspector-scroll,.scroll-list,.tool-list{overflow:auto;scrollbar-width:thin;scrollbar-color:#35506a transparent}
.modules-list{padding:8px;display:grid;gap:4px}
.group-label{padding:10px 6px 4px;font-size:10px;color:#7991a0;letter-spacing:.12em;text-transform:uppercase}
.module-row{display:grid;grid-template-columns:12px minmax(0,1fr) auto;gap:9px;align-items:center;padding:10px;border:1px solid transparent;background:transparent;color:#deedf3;border-radius:10px;text-align:left}
.module-row:hover{background:#13202b}
.module-row.selected{border-color:#4c746d;background:linear-gradient(180deg,#132327,#101c22)}
.module-light{width:8px;height:8px;border-radius:50%;background:#5d6b79;border:1px solid #8091a1}
.module-row.recent .module-light{background:var(--cyan2);border-color:#b6fff6;box-shadow:0 0 12px rgba(135,244,234,.9)}
.module-row .name{font-size:12px;font-weight:640;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.module-row .state{font-size:9px;color:#8ea4b4;letter-spacing:.08em;text-transform:uppercase}
.graph-panel{display:flex;flex-direction:column;overflow:hidden}
.graph-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 16px 8px}
.graph-top h2{margin:0;font-size:20px;letter-spacing:-.03em}
.graph-top p{margin:4px 0 0;color:#93a8b6;font-size:12px;line-height:1.55}
.graph-controls{display:flex;gap:6px;flex-wrap:wrap}
.graph-controls button{border:1px solid #304452;background:#111922;color:#d6e8ef;border-radius:10px;padding:8px 10px;min-width:38px}
.graph-stage{position:relative;padding:0 14px 12px}
.graph-canvas{position:relative;height:790px;border:1px solid #202b37;border-radius:16px;overflow:hidden;background:radial-gradient(circle at 50% 45%,rgba(34,39,53,.96),rgba(8,12,18,.98) 62%,#070a0f 100%)}
.graph-canvas::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(53,75,95,.14) 1px,transparent 1px),linear-gradient(90deg,rgba(53,75,95,.14) 1px,transparent 1px);background-size:26px 26px;opacity:.35;pointer-events:none}
.graph-canvas::after{content:"";position:absolute;inset:0;background:radial-gradient(circle at 48% 48%,rgba(125,81,155,.10),transparent 34%),radial-gradient(circle at 65% 38%,rgba(76,183,179,.10),transparent 28%),radial-gradient(circle at 30% 58%,rgba(226,128,117,.09),transparent 24%);pointer-events:none}
#graphCanvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:none}
#graphCanvas:active{cursor:grabbing}
.graph-hud{position:absolute;left:16px;right:16px;top:14px;display:flex;justify-content:space-between;gap:10px;pointer-events:none;z-index:2}
.graph-floating{background:rgba(8,14,20,.82);border:1px solid #233547;border-radius:10px;color:#c4d7e0;font-size:10px;line-height:1.45;padding:8px 10px;max-width:48%}
.graph-bottom{display:grid;grid-template-columns:1fr auto;gap:10px;padding:0 2px}
.graph-legend{display:flex;gap:12px;flex-wrap:wrap;padding:10px 0 0;color:#9fb0bc;font-size:10px}
.legend-line,.legend-dot,.legend-pulse{display:inline-block;vertical-align:middle;margin-right:6px}.legend-line{width:18px;height:2px;background:#44525c}.legend-line.live{background:var(--cyan2);box-shadow:0 0 8px rgba(135,244,234,.95)}.legend-line.route{background:#f3b484;box-shadow:0 0 8px rgba(243,180,132,.8)}.legend-dot{width:8px;height:8px;border-radius:50%;background:#d7a8ff}.legend-pulse{width:18px;height:2px;background:linear-gradient(90deg,transparent,#fff,transparent)}
.graph-caption{padding-top:10px;color:#93a8b7;font-size:11px;line-height:1.6}
.inspector-scroll{padding:12px;display:grid;gap:16px}
.detail-card{border:1px solid #25313d;background:#0c1219;border-radius:12px;padding:12px}
.detail-card h3{margin:0 0 6px;font-size:15px}.detail-state{display:inline-block;padding:5px 8px;border-radius:999px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;background:#28211e;border:1px solid #5a4135;color:#efc6a0}.detail-state.recent{background:#162f2a;border-color:#2d7866;color:#a8f5df}
.field-label{margin-top:12px;color:#86a1af;font-size:10px;letter-spacing:.12em;text-transform:uppercase}.field-value{margin-top:6px;color:#d6e4eb;font-size:12px;line-height:1.65;overflow-wrap:anywhere}
.owner{border:1px solid #2c4150;background:#111922;border-radius:12px;padding:12px}.owner label{display:block;margin-bottom:7px;color:#bad3e2;font-size:11px}.owner-form{display:flex;gap:8px}.owner input{flex:1;min-width:0;padding:10px 12px;border-radius:9px;border:1px solid #365062;background:#091018;color:#fff}.owner button{padding:10px 12px;border-radius:9px;border:1px solid #397766;background:#1a433c;color:#bcf3dc}
.owner p{margin:8px 0 0;color:#94aab7;font-size:10px;line-height:1.6}
.route-steps{display:grid;gap:7px;margin-top:10px}
.route-step{display:grid;grid-template-columns:14px minmax(0,1fr);gap:8px;align-items:start;padding:7px 0;border-bottom:1px solid #1b2530}.route-step:last-child{border-bottom:0}.route-step i{width:9px;height:9px;border-radius:50%;background:var(--cyan2);box-shadow:0 0 10px rgba(135,244,234,.7);margin-top:4px}.route-step b{display:block;font-size:11px}.route-step small{display:block;margin-top:3px;color:#8ea4b3;font-size:9px;line-height:1.45}
.tool-list{display:grid;gap:7px;margin-top:8px;max-height:240px}
.tool-row{display:grid;grid-template-columns:10px minmax(0,1fr);gap:8px;align-items:center;padding:8px 9px;border:1px solid #273846;background:#101923;color:#dce9ef;border-radius:10px;text-align:left}
.tool-light{width:8px;height:8px;border-radius:50%;background:#687c8c}.tool-light.fresh{background:var(--cyan2);box-shadow:0 0 10px rgba(135,244,234,.8)}
.tool-row b{display:block;font-size:11px}.tool-row small{display:block;color:#8ea4b3;font-size:9px;line-height:1.45}
.lower{display:grid;grid-template-columns:1.25fr 1.05fr 1fr;gap:10px;margin-top:10px}
.lower .panel{min-height:260px}
.scroll-list{padding:12px;max-height:280px}
.flow-item{width:100%;padding:10px;border:1px solid #263845;background:#101a23;color:#deebf0;border-radius:10px;text-align:left;margin-bottom:7px}
.flow-item:hover{border-color:#4a7f78}.flow-item.selected{border-color:#6dd9c0;background:#142027}
.flow-item b{display:block;font-size:11px}.flow-item small{display:block;margin-top:4px;color:#92a7b4;font-size:10px}
.event-row{display:grid;grid-template-columns:10px minmax(0,1fr);gap:9px;padding:8px 0;border-bottom:1px solid #1d2933}.event-row:last-child{border-bottom:0}.event-row i{width:7px;height:7px;border-radius:50%;background:#c58a7c;box-shadow:0 0 8px rgba(197,138,124,.4);margin-top:6px}.event-row strong{display:block;font-size:10px}.event-row small{display:block;color:#8fa2b0;font-size:9px;line-height:1.5}
.metric-list{padding:12px}
.metric-line{display:grid;grid-template-columns:120px 1fr 46px;gap:10px;align-items:center;padding:7px 0;font-size:11px}.metric-line span{color:#9aaeb9}.track{height:6px;border-radius:999px;background:#22303b;overflow:hidden}.track b{display:block;height:100%;background:linear-gradient(90deg,#3a8e9a,#6ae8cf)}.track b.warm{background:linear-gradient(90deg,#8f5660,#ec9f8a)}.metric-line strong{text-align:right;font-size:10px;font-variant-numeric:tabular-nums}
.small-text{color:#91a3ad;font-size:10px;line-height:1.6;padding:0 12px 12px}
.empty{color:#7f97a4;font-size:11px;line-height:1.6}
.chat{position:fixed;left:50%;transform:translateX(-50%);bottom:10px;z-index:20;width:min(98%,1680px);border:1px solid #32504f;background:linear-gradient(180deg,rgba(15,24,31,.96),rgba(10,16,21,.98));border-radius:16px;box-shadow:0 18px 40px rgba(0,0,0,.58);backdrop-filter:blur(14px);padding:10px}
.chat-main{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;gap:8px;align-items:center}.chat-main strong{font-size:11px;letter-spacing:.16em;color:#b8f7e2;white-space:nowrap}.chat-main input{width:100%;min-width:0;padding:12px 13px;border-radius:10px;border:1px solid #2d4e50;background:#090f16;color:#eef8fb;font-size:12px}.chat-main button{padding:11px 13px;border-radius:10px;border:1px solid #3a7a67;background:#1d5348;color:#c5f4e3}.chat-main button.secondary{border-color:#385266;background:#15212c;color:#d4e3ea}
#chatHistory{display:none;max-height:290px;overflow:auto;scrollbar-width:thin;padding:5px 2px 8px;gap:8px}#chatHistory.open{display:grid}
.chat-message{max-width:92%;padding:10px 11px;border-radius:11px;border:1px solid #253845;background:#13202a;white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;line-height:1.6}.chat-message.user{justify-self:end;background:#173038;border-color:#2c6865}.chat-message small{display:block;margin-bottom:4px;color:#90cdc5;font-size:9px;font-weight:760;letter-spacing:.1em}
@media(max-width:1560px){.workspace{grid-template-columns:280px minmax(0,1fr) 330px}.graph-canvas{height:730px}}
@media(max-width:1280px){.hero{grid-template-columns:1fr}.workspace{grid-template-columns:260px minmax(0,1fr)}.workspace>.rail:last-child{grid-column:1/-1}.modules-panel,.inspector{min-height:unset}.inspector .inspector-scroll{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:920px){.kpis{grid-template-columns:repeat(3,1fr)}.lower{grid-template-columns:1fr}.workspace{grid-template-columns:1fr}.modules-panel{min-height:260px}.modules-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}.group-label{grid-column:1/-1}.graph-canvas{height:580px}.inspector .inspector-scroll{grid-template-columns:1fr}.chat-main{grid-template-columns:minmax(0,1fr) auto auto}.chat-main strong{display:none}}
@media(max-width:640px){.shell{padding:8px 8px 146px}.top{padding:10px;border-radius:14px}.top-actions{gap:6px}.top-btn{padding:8px 9px;font-size:11px}.hero-card h1{font-size:22px}.request-main{grid-template-columns:1fr}.kpis{grid-template-columns:repeat(2,1fr)}.graph-top{padding:12px}.graph-top h2{font-size:18px}.graph-canvas{height:520px}.graph-hud{left:10px;right:10px;top:10px;gap:6px}.graph-floating{max-width:54%;font-size:9px;padding:7px 8px}.graph-bottom{grid-template-columns:1fr}.chat{width:calc(100% - 10px);bottom:6px;padding:7px}.chat-main{grid-template-columns:minmax(0,1fr) auto}.chat-main button.secondary{grid-column:1/-1}.chat-main input{font-size:16px}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
