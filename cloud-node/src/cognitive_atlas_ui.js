// AURA Cognitive Atlas 2 — zero-dependency visual layer.
export const COGNITIVE_ATLAS_CSS = String.raw`
/* Cognitive Atlas 2 — detailed instrumented runtime map, no simulated model neurons */
.main{grid-template-columns:minmax(0,1fr)!important;gap:12px!important}
.side{display:none!important;order:1;grid-column:1;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.side.diagnostics-open{display:grid!important}
.side>.aura-card{display:none!important}
@media(max-width:720px){.side.diagnostics-open{grid-template-columns:minmax(0,1fr)}}
.cog-panel{color:#eaf4ff;background:#050b15;border-top:1px solid rgba(80,148,175,.25);border-bottom:1px solid rgba(80,148,175,.25);overflow:hidden;isolation:isolate}
.cog-heading{display:flex;gap:20px;justify-content:space-between;align-items:center;padding:20px 22px 9px}
.cog-kicker{font-size:10px;font-weight:700;color:#63bfd6;letter-spacing:.19em;text-transform:uppercase;display:flex;align-items:center;gap:9px}
.cog-kicker:before{content:'';width:7px;height:7px;border-radius:50%;background:#63d9c3;box-shadow:0 0 12px #4dddd0}
.cog-heading h2{font-size:22px;font-weight:700;letter-spacing:-.035em;line-height:1.25;margin:5px 0 5px;color:#f7fbff}
.cog-heading p{margin:0;color:#90a7b9;font-size:12px;line-height:1.45}
.cog-state{font-size:12px;color:#93d9e8;background:rgba(27,69,84,.35);border:1px solid rgba(104,176,195,.24);border-radius:9px;padding:9px 11px;text-align:right;max-width:245px}
.cog-switch{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:9px 22px 15px}
.cog-switch button,.cog-zoom button{font:inherit;font-size:12px;font-weight:600;border:1px solid rgba(118,173,191,.25);color:#a7c9dc;background:#101e2b;border-radius:8px;min-height:34px;padding:7px 12px;cursor:pointer;transition:background .18s,border-color .18s,color .18s}
.cog-switch button[aria-pressed=true],.cog-switch button:hover,.cog-zoom button:hover{color:#f6feff;border-color:rgba(103,231,234,.6);background:rgba(49,127,146,.25)}
.cog-switch button:focus-visible,.cog-zoom button:focus-visible,.cog-node:focus-visible,.cog-event:focus-visible{outline:2px solid #9cf2ff;outline-offset:3px}
.cog-switch button:disabled{opacity:.4;cursor:default}
.cog-toolbar-end{margin-left:auto;display:flex;gap:7px;align-items:center}
.cog-zoom{display:flex;gap:4px}
.cog-zoom button{padding:6px 10px;min-width:35px}
.cog-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:rgba(105,170,193,.15);border-top:1px solid rgba(109,163,185,.13);border-bottom:1px solid rgba(109,163,185,.17)}
.cog-stat{background:rgba(7,17,31,.94);padding:12px 18px;min-width:0}
.cog-stat small{font-size:9px;color:#799bb0;text-transform:uppercase;letter-spacing:.14em;display:block;margin-bottom:4px}
.cog-stat strong{font-size:19px;font-weight:650;color:#e8f8ff;font-variant-numeric:tabular-nums;display:block;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.cog-stat span{font-size:10px;color:#7391a4}
.cog-stage{display:grid;grid-template-columns:minmax(0,1fr) 300px;min-height:530px}
.cog-viewport{position:relative;overflow:hidden;min-height:510px;background:radial-gradient(ellipse at 46% 46%,rgba(28,102,133,.16),transparent 60%),radial-gradient(circle at 81% 81%,rgba(135,64,132,.11),transparent 42%),linear-gradient(170deg,#06121e,#040a13)}
.cog-viewport:before{content:'';position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(rgba(129,199,224,.22) .7px,transparent 1px);background-size:25px 25px;opacity:.38}
.cog-svg{display:block;width:100%;height:100%;min-height:510px;touch-action:none;cursor:grab;user-select:none}
.cog-svg:active{cursor:grabbing}
.cog-map-label{position:absolute;top:15px;left:19px;font-size:10px;color:#7291a5;letter-spacing:.12em;text-transform:uppercase;pointer-events:none}
.cog-legend{position:absolute;left:15px;bottom:13px;display:flex;flex-wrap:wrap;align-items:center;gap:12px;background:rgba(6,14,26,.86);border:1px solid rgba(110,157,178,.15);padding:9px 11px;border-radius:9px;font-size:10px;color:#9db5c7;pointer-events:none}
.cog-legend i{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px;background:#516578}
.cog-legend .ok{background:#72e2d9}.cog-legend .busy{background:#ffd38d}.cog-legend .bad{background:#ff809d}
.cog-scope{fill:none;stroke:rgba(110,175,193,.09);stroke-width:1}
.cog-structure-label{font-family:inherit;fill:#526d83;font-size:12px;letter-spacing:2.4px;font-weight:700}
.cog-edge{fill:none;stroke:#274359;stroke-width:1.5;opacity:.65;transition:stroke .2s,opacity .2s}
.cog-edge.observed{stroke:rgba(88,209,216,.62);opacity:.9}
.cog-edge.active{stroke:#a3f6ed;stroke-width:2.5;opacity:1;stroke-dasharray:4 9;animation:cog-transport 1.2s linear infinite;filter:drop-shadow(0 0 5px rgba(85,236,234,.7))}
.cog-edge.error{stroke:#f77c9e;opacity:1}
.cog-edge.just-verified{stroke:#b5faf0;stroke-width:3;opacity:1}
.cog-node{cursor:pointer;outline:none;transition:opacity .18s}
.cog-node .node-ring{fill:none;stroke:#365467;stroke-width:1.4;stroke-dasharray:2 7;opacity:.6}
.cog-node .node-halo{fill:#102335;stroke:#52788c;stroke-width:1.5;transition:fill .25s,stroke .25s}
.cog-node .node-center{fill:#183248;stroke:#42677c;stroke-width:1.5}
.cog-node .node-glyph{font-family:inherit;font-weight:700;fill:#c8e5f0;font-size:19px;pointer-events:none;text-anchor:middle;dominant-baseline:middle}
.cog-node .node-title{font-family:inherit;font-weight:650;fill:#d3e5f2;font-size:14px;text-anchor:middle;pointer-events:none}
.cog-node.micro .node-glyph{font-size:13px;color:#a4d4e3}
.cog-node.micro .node-title{font-size:10px;fill:#b7cdda;font-weight:600}
.cog-node.micro .node-meta{font-size:9px}
.cog-node.micro .node-ring{stroke-dasharray:2 5}
.cog-node.micro[data-state=done] .node-halo{fill:#114953;stroke:#79eadc}

.cog-node .node-meta{font-family:inherit;font-size:11px;fill:#7396ab;text-anchor:middle;pointer-events:none;font-variant-numeric:tabular-nums}
.cog-node[data-state=done] .node-halo{fill:#0e3c43;stroke:#63d8d4;filter:drop-shadow(0 0 8px rgba(80,225,210,.22))}
.cog-node[data-state=done] .node-ring{stroke:#65dccf;opacity:.77}
.cog-node[data-state=running] .node-halo{fill:#463720;stroke:#ffcd7c;filter:drop-shadow(0 0 14px rgba(255,203,125,.4))}
.cog-node[data-state=running] .node-ring{stroke:#ffd092;animation:cog-pulse 1.5s ease-in-out infinite}
.cog-node[data-state=error] .node-halo{fill:#482339;stroke:#f67da4;filter:drop-shadow(0 0 13px rgba(248,105,159,.5))}
.cog-node[data-state=error] .node-ring{stroke:#f67da4;opacity:1}
.cog-node[data-state=skipped]{opacity:.62}
.cog-node[data-state=skipped] .node-halo{fill:#192537;stroke:#4b6175;stroke-dasharray:3 4}
.cog-node.selected .node-ring,.cog-node:focus-visible .node-ring,.cog-node:hover .node-ring{stroke:#d0fafd;stroke-width:2.8;opacity:1}
.cog-node.just-verified .node-halo{animation:cog-flash .75s ease-out}
.cog-micro{fill:#65e0d5;stroke:#0c2536;stroke-width:1.5;opacity:.85}
.cog-micro-label{fill:#abc6d4;font-size:9px;font-family:inherit;pointer-events:none;text-anchor:middle}
.cog-side{border-left:1px solid rgba(112,166,188,.23);padding:19px 18px;display:flex;flex-direction:column;gap:12px;background:linear-gradient(155deg,rgba(16,31,47,.94),rgba(9,18,30,.97));min-width:0}
.cog-side-kicker{font-size:10px;color:#6bbad0;letter-spacing:.15em;font-weight:700}
.cog-detail-header{display:flex;align-items:flex-start;justify-content:space-between;gap:9px}
.cog-detail-header h3{font-size:19px;font-weight:700;letter-spacing:-.025em;margin:4px 0;color:#e7f6fc}
.cog-node-status{font-size:10px;padding:5px 8px;border:1px solid rgba(117,171,191,.25);border-radius:7px;color:#a6c8d6}
.cog-node-status[data-state=error]{border-color:#c45d7b;color:#ffb4c8}
.cog-node-status[data-state=done]{border-color:#3b9c95;color:#97ecdf}
.cog-description{font-size:12px;line-height:1.6;color:#a4bfd0;min-height:40px}
.cog-evidence-title{font-size:10px;letter-spacing:.14em;font-weight:700;color:#7196aa;padding-top:10px;border-top:1px solid rgba(125,169,191,.15)}
.cog-stage-timing{font-size:14px;font-weight:650;color:#e1f6ff;font-variant-numeric:tabular-nums}
.cog-detail-metrics{display:grid;gap:9px;align-content:start;min-height:100px}
.cog-metric-row{display:grid;gap:4px}
.cog-metric-top{display:flex;justify-content:space-between;gap:9px;font-size:11px;color:#aac1d1}
.cog-metric-top strong{font-size:11px;color:#e6f7fa;font-weight:600;font-variant-numeric:tabular-nums}
.cog-metric-track{height:3px;background:#26394a;border-radius:4px;overflow:hidden}
.cog-metric-fill{height:100%;background:linear-gradient(90deg,#4089ab,#70dfd0);border-radius:4px}
.cog-metadata{display:grid;gap:6px}
.cog-meta-row{font-size:11px;color:#bdd2dc;line-height:1.4;display:flex;justify-content:space-between;gap:12px;overflow-wrap:anywhere}
.cog-meta-row b{color:#e0f4fa;font-weight:600;text-align:right}
.cog-truth{font-size:10px;color:#86a1b0;line-height:1.5;margin-top:auto;padding-top:12px;border-top:1px solid rgba(119,171,188,.16)}
.cog-timeline-head{padding:15px 20px 6px;display:flex;gap:10px;justify-content:space-between;align-items:center;border-top:1px solid rgba(121,165,181,.18)}
.cog-timeline-head h3{margin:0;color:#dceef9;font-size:13px;font-weight:650}
.cog-timeline-head span{font-size:10px;color:#7493a7}
.cog-events{padding:7px 19px 14px;display:flex;gap:7px;overflow-x:auto;min-height:69px;scrollbar-width:thin;scrollbar-color:rgba(121,177,199,.45) transparent}
.cog-event{font:inherit;flex:0 0 auto;background:rgba(21,39,56,.9);color:#b8d2df;border:1px solid rgba(116,169,190,.24);border-radius:8px;padding:8px 10px;text-align:left;min-width:119px;cursor:pointer}
.cog-event b{font-size:11px;display:block;color:#e5f4fc;font-weight:650;margin-bottom:4px}
.cog-event span{font-size:10px;color:#8ba7ba;font-variant-numeric:tabular-nums}
.cog-event[data-state=error]{border-color:#ce6484}.cog-event[data-state=done]{border-color:rgba(90,198,192,.42)}
.cog-event[data-state=skipped]{opacity:.58}.cog-event.active{background:#1b5260;border-color:#8be8e2}
.cog-foot{display:flex;justify-content:space-between;gap:16px;padding:10px 19px 15px;border-top:1px solid rgba(107,161,184,.11);color:#6f92a6;font-size:10px;line-height:1.45}
.cog-duration{color:#a2cdda;font-variant-numeric:tabular-nums;font-size:11px}
@keyframes cog-transport{to{stroke-dashoffset:-26}}
@keyframes cog-pulse{50%{opacity:1;stroke-width:3}}
@keyframes cog-flash{0%{stroke:#ffffff;stroke-width:5;filter:drop-shadow(0 0 15px #9ff7ef)}100%{stroke-width:1.5}}
@media(max-width:1000px){.cog-stage{grid-template-columns:minmax(0,1fr) 260px}.cog-viewport,.cog-svg{min-height:440px}.cog-side{padding:16px}.cog-heading{padding:16px 15px 7px}.cog-switch{padding:10px 15px}}
@media(max-width:760px){.cog-stage{grid-template-columns:1fr}.cog-viewport,.cog-svg{min-height:340px}.cog-side{border-left:0;border-top:1px solid rgba(112,166,188,.25);display:grid;grid-template-columns:1fr 1fr;gap:12px}.cog-detail-header,.cog-description,.cog-truth{grid-column:1/-1}.cog-heading h2{font-size:19px}.cog-heading{align-items:flex-start}.cog-state{font-size:10px;max-width:125px}.cog-stats{grid-template-columns:repeat(2,1fr)}.cog-stat{padding:10px 14px}.cog-stat strong{font-size:16px}.cog-toolbar-end{margin-left:0}.cog-legend{gap:7px;font-size:9px}.cog-foot{flex-direction:column}.cog-events{padding:6px 11px 13px}}
@media(max-width:420px){.cog-side{display:flex}.cog-heading h2{font-size:17px}.cog-heading p{font-size:11px}.cog-map-label{font-size:8px}.cog-switch{gap:5px}.cog-switch button{padding:6px 9px;font-size:10px}.cog-zoom button{padding:6px}}
@media(prefers-reduced-motion:reduce){.cog-edge.active,.cog-node[data-state=running] .node-ring,.cog-node.just-verified .node-halo{animation:none!important}}
`;
export const COGNITIVE_ATLAS_HTML = String.raw`
      <section class="cog-panel" aria-label="Atlas computationnel vérifiable d'AURA">
        <header class="cog-heading">
          <div><div class="cog-kicker">AURA / ATLAS COGNITIF · INSTRUMENTÉ</div>
            <h2>Architecture d'une décision</h2>
            <p>Parcours horodaté du noyau · preuves de calcul, pas simulation de neurones.</p></div>
          <div id="cogState" class="cog-state" aria-live="polite">En attente de données vérifiables</div>
        </header>
        <nav class="cog-switch" aria-label="Modes de l'atlas">
          <button type="button" id="cogModeDialogue" aria-pressed="true">Conversation</button>
          <button type="button" id="cogModeAutonomy" aria-pressed="false">Autonomie</button>
          <button type="button" id="cogReplay" disabled>Revoir le flux</button>
          <button type="button" id="cogExport" disabled title="Exporter uniquement les mesures anonymisées">Exporter JSON</button>
          <button type="button" id="cogDiagnostics" aria-expanded="false" aria-controls="auraDiagnostics">Diagnostics</button>
          <div class="cog-toolbar-end"><div class="cog-zoom" role="group" aria-label="Zoom de la carte">
            <button type="button" id="cogZoomOut" aria-label="Réduire">−</button>
            <button type="button" id="cogZoomReset" aria-label="Réinitialiser le zoom">100%</button>
            <button type="button" id="cogZoomIn" aria-label="Agrandir">+</button>
          </div></div>
        </nav>
        <div class="cog-stats" aria-label="Mesures factuelles du traitement">
          <div class="cog-stat"><small>Étapes attestées</small><strong id="cogStatsEvents">—</strong><span>jalons exécutés</span></div>
          <div class="cog-stat"><small>Durée totale</small><strong id="cogDuration">—</strong><span>mesure du serveur</span></div>
          <div class="cog-stat"><small>Anomalies</small><strong id="cogStatsErrors">—</strong><span>étapes en échec</span></div>
          <div class="cog-stat"><small>Dernier événement</small><strong id="cogStatsLatest">—</strong><span>jalon horodaté</span></div>
        </div>
        <div class="cog-stage">
          <div class="cog-viewport" id="cogViewport">
            <div class="cog-map-label">TOPOLOGIE DU NOYAU · SÉLECTIONNER UN NŒUD</div>
            <svg id="cogGraph" class="cog-svg" viewBox="0 0 1200 700" role="group" aria-label="Graphe interactif des opérations observées, navigable au clavier"></svg>
            <div class="cog-legend" aria-hidden="true">
              <span><i class="ok"></i>Exécuté</span><span><i class="busy"></i>En cours</span><span><i class="bad"></i>Erreur</span><span><i></i>Non exécuté</span>
            </div>
          </div>
          <aside class="cog-side" aria-label="Inspection détaillée de l'opération">
            <div class="cog-detail-header"><div><div class="cog-side-kicker">INSPECTEUR · DONNÉES SOURCE</div>
              <h3 id="cogDetailTitle">Aucune opération</h3></div>
              <span id="cogDetailState" class="cog-node-status" data-state="idle">En attente</span>
            </div>
            <div id="cogDetail" class="cog-description" aria-live="polite">Les étapes n'apparaissent comme exécutées que si le serveur les a enregistrées.</div>
            <div class="cog-evidence-title">TEMPS DE TRAITEMENT</div>
            <div id="cogStageTiming" class="cog-stage-timing">—</div>
            <div class="cog-evidence-title">ÉTAT INTERNE MESURÉ</div>
            <div id="cogMetrics" class="cog-detail-metrics"><span class="cog-description">Aucune mesure disponible.</span></div>
            <div class="cog-evidence-title">AUTRES PREUVES</div>
            <div id="cogMetadata" class="cog-metadata"><span class="cog-description">Sélectionner un nœud.</span></div>
            <div class="cog-truth">Nœuds = modules instrumentés. Liaisons = architecture logicielle. Un tracé observé indique des événements compatibles avec cette liaison, sans révéler les états cachés d'un LLM.</div>
          </aside>
        </div>
        <div class="cog-timeline-head"><h3>Chronologie des événements</h3><span id="cogTimelineSummary">Aucun événement</span></div>
        <div id="cogEvents" class="cog-events" aria-label="Historique chronologique des traitements"></div>
        <div class="cog-foot"><span>Source : événements serveur, compteurs autorisés et horodatages. Aucun contenu privé exporté.</span>
          <span id="cogTraceSource">Aucune trace reçue</span></div>
      </section>
`;
