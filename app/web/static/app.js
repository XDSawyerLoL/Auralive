const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const pageTitles = {
  dashboard: "Accueil", commands: "Mes commandes", announcements: "Mes annonces",
  notifications: "Notifications", protections: "Protections", community: "Communauté",
  loyalty: "Fidélité & niveaux", shop: "Boutique", rewards: "Points Twitch",
  giveaway: "Concours", queue: "Play with viewers", polls: "Sondages & prédictions",
  tts: "Text-to-Speech", counters: "Compteurs", overlays: "Widgets & OBS",
  goals: "Objectifs", ai: "Aura IA", avatar: "Avatar & voix", connections: "Mon compte",
  gamesplus: "Jeux & animations", knowledge: "FAQ & permissions", audience: "Audience",
  livefinish: "Fin de live & IA", "advanced-overlays": "Widgets avancés",
  connectors: "Intégrations", coverage: "Couverture fonctionnelle"
};

const state = {
  status: {}, overview: {}, settings: {}, commands: [], announcements: [], alerts: [],
  viewers: [], shop: [], rewards: [], goals: [], commandFilter: "all", currentPage: "dashboard"
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[char]);
}
function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
function icon(id) { return `<svg><use href="#${id}"/></svg>`; }
function formatNumber(value) { return new Intl.NumberFormat("fr-FR").format(Number(value || 0)); }
function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit"}).format(date);
}
function initials(name) { return String(name || "?").split(/\s+/).slice(0,2).map(v => v[0]).join("").toUpperCase(); }

async function api(url, options = {}) {
  const response = await fetch(url, {headers: {"Content-Type": "application/json"}, ...options});
  let payload = null;
  const text = await response.text();
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {detail: text}; }
  if (!response.ok) throw new Error(payload.detail || payload.message || `Erreur ${response.status}`);
  return payload;
}

function toast(message, error = false) {
  const node = document.createElement("div");
  node.className = `toast${error ? " error" : ""}`;
  node.textContent = message;
  $("#toast-zone").append(node);
  setTimeout(() => node.remove(), 4200);
}

function openModal(id) {
  const node = document.getElementById(id);
  if (node) node.classList.add("open");
}
function closeModal(node) { node?.classList.remove("open"); }

function setPage(page) {
  if (!pageTitles[page]) return;
  state.currentPage = page;
  $$(".page").forEach(node => node.classList.toggle("active", node.dataset.pagePanel === page));
  $$(".nav-link").forEach(node => node.classList.toggle("active", node.dataset.page === page));
  $("#page-title").textContent = pageTitles[page];
  history.replaceState(null, "", `#${page}`);
  document.body.classList.remove("mobile-sidebar-open");
  window.scrollTo({top: 0, behavior: "smooth"});
  loadPage(page).catch(error => toast(error.message, true));
}

async function loadPage(page) {
  const loaders = {
    dashboard: () => Promise.all([loadStatus(), loadOverview(), loadActivity(), loadViewers()]),
    commands: loadCommands, announcements: loadAnnouncements, notifications: loadAlerts,
    protections: () => Promise.all([loadSettings(), loadModerationLog(), loadSecurityLog()]),
    community: loadViewers, loyalty: loadSettings, shop: loadShop, rewards: loadRewards,
    giveaway: loadGiveaway, queue: loadQueue, polls: () => Promise.all([loadPoll(), loadPrediction()]),
    tts: () => Promise.all([loadTTS(), loadSettings()]), counters: loadCounters,
    overlays: loadStatus, goals: loadGoals, ai: () => Promise.all([loadStatus(), loadSettings()]),
    connections: loadStatus
  };
  if (loaders[page]) await loaders[page]();
  if (window.loadCompletePage) await window.loadCompletePage(page);
}

function parseEvent(row) {
  let payload = {};
  try { payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload || {}; } catch {}
  const labels = {
    "channel.chat.message": ["Message chat", "i-command"], "channel.follow": ["Nouveau follow", "i-user"],
    "channel.subscribe": ["Nouvel abonnement", "i-star"], "channel.subscription.gift": ["Abonnements offerts", "i-gift"],
    "channel.cheer": ["Bits", "i-spark"], "channel.raid": ["Raid", "i-users"],
    "channel.channel_points_custom_reward_redemption.add": ["Récompense Twitch", "i-target"],
    "stream.online": ["Live démarré", "i-power"], "stream.offline": ["Live terminé", "i-power"]
  };
  const [label, iconName] = labels[row.event_type] || [row.event_type, "i-bell"];
  const actor = payload.user_name || payload.chatter_user_name || payload.from_broadcaster_user_name || "Twitch";
  return {label, iconName, actor, createdAt: row.created_at};
}

function renderStatus() {
  const s = state.status;
  const accounts = s.accounts || {};
  const bot = accounts.bot || {};
  const broadcaster = accounts.broadcaster || {};
  const fullyConnected = Boolean(s.eventsub_connected && bot.matches_expected && broadcaster.matches_expected);
  $("#top-system-pill").classList.toggle("ok", fullyConnected);
  $("#top-system-pill b").textContent = fullyConnected ? "Système connecté" : "Connexion incomplète";
  $("#connection-dot").classList.toggle("connected", fullyConnected);
  $("#side-status-dot").classList.toggle("ok", fullyConnected);
  $("#side-status-text").textContent = fullyConnected ? "Service opérationnel" : "Configuration requise";
  $("#service-status").textContent = fullyConnected ? "SERVICE OPÉRATIONNEL" : "SERVICE PARTIEL";
  $("#profile-live-badge").textContent = s.stream_online ? "EN DIRECT" : (s.eventsub_connected ? "CONNECTÉ" : "HORS LIGNE");
  const liveNode = $("#dashboard-live-state");
  if (liveNode) { liveNode.innerHTML = `<span></span>${s.stream_online ? "En direct" : "Hors ligne"}`; liveNode.classList.toggle("online", Boolean(s.stream_online)); }
  $("#profile-bot-name").textContent = `Bot : ${bot.display_name || bot.login || "mairaiy"}`;
  $("#global-banner").classList.toggle("hidden", fullyConnected);
  if (!fullyConnected) $("#global-banner-text").textContent = "AURA N'EST PAS ENTIÈREMENT CONNECTÉE À TWITCH.";
  $$("[data-control]").forEach(button => {
    const action = button.dataset.control;
    button.classList.toggle("active", action === "activate" && s.bot_active && !s.bot_silent);
    button.classList.toggle("active", action === "silence" && s.bot_silent);
    button.classList.toggle("danger-active", action === "emergency" && s.emergency_mode);
  });
  renderHealth(); renderAccounts(); renderAIHealth();
}

function renderHealth() {
  const s = state.status;
  const rows = [
    ["Compte mairaiy", s.accounts?.bot?.matches_expected, s.accounts?.bot?.display_name || "Non connecté"],
    ["Chaîne SANSAHD", s.accounts?.broadcaster?.matches_expected, s.accounts?.broadcaster?.display_name || "Non connectée"],
    ["Chat mairaiy", s.eventsub_chat_connected, s.eventsub_chat_connected ? "Temps réel" : "Hors ligne"],
    ["Événements chaîne", s.eventsub_channel_connected, s.eventsub_channel_connected ? "Temps réel" : "Hors ligne"],
    ["Ollama / IA", s.ai_enabled, s.ai_enabled ? s.ai_mode : "Désactivée"],
    ["OBS WebSocket", s.obs_enabled, s.obs_enabled ? "Configuré" : "Désactivé"]
  ];
  $("#health-list").innerHTML = rows.map(([label, ok, detail]) => `<div class="health-item ${ok ? "ok" : ""}"><span></span>${escapeHtml(label)}<b>${escapeHtml(detail)}</b></div>`).join("");
}

