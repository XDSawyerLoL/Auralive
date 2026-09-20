(() => {
  const current = document.getElementById("update-current-version");
  const latest = document.getElementById("update-latest-version");
  const state = document.getElementById("update-state");
  const checkButton = document.getElementById("update-check");
  const installButton = document.getElementById("update-install");

  if (!current || !latest || !state || !checkButton || !installButton) return;

  function setBusy(busy) {
    checkButton.disabled = busy;
    installButton.disabled = busy || installButton.dataset.available !== "true";
  }

  function render(payload) {
    current.textContent = payload.current_version || "2.7.4";
    latest.textContent = payload.latest_version || "—";
    const available = Boolean(payload.update_available && payload.installer_available);
    installButton.dataset.available = available ? "true" : "false";
    installButton.disabled = !available;

    if (payload.update_available && !payload.installer_available) {
      state.textContent = "Nouvelle version détectée, mais l’installateur officiel n’est pas encore publié.";
      state.dataset.kind = "warn";
    } else if (available) {
      state.textContent = `Mise à jour ${payload.latest_version} disponible et vérifiable.`;
      state.dataset.kind = "ready";
      installButton.textContent = `Installer ${payload.latest_version}`;
    } else if (payload.checked || payload.latest_version) {
      state.textContent = "Quantic Studio est à jour.";
      state.dataset.kind = "ok";
    } else {
      state.textContent = "Vérification non effectuée.";
      state.dataset.kind = "idle";
    }
  }

  async function call(path) {
    const response = await fetch(path, {method: "POST", headers: {"Accept": "application/json"}});
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || `Erreur HTTP ${response.status}`);
    return payload;
  }

  async function loadStatus() {
    try {
      const response = await fetch("/api/update/status", {headers: {"Accept": "application/json"}});
      if (response.ok) render(await response.json());
    } catch (_) {}
  }

  checkButton.addEventListener("click", async () => {
    setBusy(true);
    state.textContent = "Vérification de la release officielle…";
    state.dataset.kind = "working";
    try {
      render(await call("/api/update/check"));
    } catch (error) {
      state.textContent = error.message || "Vérification impossible.";
      state.dataset.kind = "error";
    } finally {
      setBusy(false);
    }
  });

  installButton.addEventListener("click", async () => {
    if (installButton.dataset.available !== "true") return;
    setBusy(true);
    state.textContent = "Téléchargement et vérification SHA-256 de la mise à jour…";
    state.dataset.kind = "working";
    try {
      const payload = await call("/api/update/install");
      if (payload.up_to_date) {
        render(payload);
        return;
      }
      state.textContent = payload.message || "Installateur lancé. Quantic Studio va être mis à jour.";
      state.dataset.kind = "ready";
    } catch (error) {
      state.textContent = error.message || "Installation impossible.";
      state.dataset.kind = "error";
    } finally {
      setBusy(false);
    }
  });

  async function autoCheck() {
    const key = "quantic-studio-update-last-check";
    const interval = 12 * 60 * 60 * 1000;
    const last = Number(window.localStorage?.getItem(key) || 0);
    if (Date.now() - last < interval) return;
    try {
      render(await call("/api/update/check"));
      window.localStorage?.setItem(key, String(Date.now()));
    } catch (_) {
      // La vérification automatique ne doit jamais gêner le démarrage du Studio.
    }
  }

  loadStatus().finally(autoCheck);
})();