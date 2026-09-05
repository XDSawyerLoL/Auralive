(() => {
  let activeAudio = null;

  async function parseResponse(response) {
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { detail: raw }; }
    if (!response.ok) throw new Error(data.detail || data.message || `Erreur ${response.status}`);
    return data;
  }

  async function runVoiceTest(button) {
    const preview = document.querySelector('.avatar-preview-stage');
    button.disabled = true;
    preview?.classList.add('is-speaking');
    try {
      if (activeAudio) {
        activeAudio.pause();
        activeAudio = null;
      }
      const response = await fetch('/api/avatar/test', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          text: 'Excellente nouvelle : l’explosion a parfaitement éliminé toute l’équipe. Sansa compris, évidemment.'
        }),
      });
      const result = await parseResponse(response);
      if (!result.audio_url) throw new Error('La voix a été générée sans fichier audio lisible.');

      const audio = new Audio(`${result.audio_url}${result.audio_url.includes('?') ? '&' : '?'}test=${Date.now()}`);
      activeAudio = audio;
      audio.preload = 'auto';
      audio.volume = 1;
      const cleanup = () => {
        preview?.classList.remove('is-speaking');
        if (activeAudio === audio) activeAudio = null;
      };
      audio.addEventListener('ended', cleanup, {once:true});
      audio.addEventListener('error', cleanup, {once:true});
      await audio.play();

      if (typeof window.toast === 'function') {
        const engine = result.engine === 'kokoro-local' ? 'Kokoro local' : (result.engine || 'Voix Mairaiy');
        window.toast(`${engine} · ${result.voice || 'Mairaiy'} · ${result.generation_ms || 0} ms`);
      }
    } catch (error) {
      preview?.classList.remove('is-speaking');
      if (typeof window.toast === 'function') window.toast(error.message || String(error), true);
    } finally {
      button.disabled = false;
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest?.('#avatar-test-button');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    runVoiceTest(button);
  }, true);
})();