function renderAIHealth() {
  if (!$("#ai-health")) return;
  const s = state.status;
  $("#ai-health").innerHTML = [
    ["Moteur IA", s.ai_enabled, s.ai_mode || "off"],
    ["Modèle", s.ai_enabled, s.ai_model || "non configuré"],
    ["Préchargement", s.ai_enabled, s.ai_warming_up ? "En cours" : "Prêt"],
    ["Compte de diffusion", s.accounts?.bot?.matches_expected, s.accounts?.bot?.display_name || "Non connecté"]
  ].map(([label, ok, detail]) => `<div class="health-item ${ok ? "ok" : ""}"><span></span>${escapeHtml(label)}<b>${escapeHtml(detail)}</b></div>`).join("");
}

function renderAccounts() {
  if (!$("#account-grid")) return;
  const s = state.status;
  const accounts = s.accounts || {};
  const cards = [
    {role:"bot", title:"Compte qui parle", icon:"i-spark", expected:"mairaiy", data:accounts.bot || {}, auth:"/auth/twitch/bot"},
    {role:"broadcaster", title:"Chaîne diffusée", icon:"i-user", expected:"sansahd", data:accounts.broadcaster || {}, auth:"/auth/twitch/broadcaster"},
    {role:"obs", title:"OBS Studio", icon:"i-monitor", expected:"Port 4455", data:{connected:s.obs_enabled, matches_expected:s.obs_enabled, display_name:s.obs_enabled ? "WebSocket configuré" : "Désactivé"}}
  ];
  $("#account-grid").innerHTML = cards.map(card => {
    const ok = card.data.matches_expected;
    const login = card.data.display_name || card.data.login || "Non connecté";
    const actions = card.role === "obs"
      ? `<button class="secondary-button" id="account-obs-test">Tester OBS</button>`
      : `<a class="primary-button" href="${card.auth}">${ok ? "Reconnecter" : "Connecter"}</a>${card.data.connected ? `<button class="secondary-button" data-disconnect="${card.role}">Déconnecter</button>` : ""}`;
    return `<article class="account-card"><div class="account-card-head"><div class="account-icon">${icon(card.icon)}</div><div><h3>${card.title}</h3><p>Attendu : ${escapeHtml(card.expected)}</p></div></div><div class="account-status ${ok ? "ok" : ""}"><span></span><b>${escapeHtml(login)}</b></div><div class="account-actions">${actions}</div></article>`;
  }).join("");
  $("#account-obs-test")?.addEventListener("click", testOBS);
}

function renderOverview() {
  const o = state.overview;
  $("#profile-riders").textContent = formatNumber(o.viewers);
  $("#profile-riders").closest(".profile-stat")?.querySelector("small")?.replaceChildren(document.createTextNode("Membres connus"));
  $("#dashboard-metrics").innerHTML = [
    [o.viewers, "Membres"], [o.commands, "Commandes"], [o.announcements, "Annonces"], [o.events, "Événements"]
  ].map(([value,label]) => `<div class="metric-tile"><div><b>${formatNumber(value)}</b><small>${label}</small></div></div>`).join("");
  $("#nav-command-count").textContent = o.commands || 0;
  $("#nav-announcement-count").textContent = o.announcements || 0;
}

function renderActivity(rows) {
  const list = rows.map(parseEvent).slice(0, 8);
  $("#activity-list").innerHTML = list.length ? list.map(item => `<div class="activity-row"><div class="activity-icon">${icon(item.iconName)}</div><div><b>${escapeHtml(item.label)}</b><small>${escapeHtml(item.actor)} · ${formatDate(item.createdAt)}</small></div></div>`).join("") : `<div class="empty-state">Aucun événement enregistré.</div>`;
}

function renderDashboardRanking() {
  const top = state.viewers.slice(0, 6);
  $("#dashboard-ranking").innerHTML = top.length ? top.map((row,index) => `<div class="ranking-row"><span class="ranking-position">${index+1}</span><div><b>${escapeHtml(row.display_name)}</b><small>Niveau ${row.level} · ${formatNumber(row.message_count)} messages</small></div><strong>${formatNumber(row.points)} Écumes</strong></div>`).join("") : `<div class="empty-state">Aucun membre connu.</div>`;
}

function commandRoleLabel(role) { return ({everyone:"Tout le monde",subscriber:"Abonnés",mod:"Modérateurs",broadcaster:"Sansa"})[role] || role; }
function renderCommands() {
  const query = $("#command-search")?.value.trim().toLowerCase() || "";
  const filtered = state.commands.filter(row => {
    const matches = `${row.name} ${row.response}`.toLowerCase().includes(query);
    const filter = state.commandFilter === "all" || (state.commandFilter === "enabled" && row.enabled) || (state.commandFilter === "disabled" && !row.enabled);
    return matches && filter;
  });
  $("#command-count").textContent = `${filtered.length} commande${filtered.length > 1 ? "s" : ""}`;
  $("#commands-table").innerHTML = `<div class="table-row header"><span>Commande</span><span>Réponse</span><span>Permission</span><span>État</span><span>Actions</span></div>` + filtered.map(row => `<div class="table-row"><div><b>${escapeHtml(row.name)}</b><p>Cooldown ${row.cooldown_seconds}s</p></div><div><b>${escapeHtml(row.response)}</b></div><span class="role-badge">${commandRoleLabel(row.min_role)}</span><span class="state-badge ${row.enabled ? "ok" : "off"}">${row.enabled ? "Active" : "Désactivée"}</span><div class="table-actions"><button class="icon-action" data-edit-command="${row.id}" title="Modifier">${icon("i-edit")}</button><button class="icon-action" data-toggle-command="${row.id}" title="${row.enabled ? "Désactiver" : "Activer"}">${icon("i-power")}</button><button class="icon-action danger" data-delete-command="${row.id}" title="Supprimer">${icon("i-trash")}</button></div></div>`).join("");
}

function renderAnnouncements() {
  $("#announcement-grid").innerHTML = state.announcements.length ? state.announcements.map(row => `<article class="module-card"><div class="module-card-head"><div><span class="state-badge ${row.enabled ? "ok" : "off"}">${row.enabled ? "Active" : "Désactivée"}</span><h3>${escapeHtml(row.title)}</h3></div><label class="switch"><input type="checkbox" data-toggle-announcement="${row.id}" ${row.enabled ? "checked" : ""}><span></span></label></div><p>${escapeHtml(row.message)}</p><div class="module-card-meta"><span>Toutes les ${row.interval_minutes} min</span><span>${row.only_live ? "Live uniquement" : "Toujours"}</span><span>${row.min_messages} msg min.</span></div><div class="module-card-actions"><button class="secondary-button" data-edit-announcement="${row.id}">${icon("i-edit")}Modifier</button><button class="secondary-button" data-test-announcement="${row.id}">${icon("i-megaphone")}Tester</button><button class="icon-action danger" data-delete-announcement="${row.id}">${icon("i-trash")}</button></div></article>`).join("") : `<div class="empty-state">Aucune annonce. Crée la première.</div>`;
}

