
(() => {
  "use strict";

  const studio = {
    status: null,
    busy: false,
    statusTimer: null,
    activityTimer: null,
    sourceDiscovery: {windows: [], webcams: []},
  };

  const $s = (selector, root = document) => root.querySelector(selector);
  const $$s = (selector, root = document) => [...root.querySelectorAll(selector)];

  async function request(url, options = {}) {
    const response = await fetch(url, {
      headers: {"Content-Type": "application/json"},
      ...options,
    });
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; }
    catch { payload = {detail: text}; }
    if (!response.ok) throw new Error(payload.detail || payload.message || `Erreur ${response.status}`);
    return payload;
  }

  function notify(message, error = false) {
    if (typeof window.toast === "function") {
      window.toast(message, error);
      return;
    }
    const zone = $s("#toast-zone");
    if (!zone) return;
    const node = document.createElement("div");
    node.className = `toast${error ? " error" : ""}`;
    node.textContent = message;
    zone.append(node);
    setTimeout(() => node.remove(), 3800);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
    })[ch]);
  }

  function engineLabel(status) {
    if (status?.backend === "native") return "Aura Native";
    return "OBS";
  }

  function setBusy(value) {
    studio.busy = value;
    $$s("[data-studio-action], [data-studio-engine], [data-studio-scene]").forEach(button => {
      button.disabled = value || button.dataset.studioDisabled === "true";
    });
  }

  function sourceIcon(kind) {
    const map = {
      "Écran": "▣",
      "Fenêtre": "▤",
      "Jeu": "◆",
      "Webcam": "◉",
      "Image": "▧",
      "Texte": "T",
      "Navigateur": "◎",
    };
    return map[kind] || "◇";
  }

  function sourceKindSlug(label) {
    const map = {
      "Écran": "desktop",
      "Fenêtre": "window",
      "Jeu": "game",
      "Webcam": "webcam",
      "Image": "image",
      "Texte": "text",
      "Navigateur": "browser",
    };
    return map[String(label || "")] || "desktop";
  }

  const sourceKindConfig = {
    desktop: {name:"Écran", placeholder:"", help:"Capture l’écran principal.", target:false},
    game: {name:"Jeu", placeholder:"Choisir le jeu ou sa fenêtre", help:"Aura détecte les fenêtres ouvertes. Le mode fenêtré ou sans bordure est recommandé.", target:true, list:"windows"},
    window: {name:"Fenêtre", placeholder:"Choisir une application", help:"Sélectionne une fenêtre détectée.", target:true, list:"windows"},
    webcam: {name:"Webcam", placeholder:"Choisir une caméra", help:"Aura détecte les caméras DirectShow disponibles.", target:true, list:"webcams"},
    image: {name:"Image", placeholder:"Choisir un fichier image", help:"PNG, JPG, WEBP, BMP ou GIF.", target:true, browse:true},
    text: {name:"Texte", placeholder:"Écris le texte à afficher", help:"Le texte sera rendu directement par FFmpeg.", target:true},
    browser: {name:"Overlay", placeholder:"/overlay/avatar", help:"Overlay Aura local ou page web.", target:true},
  };

  async function loadSourceDiscovery() {
    try {
      const data = await request("/api/broadcast/discover");
      studio.sourceDiscovery = {
        windows: Array.isArray(data.windows) ? data.windows : [],
        webcams: Array.isArray(data.webcams) ? data.webcams : [],
      };
    } catch {
      studio.sourceDiscovery = {windows: [], webcams: []};
    }
  }

  function fillSourceTargetList(kind) {
    const list = $s("#studio-source-target-list");
    if (!list) return;
    const config = sourceKindConfig[kind] || sourceKindConfig.desktop;
    const values = config.list ? (studio.sourceDiscovery[config.list] || []) : [];
    list.innerHTML = values.map(value => `<option value="${escapeHtml(value)}"></option>`).join("");
  }

  function applySourceKind(kind, preset = "") {
    const config = sourceKindConfig[kind] || sourceKindConfig.desktop;
    const kindInput = $s("#studio-source-kind");
    const targetRow = $s("#studio-source-target-row");
    const target = $s("#studio-source-target");
    const help = $s("#studio-source-target-help");
    const browse = $s("#studio-source-browse");
    if (kindInput) kindInput.value = kind;
    if (targetRow) targetRow.hidden = !config.target;
    if (target) {
      target.placeholder = config.placeholder || "";
      if (preset) target.value = preset;
      if (!config.target) target.value = "";
    }
    if (help) help.textContent = config.help || "";
    if (browse) browse.hidden = !config.browse;
    fillSourceTargetList(kind);
    $s("[data-source-kind]").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.sourceKind === kind
          && (!preset || button.dataset.sourcePreset === preset)
      );
    });
  }

  async function openSourceModal(source = null) {
    if (studio.status?.backend !== "native") {
      notify("Passe en Aura Native pour gérer les sources", true);
      return;
    }
    if (studio.status?.streaming || studio.status?.recording) {
      notify("Arrête le direct ou l’enregistrement avant de modifier les sources", true);
      return;
    }

    const modal = $s("#studio-source-modal");
    if (!modal) return;
    await loadSourceDiscovery();

    const sourceId = $s("#studio-source-id");
    const name = $s("#studio-source-name");
    const target = $s("#studio-source-target");
    const title = $s("#studio-source-modal-title");
    const submit = $s("#studio-source-form button[type='submit']");
    const remove = $s("#studio-source-delete");

    if (source) {
      const kind = sourceKindSlug(source.kind);
      if (sourceId) sourceId.value = String(source.id || "");
      if (name) name.value = String(source.name || "");
      if (target) target.value = String(source.target || "");
      if (title) title.textContent = "Configurer la source";
      if (submit) submit.textContent = "Enregistrer";
      if (remove) remove.hidden = false;
      applySourceKind(kind, String(source.target || ""));
      $s("[data-source-kind]").forEach(button => button.disabled = true);
    } else {
      if (sourceId) sourceId.value = "";
      if (name) name.value = "";
      if (target) target.value = "";
      if (title) title.textContent = "Ajouter une source";
      if (submit) submit.textContent = "Ajouter au studio";
      if (remove) remove.hidden = true;
      $s("[data-source-kind]").forEach(button => button.disabled = false);
      applySourceKind("desktop");
    }

    modal.hidden = false;
  }

  function closeSourceModal() {
    const modal = $s("#studio-source-modal");
    if (modal) modal.hidden = true;
  }

  async function saveSourceFromModal(event) {
    event.preventDefault();
    const id = Number($s("#studio-source-id")?.value || 0);
    const kind = String($s("#studio-source-kind")?.value || "desktop");
    const name = String($s("#studio-source-name")?.value || "").trim();
    const target = String($s("#studio-source-target")?.value || "").trim();
    const config = sourceKindConfig[kind] || sourceKindConfig.desktop;

    if (config.target && !target && !["browser", "text"].includes(kind)) {
      notify("Choisis une source avant de continuer", true);
      return;
    }

    setBusy(true);
    try {
      const result = id
        ? await request(`/api/broadcast/source/${id}`, {
            method: "PATCH",
            body: JSON.stringify({name, target}),
          })
        : await request("/api/broadcast/source", {
            method: "POST",
            body: JSON.stringify({kind, name, target}),
          });
      renderBroadcast(result);
      closeSourceModal();
      notify(id ? "Source mise à jour" : "Source ajoutée au studio");
    } catch (error) {
      notify(error.message, true);
    } finally {
      setBusy(false);
      if (studio.status) renderBroadcast(studio.status);
    }
  }

  async function removeSource(sourceId) {
    if (!sourceId || !window.confirm("Supprimer cette source de la scène ?")) return;
    setBusy(true);
    try {
      const result = await request(`/api/broadcast/source/${sourceId}`, {method: "DELETE"});
      renderBroadcast(result);
      closeSourceModal();
      notify("Source supprimée");
    } catch (error) {
      notify(error.message, true);
    } finally {
      setBusy(false);
      if (studio.status) renderBroadcast(studio.status);
    }
  }

  async function pickSourceImage() {
    try {
      const result = await request("/api/broadcast/pick-image", {method: "POST"});
      if (result.path) {
        const target = $s("#studio-source-target");
        if (target) target.value = result.path;
      }
    } catch (error) {
      notify(error.message, true);
    }
  }

  function renderScenes(status) {
    const holder = $s("#studio-scene-list");
    if (!holder) return;
    const scenes = Array.isArray(status.scenes) ? status.scenes.filter(Boolean) : [];
    if (!scenes.length) {
      holder.innerHTML = '<div class="studio-empty">Aucune scène remontée par le moteur.</div>';
      return;
    }
    holder.innerHTML = scenes.map(name => {
      const active = String(name) === String(status.scene || "");
      return `<button class="studio-scene ${active ? "active" : ""}" data-studio-scene="${escapeHtml(name)}"><span>${escapeHtml(name)}</span><i></i></button>`;
    }).join("");
  }

  function renderSources(status) {
    const holder = $s("#studio-source-list");
    if (!holder) return;
    if (status.backend === "obs") {
      holder.innerHTML = '<div class="studio-empty">Les sources restent gérées dans OBS pendant le mode de compatibilité.</div>';
      renderSourceHandles(status);
      return;
    }
    const sources = Array.isArray(status.sources) ? status.sources : [];
    if (!sources.length) {
      holder.innerHTML = '<div class="studio-empty">Cette scène ne contient pas encore de source native.</div>';
      renderSourceHandles(status);
      return;
    }
    holder.innerHTML = sources.map(source => `
      <div class="studio-source">
        <span class="source-icon">${sourceIcon(source.kind)}</span>
        <div>
          <b>${escapeHtml(source.name)}</b>
          <small>${escapeHtml(source.kind)}${source.target ? " · " + escapeHtml(source.target) : ""}</small>
        </div>
        <button class="studio-source-visibility ${source.visible ? "" : "off"}" type="button" data-source-toggle="${Number(source.id)}" data-source-visible="${source.visible ? "1" : "0"}" title="${source.visible ? "Masquer" : "Afficher"}" ${status.streaming || status.recording ? "disabled" : ""}>${source.visible ? "◉" : "○"}</button>
        <button class="studio-source-configure" type="button" data-source-configure="${Number(source.id)}" title="Configurer" ${status.streaming || status.recording ? "disabled" : ""}>⚙</button>
        <button class="studio-source-remove" type="button" data-source-remove="${Number(source.id)}" title="Supprimer" ${status.streaming || status.recording ? "disabled" : ""}>×</button>
      </div>
    `).join("");
    renderSourceHandles(status);
  }

  function renderSourceHandles(status) {
    const layer = $s("#studio-source-handles");
    const stage = $s("#studio-stage");
    if (!layer || !stage) return;

    const native = status.backend === "native";
    const locked = Boolean(status.streaming || status.recording);
    stage.classList.toggle("edit-locked", native && locked);

    const hint = $s("#studio-edit-hint");
    if (hint) {
      hint.textContent = locked
        ? "Édition verrouillée pendant le direct ou l’enregistrement"
        : "Déplacez une source · tirez le coin pour la redimensionner";
    }

    if (!native || !status.preview) {
      layer.innerHTML = "";
      return;
    }

    const sources = (Array.isArray(status.sources) ? status.sources : []).filter(source => source.visible);
    layer.innerHTML = sources.map(source => {
      const transform = source.transform || {x:0,y:0,width:1,height:1};
      const x = Math.max(0, Math.min(1, Number(transform.x ?? 0)));
      const y = Math.max(0, Math.min(1, Number(transform.y ?? 0)));
      const width = Math.max(.05, Math.min(1, Number(transform.width ?? 1)));
      const height = Math.max(.05, Math.min(1, Number(transform.height ?? 1)));
      return `
        <div
          class="studio-source-handle ${locked ? "locked" : ""}"
          data-source-handle="${Number(source.id)}"
          style="left:${x*100}%;top:${y*100}%;width:${width*100}%;height:${height*100}%"
        >
          <span class="studio-source-handle-label">${escapeHtml(source.name)}</span>
          <span class="studio-source-resize" data-source-resize="${Number(source.id)}"></span>
        </div>
      `;
    }).join("");
  }

  function setNativePreview(status) {
    const image = $s("#studio-native-preview");
    const stage = $s("#studio-stage");
    if (!image || !stage) return;

    const active = status.backend === "native" && Boolean(status.preview);
    stage.classList.toggle("preview-active", active);

    if (active) {
      if (!image.dataset.connected) {
        image.src = `/api/broadcast/preview.mjpeg?v=${Date.now()}`;
        image.dataset.connected = "1";
      }
      image.classList.add("active");
    } else {
      image.classList.remove("active");
      if (image.dataset.connected) {
        image.removeAttribute("src");
        delete image.dataset.connected;
      }
    }
  }

  async function updateSourceTransform(sourceId, transform) {
    const result = await request(`/api/broadcast/source/${sourceId}/transform`, {
      method: "PUT",
      body: JSON.stringify(transform),
    });
    renderBroadcast(result);
  }

  async function toggleSourceVisibility(sourceId, visible) {
    const result = await request(`/api/broadcast/source/${sourceId}/visibility`, {
      method: "PUT",
      body: JSON.stringify({visible}),
    });
    renderBroadcast(result);
  }

  function bindSourceEditor() {
    const stage = $s("#studio-stage");
    if (!stage) return;

    let edit = null;

    stage.addEventListener("pointerdown", event => {
      if (studio.busy || studio.status?.backend !== "native" || studio.status?.streaming || studio.status?.recording) return;
      const handle = event.target.closest("[data-source-handle]");
      if (!handle) return;

      const rect = stage.getBoundingClientRect();
      const isResize = Boolean(event.target.closest("[data-source-resize]"));
      const startX = event.clientX;
      const startY = event.clientY;
      const left = parseFloat(handle.style.left) / 100;
      const top = parseFloat(handle.style.top) / 100;
      const width = parseFloat(handle.style.width) / 100;
      const height = parseFloat(handle.style.height) / 100;

      edit = {
        pointerId: event.pointerId,
        sourceId: Number(handle.dataset.sourceHandle),
        handle,
        rect,
        isResize,
        startX,
        startY,
        left,
        top,
        width,
        height,
      };
      handle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });

    stage.addEventListener("pointermove", event => {
      if (!edit || event.pointerId !== edit.pointerId) return;
      const dx = (event.clientX - edit.startX) / Math.max(1, edit.rect.width);
      const dy = (event.clientY - edit.startY) / Math.max(1, edit.rect.height);

      let x = edit.left;
      let y = edit.top;
      let width = edit.width;
      let height = edit.height;

      if (edit.isResize) {
        width = Math.max(.05, Math.min(1 - x, edit.width + dx));
        height = Math.max(.05, Math.min(1 - y, edit.height + dy));
      } else {
        x = Math.max(0, Math.min(1 - width, edit.left + dx));
        y = Math.max(0, Math.min(1 - height, edit.top + dy));
      }

      edit.handle.style.left = `${x * 100}%`;
      edit.handle.style.top = `${y * 100}%`;
      edit.handle.style.width = `${width * 100}%`;
      edit.handle.style.height = `${height * 100}%`;
    });

    const finish = async event => {
      if (!edit || event.pointerId !== edit.pointerId) return;
      const current = edit;
      edit = null;
      const transform = {
        x: parseFloat(current.handle.style.left) / 100,
        y: parseFloat(current.handle.style.top) / 100,
        width: parseFloat(current.handle.style.width) / 100,
        height: parseFloat(current.handle.style.height) / 100,
      };
      setBusy(true);
      try {
        await updateSourceTransform(current.sourceId, transform);
        notify("Position de la source enregistrée");
      } catch (error) {
        notify(error.message, true);
        await refreshBroadcast(true);
      } finally {
        setBusy(false);
        if (studio.status) renderBroadcast(studio.status);
      }
    };

    stage.addEventListener("pointerup", finish);
    stage.addEventListener("pointercancel", finish);
  }

  function renderAudio(status) {
    const engine = status.engine || {};
    const mic = $s("#studio-mic-meter");
    const pc = $s("#studio-pc-meter");
    const micDetail = $s("#studio-mic-detail");
    const pcDetail = $s("#studio-pc-detail");

    if (status.backend === "native") {
      const micValue = Math.max(0, Math.min(1, Number(engine.mic_volume ?? .82)));
      const pcValue = Math.max(0, Math.min(1, Number(engine.desktop_volume ?? .72)));
      if (mic) mic.style.width = `${engine.mic_muted ? 0 : micValue * 100}%`;
      if (pc) pc.style.width = `${engine.desktop_muted ? 0 : pcValue * 100}%`;
      if (micDetail) micDetail.textContent = engine.mic_muted ? "Muet" : "Entrée native";
      if (pcDetail) pcDetail.textContent = "Mixage complet V0.2";
    } else {
      if (mic) mic.style.width = "62%";
      if (pc) pc.style.width = "48%";
      if (micDetail) micDetail.textContent = "Géré par OBS";
      if (pcDetail) pcDetail.textContent = "Géré par OBS";
    }
  }

  function renderBroadcast(status) {
    studio.status = status;
    const streaming = Boolean(status.streaming);
    const recording = Boolean(status.recording);
    const preview = Boolean(status.preview);
    const native = status.backend === "native";
    const stage = $s("#studio-stage");
    const canvasWidth = Number(status.engine?.canvas_width || 16);
    const canvasHeight = Number(status.engine?.canvas_height || 9);
    if (stage && canvasWidth > 0 && canvasHeight > 0) {
      stage.style.aspectRatio = `${canvasWidth} / ${canvasHeight}`;
    }

    $s("[data-studio-engine]").forEach(button => {
      button.classList.toggle("active", button.dataset.studioEngine === status.backend);
    });

    const health = $s("#studio-broadcast-health");
    if (health) {
      health.classList.toggle("ok", native ? Boolean(status.responsive || status.process_running) : Boolean(status.obs?.connected));
      health.classList.toggle("live", streaming);
      const label = health.querySelector("span");
      if (label) {
        if (streaming) label.textContent = `En direct · ${engineLabel(status)}`;
        else if (native && !status.engine_available) label.textContent = "Moteur natif absent";
        else if (native && !status.process_running) label.textContent = "Aura Native prêt";
        else if (!native && !status.obs?.connected) label.textContent = "OBS non connecté";
        else label.textContent = `${engineLabel(status)} prêt`;
      }
    }

    const service = $s("#service-status");
    if (service) service.textContent = streaming ? "DIFFUSION EN COURS" : `${engineLabel(status).toUpperCase()} PRÊT`;

    const liveState = $s("#dashboard-live-state");
    if (liveState) {
      liveState.classList.toggle("online", streaming);
      liveState.innerHTML = `<span></span>${streaming ? "En direct" : "Hors ligne"}`;
    }

    const stageTitle = $s("#studio-stage-title");
    const stageCopy = $s("#studio-stage-copy");
    const stageStatus = $s("#studio-stage-status");
    if (stageTitle) {
      stageTitle.textContent = streaming ? "Votre diffusion est en cours" : (preview ? "Aperçu natif actif" : "Studio prêt");
    }
    if (stageCopy) {
      stageCopy.textContent = native
        ? (preview
            ? "L’aperçu vidéo est produit par Aura Native Broadcast. La prochaine étape est son affichage directement dans ce panneau."
            : "Cliquez sur Aperçu pour vérifier la capture avant de lancer le direct.")
        : (status.obs?.connected
            ? "Aura pilote OBS derrière cette interface. Vous gardez les mêmes commandes pendant la transition vers le moteur natif."
            : "OBS est sélectionné mais la connexion WebSocket n’est pas disponible.");
    }
    if (stageStatus) {
      const encoder = status.encoder || status.engine?.encoder || (native ? "Détection en cours" : "Encodeur OBS");
      stageStatus.innerHTML = `<i></i><span>${escapeHtml(status.scene || "Aucune scène")} · ${escapeHtml(encoder)}</span>`;
    }

    const previewButton = $s('[data-studio-action="preview"]');
    if (previewButton) {
      previewButton.textContent = preview ? "■ Fermer aperçu" : "◉ Aperçu";
      previewButton.classList.toggle("active", preview);
      previewButton.dataset.studioDisabled = native ? "false" : "true";
      previewButton.disabled = studio.busy || !native;
      previewButton.title = native ? "Ouvrir ou fermer l’aperçu natif" : "L’aperçu OBS reste dans OBS pendant la transition";
    }

    const recordButton = $s('[data-studio-action="record"]');
    if (recordButton) {
      recordButton.textContent = recording ? "■ Arrêter REC" : "● Enregistrer";
      recordButton.classList.toggle("active", recording);
    }

    const liveButton = $s('[data-studio-action="live"]');
    if (liveButton) {
      liveButton.textContent = streaming ? "■ Couper le direct" : "▶ Lancer le live";
      liveButton.classList.toggle("active", streaming);
    }

    setNativePreview(status);
    renderScenes(status);
    renderSources(status);
    renderAudio(status);
  }

  async function refreshBroadcast(silent = true) {
    try {
      renderBroadcast(await request("/api/broadcast/status"));
    } catch (error) {
      if (!silent) notify(error.message, true);
      const health = $s("#studio-broadcast-health span");
      if (health) health.textContent = "Moteur indisponible";
    }
  }

  async function selectEngine(mode) {
    if (studio.busy || studio.status?.backend === mode) return;
    setBusy(true);
    try {
      const result = await request(`/api/broadcast/mode/${mode}`, {method: "POST"});
      notify(mode === "native" ? "Aura Native Broadcast activé" : "Compatibilité OBS activée");
      await refreshBroadcast(false);
      return result;
    } catch (error) {
      notify(error.message, true);
    } finally {
      setBusy(false);
      if (studio.status) renderBroadcast(studio.status);
    }
  }

  async function sendAction(kind) {
    if (studio.busy || !studio.status) return;
    let endpoint = "";
    if (kind === "live") endpoint = studio.status.streaming ? "/api/broadcast/stream/stop" : "/api/broadcast/stream/start";
    if (kind === "record") endpoint = studio.status.recording ? "/api/broadcast/record/stop" : "/api/broadcast/record/start";
    if (kind === "preview") endpoint = studio.status.preview ? "/api/broadcast/preview/stop" : "/api/broadcast/preview/start";
    if (!endpoint) return;

    setBusy(true);
    try {
      const result = await request(endpoint, {method: "POST"});
      renderBroadcast(result);
      const messages = {
        live: result.streaming ? "Le direct est lancé" : "Le direct est arrêté",
        record: result.recording ? "Enregistrement démarré" : "Enregistrement arrêté",
        preview: result.preview ? "Aperçu natif lancé" : "Aperçu natif arrêté",
      };
      notify(messages[kind]);
    } catch (error) {
      notify(error.message, true);
    } finally {
      setBusy(false);
      if (studio.status) renderBroadcast(studio.status);
    }
  }

  async function selectScene(name) {
    if (!name || studio.busy) return;
    setBusy(true);
    try {
      const result = await request("/api/broadcast/scene", {
        method: "POST",
        body: JSON.stringify({scene: name}),
      });
      renderBroadcast(result);
      notify(`Scène « ${name} » active`);
    } catch (error) {
      notify(error.message, true);
    } finally {
      setBusy(false);
      if (studio.status) renderBroadcast(studio.status);
    }
  }

  function renderChat(rows) {
    const holder = $s("#studio-chat-list");
    if (!holder) return;
    const messages = [];
    for (const row of rows || []) {
      if (row.event_type !== "channel.chat.message") continue;
      let payload = {};
      try { payload = typeof row.payload === "string" ? JSON.parse(row.payload) : (row.payload || {}); }
      catch {}
      const message = payload.message?.text || payload.message_text || payload.text || payload.message || "";
      const actor = payload.chatter_user_name || payload.user_name || payload.chatter_user_login || "Viewer";
      if (typeof message === "string" && message.trim()) messages.push({actor, message});
      if (messages.length >= 14) break;
    }
    holder.innerHTML = messages.length
      ? messages.map(item => `<div class="studio-chat-message"><b>${escapeHtml(item.actor)}</b><p>${escapeHtml(item.message)}</p></div>`).join("")
      : '<div class="studio-chat-empty">Les derniers messages Twitch apparaîtront ici dès qu’ils arrivent.</div>';
  }

  async function refreshActivity() {
    try {
      const rows = await request("/api/activity?limit=80");
      renderChat(rows);
    } catch {
      // Le tableau de bord historique conserve déjà sa propre gestion d'erreur.
    }
  }

  function bindTabs() {
    $$s("[data-studio-tab]").forEach(button => button.addEventListener("click", () => {
      const tab = button.dataset.studioTab;
      $$s("[data-studio-tab]").forEach(node => node.classList.toggle("active", node === button));
      $$s("[data-studio-panel]").forEach(node => node.classList.toggle("active", node.dataset.studioPanel === tab));
    }));
  }

  function bindSourceModal() {
    const form = $s("#studio-source-form");
    if (form) form.addEventListener("submit", saveSourceFromModal);

    $s("[data-source-kind]").forEach(button => button.addEventListener("click", () => {
      if (button.disabled) return;
      const preset = String(button.dataset.sourcePreset || "");
      applySourceKind(String(button.dataset.sourceKind || "desktop"), preset);
      const name = $s("#studio-source-name");
      if (name && !name.value.trim()) {
        const label = button.querySelector("span")?.textContent || "";
        name.value = label;
      }
    }));

    const browse = $s("#studio-source-browse");
    if (browse) browse.addEventListener("click", pickSourceImage);

    const remove = $s("#studio-source-delete");
    if (remove) remove.addEventListener("click", () => {
      removeSource(Number($s("#studio-source-id")?.value || 0));
    });

    $s("[data-studio-source-close]").forEach(button => button.addEventListener("click", closeSourceModal));

    const modal = $s("#studio-source-modal");
    if (modal) modal.addEventListener("click", event => {
      if (event.target === modal) closeSourceModal();
    });
  }

  function bindControls() {
    document.addEventListener("click", event => {
      const addSource = event.target.closest("[data-studio-source-add]");
      if (addSource) {
        openSourceModal();
        return;
      }
      const configure = event.target.closest("[data-source-configure]");
      if (configure) {
        const sourceId = Number(configure.dataset.sourceConfigure);
        const source = (studio.status?.sources || []).find(item => Number(item.id) === sourceId);
        if (source) openSourceModal(source);
        return;
      }
      const remove = event.target.closest("[data-source-remove]");
      if (remove) {
        removeSource(Number(remove.dataset.sourceRemove));
        return;
      }
      const engine = event.target.closest("[data-studio-engine]");
      if (engine) {
        selectEngine(engine.dataset.studioEngine);
        return;
      }
      const action = event.target.closest("[data-studio-action]");
      if (action) {
        sendAction(action.dataset.studioAction);
        return;
      }
      const visibility = event.target.closest("[data-source-toggle]");
      if (visibility) {
        const sourceId = Number(visibility.dataset.sourceToggle);
        const visible = visibility.dataset.sourceVisible !== "1";
        setBusy(true);
        toggleSourceVisibility(sourceId, visible)
          .then(() => notify(visible ? "Source affichée" : "Source masquée"))
          .catch(error => notify(error.message, true))
          .finally(() => {
            setBusy(false);
            if (studio.status) renderBroadcast(studio.status);
          });
        return;
      }
      const scene = event.target.closest("[data-studio-scene]");
      if (scene) {
        selectScene(scene.dataset.studioScene);
      }
    });
  }

  function start() {
    if (!$s(".studio-dashboard")) return;
    bindTabs();
    bindControls();
    bindSourceEditor();
    bindSourceModal();
    refreshBroadcast(false);
    refreshActivity();

    studio.statusTimer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !studio.busy) refreshBroadcast(true);
    }, 2200);
    studio.activityTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshActivity();
    }, 6500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, {once: true});
  } else {
    start();
  }
})();
