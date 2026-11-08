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

/* AURA cognitive map: screenshot-inspired single-page observatory.
   State and percentages are populated by instrumented backend data only. */
:root{
 --bg:#07060c;--panel:#100b18;--panel2:#151020;--line:rgba(201,127,252,.24);
 --line2:rgba(207,133,247,.38);--text:#fbf2ff;--muted:#b49cbd;
 --cyan:#37f4ef;--cyan2:#9dfff3;--violet:#e48aff;--amber:#ffb36b;
 --rose:#ff688f;--green:#55ffc1;
 --shadow:0 16px 42px rgba(0,0,0,.48)
}
html,body{background:radial-gradient(ellipse at 35% -10%,#281336 0,transparent 38%),radial-gradient(ellipse at 81% 25%,#101128,transparent 45%),#050409;color:var(--text)}
.shell{padding:8px 10px 115px;max-width:2020px}
.top{padding:6px 13px;min-height:59px;top:4px;border:1px solid rgba(207,125,246,.30);background:rgba(9,7,15,.95);border-radius:13px}
.logo-mark{width:34px;height:34px;border-radius:9px;background:radial-gradient(circle at 48% 42%,#fbd6ff,#ae5bff 41%,#281134 77%);border-color:#c68bff;color:#fff;box-shadow:0 0 20px rgba(217,91,246,.5)}
.logo strong{font-size:18px;letter-spacing:.015em}
.logo small{font-size:9px;letter-spacing:.04em}
.build-mark{color:#998aa5;font-size:10px;white-space:nowrap;border:1px solid rgba(189,143,217,.19);border-radius:7px;padding:7px}
.top-btn{border-color:rgba(190,125,252,.34);background:#1b1227}
.top-btn.primary{border-color:rgba(68,255,192,.46);background:#102f28;color:#9dffe1}
.live{background:#071b17;border-color:#2b7458;color:#7fffc8;font-weight:700;letter-spacing:.04em}
.scene-nav{display:flex;gap:5px;align-items:center;margin:6px 0 9px;padding:5px;overflow:auto;scrollbar-width:thin;background:#0b0812;border:1px solid rgba(174,120,237,.24);border-radius:10px}
.scene-nav button{border:1px solid transparent;color:#b6a4c7;background:transparent;white-space:nowrap;border-radius:8px;padding:8px 13px;font-size:11px;font-weight:670;cursor:pointer}
.scene-nav button:hover,.scene-nav button.scene-active{color:#ffedff;border-color:#8a4ba0;background:linear-gradient(180deg,rgba(126,62,157,.58),rgba(61,28,90,.72));box-shadow:0 0 12px rgba(200,91,236,.19)}
.hero{grid-template-columns:1.1fr .9fr;gap:8px;margin-top:0}
.hero-card,.request-card,.panel{background:linear-gradient(180deg,rgba(19,13,28,.97),rgba(9,8,16,.99));border-color:rgba(186,129,229,.26);box-shadow:inset 0 1px 0 rgba(213,137,255,.075),0 10px 35px rgba(0,0,0,.32)}
.hero-card{padding:9px 13px}
.hero-card h1{font-size:18px;margin:0 0 4px;color:#f3dcff}
.hero-card p{font-size:11px;line-height:1.36;max-width:none}
.hero-note{margin-top:7px;gap:5px}
.pill{padding:4px 7px;font-size:9px;border-color:#4c314f;background:#150f1c;color:#c3afc8}
.request-card{padding:9px 12px;gap:6px}
.request-card h2{font-size:10px;color:#dcafff}
.request-main{gap:6px}
.request-box{padding:7px 9px;min-height:49px;background:#0a0811;border-color:#2c2134}
.request-box label{font-size:9px;margin-bottom:4px}
.request-box p{font-size:10px;max-height:28px;overflow:hidden}
.request-box strong{font-size:14px;color:#a8fff6}
.kpis{grid-template-columns:repeat(6,minmax(0,1fr));gap:7px;margin-top:8px}
.kpi{min-height:53px;padding:8px 10px;border-radius:9px;border-color:#36223d;background:linear-gradient(180deg,#110d1c,#0c0915)}
.kpi label{font-size:9px;color:#bba8c5;letter-spacing:.01em}
.kpi strong{font-size:17px;margin-top:5px;color:#e3b7fd}
.kpi:nth-child(2) strong,.kpi:nth-child(4) strong{color:#64f0d5}
.kpi:nth-child(5) strong{color:#ffca83}
.workspace{grid-template-columns:235px minmax(0,1fr) 245px;gap:8px;margin-top:8px}
.panel{border-radius:11px}
.panel-header{padding:9px 11px;border-color:#34233a;background:#100d19}
.panel-header h2{font-size:11px;letter-spacing:.05em;color:#f3ddff}
.panel-header small{font-size:9px}
.panel-body{padding:6px 8px}
.modules-panel,.inspector{min-height:770px}
.search{padding:8px 9px;font-size:10px;border-color:#4b2e56;background:#0c0812}
.modules-list{gap:2px;padding:5px}
.group-label{padding:7px 6px 2px;font-size:9px;color:#9f84a7}
.module-row{padding:7px 7px;grid-template-columns:9px minmax(0,1fr) auto;gap:6px;border:1px solid rgba(113,70,124,.12);background:rgba(27,17,39,.5);border-radius:7px;min-height:33px}
.module-row:hover,.module-row.selected{border-color:#a66ec5;background:linear-gradient(90deg,#2a163b,#171023)}
.module-row .name{font-size:10px}
.module-row .state{font-size:8px;max-width:76px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.module-light{width:7px;height:7px;background:#6a466f;border-color:#9a6ca2}
.module-row.recent .module-light{background:#5ffbd4;box-shadow:0 0 11px #5ffbd4}
.graph-top{padding:9px 12px 6px}
.graph-top h2{font-size:17px;color:#eed0fb}
.graph-top p{font-size:10px;color:#ae9bb8}
.graph-controls button{padding:6px 9px;color:#dcb5e9;border-color:#5a3669;background:#180f20}
.graph-stage{padding:0 7px 8px}
.graph-canvas{height:735px;background:radial-gradient(ellipse at 50% 49%,rgba(54,22,63,.44),transparent 54%),radial-gradient(ellipse at 70% 54%,rgba(19,63,74,.31),transparent 45%),#080710;border:1px solid #492753;border-radius:12px}
.graph-canvas::before{background-size:31px 31px;background-image:linear-gradient(rgba(131,77,167,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(131,77,167,.06) 1px,transparent 1px)}
.graph-canvas::after{background:radial-gradient(ellipse at 41% 44%,rgba(215,59,187,.10),transparent 35%),radial-gradient(ellipse at 65% 48%,rgba(24,202,221,.08),transparent 35%);pointer-events:none}
.graph-hud{left:10px;right:10px;top:10px}
.graph-floating{border-color:rgba(153,88,174,.36);background:rgba(8,5,14,.84);font-size:9px;color:#cbb2d1;padding:6px 8px}
.graph-legend{font-size:9px}
.graph-caption{font-size:10px;color:#a88dac}
.legend-line{background:#6b3a70}.legend-line.live{background:#66f6d5;box-shadow:0 0 11px #66f6d5}.legend-line.route{background:#ffb56b}
.neural-inspector{position:absolute;z-index:4;width:min(210px,36%);background:rgba(11,7,18,.91);border:1px solid rgba(213,95,239,.55);border-radius:9px;color:#e9d5f0;padding:9px 10px;box-shadow:0 0 15px rgba(220,60,210,.14);cursor:pointer;backdrop-filter:blur(7px)}
.neural-inspector:hover,.neural-inspector:focus-visible{border-color:#e8b2ff;box-shadow:0 0 20px rgba(230,95,249,.32)}
.neural-inspector.memory-inspector{left:12px;top:68px}
.neural-inspector.web-inspector{right:12px;top:68px;border-color:rgba(79,220,244,.43)}
.neural-inspector.kernel-inspector{left:12px;bottom:40px;border-color:rgba(255,181,104,.48)}
.ni-heading{display:flex;gap:5px;align-items:center;font-size:11px;font-weight:740;white-space:nowrap}
.ni-icon{color:#da8aff;font-size:14px}
.ni-state{font-size:7px;border:1px solid #57405f;border-radius:4px;padding:3px;color:#b6a3bb;margin-left:auto;overflow:hidden;text-overflow:ellipsis}
.ni-state.recent{color:#7fffd5;border-color:#368e72}
.ni-meta{color:#b59cbb;font-size:9px;margin-top:6px}
.neural-inspector strong{display:block;font-size:15px;margin-top:4px;color:#f1c9ff}
.neural-inspector small{display:block;margin-top:5px;color:#8f7d9a;font-size:9px}
.inspector-scroll{gap:7px;padding:7px}
.owner{padding:9px;border-color:#4d3260;background:#180f22}
.owner label{color:#dfbdff;font-size:10px}
.owner p{font-size:9px}
.owner input{font-size:10px}
.owner button{font-size:10px}
.detail-card{padding:9px;border-color:#462b52;background:#120c1b}
.detail-card h3{font-size:13px}
.field-label{font-size:9px;margin-top:9px;color:#b58fc6}
.field-value{font-size:10px;line-height:1.45;color:#d2bdd7;margin-top:4px}
.detail-state{font-size:8px}
.route-steps{gap:4px}
.route-step{padding:4px 0}
.route-step b{font-size:10px}.route-step small{font-size:9px}
.tool-row{padding:7px;font-size:10px;background:#130f1d}
.lower{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:8px}
.lower .panel{min-height:230px}
.scroll-list{padding:9px;max-height:246px}
.flow-item{padding:8px}
.flow-item b{font-size:10px}
.metric-list{padding:9px}
.metric-line{grid-template-columns:97px 1fr 34px;gap:7px;padding:4px 0;font-size:10px}
.metric-line strong{font-size:9px}
.track{background:#34233b;height:5px}
.track b{background:linear-gradient(90deg,#763cab,#7ff6e3);box-shadow:0 0 7px rgba(106,244,227,.35)}
.memory-stats{padding:10px;display:grid;gap:8px}
.memory-stats .memory-row{display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid #2b1938;padding:6px 0;font-size:10px;color:#bda1c9}
.memory-stats strong{font-size:13px;color:#e5b2ff;font-variant-numeric:tabular-nums}
.memory-stats .memory-row:last-child{border:none}
.activity-entry{border-bottom:1px solid #2c2036;padding:8px 2px}
.activity-entry strong{font-size:10px;color:#dec5e4;display:block}
.activity-entry small{font-size:9px;color:#8f7fa1}
.chat{background:linear-gradient(180deg,rgba(26,12,39,.985),rgba(11,8,20,.985));border-color:rgba(199,106,241,.64);box-shadow:0 0 23px rgba(187,71,215,.25),0 16px 46px rgba(0,0,0,.75);max-width:1960px}
.chat-main strong{font-size:12px;color:#eab4ff}
.chat-main input{border-color:#663975;background:#0e0b15;color:#f9edff}
.chat-main input:focus{outline:1px solid #d48ef2}
.chat-main button{background:linear-gradient(180deg,#9d3ac0,#5a2378);border-color:#bc69e0;color:white}
.chat-main button.secondary{background:#21152c;border-color:#673c7e}
.chat-message{border-color:#512e5f;background:#1c1129}
.chat-message.user{background:#14363b;border-color:#2a8888}
@media(max-width:1490px){.workspace{grid-template-columns:210px minmax(0,1fr) 220px}.graph-canvas{height:700px}.neural-inspector{width:min(190px,37%)}}
@media(max-width:1180px){.workspace{grid-template-columns:198px minmax(0,1fr)}.workspace>.rail:last-child{grid-column:1/-1}.inspector .inspector-scroll{grid-template-columns:repeat(3,minmax(0,1fr));display:grid}.modules-panel{min-height:680px}.graph-canvas{height:665px}.lower{grid-template-columns:repeat(2,minmax(0,1fr))}.hero{grid-template-columns:1fr}}
@media(max-width:850px){.workspace{grid-template-columns:1fr}.modules-list{grid-template-columns:repeat(3,minmax(0,1fr));display:grid}.module-row{min-width:0}.module-row .state{display:none}.modules-panel{min-height:0}.graph-canvas{height:620px}.inspector .inspector-scroll{grid-template-columns:1fr 1fr}.top{position:relative;top:0}}
@media(max-width:600px){.shell{padding:6px 6px 132px}.logo strong{font-size:14px}.logo small{display:none}.top-actions{gap:4px}.build-mark{display:none}.scene-nav{margin:5px 0}.scene-nav button{padding:7px 10px;font-size:10px}.hero-card{padding:9px}.hero-card h1{font-size:16px}.hero-note{display:none}.kpis{grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}.kpi{min-height:49px;padding:7px}.kpi label{font-size:8px}.kpi strong{font-size:15px}.modules-list{grid-template-columns:repeat(2,minmax(0,1fr))}.graph-canvas{height:530px}.neural-inspector{width:min(140px,43%);padding:5px 6px}.ni-heading{font-size:9px}.ni-state{font-size:7px}.ni-meta,.neural-inspector small{font-size:8px}.neural-inspector strong{font-size:11px}.neural-inspector.memory-inspector{top:49px;left:5px}.neural-inspector.web-inspector{top:49px;right:5px}.neural-inspector.kernel-inspector{left:5px;bottom:20px}.lower{grid-template-columns:1fr}.inspector .inspector-scroll{grid-template-columns:1fr}.top .live{font-size:9px;padding:6px}.chat-main button.secondary{grid-column:auto}.chat-main input{font-size:16px}}


.chat-main{grid-template-columns:auto 135px minmax(0,1fr) auto auto}
#chatMode{border:1px solid rgba(200,114,239,.50);border-radius:9px;background:#190e22;color:#f2dcff;padding:9px 8px;font-size:11px;outline:0;cursor:pointer}
#chatMode:focus-visible{outline:2px solid #dca0fa;outline-offset:2px}
#chatMode option{background:#160b20;color:#f2dcff}
@media(max-width:920px){.chat-main{grid-template-columns:115px minmax(0,1fr) auto auto}.chat-main strong{display:none}}
@media(max-width:640px){.chat-main{grid-template-columns:100px minmax(0,1fr) auto}.chat-main button.secondary{grid-column:1/-1}.chat-main input{font-size:16px}.chat-main strong{display:none}#chatMode{font-size:10px;padding:8px 3px}}


/* Observatory: information density without overlapping floating capsules. */
.module-toolbar{display:grid;gap:7px}
.module-toolbar select,#graphLens{width:100%;min-width:0;background:#111622;border:1px solid rgba(126,150,180,.32);border-radius:7px;color:#dbe7f3;font-size:11px;padding:7px 8px}
.module-toolbar #moduleSummary{font-size:10px;line-height:1.45;color:#8e9db1}
.group-label{font-size:10px;letter-spacing:.075em;color:#a9bcd1;padding:10px 7px 4px;border-bottom:1px solid rgba(121,146,165,.1)}
.module-row{min-height:46px;gap:8px;padding:7px 8px;background:rgba(14,22,36,.65);border-color:rgba(102,124,156,.16)}
.module-row:hover,.module-row.selected{background:linear-gradient(90deg,rgba(33,55,76,.85),rgba(20,28,47,.85));border-color:rgba(104,202,215,.46)}
.module-description{min-width:0;display:flex;flex-direction:column;gap:4px;text-align:left}
.module-description .name{font-size:11px;color:#e3eaf3;line-height:1.15;white-space:normal;overflow-wrap:anywhere}
.module-description small{font-size:9px;color:#768ca5;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.module-row .state{font-size:8px;max-width:92px;color:#90a5ba;white-space:normal;line-height:1.3;text-align:right}
.module-row.recent .state{color:#78e9d7}
.graph-controls{display:flex;align-items:center;gap:5px}
#graphLens{width:auto;min-width:140px;max-width:200px;padding:7px 10px}
#graphLabels{min-width:105px;background:#15202d;border-color:#37546a;color:#bdcfdb;white-space:nowrap}
#graphLabels[aria-pressed=true]{background:#194244;color:#a2fff1}
.graph-canvas{background:radial-gradient(ellipse at 49% 53%,rgba(42,57,85,.22),transparent 48%),radial-gradient(ellipse at 64% 39%,rgba(23,75,92,.14),transparent 40%),#070b12;border-color:#273c50}
.graph-canvas::after{background:radial-gradient(ellipse at 42% 45%,rgba(96,60,120,.08),transparent 38%),radial-gradient(ellipse at 65% 48%,rgba(22,132,153,.07),transparent 38%)}
.graph-floating{border-color:rgba(105,139,161,.24);background:rgba(5,10,18,.83);color:#a9bdd0}
#graphHover{font-size:10px;color:#9addd3;max-width:32%;text-align:center}
.neural-inspector{background:rgba(8,13,23,.92);border:1px solid rgba(94,132,163,.36);box-shadow:0 8px 30px rgba(0,0,0,.25)}
.neural-inspector.web-inspector{border-color:rgba(48,148,160,.34)}
.neural-inspector.kernel-inspector{border-color:rgba(178,141,99,.34)}
.node-connections{margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:5px;max-height:205px;overflow:auto}
.connection-link{border:1px solid rgba(101,128,152,.27);border-radius:7px;padding:6px 7px;color:#a5b8cc;background:rgba(11,23,35,.72);font-size:10px;line-height:1.35;cursor:pointer;text-align:left}
.connection-link:hover{color:#e4f5ff;border-color:#73bdcb}
.connection-link.observed{border-color:rgba(73,202,173,.52);color:#88edd2}
.affect-status{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:12px 12px 0;padding:10px 11px;border:1px solid rgba(73,174,167,.26);background:rgba(11,39,39,.42);border-radius:8px;font-size:11px;color:#9fbabb}
.affect-status strong{font-size:13px;color:#9cebdc}
.affect-bridge{margin:4px 12px 12px;padding:10px;border-left:2px solid #58bbaa;background:rgba(15,32,42,.56);border-radius:4px;color:#a9c2c9;font-size:11px;line-height:1.55}
@media(max-width:1450px){#graphLens{min-width:114px;max-width:160px}.graph-controls{gap:3px}.graph-controls button{padding:7px}}
@media(max-width:850px){.graph-controls{flex-wrap:wrap}.graph-hud{flex-wrap:wrap}#graphHover{max-width:54%}.module-description small{font-size:8px}}
@media(max-width:600px){.graph-controls{justify-content:flex-end}#graphLens{width:115px}.graph-hud .graph-floating:nth-child(3){display:none}#graphHover{max-width:48%}.node-connections{grid-template-columns:1fr}}

/* One operating screen: conversation + causal receipts + topology coexist. */
@media(min-width:1181px){
 .workspace{grid-template-columns:220px minmax(0,1fr) 318px;align-items:stretch}
 .workspace>.rail{min-height:0;max-height:760px}
 .modules-panel,.inspector{height:760px;min-height:0}
 .modules-panel{overflow:hidden}
 .modules-list{min-height:0;flex:1;overflow:auto;align-content:start}
 .inspector-scroll{height:100%;min-height:0;overflow-y:auto;align-content:start;display:flex;flex-direction:column;gap:8px}
 .graph-canvas{height:706px}
 .neural-inspector{width:min(190px,35%)}
}
.live-conversation,.causal-card{border-color:rgba(82,195,194,.32);background:linear-gradient(180deg,#111525,#0b101b)}
.inline-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.inline-head h3{font-size:12px;line-height:1.3;letter-spacing:0;margin:0;color:#ebdff8}
.truth-chip{font-size:9px;color:#99d6d8;border:1px solid rgba(95,201,200,.26);border-radius:6px;padding:4px 6px;white-space:nowrap}
#chatHistory,#chatHistory.open{display:flex;flex-direction:column;gap:6px;max-height:188px;min-height:92px;overflow-y:auto;scrollbar-width:thin;padding:10px 2px 2px}
#chatHistory:empty::before{content:"Aucun échange envoyé depuis cette page. La conversation de ce navigateur ne reconstitue pas d’anciens messages privés.";color:#91a2b9;font-size:10px;line-height:1.5}
#chatHistory .chat-message{max-width:98%;width:max-content;font-size:10px;line-height:1.5;align-self:flex-start}
#chatHistory .chat-message.user{align-self:flex-end}
.causal-card{display:grid;gap:9px}
.causal-evidence,.causal-footnote{font-size:10px;line-height:1.5;color:#a5b9c7;margin:0}
.causal-evidence{border-left:2px solid #5aafac;padding-left:9px}
.causal-digest{display:grid;gap:4px}
.causal-digest>div,.causal-value{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:5px 0;border-bottom:1px solid rgba(122,153,173,.17)}
.causal-digest span,.causal-value span{font-size:10px;color:#b5abc2}
.causal-digest strong,.causal-value strong{font-size:10px;color:#e0ecef;text-align:right;overflow-wrap:anywhere}
.causal-values{max-height:168px;overflow:auto;scrollbar-width:thin}
.causal-value .positive{color:#7de5ce}
.causal-value .negative{color:#f5b6af}
.causal-value .neutral{color:#b5c4d4}
.causal-footnote{font-size:9px;color:#7f9eac}
#causalStatus{white-space:normal;text-align:right}
.chat{bottom:7px;padding:8px}
#chatExpand{white-space:nowrap}
.graph-floating{max-width:34%}
@media(max-width:1180px){
 .workspace{grid-template-columns:220px minmax(0,1fr)}
 .workspace>.rail:last-child{grid-column:1/-1}
 .inspector .inspector-scroll{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));max-height:none}
 .live-conversation,.causal-card{min-height:220px}
}
@media(max-width:850px){
 .workspace{grid-template-columns:1fr}
 .inspector .inspector-scroll{grid-template-columns:1fr}
 .graph-canvas{height:clamp(480px,65vh,650px)}
 .graph-floating{max-width:46%}
}
@media(max-width:600px){
 .neural-inspector{max-width:140px}
 .graph-floating{max-width:49%}
 .live-conversation,.causal-card{min-height:0}
 .chat-main{grid-template-columns:90px minmax(0,1fr) auto}
 #chatExpand{grid-column:1/-1}
}
`;