function accentColor(name) { return ({aqua:"#2dd4bf",violet:"#7c61ff",orange:"#ff9f43",yellow:"#f5c542",pink:"#ec5fb1",blue:"#2e80ff",red:"#ef4444"})[name] || name || "#2dd4bf"; }
function renderAlerts() {
  $("#alert-template-grid").innerHTML = state.alerts.map(row => `<article class="module-card alert-template" data-alert-card="${escapeAttr(row.event_type)}"><div class="module-card-head"><div><span class="state-badge ${row.enabled ? "ok" : "off"}">${row.enabled ? "Active" : "Désactivée"}</span><h3>${escapeHtml(row.label)}</h3></div><label class="switch"><input type="checkbox" data-alert-enabled ${row.enabled ? "checked" : ""}><span></span></label></div><div class="alert-preview-line"><i style="background:${accentColor(row.accent)}"></i><div><small>${escapeHtml(row.event_type.toUpperCase())}</small><b>${escapeHtml(row.message_template.replace("{viewer}", "Viewer"))}</b></div></div><div class="form-row"><label>Nom<input data-alert-label value="${escapeAttr(row.label)}"></label><label>Accent<select data-alert-accent>${["aqua","violet","orange","yellow","pink","blue","red"].map(v => `<option ${v===row.accent?"selected":""}>${v}</option>`).join("")}</select></label></div><label>Texte<textarea data-alert-message>${escapeHtml(row.message_template)}</textarea></label><div class="form-row"><label>Durée<input data-alert-duration type="number" min="2" max="30" value="${row.duration_seconds}"></label><label>Volume<input data-alert-volume type="number" min="0" max="1" step="0.1" value="${row.volume ?? 0.8}"></label></div><div class="form-row"><label>Son /media/...<input data-alert-sound value="${escapeAttr(row.sound_path || "")}" placeholder="/media/son.mp3"></label><label>Image ou vidéo<input data-alert-media value="${escapeAttr(row.media_path || "")}" placeholder="/media/alerte.gif"></label></div><div class="form-row"><label>Entrée<select data-alert-in>${["pop","slide-left","bounce","zoom"].map(v=>`<option ${v===(row.animation_in||"pop")?"selected":""}>${v}</option>`).join("")}</select></label><label>Sortie<select data-alert-out>${["fade","slide","zoom"].map(v=>`<option ${v===(row.animation_out||"fade")?"selected":""}>${v}</option>`).join("")}</select></label></div><label>Mise en page<select data-alert-layout>${["card","media-top","minimal"].map(v=>`<option ${v===(row.layout||"card")?"selected":""}>${v}</option>`).join("")}</select></label><div class="module-card-actions"><button class="primary-button" data-save-alert="${escapeAttr(row.event_type)}">Enregistrer</button><button class="secondary-button" data-test-alert="${escapeAttr(row.event_type)}">Tester</button></div></article>`).join("");
}

function renderViewers() {
  const query = $("#viewer-search")?.value.trim().toLowerCase() || "";
  const rows = state.viewers.filter(row => `${row.display_name} ${row.login}`.toLowerCase().includes(query));
  if ($("#viewer-count")) $("#viewer-count").textContent = `${rows.length} membre${rows.length > 1 ? "s" : ""}`;
  if ($("#community-summary")) {
    const points = state.viewers.reduce((sum,row) => sum + Number(row.points || 0), 0);
    const messages = state.viewers.reduce((sum,row) => sum + Number(row.message_count || 0), 0);
    const maxLevel = Math.max(0, ...state.viewers.map(row => Number(row.level || 0)));
    $("#community-summary").innerHTML = [[state.viewers.length,"Membres connus"],[points,"Écumes cumulées"],[messages,"Messages traités"],[maxLevel,"Niveau maximal"]].map(([v,l]) => `<article class="summary-card"><small>${l}</small><b>${formatNumber(v)}</b></article>`).join("");
  }
  if ($("#community-table")) $("#community-table").innerHTML = `<div class="table-row viewer-row header"><span>Membre</span><span>Écumes</span><span>Niveau</span><span>Messages</span><span>Dernière visite</span></div>` + rows.map(row => `<div class="table-row viewer-row"><div class="viewer-identity"><span class="viewer-avatar">${initials(row.display_name)}</span><div><b>${escapeHtml(row.display_name)}</b><p>@${escapeHtml(row.login)}</p></div></div><b>${formatNumber(row.points)}</b><span class="role-badge">Niveau ${row.level}</span><b>${formatNumber(row.message_count)}</b><span>${formatDate(row.last_seen)}</span></div>`).join("");
  renderDashboardRanking();
}

function renderShop() {
  $("#shop-grid").innerHTML = state.shop.length ? state.shop.map(row => `<article class="shop-card"><div class="shop-icon">${icon("i-shop")}</div><h3>${escapeHtml(row.name)}</h3><p>${escapeHtml(row.description || "Aucune description")}</p><div class="module-card-meta"><span>${escapeHtml(row.action_type)}</span><span>${row.enabled ? "Disponible" : "Masqué"}</span></div><div class="shop-footer"><span class="shop-price">${formatNumber(row.cost)} Écumes</span><button class="icon-action danger" data-delete-shop="${row.id}">${icon("i-trash")}</button></div></article>`).join("") : `<div class="empty-state">La boutique est vide.</div>`;
}

function renderRewards() {
  $("#reward-action-list").innerHTML = `<div class="table-row header"><span>Récompense Twitch</span><span>Action</span><span>Réponse</span><span>État</span><span>Actions</span></div>` + state.rewards.map(row => `<div class="table-row"><div><b>${escapeHtml(row.reward_title)}</b></div><div><b>${escapeHtml(row.action_type)}</b><p>${escapeHtml(JSON.stringify(row.action_payload || {}))}</p></div><div><b>${escapeHtml(row.response_message || "—")}</b></div><span class="state-badge ${row.enabled ? "ok" : "off"}">${row.enabled ? "Active" : "Inactive"}</span><div class="table-actions"><button class="icon-action danger" data-delete-reward="${row.id}">${icon("i-trash")}</button></div></div>`).join("");
}

function renderGiveaway(data) {
  if (!data.active) { $("#giveaway-state").innerHTML = `<div><b>Aucun concours actif</b><p>Ouvre un concours pour permettre aux viewers de participer.</p></div>`; return; }
  const g = data.giveaway;
  $("#giveaway-state").innerHTML = `<div><span class="state-badge ok">Inscriptions ouvertes</span><h3>${escapeHtml(g.title)}</h3><p>Commande : <code>${escapeHtml(g.keyword)}</code> · Coût : ${formatNumber(g.cost)} Écumes</p><b>${data.entries.length} participant${data.entries.length > 1 ? "s" : ""}</b><div class="module-card-meta">${data.entries.slice(0,12).map(row => `<span>${escapeHtml(row.display_name)}</span>`).join("")}</div></div>`;
}

function renderQueue(rows) {
  $("#queue-list").innerHTML = rows.length ? rows.map(row => `<div class="queue-row"><div><span class="queue-position">${row.position}</span><div><b>${escapeHtml(row.display_name)}</b><small>${escapeHtml(row.note || "Sans note")}</small></div></div><span class="state-badge ok">En attente</span></div>`).join("") : `<div class="empty-state">La file est vide. Les viewers utilisent <code>!join</code>.</div>`;
}

