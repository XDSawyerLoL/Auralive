const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  catalog: { triggers: [], actions: [], conditions: [] },
  automations: [],
  selected: null,
  selectedNode: null,
  libraryTab: "triggers",
  executions: [],
  emergency: false,
};

const api = async (url, options = {}) => {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const payload = await response.json();
      message = payload.detail || message;
    } catch (_) {
      // La réponse n'est pas du JSON.
    }
    throw new Error(message);
  }
  if (response.status === 204) return null;
  return response.json();
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function toast(message, type = "success") {
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  $("#toastStack").append(item);
  setTimeout(() => item.remove(), 3600);
}

function defaultAutomation() {
  return {
    id: `scenario-${uid()}`,
    name: "Nouvelle automatisation",
    description: "",
    trigger: "internal.test",
    enabled: true,
    priority: 100,
    run_mode: "sequential",
    queue_key: null,
    condition_mode: "all",
    cooldown_seconds: 0,
    cooldown_scope: "global",
    max_concurrency: 1,
    tags: [],
    version: 1,
    conditions: [],
    actions: [],
  };
}

function defaultConfig(schema = {}) {
  const output = {};
  Object.entries(schema).forEach(([key, type]) => {
    const description = String(type);
    if (description.includes("boolean")) output[key] = false;
    else if (description.includes("number")) output[key] = 0;
    else if (description.includes("array")) output[key] = [];
    else if (description.includes("object")) output[key] = {};
    else if (description.includes("null")) output[key] = null;
    else output[key] = "";
  });
  return output;
}

async function bootstrap() {
  bindStaticEvents();
  try {
    const [health, catalog, automations] = await Promise.all([
      api("/api/health"),
      api("/api/catalog"),
      api("/api/automations"),
    ]);
    state.catalog = catalog;
    state.automations = automations;
    updateHealth(health);
    renderLibrary();
    renderAutomationList();
    selectAutomation(automations[0] || defaultAutomation());
    connectExecutionSocket();
    loadExecutionHistory();
  } catch (error) {
    updateHealth({ ok: false });
    toast(`Initialisation impossible : ${error.message}`, "error");
    selectAutomation(defaultAutomation());
  }
}

function updateHealth(health) {
  $("#healthDot").classList.toggle("online", Boolean(health.ok));
  $("#healthText").textContent = health.ok ? "Moteur opérationnel" : "Moteur indisponible";
  $("#appVersion").textContent = health.version || "2.0";
  const mairaiyReady = Boolean(health.services?.mairaiy);
  $("#mairaiyDot").classList.toggle("online", mairaiyReady);
  $("#mairaiyStatus").textContent = mairaiyReady ? "Connectée au moteur" : "Service à configurer";
}

function renderAutomationList() {
  const query = $("#automationSearch").value.trim().toLowerCase();
  const items = state.automations.filter((item) =>
    `${item.name} ${item.trigger} ${(item.tags || []).join(" ")}`.toLowerCase().includes(query)
  );
  $("#automationCount").textContent = state.automations.length;
  if (!items.length) {
    $("#automationList").innerHTML = '<div class="empty-list">Aucun scénario ne correspond à cette recherche.</div>';
    return;
  }
  $("#automationList").innerHTML = items.map((item) => `
    <button class="automation-card ${state.selected?.id === item.id ? "active" : ""}" data-id="${escapeHtml(item.id)}">
      <span class="state ${item.enabled ? "enabled" : ""}"></span>
      <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.trigger)}</small></span>
      <em>v${item.version || 1}</em>
    </button>
  `).join("");
  $$(".automation-card").forEach((button) => {
    button.addEventListener("click", () => {
      const automation = state.automations.find((item) => item.id === button.dataset.id);
      if (automation) selectAutomation(automation);
    });
  });
}

function selectAutomation(automation) {
  state.selected = clone(automation);
  state.selectedNode = null;
  $("#scenarioName").value = state.selected.name;
  $("#scenarioId").textContent = state.selected.id;
  $("#scenarioVersion").textContent = `v${state.selected.version || 1}`;
  $("#scenarioState").classList.toggle("enabled", Boolean(state.selected.enabled));
  $("#simulationType").value = state.selected.trigger;
  renderAutomationList();
  renderFlow();
  renderInspector();
}

