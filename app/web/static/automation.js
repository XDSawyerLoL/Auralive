const $ = (selector) => document.querySelector(selector);
const state = { catalog: { actions: [], conditions: [], triggers: [] }, definitions: [], templates: [], current: null, editing: null };

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try { detail = (await response.json()).detail || detail; } catch {}
    throw new Error(detail);
  }
  return response.status === 204 ? null : response.json();
}

function toast(message, error = false) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.toggle("error", error);
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 2800);
}

function emptyDefinition() {
  return {
    id: `automation-${crypto.randomUUID()}`,
    name: "Nouvelle automatisation",
    description: "",
    trigger: "automation.manual",
    enabled: true,
    priority: 100,
    run_mode: "sequential",
    queue_key: "",
    cooldown_seconds: 0,
    cooldown_scope: "global",
    max_concurrency: 1,
    condition_mode: "all",
    conditions: [],
    actions: [{ type: "debug.capture", config: { message: "Test Aura Live" }, enabled: true, failure_policy: "stop" }],
    tags: [], version: 1,
  };
}

function nodeDefinition(type, kind) {
  return state.catalog[kind === "action" ? "actions" : "conditions"].find((item) => item.name === type) || { name: type, title: type, category: "Inconnu", config_schema: {} };
}

function syncFormToState() {
  if (!state.current) return;
  Object.assign(state.current, {
    name: $("#automationName").value.trim() || "Automatisation sans nom",
    description: $("#automationDescription").value.trim(),
    enabled: $("#automationEnabled").checked,
    trigger: $("#triggerSelect").value,
    priority: Number($("#priorityInput").value || 100),
    run_mode: $("#runMode").value,
    queue_key: $("#queueKey").value.trim() || null,
    cooldown_seconds: Number($("#cooldown").value || 0),
    cooldown_scope: $("#cooldownScope").value,
  });
}

function fillForm() {
  const item = state.current;
  if (!item) return;
  $("#automationName").value = item.name || "";
  $("#automationDescription").value = item.description || "";
  $("#automationEnabled").checked = item.enabled !== false;
  $("#triggerSelect").value = item.trigger || "automation.manual";
  $("#priorityInput").value = item.priority ?? 100;
  $("#runMode").value = item.run_mode || "sequential";
  $("#queueKey").value = item.queue_key || "";
  $("#cooldown").value = item.cooldown_seconds || 0;
  $("#cooldownScope").value = item.cooldown_scope || "global";
  renderFlow();
  renderAutomationList();
}

function renderStatus(status) {
  const values = [
    [status.definitions, "scénarios"], [status.enabled, "actifs"], [status.actions, "actions"], [status.conditions, "conditions"]
  ];
  $("#statusCards").innerHTML = values.map(([value, label]) => `<div class="status-card"><b>${value}</b><span>${label}</span></div>`).join("");
}