function renderPoll(data) {
  const poll = data.poll;
  if (!poll) { $("#poll-state").innerHTML = `<div><b>Aucun sondage actif</b><p>${escapeHtml(data.error || "Crée un sondage pour le diffuser sur Twitch.")}</p></div>`; return; }
  const total = poll.total_votes || 0;
  $("#poll-state").innerHTML = `<div><span class="state-badge ok">${escapeHtml(poll.status)}</span><h3>${escapeHtml(poll.title)}</h3>${poll.choices.map(choice => { const pct = total ? Math.round(choice.votes * 100 / total) : 0; return `<div class="poll-option"><div class="poll-option-head"><b>${escapeHtml(choice.title)}</b><span>${choice.votes} · ${pct}%</span></div><div class="poll-bar"><i style="width:${pct}%"></i></div></div>`; }).join("")}<p>${formatNumber(total)} votes</p></div>`;
}

function renderPrediction(data) {
  const node = $("#prediction-state");
  const prediction = data.prediction;
  if (!prediction) { node.innerHTML = `<div><b>Aucune prédiction active</b><p>${escapeHtml(data.error || "Lance une prédiction native Twitch.")}</p></div>`; return; }
  node.innerHTML = `<div><span class="state-badge ok">${escapeHtml(prediction.status)}</span><h3>${escapeHtml(prediction.title)}</h3><div class="command-help">${prediction.outcomes.map(outcome => `<div><span>${escapeHtml(outcome.title)}</span><button class="secondary-button" data-resolve-prediction="${escapeAttr(prediction.id)}" data-outcome="${escapeAttr(outcome.id)}">Déclarer gagnant</button></div>`).join("")}</div><button class="danger-button wide" data-cancel-prediction="${escapeAttr(prediction.id)}">Annuler la prédiction</button></div>`;
}

function renderTTS(rows) {
  const labels = {pending:"À valider",approved:"Approuvé",played:"Lu",rejected:"Refusé"};
  $("#tts-list").innerHTML = rows.length ? rows.map(row => {
    const pending = row.status === "pending";
    const approved = row.status === "approved";
    return `<div class="queue-row tts-row"><div><span class="queue-position">${row.id}</span><div><b>${escapeHtml(row.display_name)}</b><small>${escapeHtml(row.text)}</small><small>Voix : ${escapeHtml(row.voice || "défaut")} · vitesse ${Number(row.rate || 1).toFixed(2)} · tonalité ${Number(row.pitch || 1).toFixed(2)}</small></div></div><div class="tts-actions"><span class="state-badge ${approved ? "ok" : "off"}">${labels[row.status] || escapeHtml(row.status)}</span>${pending ? `<button class="secondary-button compact" data-tts-approve="${row.id}">Approuver</button>` : ""}${pending ? `<button class="danger-button compact" data-tts-reject="${row.id}">Refuser</button>` : ""}${approved ? `<button class="primary-button compact" data-tts-play="${row.id}">Lire</button>` : ""}</div></div>`;
  }).join("") : `<div class="empty-state">Aucun message en attente.</div>`;
}

function renderCounters(rows) {
  $("#counter-grid").innerHTML = rows.map(row => `<article class="counter-card"><small>${escapeHtml(row.label).toUpperCase()}</small><strong>${formatNumber(row.value)}</strong><div class="counter-actions"><button data-counter="${escapeAttr(row.slug)}" data-delta="-1">−</button><button data-counter-reset="${escapeAttr(row.slug)}">0</button><button data-counter="${escapeAttr(row.slug)}" data-delta="1">+</button></div></article>`).join("");
}

function renderGoals() {
  $("#goal-grid").innerHTML = state.goals.length ? state.goals.map(row => { const pct = Math.min(100, Math.round(Number(row.current_value) * 100 / Math.max(1, Number(row.target_value)))); return `<article class="goal-card"><div class="goal-head"><div><span class="state-badge ${row.enabled ? "ok" : "off"}">${row.enabled ? "Affiché" : "Masqué"}</span><h3>${escapeHtml(row.title)}</h3></div><span class="role-badge">${escapeHtml(row.goal_type)}</span></div><div class="progress"><i style="width:${pct}%"></i></div><div class="goal-values"><b>${formatNumber(row.current_value)} ${escapeHtml(row.unit)}</b><span>${formatNumber(row.target_value)} ${escapeHtml(row.unit)}</span></div><div class="module-card-actions"><button class="secondary-button" data-edit-goal="${row.id}">${icon("i-edit")}Modifier</button><button class="icon-action danger" data-delete-goal="${row.id}">${icon("i-trash")}</button></div></article>`; }).join("") : `<div class="empty-state">Aucun objectif configuré.</div>`;
}

function fillSettings() {
  const s = state.settings;
  $$('[data-setting]').forEach(input => { if (s[input.dataset.setting] !== undefined) input.checked = Boolean(s[input.dataset.setting]); });
  if ($("#caps-ratio")) { $("#caps-ratio").value = s["moderation.caps_ratio"] ?? .78; $("#caps-value").textContent = `${Math.round(Number($("#caps-ratio").value) * 100)} %`; }
  if ($("#timeout-seconds")) $("#timeout-seconds").value = s["moderation.timeout_seconds"] ?? 30;
  if ($("#banned-words")) $("#banned-words").value = (s["moderation.banned_words"] || []).join("\n");
  if ($("#allowed-domains")) $("#allowed-domains").value = (s["moderation.allowed_domains"] || []).join("\n");
  if ($("#points-per-message")) $("#points-per-message").value = s["loyalty.points_per_message"] ?? 5;
  if ($("#xp-per-message")) $("#xp-per-message").value = s["loyalty.xp_per_message"] ?? 8;
  if ($("#loyalty-cooldown")) $("#loyalty-cooldown").value = s["loyalty.cooldown_seconds"] ?? 60;
  if ($("#tts-cost")) $("#tts-cost").value = s["tts.cost"] ?? 50;
  if ($("#tts-max")) $("#tts-max").value = s["tts.max_length"] ?? 180;
  if ($("#tts-voice")) $("#tts-voice").value = s["tts.voice"] ?? "";
  if ($("#tts-rate")) $("#tts-rate").value = s["tts.rate"] ?? 1;
  if ($("#tts-pitch")) $("#tts-pitch").value = s["tts.pitch"] ?? 1;
  if ($("#tts-volume")) $("#tts-volume").value = s["tts.volume"] ?? 1;
  if ($("#tts-approval")) $("#tts-approval").checked = Boolean(s["tts.require_approval"] ?? false);
  if ($("#follow-guard-enabled")) $("#follow-guard-enabled").checked = Boolean(s["security.follow_guard.enabled"] ?? true);
  if ($("#follow-guard-threshold")) $("#follow-guard-threshold").value = s["security.follow_guard.threshold"] ?? 8;
  if ($("#follow-guard-window")) $("#follow-guard-window").value = s["security.follow_guard.window_seconds"] ?? 15;
  if ($("#follow-guard-emergency")) $("#follow-guard-emergency").checked = Boolean(s["security.follow_guard.emergency"] ?? true);
  if ($("#ai-spontaneous")) $("#ai-spontaneous").checked = Boolean(s["ai.spontaneous"] ?? false);
  if ($("#ai-threaded-replies")) $("#ai-threaded-replies").checked = Boolean(s["ai.threaded_replies"] ?? false);
}