function flowNodes() {
  if (!state.selected) return [];
  return [
    { kind: "trigger", index: 0, type: state.selected.trigger, config: {} },
    ...(state.selected.conditions || []).map((node, index) => ({ ...node, kind: "condition", index })),
    ...(state.selected.actions || []).map((node, index) => ({ ...node, kind: "action", index })),
  ];
}

function definitionFor(kind, type) {
  if (kind === "trigger") {
    const found = state.catalog.triggers.find((item) => item.type === type);
    return found ? { title: found.title || type, description: found.eventsub || found.source || "Événement" } : { title: type, description: "Déclencheur" };
  }
  const collection = kind === "condition" ? state.catalog.conditions : state.catalog.actions;
  return collection.find((item) => item.name === type) || { title: type, description: "Bloc natif" };
}

function renderFlow() {
  const nodes = flowNodes();
  $("#canvasStats").textContent = `${nodes.length} bloc${nodes.length > 1 ? "s" : ""}`;
  if (!nodes.length) {
    $("#flowColumn").innerHTML = '<div class="empty-flow"><div class="empty-orb">＋</div><strong>Scénario vide</strong><p>Ajoute un déclencheur puis compose les actions de Mairaiy.</p></div>';
    return;
  }
  $("#flowColumn").innerHTML = nodes.map((node) => {
    const definition = definitionFor(node.kind, node.type);
    const key = `${node.kind}:${node.index}`;
    const selected = state.selectedNode?.kind === node.kind && state.selectedNode?.index === node.index;
    const summary = node.kind === "trigger"
      ? node.type
      : Object.entries(node.config || {}).slice(0, 2).map(([name, value]) => `${name}: ${formatShort(value)}`).join(" · ") || definition.description;
    return `
      <article class="flow-node ${node.kind} ${selected ? "selected" : ""}" data-kind="${node.kind}" data-index="${node.index}">
        <div class="node-icon">${node.kind === "trigger" ? "⚡" : node.kind === "condition" ? "◇" : "✦"}</div>
        <div class="node-copy"><strong>${escapeHtml(definition.title || node.type)}</strong><small>${escapeHtml(summary)}</small></div>
        <button class="node-menu" title="Configurer">•••</button>
      </article>
    `;
  }).join("");
  $$(".flow-node").forEach((node) => {
    node.addEventListener("click", () => {
      state.selectedNode = { kind: node.dataset.kind, index: Number(node.dataset.index) };
      renderFlow();
      renderInspector();
    });
  });
}

