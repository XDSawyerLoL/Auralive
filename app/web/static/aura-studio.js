
(() => {
  "use strict";

  const studio = {
    status: null,
    busy: false,
    statusTimer: null,
    activityTimer: null,
    sourceDiscovery: {windows: [], webcams: []},
    refreshInFlight: false,
    actionLocks: new Set(),
    lastActionAt: 0,
  };

  const $s = (selector, root = document) => root.querySelector(selector);
  const $$s = (selector, root = document) => [...root.querySelectorAll(selector)];

  async function request(url, options = {}) {
    const timeoutMs = Number(options.timeoutMs || 18000);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    const requestOptions = {...options};
    delete requestOptions.timeoutMs;
    try {
      const response = await fetch(url, {
        headers: {"Content-Type": "application/json"},
        ...requestOptions,
        signal: controller.signal,
      });
      const text = await response.text();
      let payload = {};
      try { payload = text ? JSON.parse(text) : {}; }
      catch { payload = {detail: text}; }
      if (!response.ok) throw new Error(payload.detail || payload.message || `Erreur ${response.status}`);
      return payload;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("Le moteur met trop de temps à répondre. La commande a été interrompue proprement.");
      }
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
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

  function engineLabel() {
    return "Quantic Studio Core";
  }

  function liveReadiness(status) {
    const engineReady = Boolean(status?.engine_available && (status?.responsive || status?.process_running));
    const secondaryReady = Array.isArray(status?.output?.destinations)
      && status.output.destinations.some(row => row?.enabled && row?.stream_key_configured);
    const outputReady = Boolean(status?.output?.stream_key_configured || secondaryReady);
    const sceneReady = Boolean(String(status?.scene || "").trim());
    return {
      engineReady,
      outputReady,
      sceneReady,
      ready: engineReady && outputReady && sceneReady,
    };
  }

  function renderLiveReadiness(status) {
    const readiness = liveReadiness(status);
    const values = {
      engine: {
        ready: readiness.engineReady,
        label: readiness.engineReady ? "Moteur prêt" : "Moteur à vérifier",
      },
      output: {
        ready: readiness.outputReady,
        label: readiness.outputReady ? "Diffusion prête" : "Clé de stream requise",
      },
      scene: {
        ready: readiness.sceneReady,
        label: readiness.sceneReady ? "Scène prête" : "Scène à choisir",
      },
    };

    for (const [key, value] of Object.entries(values)) {
      const node = $s(`[data-studio-ready="${key}"]`);
      if (!node) continue;
      node.classList.toggle("ready", value.ready);
      node.classList.toggle("warn", !value.ready);
      const dot = node.querySelector("i")?.outerHTML || "<i></i>";
      node.innerHTML = `${dot}${escapeHtml(value.label)}`;
    }

    return readiness;
  }

  function setBusy(value) {
    studio.busy = value;
    $s(".studio-dashboard")?.classList.toggle("is-busy", value);
    $s("[data-studio-action], [data-studio-scene], [data-studio-scene-edit], [data-source-toggle], [data-source-configure], [data-source-remove], [data-studio-output-settings], [data-studio-scene-manage], [data-studio-source-add], #studio-mic-mute, #studio-system-mute, #studio-aura-mute").forEach(button => {
      button.disabled = value || button.dataset.studioDisabled === "true";
      button.setAttribute("aria-busy", value ? "true" : "false");
    });
  }

  function actionFeedback(message, kind = "idle") {
    const node = $s("#studio-action-feedback");
    if (!node) return;
    node.textContent = message;
    node.dataset.kind = kind;
  }

  function setActionPending(kind, pending) {
    const button = $s(`[data-studio-action="${kind}"]`);
    if (!button) return;
    button.classList.toggle("pending", pending);
    button.setAttribute("aria-busy", pending ? "true" : "false");
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
    image: {name:"Image", placeholder:"Choisir un fichier image", help:"PNG, JPG, WEBP ou BMP.", target:true, browse:true},
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
    $$s("[data-source-kind]").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.sourceKind === kind
          && (!preset || button.dataset.sourcePreset === preset)
      );
    });
  }

  async function openSourceModal(source = null) {
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
      $$s("[data-source-kind]").forEach(button => button.disabled = true);
    } else {
      if (sourceId) sourceId.value = "";
      if (name) name.value = "";
      if (target) target.value = "";
      if (title) title.textContent = "Ajouter une source";
      if (submit) submit.textContent = "Ajouter au studio";
      if (remove) remove.hidden = true;
      $$s("[data-source-kind]").forEach(button => button.disabled = false);
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

  function renderMultistreamDestinations(rows = []) {
    const holder = $s("#studio-multistream-list");
    if (!holder) return;
    const destinations = Array.isArray(rows) ? rows : [];
    holder.innerHTML = destinations.length
      ? destinations.map((row, index) => `
        <div class="studio-destination" data-destination-id="${escapeHtml(row.id || `dest-${index + 1}`)}">
          <div class="studio-destination-head">
            <b>Destination ${index + 2}</b>
            <label><input type="checkbox" data-destination-enabled ${row.enabled !== false ? "checked" : ""}> Active</label>
            <button type="button" data-destination-remove title="Retirer">×</button>
          </div>
          <input data-destination-label maxlength="80" value="${escapeHtml(row.label || "")}" placeholder="YouTube / Kick / autre">
          <input data-destination-url maxlength="500" value="${escapeHtml(row.rtmp_url || "")}" placeholder="rtmps://serveur/app">
          <input data-destination-key type="password" autocomplete="new-password" maxlength="500" placeholder="${row.stream_key_configured ? "Clé protégée — laisser vide pour conserver" : "Clé de stream"}">
        </div>
      `).join("")
      : '<div class="studio-empty">Une seule destination active. Ajoute-en une pour diffuser simultanément ailleurs.</div>';
  }

  function addMultistreamDestination() {
    const holder = $s("#studio-multistream-list");
    if (!holder) return;
    const count = $s(".studio-destination", holder).length;
    if (count >= 3) {
      notify("Maximum de 3 destinations secondaires", true);
      return;
    }
    if (holder.querySelector(".studio-empty")) holder.innerHTML = "";
    const id = `dest-${Date.now()}`;
    holder.insertAdjacentHTML("beforeend", `
      <div class="studio-destination" data-destination-id="${id}">
        <div class="studio-destination-head">
          <b>Destination ${count + 2}</b>
          <label><input type="checkbox" data-destination-enabled checked> Active</label>
          <button type="button" data-destination-remove title="Retirer">×</button>
        </div>
        <input data-destination-label maxlength="80" placeholder="YouTube / Kick / autre">
        <input data-destination-url maxlength="500" placeholder="rtmps://serveur/app">
        <input data-destination-key type="password" autocomplete="new-password" maxlength="500" placeholder="Clé de stream">
      </div>
    `);
  }

  function collectMultistreamDestinations() {
    return $s("#studio-multistream-list .studio-destination").map((row, index) => {
      const label = String($s("[data-destination-label]", row)?.value || "").trim();
      const rtmpUrl = String($s("[data-destination-url]", row)?.value || "").trim();
      const streamKey = String($s("[data-destination-key]", row)?.value || "").trim();
      return {
        id: String(row.dataset.destinationId || `dest-${index + 1}`),
        label: label || `Destination ${index + 2}`,
        rtmp_url: rtmpUrl,
        stream_key: streamKey || null,
        enabled: Boolean($s("[data-destination-enabled]", row)?.checked),
      };
    }).filter(row => row.rtmp_url || row.stream_key);
  }

  function openOutputModal() {
        const modal = $s("#studio-output-modal");
    if (!modal) return;

    const output = studio.status?.output || {};
    const url = $s("#studio-output-url");
    const key = $s("#studio-output-key");
    const keyStatus = $s("#studio-output-key-status");
    const clearButton = $s("#studio-output-clear-key");

    if (url) url.value = String(output.rtmp_url || "rtmp://live.twitch.tv/app");
    if (key) key.value = "";
    if (keyStatus) {
      keyStatus.textContent = output.stream_key_configured
        ? "Clé protégée dans le coffre local. Elle ne sera jamais réaffichée."
        : "Aucune clé enregistrée.";
    }
    if (clearButton) clearButton.disabled = !output.stream_key_configured;
    renderMultistreamDestinations(output.destinations || []);
    modal.hidden = false;
  }

  function closeOutputModal() {
    const modal = $s("#studio-output-modal");
    if (modal) modal.hidden = true;
  }

  async function saveOutputSettings(event) {
    event.preventDefault();
    if (studio.status?.streaming || studio.status?.recording) {
      notify("Arrête le Live et le REC avant de modifier la destination", true);
      return;
    }

    const rtmpUrl = String($s("#studio-output-url")?.value || "").trim();
    const key = String($s("#studio-output-key")?.value || "").trim();
    setBusy(true);
    try {
      await request("/api/broadcast/output", {
        method: "PUT",
        body: JSON.stringify({
          rtmp_url: rtmpUrl,
          stream_key: key || null,
          destinations: collectMultistreamDestinations(),
        }),
      });
      closeOutputModal();
      await refreshBroadcast(false);
      notify("Réglages de diffusion enregistrés dans le coffre local");
    } catch (error) {
      notify(error.message, true);
    } finally {
      setBusy(false);
      if (studio.status) renderBroadcast(studio.status);
    }
  }

  async function clearOutputStreamKey() {
    if (!window.confirm("Supprimer la clé de stream enregistrée sur ce PC ?")) return;
    const rtmpUrl = String($s("#studio-output-url")?.value || "rtmp://live.twitch.tv/app").trim();
    setBusy(true);
    try {
      await request("/api/broadcast/output", {
        method: "PUT",
        body: JSON.stringify({
          rtmp_url: rtmpUrl,
          clear_stream_key: true,
          destinations: collectMultistreamDestinations(),
        }),
      });
      closeOutputModal();
      await refreshBroadcast(false);
      notify("Clé de stream supprimée du coffre local");
    } catch (error) {
      notify(error.message, true);
    } finally {
      setBusy(false);
      if (studio.status) renderBroadcast(studio.status);
    }
  }

  function bindOutputSettings() {
    const form = $s("#studio-output-form");
    if (form) form.addEventListener("submit", saveOutputSettings);

    const clear = $s("#studio-output-clear-key");
    if (clear) clear.addEventListener("click", clearOutputStreamKey);

    const addDestination = $s("[data-studio-add-destination]");
    if (addDestination) addDestination.addEventListener("click", addMultistreamDestination);

    const list = $s("#studio-multistream-list");
    if (list) list.addEventListener("click", event => {
      const remove = event.target.closest("[data-destination-remove]");
      if (remove) {
        remove.closest(".studio-destination")?.remove();
        if (!list.querySelector(".studio-destination")) renderMultistreamDestinations([]);
      }
    });

    $s("[data-studio-output-close]").forEach(button => {
      button.addEventListener("click", closeOutputModal);
    });

    const modal = $s("#studio-output-modal");
    if (modal) modal.addEventListener("click", event => {
      if (event.target === modal) closeOutputModal();
    });
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
      return `<div class="studio-scene-row">
        <button class="studio-scene ${active ? "active" : ""}" data-studio-scene="${escapeHtml(name)}"><span>${escapeHtml(name)}</span><i></i></button>
        <button class="studio-scene-edit" type="button" data-studio-scene-edit="${escapeHtml(name)}" title="Renommer ou supprimer">•••</button>
      </div>`;
    }).join("");
  }

  function openSceneModal(sceneName = "") {
        const modal = $s("#studio-scene-modal");
    if (!modal) return;
    const current = $s("#studio-scene-current");
    const name = $s("#studio-scene-name");
    const title = $s("#studio-scene-modal-title");
    const submit = $s("#studio-scene-submit");
    const remove = $s("#studio-scene-delete");
    if (current) current.value = sceneName;
    if (name) name.value = sceneName;
    if (title) title.textContent = sceneName ? "Gérer la scène" : "Nouvelle scène";
    if (submit) submit.textContent = sceneName ? "Renommer" : "Créer la scène";
    if (remove) remove.hidden = !sceneName;
    modal.hidden = false;
    setTimeout(() => name?.focus(), 20);
  }

  function closeSceneModal() {
    const modal = $s("#studio-scene-modal");
    if (modal) modal.hidden = true;
  }

  async function saveScene(event) {
    event.preventDefault();
    const current = String($s("#studio-scene-current")?.value || "").trim();
    const name = String($s("#studio-scene-name")?.value || "").trim();
    if (!name) return;
    setBusy(true);
    try {
      const result = current
        ? await request(`/api/broadcast/scenes/${encodeURIComponent(current)}`, {
            method: "PATCH",
            body: JSON.stringify({name}),
          })
        : await request("/api/broadcast/scenes", {
            method: "POST",
            body: JSON.stringify({name}),
          });
      renderBroadcast(result);
      closeSceneModal();
      notify(current ? `Scène renommée « ${name} »` : `Scène créée « ${name} »`);
    } catch (error) {
      notify(error.message, true);
    } finally {
      setBusy(false);
      if (studio.status) renderBroadcast(studio.status);
    }
  }

  async function removeScene() {
    const current = String($s("#studio-scene-current")?.value || "").trim();
    if (!current || !window.confirm(`Supprimer la scène « ${current} » ?`)) return;
    setBusy(true);
    try {
      const result = await request(`/api/broadcast/scenes/${encodeURIComponent(current)}`, {method: "DELETE"});
      renderBroadcast(result);
      closeSceneModal();
      notify("Scène supprimée");
    } catch (error) {
      notify(error.message, true);
    } finally {
      setBusy(false);
      if (studio.status) renderBroadcast(studio.status);
    }
  }

  async function saveTransition() {
        const kind = String($s("#studio-transition-kind")?.value || "fade");
    const durationMs = Number($s("#studio-transition-duration")?.value || 350);
    try {
      const result = await request("/api/broadcast/transition", {
        method: "PUT",
        body: JSON.stringify({kind, duration_ms: durationMs}),
      });
      renderBroadcast(result);
      notify(kind === "fade" ? `Fondu réglé à ${durationMs} ms` : "Transition Cut activée");
    } catch (error) {
      notify(error.message, true);
    }
  }

  function bindSceneControls() {
    const form = $s("#studio-scene-form");
    if (form) form.addEventListener("submit", saveScene);
    const remove = $s("#studio-scene-delete");
    if (remove) remove.addEventListener("click", removeScene);
    $s("[data-studio-scene-close]").forEach(button => button.addEventListener("click", closeSceneModal));
    const modal = $s("#studio-scene-modal");
    if (modal) modal.addEventListener("click", event => {
      if (event.target === modal) closeSceneModal();
    });

    const kind = $s("#studio-transition-kind");
    if (kind) kind.addEventListener("change", saveTransition);
    const duration = $s("#studio-transition-duration");
    if (duration) {
      duration.addEventListener("input", () => {
        const label = $s("#studio-transition-duration-label");
        if (label) label.textContent = `${duration.value} ms`;
      });
      duration.addEventListener("change", saveTransition);
    }
  }

  function renderSources(status) {
    const holder = $s("#studio-source-list");
    if (!holder) return;
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
        <button class="studio-source-visibility ${source.visible ? "" : "off"}" type="button" data-source-toggle="${Number(source.id)}" data-source-visible="${source.visible ? "1" : "0"}" title="${source.visible ? "Masquer" : "Afficher"}">${source.visible ? "◉" : "○"}</button>
        <button class="studio-source-configure" type="button" data-source-configure="${Number(source.id)}" title="Configurer">⚙</button>
        <button class="studio-source-remove" type="button" data-source-remove="${Number(source.id)}" title="Supprimer">×</button>
      </div>
    `).join("");
    renderSourceHandles(status);
  }

  function renderSourceHandles(status) {
    const layer = $s("#studio-source-handles");
    const stage = $s("#studio-stage");
    if (!layer || !stage) return;

    const native = true;
    const liveReload = Boolean(status.streaming || status.recording);
    stage.classList.remove("edit-locked");

    const hint = $s("#studio-edit-hint");
    if (hint) {
      hint.textContent = liveReload
        ? "Édition active · Aura actualise automatiquement les sorties"
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
          class="studio-source-handle"
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

    const active = Boolean(status.preview);
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
      if (studio.busy || studio.status?.backend !== "native") return;
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
    const micMeter = $s("#studio-mic-meter");
    const systemMeter = $s("#studio-system-meter");
    const auraMeter = $s("#studio-pc-meter");
    const micDetail = $s("#studio-mic-detail");
    const systemDetail = $s("#studio-system-detail");
    const auraDetail = $s("#studio-pc-detail");
    const micVolume = $s("#studio-mic-volume");
    const systemVolume = $s("#studio-system-volume");
    const auraVolume = $s("#studio-aura-volume");
    const micMute = $s("#studio-mic-mute");
    const systemMute = $s("#studio-system-mute");
    const auraMute = $s("#studio-aura-mute");

    if (status.backend === "native") {
      const micValue = Math.max(0, Math.min(2, Number(engine.mic_volume ?? .82)));
      const systemValue = Math.max(0, Math.min(2, Number(engine.system_volume ?? .72)));
      const auraValue = Math.max(0, Math.min(2, Number(engine.desktop_volume ?? .72)));
      const systemAudio = status.system_audio || {};

      if (micMeter) micMeter.style.width = `${engine.mic_muted ? 0 : Math.min(100, micValue * 100)}%`;
      if (systemMeter) systemMeter.style.width = `${engine.system_muted ? 0 : Math.min(100, systemValue * 100)}%`;
      if (auraMeter) auraMeter.style.width = `${engine.desktop_muted ? 0 : Math.min(100, auraValue * 100)}%`;

      if (micDetail) micDetail.textContent = engine.mic_muted ? "Muet" : `${Math.round(micValue * 100)} %`;
      if (systemDetail) {
        if (engine.system_muted) systemDetail.textContent = "Muet";
        else if (systemAudio.available || systemAudio.running) systemDetail.textContent = `${Math.round(systemValue * 100)} % · ${systemAudio.device || "WASAPI"}`;
        else if (systemAudio.error) systemDetail.textContent = "WASAPI indisponible";
        else systemDetail.textContent = `${Math.round(systemValue * 100)} % · prêt`;
      }
      if (auraDetail) auraDetail.textContent = engine.desktop_muted ? "Muet" : `${Math.round(auraValue * 100)} % · bus Aura`;

      if (micVolume && document.activeElement !== micVolume) micVolume.value = String(Math.round(micValue * 100));
      if (systemVolume && document.activeElement !== systemVolume) systemVolume.value = String(Math.round(systemValue * 100));
      if (auraVolume && document.activeElement !== auraVolume) auraVolume.value = String(Math.round(auraValue * 100));

      for (const [button, muted] of [
        [micMute, Boolean(engine.mic_muted)],
        [systemMute, Boolean(engine.system_muted)],
        [auraMute, Boolean(engine.desktop_muted)],
      ]) {
        if (!button) continue;
        button.classList.toggle("muted", muted);
        button.textContent = muted ? "○" : "◉";
      }
    } else {
      if (micMeter) micMeter.style.width = "62%";
      if (systemMeter) systemMeter.style.width = "48%";
      if (auraMeter) auraMeter.style.width = "48%";
      if (micDetail) micDetail.textContent = "Géré par OBS";
      if (systemDetail) systemDetail.textContent = "Géré par OBS";
      if (auraDetail) auraDetail.textContent = "Géré par OBS";
    }
  }

  async function updateAudioMix(overrides = {}) {
        const engine = studio.status?.engine || {};
    const payload = {
      mic_volume: Number($s("#studio-mic-volume")?.value || Math.round(Number(engine.mic_volume ?? .82) * 100)) / 100,
      system_volume: Number($s("#studio-system-volume")?.value || Math.round(Number(engine.system_volume ?? .72) * 100)) / 100,
      aura_volume: Number($s("#studio-aura-volume")?.value || Math.round(Number(engine.desktop_volume ?? .72) * 100)) / 100,
      mic_muted: Boolean(engine.mic_muted),
      system_muted: Boolean(engine.system_muted),
      aura_muted: Boolean(engine.desktop_muted),
      ...overrides,
    };
    setBusy(true);
    try {
      const result = await request("/api/broadcast/audio", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      renderBroadcast(result);
      notify("Mix audio Aura actualisé");
    } catch (error) {
      notify(error.message, true);
    } finally {
      setBusy(false);
      if (studio.status) renderBroadcast(studio.status);
    }
  }

  function bindAudioMixer() {
    const micVolume = $s("#studio-mic-volume");
    const systemVolume = $s("#studio-system-volume");
    const auraVolume = $s("#studio-aura-volume");
    const micMute = $s("#studio-mic-mute");
    const systemMute = $s("#studio-system-mute");
    const auraMute = $s("#studio-aura-mute");

    if (micVolume) micVolume.addEventListener("change", () => updateAudioMix());
    if (systemVolume) systemVolume.addEventListener("change", () => updateAudioMix());
    if (auraVolume) auraVolume.addEventListener("change", () => updateAudioMix());
    if (micMute) micMute.addEventListener("click", () => {
      updateAudioMix({mic_muted: !Boolean(studio.status?.engine?.mic_muted)});
    });
    if (systemMute) systemMute.addEventListener("click", () => {
      updateAudioMix({system_muted: !Boolean(studio.status?.engine?.system_muted)});
    });
    if (auraMute) auraMute.addEventListener("click", () => {
      updateAudioMix({aura_muted: !Boolean(studio.status?.engine?.desktop_muted)});
    });
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

    $$s("[data-studio-engine]").forEach(button => {
      button.classList.toggle("active", button.dataset.studioEngine === status.backend);
    });

    const outputButton = $s("[data-studio-output-settings]");
    if (outputButton) {
      const configured = Boolean(status.output?.stream_key_configured);
      outputButton.classList.toggle("configured", configured);
      outputButton.textContent = configured ? "⚙ Diffusion · sécurisée" : "⚙ Diffusion";
      outputButton.title = configured
        ? "Destination RTMP configurée et clé protégée localement"
        : "Configurer la destination et la clé de diffusion";
      outputButton.disabled = !native;
    }

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
            ? "Aperçu composite natif actif. Les scènes, sources et positions sont modifiables directement ici."
            : "Cliquez sur Aperçu pour vérifier la capture avant de lancer le direct.")
        : (status.obs?.connected
            ? "Mode de compatibilité OBS actif. Aura continue de piloter OBS avec les mêmes commandes."
            : "OBS est sélectionné mais la connexion WebSocket n’est pas disponible.");
    }
    if (stageStatus) {
      const encoder = status.encoder || status.engine?.encoder || (native ? "Détection en cours" : "Encodeur OBS");
      const capture = status.engine?.capture_backend || "";
      stageStatus.innerHTML = `<i></i><span>${escapeHtml(status.scene || "Aucune scène")} · ${escapeHtml(encoder)}${capture ? " · " + escapeHtml(capture) : ""}</span>`;
    }

    const previewButton = $s('[data-studio-action="preview"]');
    if (previewButton) {
      previewButton.textContent = preview ? "■ Fermer aperçu" : "◉ Aperçu";
      previewButton.classList.toggle("active", preview);
      previewButton.dataset.studioDisabled = native ? "false" : "true";
      previewButton.disabled = studio.busy || !native;
      previewButton.title = native ? "Ouvrir ou fermer l’aperçu natif" : "L’aperçu du mode de compatibilité reste affiché dans OBS";
    }

    const recordButton = $s('[data-studio-action="record"]');
    if (recordButton) {
      recordButton.textContent = recording ? "■ Arrêter REC" : "● Enregistrer";
      recordButton.classList.toggle("active", recording);
    }

    const replayButton = $s('[data-studio-action="replay"]');
    if (replayButton) {
      const buffering = Boolean(status.replay_buffering);
      replayButton.textContent = buffering ? "■ Stop replay" : `↺ Replay ${Number(status.replay_seconds || 30)} s`;
      replayButton.classList.toggle("active", buffering);
      replayButton.dataset.studioDisabled = native ? "false" : "true";
      replayButton.disabled = studio.busy || !native;
    }
    const clipButton = $s('[data-studio-action="clip"]');
    if (clipButton) {
      clipButton.dataset.studioDisabled = native && status.replay_buffering ? "false" : "true";
      clipButton.disabled = studio.busy || !native || !status.replay_buffering;
      clipButton.title = status.last_replay_file
        ? `Dernier clip : ${status.last_replay_file}`
        : "Sauvegarder les dernières secondes du replay buffer";
    }

    const transitionKind = $s("#studio-transition-kind");
    const transitionDuration = $s("#studio-transition-duration");
    const transitionLabel = $s("#studio-transition-duration-label");
    if (transitionKind) transitionKind.value = String(status.transition || "fade");
    if (transitionDuration) transitionDuration.value = String(Number(status.transition_ms || 350));
    if (transitionLabel) transitionLabel.textContent = `${Number(status.transition_ms || 350)} ms`;

    const readiness = renderLiveReadiness(status);
    const liveButton = $s('[data-studio-action="live"]');
    if (liveButton) {
      const needsOutput = native && !streaming && !readiness.outputReady;
      liveButton.textContent = streaming
        ? "■ Couper le direct"
        : (needsOutput ? "⚙ Configurer le live" : "▶ Lancer le live");
      liveButton.classList.toggle("active", streaming);
      liveButton.classList.toggle("needs-setup", needsOutput);
      liveButton.title = needsOutput
        ? "Ajoutez votre destination et votre clé de stream avant de lancer le direct"
        : (readiness.ready ? "Tout est prêt pour lancer le direct" : "Aura vérifiera les éléments manquants au lancement");
    }

    setNativePreview(status);
    renderScenes(status);
    renderSources(status);
    renderAudio(status);
  }

  async function refreshBroadcast(silent = true) {
    if (studio.refreshInFlight) return studio.status;
    studio.refreshInFlight = true;
    try {
      const status = await request("/api/broadcast/status", {timeoutMs: 7000});
      renderBroadcast(status);
      return status;
    } catch (error) {
      if (!silent) notify(error.message, true);
      const health = $s("#studio-broadcast-health span");
      if (health) health.textContent = "Moteur indisponible";
      actionFeedback("Moteur indisponible — réessaie dans quelques secondes.", "error");
      return studio.status;
    } finally {
      studio.refreshInFlight = false;
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
    if (!studio.status || studio.actionLocks.has(kind)) return;

    const now = Date.now();
    if (now - studio.lastActionAt < 350) return;
    studio.lastActionAt = now;

    if (kind === "live" && !studio.status.streaming && !liveReadiness(studio.status).outputReady) {
      openOutputModal();
      actionFeedback("Configure d’abord la destination de diffusion.", "warn");
      return;
    }

    let endpoint = "";
    const starting = {
      live: !studio.status.streaming,
      record: !studio.status.recording,
      preview: !studio.status.preview,
      replay: !studio.status.replay_buffering,
    };
    if (kind === "live") endpoint = studio.status.streaming ? "/api/broadcast/stream/stop" : "/api/broadcast/stream/start";
    if (kind === "record") endpoint = studio.status.recording ? "/api/broadcast/record/stop" : "/api/broadcast/record/start";
    if (kind === "preview") endpoint = studio.status.preview ? "/api/broadcast/preview/stop" : "/api/broadcast/preview/start";
    if (kind === "replay") endpoint = studio.status.replay_buffering ? "/api/broadcast/replay/stop" : "/api/broadcast/replay/start";
    if (kind === "clip") endpoint = "/api/broadcast/replay/save";
    if (!endpoint) return;

    studio.actionLocks.add(kind);
    setActionPending(kind, true);
    setBusy(true);
    const pendingMessages = {
      live: starting.live ? "Démarrage du direct…" : "Arrêt du direct…",
      record: starting.record ? "Démarrage de l’enregistrement…" : "Arrêt de l’enregistrement…",
      preview: starting.preview ? "Ouverture de l’aperçu…" : "Fermeture de l’aperçu…",
      replay: starting.replay ? "Activation du replay…" : "Arrêt du replay…",
      clip: "Sauvegarde du clip…",
    };
    actionFeedback(pendingMessages[kind] || "Commande en cours…", "working");

    try {
      const requestOptions = {method: "POST", timeoutMs: 16000};
      if (kind === "replay" && !studio.status.replay_buffering) {
        requestOptions.body = JSON.stringify({seconds: Number(studio.status.replay_seconds || 30)});
      }
      const result = await request(endpoint, requestOptions);
      renderBroadcast(result);
      const messages = {
        live: result.streaming ? "Direct lancé." : "Direct arrêté.",
        record: result.recording ? "Enregistrement démarré." : "Enregistrement arrêté.",
        preview: result.preview ? "Aperçu actif." : "Aperçu fermé.",
        replay: result.replay_buffering ? "Replay actif." : "Replay arrêté.",
        clip: result.last_replay_file ? "Clip sauvegardé." : "Clip demandé.",
      };
      actionFeedback(messages[kind], "ok");
      notify(messages[kind]);
    } catch (error) {
      actionFeedback(error.message || "La commande a échoué.", "error");
      notify(error.message, true);
      await refreshBroadcast(true);
    } finally {
      studio.actionLocks.delete(kind);
      setActionPending(kind, false);
      setBusy(false);
      if (studio.status) renderBroadcast(studio.status);
    }
  }

  async function selectScene(name) {
    if (!name || studio.busy) return;
    const stage = $s("#studio-stage");
    const fade = studio.status?.backend === "native" && String(studio.status?.transition || "fade") === "fade";
    if (fade) stage?.classList.add("switching");
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
      const duration = Number(studio.status?.transition_ms || 350);
      setTimeout(() => stage?.classList.remove("switching"), Math.max(100, duration + 80));
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

    $$s("[data-source-kind]").forEach(button => button.addEventListener("click", () => {
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

    $$s("[data-studio-source-close]").forEach(button => button.addEventListener("click", closeSourceModal));

    const modal = $s("#studio-source-modal");
    if (modal) modal.addEventListener("click", event => {
      if (event.target === modal) closeSourceModal();
    });
  }

  function bindControls() {
    document.addEventListener("click", event => {
      const sceneManage = event.target.closest("[data-studio-scene-manage]");
      if (sceneManage) {
        openSceneModal("");
        return;
      }
      const sceneEdit = event.target.closest("[data-studio-scene-edit]");
      if (sceneEdit) {
        openSceneModal(String(sceneEdit.dataset.studioSceneEdit || ""));
        return;
      }
      const outputSettings = event.target.closest("[data-studio-output-settings]");
      if (outputSettings) {
        openOutputModal();
        return;
      }
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
    bindSceneControls();
    bindOutputSettings();
    bindAudioMixer();
    refreshBroadcast(false);
    refreshActivity();

    studio.statusTimer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !studio.busy && !studio.refreshInFlight) refreshBroadcast(true);
    }, 3000);
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