function renderModerationLog(rows) {
  $("#moderation-log").innerHTML = `<div class="table-row header"><span>Viewer</span><span>Action</span><span>Raison / message</span><span>Date</span></div>` + rows.map(row => `<div class="table-row"><b>${escapeHtml(row.display_name)}</b><span class="state-badge off">${escapeHtml(row.action)}</span><div><b>${escapeHtml(row.reason)}</b><p>${escapeHtml(row.message)}</p></div><span>${formatDate(row.created_at)}</span></div>`).join("");
}

function renderSecurityLog(rows) {
  const node = $("#security-log"); if (!node) return;
  node.innerHTML = `<div class="table-row header"><span>Type</span><span>Niveau</span><span>Détails</span><span>Date</span></div>` + (rows.length ? rows.map(row => `<div class="table-row"><b>${escapeHtml(row.event_type)}</b><span class="state-badge off">${escapeHtml(row.severity)}</span><div><b>${escapeHtml(row.actor || "Système")}</b><p>${escapeHtml(JSON.stringify(row.details || {}))}</p></div><span>${formatDate(row.created_at)}</span></div>`).join("") : `<div class="empty-state">Aucune alerte de sécurité.</div>`);
}

async function loadStatus() { state.status = await api("/api/status"); renderStatus(); }
async function loadOverview() { state.overview = await api("/api/overview"); renderOverview(); }
async function loadActivity() { renderActivity(await api("/api/activity?limit=30")); }
async function loadViewers() { state.viewers = await api("/api/viewers/top?limit=100"); renderViewers(); }
async function loadCommands() { state.commands = await api("/api/commands"); renderCommands(); }
async function loadAnnouncements() { state.announcements = await api("/api/announcements"); renderAnnouncements(); }
async function loadAlerts() { state.alerts = await api("/api/alert-templates"); renderAlerts(); }
async function loadSettings() { state.settings = await api("/api/settings"); fillSettings(); }
async function loadShop() { state.shop = await api("/api/shop"); renderShop(); }
async function loadRewards() { state.rewards = await api("/api/reward-actions"); renderRewards(); }
async function loadGiveaway() { renderGiveaway(await api("/api/giveaway")); }
async function loadQueue() { renderQueue(await api("/api/queue")); }
async function loadPoll() { renderPoll(await api("/api/poll")); }
async function loadPrediction() { renderPrediction(await api("/api/prediction")); }
async function loadTTS() { renderTTS(await api("/api/tts")); }
async function loadCounters() { renderCounters(await api("/api/counters")); }
async function loadGoals() { state.goals = await api("/api/goals"); renderGoals(); }
async function loadModerationLog() { renderModerationLog(await api("/api/moderation/log?limit=50")); }
async function loadSecurityLog() { if ($("#security-log")) renderSecurityLog(await api("/api/power/security/events?limit=50")); }

async function refreshAll() {
  try {
    await Promise.all([loadStatus(), loadOverview(), loadActivity(), loadViewers()]);
    if (state.currentPage !== "dashboard") await loadPage(state.currentPage);
    toast("Données actualisées");
  } catch (error) { toast(error.message, true); }
}

async function testOBS() {
  try { const result = await api("/api/obs/test", {method:"POST"}); if ($("#obs-output")) $("#obs-output").textContent = JSON.stringify(result.data, null, 2); toast("OBS WebSocket répond correctement"); }
  catch (error) { if ($("#obs-output")) $("#obs-output").textContent = error.message; toast(error.message, true); }
}

function resetCommandForm() {
  $("#command-form").reset(); $("#command-id").value = ""; $("#command-cooldown").value = 10; $("#command-enabled").checked = true; $("#command-modal-title").textContent = "Nouvelle commande";
}
function editCommand(id) {
  const row = state.commands.find(item => Number(item.id) === Number(id)); if (!row) return;
  $("#command-id").value = row.id; $("#command-name").value = row.name; $("#command-response").value = row.response; $("#command-role").value = row.min_role; $("#command-cooldown").value = row.cooldown_seconds; $("#command-enabled").checked = Boolean(row.enabled); $("#command-modal-title").textContent = `Modifier ${row.name}`; openModal("command-modal");
}
function resetAnnouncementForm() {
  $("#announcement-form").reset(); $("#announcement-id").value = ""; $("#announcement-interval").value = 20; $("#announcement-min-messages").value = 0; $("#announcement-only-live").checked = true; $("#announcement-enabled").checked = true; $("#announcement-modal-title").textContent = "Nouvelle annonce";
}
function editAnnouncement(id) {
  const row = state.announcements.find(item => Number(item.id) === Number(id)); if (!row) return;
  $("#announcement-id").value = row.id; $("#announcement-title").value = row.title; $("#announcement-message").value = row.message; $("#announcement-interval").value = row.interval_minutes; $("#announcement-min-messages").value = row.min_messages; $("#announcement-only-live").checked = Boolean(row.only_live); $("#announcement-enabled").checked = Boolean(row.enabled); $("#announcement-modal-title").textContent = `Modifier ${row.title}`; openModal("announcement-modal");
}
function resetGoalForm() { $("#goal-form").reset(); $("#goal-id").value = ""; $("#goal-current").value = 0; $("#goal-target").value = 100; $("#goal-enabled").checked = true; $("#goal-modal-title").textContent = "Nouvel objectif"; }
function editGoal(id) { const row = state.goals.find(item => Number(item.id) === Number(id)); if (!row) return; $("#goal-id").value=row.id; $("#goal-title").value=row.title; $("#goal-current").value=row.current_value; $("#goal-target").value=row.target_value; $("#goal-type").value=row.goal_type; $("#goal-unit").value=row.unit; $("#goal-enabled").checked=Boolean(row.enabled); $("#goal-modal-title").textContent=`Modifier ${row.title}`; openModal("goal-modal"); }

function appendAIMessage(kind, name, text) {
  const node = document.createElement("div"); node.className = `ai-message ${kind}`; node.innerHTML = `<b>${escapeHtml(name)}</b><p>${escapeHtml(text)}</p>`; $("#ai-conversation").append(node); $("#ai-conversation").scrollTop = $("#ai-conversation").scrollHeight;
}
function speakAura(text) { if (!("speechSynthesis" in window)) return; speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = "fr-FR"; utterance.rate = 1.02; utterance.pitch = .96; speechSynthesis.speak(utterance); }

function setupNavigation() {
  $("#main-nav").addEventListener("click", event => {
    const link = event.target.closest(".nav-link"); if (link) {
      if (link.dataset.powerPage) return;
      setPage(link.dataset.page); return;
    }
    const group = event.target.closest(".nav-group-title"); if (group) group.closest(".nav-group").classList.toggle("open");
  });
  $("#nav-search").addEventListener("input", event => {
    const q = event.target.value.toLowerCase().trim();
    $$(".nav-link").forEach(link => link.classList.toggle("hidden", q && !`${link.textContent} ${link.dataset.search || ""}`.toLowerCase().includes(q)));
    $$(".nav-group").forEach(group => { const visible = $$(".nav-link:not(.hidden)", group).length; group.classList.toggle("hidden", q && !visible); if (q && visible) group.classList.add("open"); });
  });
  const collapseButton = $("#sidebar-collapse");
  try {
    if (localStorage.getItem("aura.sidebar.small") === "1") document.body.classList.add("sidebar-small");
  } catch (_) {}
  collapseButton.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-small");
    try { localStorage.setItem("aura.sidebar.small", document.body.classList.contains("sidebar-small") ? "1" : "0"); } catch (_) {}
    collapseButton.textContent = document.body.classList.contains("sidebar-small") ? "›" : "‹";
  });
  $("#mobile-menu").addEventListener("click", () => document.body.classList.toggle("mobile-sidebar-open"));
  $$('[data-page-jump]').forEach(button => button.addEventListener("click", () => setPage(button.dataset.pageJump)));
  $("#global-banner-action").addEventListener("click", () => setPage("connections"));
}