function formatShort(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.length}]`;
  if (typeof value === "object") return "{…}";
  const text = String(value);
  return text.length > 34 ? `${text.slice(0, 31)}…` : text;
}

function renderLibrary() {
  $$("[data-library]").forEach((button) => button.classList.toggle("active", button.dataset.library === state.libraryTab));
  const query = $("#nodeSearch")?.value.trim().toLowerCase() || "";
  let items;
  if (state.libraryTab === "triggers") {
    items = state.catalog.triggers.map((item) => ({
      key: item.type,
      title: item.title || item.type,
      category: item.type.startsWith("twitch.") ? "Twitch" : item.type.startsWith("obs.") ? "OBS" : "Local",
      description: item.eventsub || item.source || "Événement natif",
    }));
  } else {
    items = state.catalog[state.libraryTab].map((item) => ({
      key: item.name,
      title: item.title,
      category: item.category || "Général",
      description: item.description || item.name,
    }));
  }
  items = items.filter((item) => `${item.title} ${item.key} ${item.category}`.toLowerCase().includes(query));
  const groups = Object.groupBy ? Object.groupBy(items, (item) => item.category) : items.reduce((result, item) => {
    (result[item.category] ||= []).push(item);
    return result;
  }, {});
  $("#libraryItems").innerHTML = Object.entries(groups).map(([category, group]) => `
    <div class="library-group-title">${escapeHtml(category)}</div>
    ${group.map((item) => `
      <button class="library-item" data-key="${escapeHtml(item.key)}">
        <span class="library-icon">${state.libraryTab === "triggers" ? "⚡" : state.libraryTab === "conditions" ? "◇" : "✦"}</span>
        <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.description)}</small></span>
        <span>＋</span>
      </button>
    `).join("")}
  `).join("") || '<div class="empty-list">Aucun bloc trouvé.</div>';
  $$(".library-item").forEach((button) => button.addEventListener("click", () => addLibraryItem(button.dataset.key)));
}

function addLibraryItem(key) {
  if (!state.selected) selectAutomation(defaultAutomation());
  if (state.libraryTab === "triggers") {
    state.selected.trigger = key;
    $("#simulationType").value = key;
    state.selectedNode = { kind: "trigger", index: 0 };
  } else if (state.libraryTab === "conditions") {
    const definition = state.catalog.conditions.find((item) => item.name === key);
    state.selected.conditions.push({ type: key, config: defaultConfig(definition?.config_schema), negate: false, enabled: true });
    state.selectedNode = { kind: "condition", index: state.selected.conditions.length - 1 };
  } else {
    const definition = state.catalog.actions.find((item) => item.name === key);
    state.selected.actions.push({
      id: uid(), type: key, config: defaultConfig(definition?.config_schema), enabled: true,
      timeout_seconds: 30, failure_policy: "stop", retries: 0, retry_delay_seconds: 0, save_as: null,
    });
    state.selectedNode = { kind: "action", index: state.selected.actions.length - 1 };
  }
  renderFlow();
  renderInspector();
}

function selectedNodeData() {
  if (!state.selectedNode || !state.selected) return null;
  if (state.selectedNode.kind === "trigger") return { type: state.selected.trigger, config: {} };
  const collection = state.selectedNode.kind === "condition" ? state.selected.conditions : state.selected.actions;
  return collection[state.selectedNode.index] || null;
}

function renderInspector() {
  const inspector = $("#inspector");
  inspector.classList.remove("closed");
  const node = selectedNodeData();
  if (!node) {
    renderScenarioInspector();
    return;
  }
  const kind = state.selectedNode.kind;
  const definition = definitionFor(kind, node.type);
  $("#inspectorTitle").textContent = definition.title || node.type;
  if (kind === "trigger") {
    $("#inspectorContent").innerHTML = `
      <section class="inspector-section"><h3>Déclencheur</h3>
        <div class="field-grid">
          <label>Type d’événement<input id="triggerType" value="${escapeHtml(node.type)}"></label>
          <div class="switch-row"><span>Scénario actif</span><input class="switch" id="triggerEnabled" type="checkbox" ${state.selected.enabled ? "checked" : ""}></div>
        </div>
      </section>
      <section class="inspector-section"><h3>Données disponibles</h3><textarea class="json-editor" rows="10" readonly>${escapeHtml(JSON.stringify({ event: "payload du déclencheur", global: "variables globales", viewer: "mémoire du viewer", local: "résultats précédents" }, null, 2))}</textarea></section>
    `;
    $("#triggerType").addEventListener("change", (event) => { state.selected.trigger = event.target.value.trim(); renderFlow(); });
    $("#triggerEnabled").addEventListener("change", (event) => { state.selected.enabled = event.target.checked; syncHeader(); });
    return;
  }

  const isAction = kind === "action";
  $("#inspectorContent").innerHTML = `
    <section class="inspector-section"><h3>Bloc</h3><div class="field-grid">
      <label>Type<input value="${escapeHtml(node.type)}" readonly></label>
      <div class="switch-row"><span>Bloc actif</span><input class="switch" id="nodeEnabled" type="checkbox" ${node.enabled !== false ? "checked" : ""}></div>
      ${kind === "condition" ? '<div class="switch-row"><span>Inverser le résultat</span><input class="switch" id="nodeNegate" type="checkbox" ' + (node.negate ? "checked" : "") + '></div>' : ""}
    </div></section>
    ${isAction ? `<section class="inspector-section"><h3>Exécution</h3><div class="field-grid two">
      <label>Délai max<input id="nodeTimeout" type="number" min="0.1" step="0.1" value="${node.timeout_seconds ?? 30}"></label>
      <label>Relances<input id="nodeRetries" type="number" min="0" value="${node.retries ?? 0}"></label>
      <label>Pause relance<input id="nodeRetryDelay" type="number" min="0" step="0.1" value="${node.retry_delay_seconds ?? 0}"></label>
      <label>En cas d’erreur<select id="nodeFailure"><option value="stop">Arrêter</option><option value="continue">Continuer</option><option value="rollback">Annuler</option></select></label>
    </div><label style="margin-top:10px">Sauvegarder le résultat sous<input id="nodeSaveAs" value="${escapeHtml(node.save_as || "")}" placeholder="ex. reponse_mairaiy"></label></section>` : ""}
    <section class="inspector-section"><h3>Configuration JSON</h3><textarea class="json-editor" id="nodeConfig" rows="13">${escapeHtml(JSON.stringify(node.config || {}, null, 2))}</textarea></section>
    <div class="inspector-actions"><button class="delete-button" id="deleteNode">Supprimer ce bloc</button></div>
  `;
  if (isAction) $("#nodeFailure").value = node.failure_policy || "stop";
  $("#nodeEnabled").addEventListener("change", (event) => { node.enabled = event.target.checked; renderFlow(); });
  $("#nodeNegate")?.addEventListener("change", (event) => { node.negate = event.target.checked; });
  $("#nodeTimeout")?.addEventListener("change", (event) => { node.timeout_seconds = Number(event.target.value); });
  $("#nodeRetries")?.addEventListener("change", (event) => { node.retries = Number(event.target.value); });
  $("#nodeRetryDelay")?.addEventListener("change", (event) => { node.retry_delay_seconds = Number(event.target.value); });
  $("#nodeFailure")?.addEventListener("change", (event) => { node.failure_policy = event.target.value; });
  $("#nodeSaveAs")?.addEventListener("change", (event) => { node.save_as = event.target.value.trim() || null; });
  $("#nodeConfig").addEventListener("change", (event) => {
    try { node.config = JSON.parse(event.target.value); renderFlow(); }
    catch (error) { toast(`JSON invalide : ${error.message}`, "error"); }
  });
  $("#deleteNode").addEventListener("click", deleteSelectedNode);
}

function renderScenarioInspector() {
  $("#inspectorTitle").textContent = "Scénario";
  const a = state.selected;
  $("#inspectorContent").innerHTML = `
    <section class="inspector-section"><h3>Identité</h3><div class="field-grid">
      <div class="switch-row"><span>Automatisation active</span><input class="switch" id="scenarioEnabled" type="checkbox" ${a.enabled ? "checked" : ""}></div>
      <label>Description<textarea id="scenarioDescription" rows="3">${escapeHtml(a.description || "")}</textarea></label>
      <label>Tags<input id="scenarioTags" value="${escapeHtml((a.tags || []).join(", "))}" placeholder="alertes, mairaiy, communauté"></label>
    </div></section>
    <section class="inspector-section"><h3>Orchestration</h3><div class="field-grid two">
      <label>Priorité<input id="scenarioPriority" type="number" value="${a.priority ?? 100}"></label>
      <label>Mode<select id="scenarioRunMode"><option value="sequential">Séquentiel</option><option value="parallel">Parallèle</option></select></label>
      <label>Conditions<select id="scenarioConditionMode"><option value="all">Toutes</option><option value="any">Au moins une</option></select></label>
      <label>Concurrence<input id="scenarioConcurrency" type="number" min="1" value="${a.max_concurrency ?? 1}"></label>
      <label>Cooldown<input id="scenarioCooldown" type="number" min="0" step="0.1" value="${a.cooldown_seconds ?? 0}"></label>
      <label>Portée<select id="scenarioCooldownScope"><option value="global">Globale</option><option value="viewer">Par viewer</option></select></label>
    </div><label style="margin-top:10px">Clé de file<input id="scenarioQueue" value="${escapeHtml(a.queue_key || "")}" placeholder="ex. chat-{{event.user_id}}"></label></section>
    <section class="inspector-section"><h3>Variables de modèles</h3><textarea class="json-editor" rows="8" readonly>${escapeHtml(JSON.stringify({ viewer: "{{event.user_name}}", message: "{{event.message}}", variable: "{{global.nom}}", previous: "{{local.resultat}}" }, null, 2))}</textarea></section>
  `;
  $("#scenarioRunMode").value = a.run_mode || "sequential";
  $("#scenarioConditionMode").value = a.condition_mode || "all";
  $("#scenarioCooldownScope").value = a.cooldown_scope || "global";
  const bind = (id, callback) => $(id).addEventListener("change", callback);
  bind("#scenarioEnabled", (e) => { a.enabled = e.target.checked; syncHeader(); });
  bind("#scenarioDescription", (e) => { a.description = e.target.value; });
  bind("#scenarioTags", (e) => { a.tags = e.target.value.split(",").map((item) => item.trim()).filter(Boolean); });
  bind("#scenarioPriority", (e) => { a.priority = Number(e.target.value); });
  bind("#scenarioRunMode", (e) => { a.run_mode = e.target.value; });
  bind("#scenarioConditionMode", (e) => { a.condition_mode = e.target.value; });
  bind("#scenarioConcurrency", (e) => { a.max_concurrency = Math.max(1, Number(e.target.value)); });
  bind("#scenarioCooldown", (e) => { a.cooldown_seconds = Math.max(0, Number(e.target.value)); });
  bind("#scenarioCooldownScope", (e) => { a.cooldown_scope = e.target.value; });
  bind("#scenarioQueue", (e) => { a.queue_key = e.target.value.trim() || null; });
}

function syncHeader() {
  $("#scenarioState").classList.toggle("enabled", Boolean(state.selected?.enabled));
}

function deleteSelectedNode() {
  if (!state.selectedNode || state.selectedNode.kind === "trigger") {
    toast("Le déclencheur ne peut pas être supprimé, seulement remplacé.", "error");
    return;
  }
  const collection = state.selectedNode.kind === "condition" ? state.selected.conditions : state.selected.actions;
  collection.splice(state.selectedNode.index, 1);
  state.selectedNode = null;
  renderFlow();
  renderInspector();
}

async function saveSelected() {
  if (!state.selected) return;
  state.selected.name = $("#scenarioName").value.trim() || "Automatisation sans nom";
  try {
    const saved = await api("/api/automations", { method: "POST", body: JSON.stringify(state.selected) });
    const index = state.automations.findIndex((item) => item.id === saved.id);
    if (index >= 0) state.automations[index] = saved;
    else state.automations.push(saved);
    selectAutomation(saved);
    toast("Automatisation enregistrée.");
  } catch (error) {
    toast(`Enregistrement impossible : ${error.message}`, "error");
  }
}

function duplicateSelected() {
  if (!state.selected) return;
  const duplicate = clone(state.selected);
  duplicate.id = `scenario-${uid()}`;
  duplicate.name = `${duplicate.name} — copie`;
  duplicate.version = 1;
  duplicate.actions = duplicate.actions.map((action) => ({ ...action, id: uid() }));
  selectAutomation(duplicate);
  toast("Copie créée. Enregistre-la pour la conserver.");
}

function openJsonDialog() {
  $("#jsonDocument").value = JSON.stringify(state.selected || defaultAutomation(), null, 2);
  $("#jsonDialog").showModal();
}

function applyJsonDocument() {
  try {
    const parsed = JSON.parse($("#jsonDocument").value);
    selectAutomation(parsed);
    $("#jsonDialog").close();
    toast("Document JSON appliqué. Enregistre pour le conserver.");
  } catch (error) {
    toast(`JSON invalide : ${error.message}`, "error");
  }
}

async function runSimulation() {
  if (!state.selected) return;
  let payload;
  try { payload = JSON.parse($("#simulationPayload").value); }
  catch (error) { toast(`Payload invalide : ${error.message}`, "error"); return; }
  $("#simulationResult").textContent = "Simulation en cours…";
  try {
    const result = await api(`/api/automations/${encodeURIComponent(state.selected.id)}/simulate`, {
      method: "POST",
      body: JSON.stringify({ type: $("#simulationType").value, payload }),
    });
    $("#simulationResult").textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    $("#simulationResult").textContent = error.message;
  }
}

async function loadExecutionHistory() {
  try {
    const history = await api("/api/executions?limit=50");
    state.executions = history.reverse();
    renderExecutions();
  } catch (_) {
    // Le journal temps réel reste disponible même sans historique.
  }
}

function connectExecutionSocket() {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${scheme}://${location.host}/ws/executions`);
  socket.onmessage = (event) => {
    state.executions.push(JSON.parse(event.data));
    state.executions = state.executions.slice(-200);
    renderExecutions();
  };
  socket.onclose = () => setTimeout(connectExecutionSocket, 1800);
}