function renderTriggerOptions() {
  $("#triggerSelect").innerHTML = state.catalog.triggers.map((item) => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.category)} — ${escapeHtml(item.title)}</option>`).join("");
  $("#triggerSelect").addEventListener("change", () => { syncFormToState(); renderFlow(); });
}

function renderAutomationList() {
  const root = $("#automationList");
  if (!state.definitions.length) { root.innerHTML = `<div class="automation-card"><small>Aucun scénario enregistré</small></div>`; return; }
  root.innerHTML = state.definitions.map((item) => `<button class="automation-card ${state.current?.id === item.id ? "active" : ""}" data-id="${escapeHtml(item.id)}"><strong><span class="dot ${item.enabled ? "on" : ""}"></span>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.trigger)}</small></button>`).join("");
  root.querySelectorAll("[data-id]").forEach((button) => button.addEventListener("click", () => {
    syncFormToState();
    state.current = structuredClone(state.definitions.find((item) => item.id === button.dataset.id));
    fillForm();
  }));
}

function renderTemplates() {
  const root = $("#templateList");
  root.innerHTML = state.templates.map((item) => `<button class="template-card" data-template="${escapeHtml(item.id)}"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.trigger)}</small></button>`).join("");
  root.querySelectorAll("[data-template]").forEach((button) => button.addEventListener("click", async () => {
    try {
      const installed = await api(`/api/automation/templates/${encodeURIComponent(button.dataset.template)}/install`, { method: "POST", body: "{}" });
      await reloadDefinitions(installed.id);
      toast("Modèle installé. Il reste désactivé jusqu’à ta validation.");
    } catch (error) { toast(error.message, true); }
  }));
}

function renderFlow() {
  const current = state.current;
  const trigger = state.catalog.triggers.find((item) => item.name === current.trigger) || { title: current.trigger, category: "Avancé" };
  $("#triggerNode").innerHTML = `<strong>${escapeHtml(trigger.title)}</strong><small>${escapeHtml(trigger.category)} · ${escapeHtml(current.trigger)}</small>`;
  renderNodes("condition");
  renderNodes("action");
}

function renderNodes(kind) {
  const key = kind === "action" ? "actions" : "conditions";
  const root = kind === "action" ? $("#actionsCanvas") : $("#conditionsCanvas");
  const rows = state.current[key] || [];
  if (!rows.length) { root.innerHTML = `<div class="node ${kind}-node"><small>Aucune ${kind === "action" ? "action" : "condition"}</small></div>`; return; }
  root.innerHTML = rows.map((item, index) => {
    const definition = nodeDefinition(item.type, kind);
    const summary = Object.entries(item.config || {}).slice(0, 3).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ");
    return `<div class="node ${kind}-node" draggable="true" data-kind="${kind}" data-index="${index}"><div class="node-actions"><button data-edit="${index}" title="Configurer">⚙</button><button data-copy="${index}" title="Dupliquer">⧉</button><button data-delete="${index}" title="Supprimer">×</button></div><strong>${escapeHtml(definition.title)}</strong><small>${escapeHtml(definition.category)} · ${escapeHtml(summary || "Configuration par défaut")}</small></div>`;
  }).join("");
  root.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => openNodeDialog(kind, Number(button.dataset.edit))));
  root.querySelectorAll("[data-copy]").forEach((button) => button.addEventListener("click", () => { rows.splice(Number(button.dataset.copy) + 1, 0, structuredClone(rows[Number(button.dataset.copy)])); renderNodes(kind); }));
  root.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => { rows.splice(Number(button.dataset.delete), 1); renderNodes(kind); }));
  installDrag(root, rows, kind);
}

function installDrag(root, rows, kind) {
  let from = null;
  root.querySelectorAll("[draggable]").forEach((node) => {
    node.addEventListener("dragstart", () => { from = Number(node.dataset.index); node.style.opacity = ".45"; });
    node.addEventListener("dragend", () => { node.style.opacity = "1"; from = null; });
    node.addEventListener("dragover", (event) => event.preventDefault());
    node.addEventListener("drop", (event) => {
      event.preventDefault(); const to = Number(node.dataset.index);
      if (from === null || from === to) return;
      const [moved] = rows.splice(from, 1); rows.splice(to, 0, moved); renderNodes(kind);
    });
  });
}

function openPicker(kind) {
  const options = state.catalog[kind === "action" ? "actions" : "conditions"];
  const query = prompt(`Nom du bloc à ajouter :\n\n${options.map((item) => item.name).join("\n")}`, options[0]?.name || "");
  if (!query) return;
  const match = options.find((item) => item.name === query) || options.find((item) => item.title.toLowerCase().includes(query.toLowerCase()));
  if (!match) { toast("Bloc introuvable", true); return; }
  const row = kind === "action" ? { type: match.name, config: defaultsFor(match.config_schema), enabled: true, failure_policy: "stop", timeout_seconds: 30, retries: 0 } : { type: match.name, config: defaultsFor(match.config_schema), enabled: true, negate: false };
  const key = kind === "action" ? "actions" : "conditions";
  state.current[key].push(row);
  renderNodes(kind);
  openNodeDialog(kind, state.current[key].length - 1);
}

function defaultsFor(schema = {}) {
  const result = {};
  for (const [key, type] of Object.entries(schema)) {
    const text = String(type);
    result[key] = text.includes("boolean") ? false : text.includes("number") ? 0 : text.includes("array") ? [] : text.includes("object") || text === "any" ? {} : "";
  }
  return result;
}

function openNodeDialog(kind, index) {
  const key = kind === "action" ? "actions" : "conditions";
  const row = state.current[key][index];
  const definition = nodeDefinition(row.type, kind);
  state.editing = { kind, index };
  $("#dialogCategory").textContent = definition.category;
  $("#dialogTitle").textContent = definition.title;
  $("#dialogDescription").textContent = definition.description || definition.name;
  const fields = Object.entries(definition.config_schema || {}).map(([name, type]) => {
    const value = row.config?.[name];
    const inputType = String(type).includes("number") ? "number" : "text";
    return `<label>${escapeHtml(name)}<input data-field="${escapeHtml(name)}" data-type="${escapeHtml(String(type))}" type="${inputType}" value="${escapeHtml(typeof value === "object" ? JSON.stringify(value) : value ?? "")}"></label>`;
  }).join("");
  $("#configFields").innerHTML = fields || `<p>Aucun champ obligatoire.</p>`;
  $("#configJson").value = JSON.stringify(row.config || {}, null, 2);
  $("#configDialog").showModal();
}

function applyNodeConfig(event) {
  event.preventDefault();
  if (!state.editing) return;
  const { kind, index } = state.editing;
  const key = kind === "action" ? "actions" : "conditions";
  const row = state.current[key][index];
  try {
    const config = JSON.parse($("#configJson").value || "{}");
    $("#configFields").querySelectorAll("[data-field]").forEach((input) => {
      let value = input.value; const type = input.dataset.type;
      if (type.includes("number")) value = Number(value || 0);
      else if (type.includes("boolean")) value = ["true", "1", "oui"].includes(value.toLowerCase());
      else if (type.includes("array") || type.includes("object") || type === "any") { try { value = JSON.parse(value); } catch {} }
      config[input.dataset.field] = value;
    });
    row.config = config;
    $("#configDialog").close();
    renderNodes(kind);
  } catch (error) { toast(`JSON invalide : ${error.message}`, true); }
}

function renderCatalog(filter = "") {
  const needle = filter.trim().toLowerCase();
  const items = [
    ...state.catalog.actions.map((item) => ({ ...item, kind: "action" })),
    ...state.catalog.conditions.map((item) => ({ ...item, kind: "condition" })),
  ].filter((item) => !needle || `${item.title} ${item.name} ${item.category}`.toLowerCase().includes(needle));
  $("#catalog").innerHTML = items.map((item) => `<div class="catalog-item" data-catalog-kind="${item.kind}" data-catalog-name="${escapeHtml(item.name)}"><b>${item.kind === "action" ? "▶" : "◆"} ${escapeHtml(item.title)}</b><span>${escapeHtml(item.category)} · ${escapeHtml(item.name)}</span>${item.risk && item.risk !== "safe" ? `<span class="risk">Risque contrôlé : ${escapeHtml(item.risk)}</span>` : ""}</div>`).join("");
  $("#catalog").querySelectorAll("[data-catalog-name]").forEach((node) => node.addEventListener("click", () => {
    const kind = node.dataset.catalogKind; const definition = nodeDefinition(node.dataset.catalogName, kind);
    const key = kind === "action" ? "actions" : "conditions";
    state.current[key].push(kind === "action" ? { type: definition.name, config: defaultsFor(definition.config_schema), enabled: true, failure_policy: "stop", timeout_seconds: 30 } : { type: definition.name, config: defaultsFor(definition.config_schema), enabled: true, negate: false });
    renderNodes(kind); openNodeDialog(kind, state.current[key].length - 1);
  }));
}

function renderReports(reports) {
  $("#reports").innerHTML = reports.length ? reports.map((item) => `<div class="report ${item.skipped ? "skip" : item.ok ? "" : "fail"}"><strong>${escapeHtml(item.automation_id)} · ${escapeHtml(item.status)}</strong><small>${escapeHtml(item.event_type)} · ${item.duration_ms || 0} ms · ${item.steps?.length || 0} étape(s)${item.reason ? ` · ${escapeHtml(item.reason)}` : ""}</small></div>`).join("") : `<p>Aucune exécution enregistrée.</p>`;
}

async function reloadDefinitions(selectId = null) {
  state.definitions = await api("/api/automation/definitions");
  if (selectId) state.current = structuredClone(state.definitions.find((item) => item.id === selectId));
  else if (state.current) state.current = structuredClone(state.definitions.find((item) => item.id === state.current.id) || state.current);
  renderAutomationList(); fillForm();
}

async function saveCurrent() {
  syncFormToState();
  try {
    const saved = await api("/api/automation/definitions", { method: "POST", body: JSON.stringify(state.current) });
    await reloadDefinitions(saved.id); toast("Automatisation enregistrée");
  } catch (error) { toast(error.message, true); }
}

async function simulateCurrent() {
  syncFormToState();
  try {
    if (!state.definitions.some((item) => item.id === state.current.id)) await saveCurrent();
    const report = await api(`/api/automation/definitions/${encodeURIComponent(state.current.id)}/simulate`, { method: "POST", body: JSON.stringify({ event_type: state.current.trigger, user_id: "simulation", user_name: "Viewer Test", text: "Message de test", viewers: 42, reward: { title: "CHANGE_SCENE" } }) });
    renderReports([report]); toast("Simulation terminée sans mutation réelle");
  } catch (error) { toast(error.message, true); }
}

async function runCurrent() {
  syncFormToState();
  try {
    await saveCurrent();
    const result = await api("/api/automation/dispatch", { method: "POST", body: JSON.stringify({ event_type: state.current.trigger, user_id: "dashboard", user_name: "Sansa", text: "Déclenchement manuel" }) });
    renderReports(result.reports || []); toast("Événement envoyé au moteur");
  } catch (error) { toast(error.message, true); }
}

function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }

async function initialize() {
  try {
    const [status, catalog, definitions, templates, reports] = await Promise.all([
      api("/api/automation/status"), api("/api/automation/catalog"), api("/api/automation/definitions"), api("/api/automation/templates"), api("/api/automation/reports?limit=30")
    ]);
    state.catalog = catalog; state.definitions = definitions; state.templates = templates; state.current = structuredClone(definitions[0] || emptyDefinition());
    renderStatus(status); renderTriggerOptions(); renderAutomationList(); renderTemplates(); renderCatalog(); renderReports(reports); fillForm();
  } catch (error) { toast(`Initialisation impossible : ${error.message}`, true); }
}

$("#newAutomation").addEventListener("click", () => { state.current = emptyDefinition(); fillForm(); });
$("#saveAutomation").addEventListener("click", saveCurrent);
$("#simulateAutomation").addEventListener("click", simulateCurrent);
$("#runAutomation").addEventListener("click", runCurrent);
$("#addAction").addEventListener("click", () => openPicker("action"));
$("#addCondition").addEventListener("click", () => openPicker("condition"));
$("#applyNodeConfig").addEventListener("click", applyNodeConfig);
$("#catalogSearch").addEventListener("input", (event) => renderCatalog(event.target.value));
$("#refreshReports").addEventListener("click", async () => renderReports(await api("/api/automation/reports?limit=50")));
["automationName", "automationDescription", "automationEnabled", "priorityInput", "runMode", "queueKey", "cooldown", "cooldownScope"].forEach((id) => $(`#${id}`).addEventListener("change", syncFormToState));
initialize();