function setupModals() {
  $$('[data-open-modal]').forEach(button => button.addEventListener("click", () => {
    const id = button.dataset.openModal;
    if (id === "command-modal") resetCommandForm();
    if (id === "announcement-modal") resetAnnouncementForm();
    if (id === "goal-modal") resetGoalForm();
    openModal(id);
  }));
  $$('[data-close-modal]').forEach(button => button.addEventListener("click", () => closeModal(button.closest(".modal"))));
  $$(".modal").forEach(modal => modal.addEventListener("click", event => { if (event.target === modal) closeModal(modal); }));
}

function setupForms() {
  $("#command-search").addEventListener("input", renderCommands);
  $("#viewer-search").addEventListener("input", renderViewers);
  $$("[data-command-filter]").forEach(button => button.addEventListener("click", () => { state.commandFilter = button.dataset.commandFilter; $$("[data-command-filter]").forEach(v => v.classList.toggle("active", v === button)); renderCommands(); }));

  $("#command-form").addEventListener("submit", async event => {
    event.preventDefault(); const id = $("#command-id").value; const payload = {name:$("#command-name").value,response:$("#command-response").value,cooldown_seconds:Number($("#command-cooldown").value),min_role:$("#command-role").value,enabled:$("#command-enabled").checked};
    try { await api(id ? `/api/commands/${id}` : "/api/commands", {method:id?"PUT":"POST",body:JSON.stringify(payload)}); closeModal($("#command-modal")); toast(id ? "Commande modifiée" : "Commande créée"); await Promise.all([loadCommands(),loadOverview()]); } catch(error){toast(error.message,true);}
  });
  $("#announcement-form").addEventListener("submit", async event => {
    event.preventDefault(); const id=$("#announcement-id").value; const payload={title:$("#announcement-title").value,message:$("#announcement-message").value,interval_minutes:Number($("#announcement-interval").value),min_messages:Number($("#announcement-min-messages").value),only_live:$("#announcement-only-live").checked,enabled:$("#announcement-enabled").checked};
    try { await api(id?`/api/announcements/${id}`:"/api/announcements",{method:id?"PUT":"POST",body:JSON.stringify(payload)}); closeModal($("#announcement-modal")); toast("Annonce enregistrée"); await Promise.all([loadAnnouncements(),loadOverview()]); } catch(error){toast(error.message,true);}
  });
  $("#shop-form").addEventListener("submit", async event => { event.preventDefault(); try { await api("/api/shop",{method:"POST",body:JSON.stringify({name:$("#shop-name").value,description:$("#shop-description").value,cost:Number($("#shop-cost").value),action_type:$("#shop-action").value,action_payload:{},enabled:true})}); event.target.reset(); closeModal($("#shop-modal")); toast("Objet ajouté"); await loadShop(); } catch(error){toast(error.message,true);} });
  $("#reward-form").addEventListener("submit", async event => { event.preventDefault(); try { const payload=JSON.parse($("#reward-payload").value||"{}"); await api("/api/reward-actions",{method:"POST",body:JSON.stringify({reward_title:$("#reward-title").value,action_type:$("#reward-action-type").value,action_payload:payload,response_message:$("#reward-response").value,enabled:true})}); event.target.reset(); $("#reward-payload").value="{}"; closeModal($("#reward-modal")); toast("Action Twitch créée"); await loadRewards(); } catch(error){toast(error.message,true);} });
  $("#goal-form").addEventListener("submit", async event => { event.preventDefault(); const id=$("#goal-id").value; const payload={title:$("#goal-title").value,goal_type:$("#goal-type").value,current_value:Number($("#goal-current").value),target_value:Number($("#goal-target").value),unit:$("#goal-unit").value,enabled:$("#goal-enabled").checked}; try { await api(id?`/api/goals/${id}`:"/api/goals",{method:id?"PUT":"POST",body:JSON.stringify(payload)}); closeModal($("#goal-modal")); toast("Objectif enregistré"); await loadGoals(); } catch(error){toast(error.message,true);} });
  $("#giveaway-form").addEventListener("submit", async event => { event.preventDefault(); try { await api("/api/giveaway",{method:"POST",body:JSON.stringify({title:$("#giveaway-title").value,keyword:$("#giveaway-keyword").value,cost:Number($("#giveaway-cost").value)})}); toast("Concours ouvert"); await loadGiveaway(); } catch(error){toast(error.message,true);} });
  $("#poll-form").addEventListener("submit", async event => { event.preventDefault(); try { await api("/api/poll",{method:"POST",body:JSON.stringify({question:$("#poll-question").value,options:$("#poll-options").value.split("\n").map(v=>v.trim()).filter(Boolean),duration:Number($("#poll-duration").value)})}); toast("Sondage Twitch lancé"); await loadPoll(); } catch(error){toast(error.message,true);} });
  $("#prediction-form").addEventListener("submit", async event => { event.preventDefault(); try { await api("/api/prediction",{method:"POST",body:JSON.stringify({title:$("#prediction-title").value,outcomes:$("#prediction-outcomes").value.split("\n").map(v=>v.trim()).filter(Boolean),window:Number($("#prediction-window").value)})}); toast("Prédiction Twitch lancée"); await loadPrediction(); } catch(error){toast(error.message,true);} });
  $("#tts-form").addEventListener("submit", async event => { event.preventDefault(); try { const result=await api("/api/tts",{method:"POST",body:JSON.stringify({text:$("#tts-message").value})}); toast(result.message); event.target.reset(); await loadTTS(); } catch(error){toast(error.message,true);} });
  $("#ai-form").addEventListener("submit", async event => { event.preventDefault(); const text=$("#ai-message").value.trim(); if(!text)return; appendAIMessage("user","Sansa",text); const button=event.submitter; button.disabled=true; button.textContent="Traitement…"; try { const result=await api("/api/ai/test",{method:"POST",body:JSON.stringify({message:text,viewer_name:"Sansa",send_to_chat:$("#ai-send-chat").checked})}); appendAIMessage("aura","Aura",result.answer); $("#ai-message").value=""; if($("#ai-speak-aloud").checked)speakAura(result.answer); if(result.sent_to_chat)toast(`Réponse publiée par ${result.sender||"mairaiy"}`); } catch(error){appendAIMessage("error","Erreur",error.message);toast(error.message,true);} finally {button.disabled=false;button.textContent="Envoyer à Aura";} });

  $("#save-moderation").addEventListener("click", async () => { try { await Promise.all([api("/api/settings/moderation.caps_ratio",{method:"PUT",body:JSON.stringify({value:Number($("#caps-ratio").value)})}),api("/api/settings/moderation.timeout_seconds",{method:"PUT",body:JSON.stringify({value:Number($("#timeout-seconds").value)})})]); toast("Protection enregistrée"); } catch(error){toast(error.message,true);} });
  $("#save-lists").addEventListener("click", async () => { try { const banned=$("#banned-words").value.split("\n").map(v=>v.trim()).filter(Boolean); const domains=$("#allowed-domains").value.split("\n").map(v=>v.trim()).filter(Boolean); await Promise.all([api("/api/settings/moderation.banned_words",{method:"PUT",body:JSON.stringify({value:banned})}),api("/api/settings/moderation.allowed_domains",{method:"PUT",body:JSON.stringify({value:domains})})]); toast("Listes enregistrées"); } catch(error){toast(error.message,true);} });
  $("#save-loyalty").addEventListener("click", async () => { try { await Promise.all([api("/api/settings/loyalty.points_per_message",{method:"PUT",body:JSON.stringify({value:Number($("#points-per-message").value)})}),api("/api/settings/loyalty.xp_per_message",{method:"PUT",body:JSON.stringify({value:Number($("#xp-per-message").value)})}),api("/api/settings/loyalty.cooldown_seconds",{method:"PUT",body:JSON.stringify({value:Number($("#loyalty-cooldown").value)})})]); toast("Fidélité enregistrée"); } catch(error){toast(error.message,true);} });
  $("#save-tts").addEventListener("click", async () => { try { await Promise.all([
    api("/api/settings/tts.cost",{method:"PUT",body:JSON.stringify({value:Number($("#tts-cost").value)})}),
    api("/api/settings/tts.max_length",{method:"PUT",body:JSON.stringify({value:Number($("#tts-max").value)})}),
    api("/api/settings/tts.voice",{method:"PUT",body:JSON.stringify({value:$("#tts-voice").value.trim()})}),
    api("/api/settings/tts.rate",{method:"PUT",body:JSON.stringify({value:Number($("#tts-rate").value)})}),
    api("/api/settings/tts.pitch",{method:"PUT",body:JSON.stringify({value:Number($("#tts-pitch").value)})}),
    api("/api/settings/tts.volume",{method:"PUT",body:JSON.stringify({value:Number($("#tts-volume").value)})}),
    api("/api/settings/tts.require_approval",{method:"PUT",body:JSON.stringify({value:$("#tts-approval").checked})})
  ]); toast("Règles TTS enregistrées"); await loadSettings(); } catch(error){toast(error.message,true);} });
  $("#save-follow-guard").addEventListener("click", async () => { try { await Promise.all([
    api("/api/settings/security.follow_guard.enabled",{method:"PUT",body:JSON.stringify({value:$("#follow-guard-enabled").checked})}),
    api("/api/settings/security.follow_guard.threshold",{method:"PUT",body:JSON.stringify({value:Number($("#follow-guard-threshold").value)})}),
    api("/api/settings/security.follow_guard.window_seconds",{method:"PUT",body:JSON.stringify({value:Number($("#follow-guard-window").value)})}),
    api("/api/settings/security.follow_guard.emergency",{method:"PUT",body:JSON.stringify({value:$("#follow-guard-emergency").checked})})
  ]); toast("Follow Guard enregistré"); } catch(error){toast(error.message,true);} });
  $("#test-follow-guard").addEventListener("click", async () => { try { await api(`/api/power/security/test-follow-guard?count=${Number($("#follow-guard-threshold").value)||8}`,{method:"POST"}); toast("Simulation Follow Guard exécutée"); await Promise.all([loadSecurityLog(),loadSettings(),loadStatus()]); } catch(error){toast(error.message,true);} });
  $("#caps-ratio").addEventListener("input",()=>$("#caps-value").textContent=`${Math.round(Number($("#caps-ratio").value)*100)} %`);
  $$('[data-setting]').forEach(input => input.addEventListener("change", async () => { try { await api(`/api/settings/${input.dataset.setting}`,{method:"PUT",body:JSON.stringify({value:input.checked})}); state.settings[input.dataset.setting]=input.checked; await loadStatus(); toast("Réglage mis à jour"); } catch(error){toast(error.message,true);} }));
  $("#ai-spontaneous").addEventListener("change", async () => { state.settings["ai.spontaneous"]=$("#ai-spontaneous").checked; await api("/api/settings/ai.spontaneous",{method:"PUT",body:JSON.stringify({value:$("#ai-spontaneous").checked})}); toast("Préférence enregistrée"); });
  $("#ai-threaded-replies")?.addEventListener("change", async () => { state.settings["ai.threaded_replies"]=$("#ai-threaded-replies").checked; await api("/api/settings/ai.threaded_replies",{method:"PUT",body:JSON.stringify({value:$("#ai-threaded-replies").checked})}); toast("Mode de réponse Twitch enregistré"); });
}