function renderExecutions() {
  const consoleElement = $("#executionConsole");
  if (!state.executions.length) {
    consoleElement.innerHTML = '<div class="empty-console">Aucune exécution reçue pendant cette session.</div>';
    return;
  }
  consoleElement.innerHTML = state.executions.slice().reverse().map((item) => {
    const statusClass = item.skipped ? "skip" : item.ok ? "ok" : "fail";
    const time = item.finished_at ? new Date(item.finished_at).toLocaleTimeString("fr-FR") : "—";
    return `<div class="execution-row"><small>${escapeHtml(time)}</small><b class="${statusClass}">${escapeHtml(item.status || (item.ok ? "succès" : "échec"))}</b><span>${escapeHtml(item.automation_id)} · ${escapeHtml(item.event_type)}</span><small>${item.duration_ms || 0} ms</small></div>`;
  }).join("");
}

async function toggleEmergency() {
  try {
    const result = await api("/api/emergency", { method: "POST", body: JSON.stringify({ active: !state.emergency }) });
    state.emergency = Boolean(result.active);
    $("#emergencyButton").classList.toggle("active", state.emergency);
    $("#emergencyButton").textContent = state.emergency ? "URGENCE ACTIVE" : "MODE URGENCE";
    toast(state.emergency ? "Mode urgence activé." : "Mode normal restauré.", state.emergency ? "error" : "success");
  } catch (error) {
    toast(`Mode urgence indisponible : ${error.message}`, "error");
  }
}

