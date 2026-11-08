import {BRAIN_OPERATIONS_CSS} from './brain_operations_style.js';
import {BRAIN_OPERATIONS_SCRIPT} from './brain_operations_runtime.js';

export const BRAIN_OPERATIONS_HTML = String.raw`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#06080d">
<title>AURA — Interface neuronale réelle</title>
<style>__OPS_CSS__</style>
</head>
<body>
<div class="shell">
  <header class="top">
    <a class="logo" href="/" title="Retour au chat AURA">
      <span class="logo-mark">△</span>
      <span><strong>AURA / NEURAL OPS</strong><small>une seule interface · modules réels · traces réelles · requête live</small></span>
    </a>
    <div class="top-actions">
      <span id="onlineState" class="live" data-state="unknown"><i></i>Connexion au noyau…</span>
      <button id="refreshMap" class="top-btn primary" type="button">Actualiser</button>
      <a href="/" class="top-btn">Chat principal</a>
    </div>
  </header>

  <section class="hero">
    <div class="hero-card">
      <h1>Observatoire neuronal véridique d’AURA</h1>
      <p>Cette interface ne montre pas un cerveau décoratif. Elle montre l’architecture du logiciel, les transitions réellement persistées, les trajets de traitement, l’homéostasie, les outils mobilisés et la réponse produite après une requête.</p>
      <div class="hero-note">
        <span class="pill">Gris = Connexions déclarées</span>
        <span class="pill">Cyan = Transition enregistrée récemment</span>
        <span class="pill">Ambre = replay du trajet sélectionné</span>
        <span class="pill">Aucun texte privé affiché par la carte</span>
      </div>
    </div>
    <div class="request-card">
      <h2>Lecture de la requête en direct</h2>
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
    <div class="kpi"><label>Transitions observées (24 h)</label><strong id="kHops">—</strong></div>
    <div class="kpi"><label>Trajets identifiables</label><strong id="kFlows">—</strong></div>
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

    <section class="panel graph-panel" aria-label="Réseau neuronal opérationnel d’AURA">
      <div class="graph-top">
        <div>
          <h2>Réseau neuronal opérationnel</h2>
          <p>Chaque nœud représente un module réel. Les arêtes cyan correspondent à des transitions de modules enregistrées. La sélection d’un trajet rejoue visuellement le traitement de la requête sans inventer de faux événements. Source : aura_cognitive_traces.</p>
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
            <div class="graph-floating">Glisser pour déplacer, molette pour zoomer, cliquer pour inspecter un module, sélectionner un trajet pour voir son replay.</div>
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
  </section>

  <div id="chatDock" class="chat" aria-label="Console de requête AURA">
    <div id="chatHistory" role="log" aria-live="polite"></div>
    <div class="chat-main">
      <strong>AURA / REQUÊTE</strong>
      <input id="chatInput" placeholder="Pose une requête à AURA et observe en direct les modules traversés…" aria-label="Message à AURA">
      <button type="button" id="chatSend">Envoyer</button>
      <button id="chatExpand" type="button" class="secondary" aria-expanded="false">Historique</button>
    </div>
  </div>
</div>
<script>__OPS_SCRIPT__</script>
</body>
</html>`
.replace('__OPS_CSS__', BRAIN_OPERATIONS_CSS)
.replace('__OPS_SCRIPT__', BRAIN_OPERATIONS_SCRIPT);