function setupActions() {
  document.addEventListener("click", async event => {
    const control=event.target.closest("[data-control]"); if(control){ try { state.status=await api(`/api/control/${control.dataset.control}`,{method:"POST"}); renderStatus(); toast("État d’Aura mis à jour"); } catch(error){toast(error.message,true);} return; }
    const editCmd=event.target.closest("[data-edit-command]"); if(editCmd){editCommand(editCmd.dataset.editCommand);return;}
    const toggleCmd=event.target.closest("[data-toggle-command]"); if(toggleCmd){ const row=state.commands.find(v=>Number(v.id)===Number(toggleCmd.dataset.toggleCommand)); if(row){await api(`/api/commands/${row.id}`,{method:"PUT",body:JSON.stringify({name:row.name,response:row.response,cooldown_seconds:row.cooldown_seconds,min_role:row.min_role,enabled:!row.enabled})});await loadCommands();toast("État de la commande modifié");}return;}
    const delCmd=event.target.closest("[data-delete-command]"); if(delCmd&&confirm("Supprimer cette commande ?")){await api(`/api/commands/${delCmd.dataset.deleteCommand}`,{method:"DELETE"});await Promise.all([loadCommands(),loadOverview()]);toast("Commande supprimée");return;}
    const editAnn=event.target.closest("[data-edit-announcement]"); if(editAnn){editAnnouncement(editAnn.dataset.editAnnouncement);return;}
    const toggleAnn=event.target.closest("[data-toggle-announcement]"); if(toggleAnn){const row=state.announcements.find(v=>Number(v.id)===Number(toggleAnn.dataset.toggleAnnouncement));if(row){await api(`/api/announcements/${row.id}`,{method:"PUT",body:JSON.stringify({...row,enabled:toggleAnn.checked})});await loadAnnouncements();}return;}
    const delAnn=event.target.closest("[data-delete-announcement]"); if(delAnn&&confirm("Supprimer cette annonce ?")){await api(`/api/announcements/${delAnn.dataset.deleteAnnouncement}`,{method:"DELETE"});await loadAnnouncements();toast("Annonce supprimée");return;}
    const testAnn=event.target.closest("[data-test-announcement]"); if(testAnn){const row=state.announcements.find(v=>Number(v.id)===Number(testAnn.dataset.testAnnouncement));if(row){await api("/api/chat/send",{method:"POST",body:JSON.stringify({message:row.message})});toast("Annonce envoyée par mairaiy");}return;}
    const saveAlert=event.target.closest("[data-save-alert]"); if(saveAlert){const card=saveAlert.closest("[data-alert-card]");const payload={label:$("[data-alert-label]",card).value,message_template:$("[data-alert-message]",card).value,accent:$("[data-alert-accent]",card).value,duration_seconds:Number($("[data-alert-duration]",card).value),sound_path:$("[data-alert-sound]",card).value,media_path:$("[data-alert-media]",card).value,animation_in:$("[data-alert-in]",card).value,animation_out:$("[data-alert-out]",card).value,volume:Number($("[data-alert-volume]",card).value),layout:$("[data-alert-layout]",card).value,variants:[],enabled:$("[data-alert-enabled]",card).checked};await api(`/api/alert-templates/${saveAlert.dataset.saveAlert}`,{method:"PUT",body:JSON.stringify(payload)});toast("Alerte enregistrée");await loadAlerts();return;}
    const testAlert=event.target.closest("[data-test-alert]"); if(testAlert){const type=testAlert.dataset.testAlert;const samples={follow:{viewer:"Luna"},subscribe:{viewer:"Kaito"},raid:{viewer:"Les Pirates",count:42},bits:{viewer:"Nova",amount:500},redemption:{viewer:"Mira",reward:"Faire parler Aura"}};await api("/api/overlay/test",{method:"POST",body:JSON.stringify({type,viewer:samples[type]?.viewer||"Viewer",message:`Test ${type}`,...samples[type]})});toast("Alerte envoyée à l’overlay");return;}
    const delShop=event.target.closest("[data-delete-shop]"); if(delShop&&confirm("Supprimer cet objet ?")){await api(`/api/shop/${delShop.dataset.deleteShop}`,{method:"DELETE"});await loadShop();toast("Objet supprimé");return;}
    const delReward=event.target.closest("[data-delete-reward]"); if(delReward&&confirm("Supprimer cette action ?")){await api(`/api/reward-actions/${delReward.dataset.deleteReward}`,{method:"DELETE"});await loadRewards();toast("Action supprimée");return;}
    const editGoalButton=event.target.closest("[data-edit-goal]"); if(editGoalButton){editGoal(editGoalButton.dataset.editGoal);return;}
    const delGoal=event.target.closest("[data-delete-goal]"); if(delGoal&&confirm("Supprimer cet objectif ?")){await api(`/api/goals/${delGoal.dataset.deleteGoal}`,{method:"DELETE"});await loadGoals();toast("Objectif supprimé");return;}
    const counter=event.target.closest("[data-counter]"); if(counter){const route=Number(counter.dataset.delta)>0?"increment":"decrement";await api(`/api/counters/${counter.dataset.counter}/${route}`,{method:"POST"});await loadCounters();return;}
    const reset=event.target.closest("[data-counter-reset]"); if(reset){await api(`/api/counters/${reset.dataset.counterReset}`,{method:"PUT",body:JSON.stringify({value:0})});await loadCounters();return;}
    const copy=event.target.closest("[data-copy-url]"); if(copy){const url=`${location.origin}${copy.dataset.copyUrl}`;try{await navigator.clipboard.writeText(url);}catch{const temp=document.createElement("textarea");temp.value=url;document.body.append(temp);temp.select();document.execCommand("copy");temp.remove();}toast("Lien OBS copié");return;}
    const overlayTest=event.target.closest("[data-overlay-test]"); if(overlayTest){await api("/api/overlay/test",{method:"POST",body:JSON.stringify({type:"raid",viewer:"Les Pirates",message:"Marée montante : 42 personnes débarquent.",count:42})});toast("Test envoyé");return;}
    const disconnect=event.target.closest("[data-disconnect]"); if(disconnect){await api(`/api/twitch/accounts/${disconnect.dataset.disconnect}`,{method:"DELETE"});await loadStatus();toast("Compte déconnecté");return;}
    const resolve=event.target.closest("[data-resolve-prediction]"); if(resolve){await api(`/api/prediction/${resolve.dataset.resolvePrediction}/resolve`,{method:"POST",body:JSON.stringify({status:"RESOLVED",winning_outcome_id:resolve.dataset.outcome})});toast("Prédiction résolue");await loadPrediction();return;}
    const cancel=event.target.closest("[data-cancel-prediction]"); if(cancel){await api(`/api/prediction/${cancel.dataset.cancelPrediction}/resolve`,{method:"POST",body:JSON.stringify({status:"CANCELED",winning_outcome_id:null})});toast("Prédiction annulée");await loadPrediction();return;}
    const approveTTS=event.target.closest("[data-tts-approve]"); if(approveTTS){await api(`/api/power/tts/${approveTTS.dataset.ttsApprove}/action`,{method:"POST",body:JSON.stringify({action:"approve",note:"Validé depuis le panneau"})});toast("Message TTS approuvé");await loadTTS();return;}
    const rejectTTS=event.target.closest("[data-tts-reject]"); if(rejectTTS){await api(`/api/power/tts/${rejectTTS.dataset.ttsReject}/action`,{method:"POST",body:JSON.stringify({action:"reject",note:"Refusé depuis le panneau"})});toast("Message TTS refusé");await loadTTS();return;}
    const playTTS=event.target.closest("[data-tts-play]"); if(playTTS){await api(`/api/power/tts/${playTTS.dataset.ttsPlay}/action`,{method:"POST",body:JSON.stringify({action:"play",note:"Lecture manuelle"})});toast("Message envoyé à l’overlay TTS");await loadTTS();return;}
  });
  $("#draw-giveaway").addEventListener("click",async()=>{try{const result=await api("/api/giveaway/draw",{method:"POST"});toast(result.winner?`${result.winner.display_name} remporte le concours`:"Aucun participant");await loadGiveaway();}catch(error){toast(error.message,true);}});
  $("#queue-next").addEventListener("click",async()=>{const result=await api("/api/queue/next",{method:"POST"});toast(result.entry?`${result.entry.display_name} est appelé`:"File vide");await loadQueue();});
  $("#queue-clear").addEventListener("click",async()=>{if(confirm("Vider toute la file ?")){await api("/api/queue",{method:"DELETE"});await loadQueue();toast("File vidée");}});
  $("#poll-close").addEventListener("click",async()=>{try{await api("/api/poll/close",{method:"POST"});toast("Sondage clôturé");await loadPoll();}catch(error){toast(error.message,true);}});
  $("#tts-next").addEventListener("click",async()=>{await api("/api/tts/next",{method:"POST"});await loadTTS();});
  $("#obs-test").addEventListener("click",testOBS);
  $("#refresh-all").addEventListener("click",refreshAll);
  $$("[data-interaction-tab]").forEach(button=>button.addEventListener("click",()=>{$$("[data-interaction-tab]").forEach(v=>v.classList.toggle("active",v===button));$$('[data-interaction-panel]').forEach(panel=>panel.classList.toggle("active",panel.dataset.interactionPanel===button.dataset.interactionTab));}));
}

async function bootstrap() {
  setupNavigation(); setupModals(); setupForms(); setupActions();
  const page = location.hash.slice(1); setPage(pageTitles[page] ? page : "dashboard");
  try { await Promise.all([loadStatus(),loadOverview(),loadActivity(),loadViewers()]); } catch(error){toast(error.message,true);}
  setInterval(()=>loadStatus().catch(()=>{}),10000);
  setInterval(()=>{if(state.currentPage==="dashboard")Promise.all([loadOverview(),loadActivity(),loadViewers()]).catch(()=>{});},30000);
}

document.addEventListener("DOMContentLoaded", bootstrap);