function bindStaticEvents() {
  $("#collapseSidebar").addEventListener("click", () => {
    $("#appShell").classList.toggle("sidebar-collapsed");
    localStorage.setItem("aura.sidebar.collapsed", $("#appShell").classList.contains("sidebar-collapsed"));
  });
  if (localStorage.getItem("aura.sidebar.collapsed") === "true") $("#appShell").classList.add("sidebar-collapsed");
  $("#automationSearch").addEventListener("input", renderAutomationList);
  $("#nodeSearch").addEventListener("input", renderLibrary);
  $$("[data-library]").forEach((button) => button.addEventListener("click", () => { state.libraryTab = button.dataset.library; renderLibrary(); }));
  $("#newAutomation").addEventListener("click", () => selectAutomation(defaultAutomation()));
  $("#scenarioName").addEventListener("input", (event) => { if (state.selected) state.selected.name = event.target.value; });
  $("#saveAutomation").addEventListener("click", saveSelected);
  $("#duplicateAutomation").addEventListener("click", duplicateSelected);
  $("#simulateAutomation").addEventListener("click", () => $("#simulationDialog").showModal());
  $("#runSimulation").addEventListener("click", runSimulation);
  $("#importButton").addEventListener("click", openJsonDialog);
  $("#applyJson").addEventListener("click", applyJsonDocument);
  $("#openExecutions").addEventListener("click", () => $("#executionDrawer").classList.add("open"));
  $("#closeExecutions").addEventListener("click", () => $("#executionDrawer").classList.remove("open"));
  $("#clearConsole").addEventListener("click", () => { state.executions = []; renderExecutions(); });
  $("#closeInspector").addEventListener("click", () => $("#inspector").classList.add("closed"));
  $("#addNodeFloating").addEventListener("click", () => { state.libraryTab = "actions"; renderLibrary(); $("#nodeSearch").focus(); });
  $("#emergencyButton").addEventListener("click", toggleEmergency);
  $$("[data-view]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.view !== "studio") toast(`${button.textContent.trim()} sera branché sur le même moteur natif.`);
  }));
}

bootstrap();
