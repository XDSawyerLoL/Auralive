import {BRAIN_OPERATIONS_CSS} from './brain_operations_style.js';
import {BRAIN_REFERENCE_THEME} from './brain_reference_theme.js';
import {BRAIN_READABLE_CSS} from './brain_readable_theme.js';
import {BRAIN_OPERATIONS_SCRIPT} from './brain_operations_runtime.js';

export const BRAIN_OPERATIONS_HTML = String.raw`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#06080d">
<title>AURA — Interface neuronale réelle</title>
<style>__OPS_CSS__</style>
<style>__REFERENCE_CSS__</style>
<style>__READABLE_CSS__</style>
</head>
<body>
<div class="shell">
  <header class="top">
    <div class="logo" aria-label="AURA Cerveau opérationnel">
      <span class="logo-mark">△</span>
      <span><strong>AURA / Cerveau opérationnel</strong><small>Noyau · Mémoire · Outils · Exécution · Homéostasie</small></span>
    </div>
    <div class="top-actions">
      <span id="onlineState" class="live" data-state="unknown"><i></i><span id="onlineLabel">Connexion au noyau…</span></span>
      <button id="refreshMap" class="top-btn primary" type="button">Actualiser</button>
      <span class="build-mark">NEURAL OBSERVATORY · V1</span>
    </div>
  </header>

  <nav class="scene-nav" aria-label="Accès aux espaces d’AURA">
    <button class="scene-active" data-focus="conversation-panel" type="button">Dialogue</button>
    <button data-focus="brain" type="button">Réseau</button>
    <button data-focus="homeostasis-panel" type="button">État interne</button>
    <button data-focus="diagnostics-details" type="button">Historique et outils</button>
  </nav>
  <section id="runtimeIncident" class="runtime-incident" aria-live="polite" aria-label="Diagnostic du noyau" hidden>
    <div class="incident-icon" aria-hidden="true">!</div>
    <div class="incident-main">
      <strong id="runtimeTitle">Noyau en attente de diagnostic</strong>
      <p id="runtimeMessage">L’interface fonctionne, mais l’activité du noyau n’est pas vérifiée.</p>
      <small id="runtimeMeta">Les modules visibles sont une architecture déclarée, pas des activités exécutées.</small>
      <small id="runtimeFeedback" role="status"></small>
    </div>
    <div class="incident-actions">
      <button type="button" id="runtimeCheck">Vérifier l’état</button>
      <button type="button" id="runtimeRetry" hidden>Relancer (administrateur)</button>
    </div>
  </section>
  <details class="intro-details" id="context-details"><summary>Comprendre les mesures et les preuves de fonctionnement</summary>
  <section class="hero">
    <div class="hero-card">
      <h1>Cartographie cognitive d’AURA</h1>
      <p>Une seule interface pour interroger AURA et inspecter la circulation réelle entre ses modules, les outils sollicités et les événements persistés.</p>
      <div class="hero-note">
        <span class="pill">Gris = Connexions déclarées</span>
        <span class="pill">Cyan = Transition enregistrée récemment</span>
        <span class="pill">Ambre = replay du trajet sélectionné</span>
        <span class="pill">Aucun texte privé affiché par la carte</span>
      </div>
    </div>
    <div class="request-card">
      <h2>Requête courante · preuve d’exécution</h2>
      <div class="request-main">
        <div class="request-box">
          <label>Dernière requête envoyée ici</label>
          <p id="requestPreview">Aucune requête envoyée depuis cette interface pour l’instant.</p>
        </div>
        <div class="request-box">
          <label>Trajet courant</label>
          <strong id="currentFlowLabel">Aucun trajet sélectionné</strong>
          <p id="currentFlowSummary">Envoie une requête à AURA puis observe la chaîne de traitement et les modules effectivement traversés.</p>
        </div>
      </div>
    </div>
  </section>
  </details>

  <section class="kpis" aria-label="Mesures provenant exclusivement du serveur">
    <div class="kpi"><label>Modules présents dans le code</label><strong id="kModules">—</strong></div>
    <div class="kpi"><label>Transitions conservées (max. 160)</label><strong id="kHops">—</strong></div>
    <div class="kpi"><label>Trajets visibles (max. 12)</label><strong id="kFlows">—</strong></div>
    <div class="kpi"><label>Signaux récents (20 s)</label><strong id="kSignals">—</strong></div>
    <div class="kpi"><label>Outils observés</label><strong id="kTools">—</strong></div>
    <div class="kpi"><label>Dernière mutation organisme</label><strong id="kOrganism">—</strong></div>
  </section>

  <section class="workspace">
    <aside class="rail dialogue-rail">
      <section class="panel conversation-workspace" id="conversation-panel" aria-label="Dialogue avec AURA">
        <div class="panel-header"><h2>Dialogue avec AURA</h2><small>Conversation de cette session</small></div>
        <div id="chatHistory" role="log" aria-live="polite" aria-label="Échanges de la session"></div>
  <div id="chatDock" class="chat" aria-label="Console de requête AURA">
    <div class="chat-main">
      <strong>✦ AURA</strong>
      <select id="chatMode" aria-label="Type de requête" title="Dialogue ou mission réelle via opérateur">
        <option value="chat">Dialogue</option>
        <option value="mission">Mission / outils</option>
      </select>
      <input id="chatInput" placeholder="Pose une requête à AURA et observe en direct les modules traversés…" aria-label="Message à AURA">
      <button type="button" id="chatSend">Envoyer</button>
      <button id="chatExpand" type="button" class="secondary" aria-controls="conversation-panel">Voir dialogue</button>
    </div>
  </div>
      </section>
      <details class="module-drawer" id="module-drawer">
        <summary>Explorer les modules <span>Architecture · 42 modules</span></summary>
      <section class="panel modules-panel" id="module-list">
        <div class="panel-header"><h2>Modules réels</h2><small id="moduleCount">—</small></div>
        <div class="panel-body module-toolbar">
          <input id="moduleSearch" class="search" placeholder="Chercher un module, un outil, un fournisseur…" aria-label="Filtrer les modules">
          <select id="moduleGroup" aria-label="Catégorie des modules"><option value="all">Tous les domaines</option></select>
          <small id="moduleSummary">Inventaire des capacités installées, distinct des exécutions attestées.</small>
        </div>
        <div id="moduleList" class="modules-list" aria-label="Modules disponibles et états observés"><p class="empty">Chargement de la cartographie…</p></div>
      </section>
      </details>
    </aside>

    <section class="panel graph-panel" id="brain" aria-label="Réseau neuronal opérationnel d’AURA">
      <div class="graph-top">
        <div>
          <h2>Réseau neuronal · architecture et exécution</h2>
          <p>Régions = fonctions réelles d’AURA · Traits discrets = architecture · Impulsions = transitions persistées.</p>
        </div>
        <div class="graph-controls">
          <select id="graphLens" aria-label="Isoler une famille de modules"><option value="all">Tout le réseau</option></select>
          <button id="graphLabels" type="button" aria-pressed="false" title="Afficher davantage de noms de modules">Tous les noms</button>
          <button id="graphLess" type="button" title="Dézoomer">−</button>
          <button id="graphReset" type="button" title="Recentrer">◎</button>
          <button id="graphMore" type="button" title="Zoomer">+</button>
        </div>
      </div>
      <div class="graph-stage">
        <div id="graphViewport" class="graph-canvas">
          <canvas id="graphCanvas" role="img" aria-label="Carte neuronale interactive des modules réels et de leurs transitions observées"></canvas>
          <div class="graph-hud">
            <div class="graph-floating" id="graphClock">Aucun relevé disponible pour le moment.</div>
            <div class="graph-floating" id="graphHover" aria-live="off">Survole un point : module, statut et dernière observation.</div>
            <div class="graph-floating">Glisser · Zoomer · Cliquer sur un module · Rejouer un trajet enregistré</div>
          </div>
          <div class="neural-inspector memory-inspector" role="button" tabindex="0" data-inspect="memory">
            <div class="ni-heading"><span class="ni-icon">▤</span> Mémoire <span id="niMemoryState" class="ni-state">NON VÉRIFIÉE</span></div>
            <div class="ni-meta">Réflexions enregistrées</div><strong id="niMemoryCount">—</strong><small id="niMemoryTime">Dernier événement : —</small>
          </div>
          <div class="neural-inspector web-inspector" role="button" tabindex="0" data-inspect="web">
            <div class="ni-heading"><span class="ni-icon">◎</span> Recherche web <span id="niWebState" class="ni-state">NON VÉRIFIÉE</span></div>
            <div class="ni-meta">Dernière transition observée</div><strong id="niWebTime">—</strong><small>Source : traces AURA</small>
          </div>
          <div class="neural-inspector kernel-inspector" role="button" tabindex="0" data-inspect="kernel">
            <div class="ni-heading"><span class="ni-icon">△</span> Noyau <span id="niKernelState" class="ni-state">NON VÉRIFIÉ</span></div>
            <div class="ni-meta">Traitement routé et décision</div><strong id="niKernelTime">—</strong><small id="niKernelInfo">Aucune transition constatée</small>
          </div>
        </div>
        <div class="graph-bottom">
          <div>
            <div class="graph-legend">
              <span><i class="legend-line"></i> Connexion déclarée</span>
              <span><i class="legend-line live"></i> Transition observée récemment</span>
              <span><i class="legend-line route"></i> Requête sélectionnée</span>
              <span><i class="legend-dot"></i> Module observé &lt; 60 s</span>
            </div>
            <div class="graph-caption" id="graphCaption">Aucun mouvement n’est simulé : le graphe est silencieux lorsqu’aucune transition n’est enregistrée.</div>
          </div>
        </div>
      </div>
    </section>

    <aside class="rail inspector">
      <div class="inspector-scroll">
        <section class="detail-card causal-card" id="causal-panel">
          <div class="inline-head"><h3>Signal → décision → état</h3><span id="causalStatus" class="truth-chip">Non observé</span></div>
          <p id="causalEvidence" class="causal-evidence">Envoie une requête pour relier son trajet à un bilan homéostatique enregistré par le noyau.</p>
          <div class="causal-digest">
            <div><span>Décision du noyau</span><strong id="causalDecision">—</strong></div>
            <div><span>Expression</span><strong id="causalLanguage">—</strong></div>
            <div><span>Action métier exécutée</span><strong id="causalExecution">Non attestée</strong></div>
          </div>
          <div class="causal-values" id="causalValues"></div>
          <p class="causal-footnote" id="causalProvenance">Les états sont des indices calculés ; la charge est mesurée uniquement dans le processus Node.</p>
        </section>
    <div class="panel" id="homeostasis-panel">
      <div class="panel-header"><h2>Homéostasie</h2><small>Indices internes, calculés par AuraOrganism</small></div>
      <div class="affect-status"><span>Humeur du noyau</span><strong id="organismMood">—</strong></div>
      <div class="somatic-sensors">
        <div class="inline-head"><h3>Capteurs du processus</h3><span id="somaticFreshness" class="truth-chip">Non mesuré</span></div>
        <div><span>CPU Node</span><strong id="somaticCpu">—</strong></div>
        <div><span>Mémoire heap</span><strong id="somaticHeap">—</strong></div>
        <div><span>Pression calculée</span><strong id="somaticPressure">—</strong></div>
        <small id="somaticScope">Processus Node uniquement, pas l’ensemble de la machine.</small>
      </div>
      <div id="metricList" class="metric-list"></div>
      <p class="affect-bridge" id="affectBridge">Transmission homéostasie → langage : aucune observation chargée.</p>
      <p class="small-text" id="metricTime">Aucune mesure actuellement reçue.</p>
    </div>

        <details class="side-details" id="module-proof-details">
          <summary>Module inspecté, trajet et outils</summary>
        <section class="owner" aria-label="Accès aux observations">
          <label>OBSERVATIONS PUBLIQUES · LECTURE SEULE</label>
          <p>Trajets, outils et journal consultables sans connexion. Seules les métadonnées d’exécution sont affichées ; aucun texte de conversation ni secret n’est publié.</p>
        </section>

        <section class="detail-card">
          <h3 id="nodeTitle">Sélectionne un module</h3>
          <span id="nodeState" class="detail-state">Non inspecté</span>
          <div class="field-label">Implémentation réelle</div><div class="field-value" id="nodeSource">—</div>
          <div class="field-label">Dernière transition relevée</div><div class="field-value" id="nodeLast">Aucun événement observé</div>
          <div class="field-label">Preuve / interprétation</div><div class="field-value" id="nodeEvidence">Code présent ≠ activité réelle.</div>
          <div class="field-label">Connexions connues</div><div id="nodeConnections" class="node-connections"></div>
        </section>

        <section class="detail-card">
          <div class="field-label">Trajet sélectionné</div>
          <div class="field-value" id="flowState">Sélectionne un trajet réellement enregistré.</div>
          <div id="routeSteps" class="route-steps"></div>
        </section>

        <section class="detail-card">
          <div class="field-label">Outils réellement observés (24 h)</div>
          <div id="toolList" class="tool-list"><p class="empty">En attente de preuves d’appel.</p></div>
        </section>
        </details>
      </div>
    </aside>
  </section>

  <details class="diagnostics-details" id="diagnostics-details">
    <summary>Historique complet · flux, outils, mémoire et journal</summary>
  <section class="lower">
    <div class="panel" id="tool-panel">
      <div class="panel-header"><h2>Outils mobilisés</h2><small>Observations réelles, jamais « actifs » par défaut</small></div>
      <div id="toolMirror" class="scroll-list"><p class="empty">En attente d’une preuve d’utilisation.</p></div>
    </div>
    <div class="panel" id="flow-panel">
      <div class="panel-header"><h2>Trajets de traitement</h2><small>Identifiants persistés</small></div>
      <div id="flowList" class="scroll-list"><p class="empty">Aucune trace chargée.</p></div>
    </div>
    <div class="panel" id="journal-panel">
      <div class="panel-header"><h2>Journal d’événements</h2><small>CommandCenter · Noyau · Organisme</small></div>
      <div id="eventList" class="scroll-list"><p class="empty">Aucun événement chargé.</p></div>
    </div>
    <div class="panel" id="memory-panel">
      <div class="panel-header"><h2>Mémoire du noyau</h2><small>Compteurs issus du serveur</small></div>
      <div id="memoryStats" class="memory-stats"><p class="empty">Aucun compteur transmis.</p></div>
    </div>
    <div class="panel" id="activity-panel">
      <div class="panel-header"><h2>Activité observée</h2><small>Sessions et opérations</small></div>
      <div id="activityStats" class="scroll-list"><p class="empty">Aucune activité attestée.</p></div>
    </div>
  </section>
  </details>


</div>
<script>__OPS_SCRIPT__</script>
</body>
</html>`
.replace('__OPS_CSS__', BRAIN_OPERATIONS_CSS)
.replace('__REFERENCE_CSS__', BRAIN_REFERENCE_THEME)
.replace('__READABLE_CSS__', BRAIN_READABLE_CSS)
.replace('__OPS_SCRIPT__', BRAIN_OPERATIONS_SCRIPT);
