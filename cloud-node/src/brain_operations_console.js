import {BRAIN_OPERATIONS_CSS} from './brain_operations_style.js';
import {BRAIN_REFERENCE_THEME} from './brain_reference_theme.js';
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
</head>
<body>
<div class="shell">
  <header class="top">
    <div class="logo" aria-label="AURA Cerveau opérationnel">
      <span class="logo-mark">△</span>
      <span><strong>AURA / Cerveau opérationnel</strong><small>Noyau · Mémoire · Outils · Exécution · Homéostasie</small></span>
    </div>
    <div class="top-actions">
      <span id="onlineState" class="live" data-state="unknown"><i></i>Connexion au noyau…</span>
      <button id="refreshMap" class="top-btn primary" type="button">Actualiser</button>
      <span class="build-mark">NEURAL OBSERVATORY · V1</span>
    </div>
  </header>

  <nav class="scene-nav" aria-label="Navigation dans l’interface unique">
    <button class="scene-active" data-focus="brain" type="button">◈ Cerveau</button>
    <button data-focus="module-list" type="button">⠿ Modules</button>
    <button data-focus="tool-panel" type="button">◇ Outils</button>
    <button data-focus="memory-panel" type="button">▣ Mémoire</button>
    <button data-focus="flow-panel" type="button">⇢ Flux</button>
    <button data-focus="homeostasis-panel" type="button">♡ Homéostasie</button>
    <button data-focus="journal-panel" type="button">≡ Journal</button>
    <button data-focus="chatInput" type="button">✦ Requête AURA</button>
  </nav>
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

  <section class="kpis" aria-label="Mesures provenant exclusivement du serveur">
    <div class="kpi"><label>Modules présents dans le code</label><strong id="kModules">—</strong></div>
    <div class="kpi"><label>Transitions conservées (max. 160)</label><strong id="kHops">—</strong></div>
    <div class="kpi"><label>Trajets visibles (max. 12)</label><strong id="kFlows">—</strong></div>
    <div class="kpi"><label>Signaux récents (20 s)</label><strong id="kSignals">—</strong></div>
    <div class="kpi"><label>Outils observés</label><strong id="kTools">—</strong></div>
    <div class="kpi"><label>Dernière mutation organisme</label><strong id="kOrganism">—</strong></div>
  </section>

  <section class="workspace">
    <aside class="rail">
      <section class="panel modules-panel" id="module-list">
        <div class="panel-header"><h2>Modules réels</h2><small id="moduleCount">—</small></div>
        <div class="panel-body"><input id="moduleSearch" class="search" placeholder="Chercher un module, un outil, un fournisseur…" aria-label="Filtrer les modules"></div>
        <div id="moduleList" class="modules-list" aria-label="Modules disponibles et états observés"><p class="empty">Chargement de la cartographie…</p></div>
      </section>
    </aside>

    <section class="panel graph-panel" id="brain" aria-label="Réseau neuronal opérationnel d’AURA">
      <div class="graph-top">
        <div>
          <h2>Réseau neuronal · architecture et exécution</h2>
          <p>Régions = fonctions réelles d’AURA · Traits discrets = architecture · Impulsions = transitions persistées.</p>
        </div>
        <div class="graph-controls">
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
        <section class="owner" id="ownerArea">
          <label id="authState">Accès aux traces : vérification…</label>
          <div id="ownerFields" class="owner-form">
            <input id="ownerKey" type="password" placeholder="Clé privée AURA" autocomplete="off" aria-label="Clé propriétaire AURA">
            <button id="ownerSignIn" type="button">Ouvrir</button>
          </div>
          <p>Les trajets détaillés sont privés. La carte n’expose pas le contenu des conversations ; elle expose uniquement les modules traversés et leurs preuves.</p>
        </section>

        <section class="detail-card">
          <h3 id="nodeTitle">Sélectionne un module</h3>
          <span id="nodeState" class="detail-state">Non inspecté</span>
          <div class="field-label">Implémentation réelle</div><div class="field-value" id="nodeSource">—</div>
          <div class="field-label">Dernière transition relevée</div><div class="field-value" id="nodeLast">Aucun événement observé</div>
          <div class="field-label">Preuve / interprétation</div><div class="field-value" id="nodeEvidence">Code présent ≠ activité réelle.</div>
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
      </div>
    </aside>
  </section>

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
    <div class="panel" id="homeostasis-panel">
      <div class="panel-header"><h2>Homéostasie</h2><small>Mesures numériques réelles</small></div>
      <div id="metricList" class="metric-list"></div>
      <p class="small-text" id="metricTime">Aucune mesure actuellement reçue.</p>
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

  <div id="chatDock" class="chat" aria-label="Console de requête AURA">
    <div id="chatHistory" role="log" aria-live="polite"></div>
    <div class="chat-main">
      <strong>✦ AURA</strong>
      <select id="chatMode" aria-label="Type de requête" title="Dialogue ou mission réelle via opérateur">
        <option value="chat">Dialogue</option>
        <option value="mission">Mission / outils</option>
      </select>
      <input id="chatInput" placeholder="Pose une requête à AURA et observe en direct les modules traversés…" aria-label="Message à AURA">
      <button type="button" id="chatSend">Envoyer</button>
      <button id="chatExpand" type="button" class="secondary" aria-expanded="false">Conversation</button>
    </div>
  </div>
</div>
<script>__OPS_SCRIPT__</script>
</body>
</html>`
.replace('__OPS_CSS__', BRAIN_OPERATIONS_CSS)
.replace('__REFERENCE_CSS__', BRAIN_REFERENCE_THEME)
.replace('__OPS_SCRIPT__', BRAIN_OPERATIONS_SCRIPT);
