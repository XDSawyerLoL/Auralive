(() => {
  const button = document.querySelector('#mic-button');
  const hint = document.querySelector('#mic-hint');
  const transcript = document.querySelector('#transcript');
  const answer = document.querySelector('#answer');
  const statusNode = document.querySelector('#system-status');
  const sendChat = document.querySelector('#send-chat');
  const handsFree = document.querySelector('#hands-free');
  const micRuntime = document.querySelector('#mic-runtime');
  const visionRuntime = document.querySelector('#vision-runtime');

  let state = 'idle';
  let audioContext = null;
  let stream = null;
  let source = null;
  let processor = null;
  let silentGain = null;
  let chunks = [];
  let preRoll = [];
  let sampleRate = 48000;
  let startedAt = 0;
  let stopTimer = null;
  let maxSeconds = 20;
  let requestSerial = 0;
  let speechFrames = 0;
  let silenceMs = 0;
  let noiseFloor = 0.006;
  let speechThreshold = 0.02;
  let stopQueued = false;
  let autoStartAttempted = false;

  const PRE_ROLL_FRAMES = 8;
  const START_FRAMES = 2;
  const END_SILENCE_MS = 850;
  const MIN_UTTERANCE_MS = 500;

  const setHint = (title, detail = '', error = false) => {
    hint.innerHTML = `<b class="${error ? 'error' : ''}">${title}</b>${detail}`;
  };

  function renderState() {
    button.classList.toggle('listening', state === 'listening');
    button.classList.toggle('recording', state === 'capturing');
    button.classList.toggle('processing', state === 'processing' || state === 'cooldown');
    button.disabled = state === 'processing' || state === 'cooldown';

    if (state === 'listening') button.innerHTML = 'Écoute<br>active';
    else if (state === 'capturing') button.innerHTML = 'Mairaiy<br>t’écoute';
    else if (state === 'processing') button.innerHTML = 'Mairaiy<br>répond';
    else if (state === 'cooldown') button.innerHTML = 'Réponse<br>en cours';
    else button.innerHTML = handsFree.checked ? 'Activer<br>l’écoute' : 'Cliquer<br>pour parler';

    if (state === 'listening') micRuntime.textContent = 'Mains libres · dis « Mairaiy »';
    else if (state === 'capturing') micRuntime.textContent = 'Phrase détectée';
    else if (state === 'processing') micRuntime.textContent = 'Transcription en cours';
    else if (state === 'cooldown') micRuntime.textContent = 'Pause anti-écho';
    else micRuntime.textContent = 'Micro en pause';
  }

  function visionLabel(data) {
    const awareness = data?.live_awareness;
    const vision = awareness?.vision;
    if (!vision) return 'Service non chargé';
    if (vision.active) {
      return `Active · ${vision.captures || 0} captures · ${vision.reactions || 0} réactions`;
    }
    const labels = {
      service_non_demarre: 'service non démarré',
      live_hors_ligne: 'live hors ligne',
      vision_desactivee: 'vision désactivée',
      obs_desactive: 'OBS désactivé',
      gemini_non_configure: 'Gemini non configuré',
    };
    const blockers = (vision.blockers || []).map(item => labels[item] || item);
    return blockers.length ? `En attente · ${blockers.join(', ')}` : 'En attente';
  }

  async function refreshStatus() {
    try {
      const response = await fetch('/api/voice/status', { cache: 'no-store' });
      const data = await response.json();
      maxSeconds = Number(data.max_seconds || 20);
      const visionActive = Boolean(data?.live_awareness?.vision?.active);
      statusNode.textContent = data.configured
        ? (data.avatar_connected
          ? (visionActive ? 'PRÊTE · MICRO + VISION' : 'PRÊTE · MICRO')
          : 'PRÊTE · OUVRE L’AVATAR OBS')
        : 'CONFIGURATION GEMINI MANQUANTE';
      statusNode.style.color = data.configured ? '#a9f7df' : '#ff9ab2';
      visionRuntime.textContent = visionLabel(data);
    } catch {
      statusNode.textContent = 'AURA LIVE INJOIGNABLE';
      statusNode.style.color = '#ff9ab2';
      visionRuntime.textContent = 'Serveur local injoignable';
    }
  }

  function hardwareAlive() {
    const track = stream?.getAudioTracks?.()[0];
    return Boolean(track && track.readyState === 'live' && audioContext && audioContext.state !== 'closed');
  }

  async function disposeHardware() {
    clearTimeout(stopTimer);
    stopTimer = null;
    try { processor?.disconnect(); } catch {}
    try { source?.disconnect(); } catch {}
    try { silentGain?.disconnect(); } catch {}
    stream?.getTracks?.().forEach(track => track.stop());
    try { await audioContext?.close(); } catch {}
    audioContext = stream = source = processor = silentGain = null;
  }

  function frameRms(frame) {
    let sum = 0;
    for (let i = 0; i < frame.length; i += 1) sum += frame[i] * frame[i];
    return Math.sqrt(sum / Math.max(1, frame.length));
  }

  function beginDetectedSpeech() {
    state = 'capturing';
    chunks = preRoll.slice();
    preRoll = [];
    startedAt = Date.now();
    silenceMs = 0;
    stopQueued = false;
    renderState();
    setHint('Je t’écoute', 'Continue ta phrase, elle sera envoyée automatiquement après le silence.');
    clearTimeout(stopTimer);
    stopTimer = setTimeout(() => queueStopRecording(true), Math.max(3, maxSeconds) * 1000);
  }

  function handleAudioFrame(event) {
    const frame = new Float32Array(event.inputBuffer.getChannelData(0));
    const rms = frameRms(frame);
    const frameMs = (frame.length / Math.max(1, sampleRate)) * 1000;

    if (state === 'listening') {
      preRoll.push(frame);
      if (preRoll.length > PRE_ROLL_FRAMES) preRoll.shift();

      if (rms < speechThreshold * 0.75) {
        noiseFloor = (noiseFloor * 0.97) + (rms * 0.03);
      }
      speechThreshold = Math.max(0.014, Math.min(0.08, noiseFloor * 3.4));

      if (rms >= speechThreshold) speechFrames += 1;
      else speechFrames = 0;

      if (speechFrames >= START_FRAMES) {
        speechFrames = 0;
        beginDetectedSpeech();
      }
      return;
    }

    if (state !== 'capturing') return;
    chunks.push(frame);

    if (rms < speechThreshold * 0.72) silenceMs += frameMs;
    else silenceMs = 0;

    const duration = Date.now() - startedAt;
    if (duration >= MIN_UTTERANCE_MS && silenceMs >= END_SILENCE_MS) {
      queueStopRecording(true);
    }
  }

  async function ensureHardware() {
    if (hardwareAlive()) {
      if (audioContext.state === 'suspended') await audioContext.resume();
      return;
    }

    await disposeHardware();
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Ce navigateur ne donne pas accès au microphone.');
    }

    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    });

    audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    await audioContext.resume();
    sampleRate = audioContext.sampleRate;
    source = audioContext.createMediaStreamSource(stream);
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    processor.onaudioprocess = handleAudioFrame;
    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioContext.destination);

    const track = stream.getAudioTracks()[0];
    track.addEventListener('ended', () => {
      state = 'idle';
      renderState();
      setHint('Micro déconnecté', 'Reconnecte le périphérique puis clique une fois pour réactiver.', true);
      disposeHardware();
    }, { once: true });
  }

  async function startHandsFree() {
    if (!handsFree.checked || ['processing', 'cooldown', 'capturing'].includes(state)) return;
    try {
      await ensureHardware();
      chunks = [];
      preRoll = [];
      speechFrames = 0;
      silenceMs = 0;
      state = 'listening';
      renderState();
      setHint('Écoute mains libres active', 'Dis « Mairaiy » puis ta phrase. Aucun bouton à maintenir.');
    } catch (error) {
      state = 'idle';
      renderState();
      setHint('Autorisation du micro nécessaire', error.message || 'Clique une fois puis autorise le microphone.', true);
    }
  }

  function pauseListening(message = '') {
    clearTimeout(stopTimer);
    stopTimer = null;
    chunks = [];
    preRoll = [];
    speechFrames = 0;
    silenceMs = 0;
    state = 'idle';
    renderState();
    if (message) setHint('Écoute en pause', message);
  }

  async function startManualRecording() {
    if (state !== 'idle') return;
    try {
      await ensureHardware();
      chunks = [];
      preRoll = [];
      startedAt = Date.now();
      state = 'capturing';
      renderState();
      setHint('Je t’écoute', 'Clique de nouveau pour envoyer ta phrase.');
      stopTimer = setTimeout(() => queueStopRecording(false), Math.max(3, maxSeconds) * 1000);
    } catch (error) {
      state = 'idle';
      renderState();
      setHint('Micro inaccessible', error.message || 'Autorise le microphone dans le navigateur.', true);
    }
  }

  function queueStopRecording(requireWakeWord) {
    if (stopQueued || state !== 'capturing') return;
    stopQueued = true;
    queueMicrotask(() => stopRecording(requireWakeWord));
  }

  async function stopRecording(requireWakeWord) {
    if (state !== 'capturing') return;
    clearTimeout(stopTimer);
    stopTimer = null;
    const duration = Date.now() - startedAt;
    stopQueued = false;

    if (duration < 350 || !chunks.length) {
      if (handsFree.checked) await startHandsFree();
      else pauseListening();
      setHint('Phrase trop courte', 'Parle un peu plus longtemps.', true);
      return;
    }

    state = 'processing';
    renderState();
    setHint('Transcription et réponse en cours', requireWakeWord
      ? 'Elle répond uniquement si la phrase contient « Mairaiy ».'
      : 'La phrase est envoyée à Mairaiy.');

    const serial = ++requestSerial;
    const wav = encodeWav(chunks, sampleRate);
    chunks = [];
    preRoll = [];

    try {
      const payload = {
        audio_base64: arrayBufferToBase64(wav),
        mime_type: requireWakeWord ? 'audio/wav; mode=handsfree' : 'audio/wav',
        send_to_chat: sendChat.checked,
      };
      const response = await fetch('/api/voice/talk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const raw = await response.text();
      let data = {};
      try { data = JSON.parse(raw); } catch { data = { detail: raw }; }
      if (!response.ok) throw new Error(data.detail || 'Dialogue vocal impossible');
      if (serial !== requestSerial) return;

      transcript.textContent = data.transcript || '—';
      answer.textContent = data.answer || '—';

      if (data.ignored) {
        setHint('Écoute active', 'Phrase ignorée : appelle-la par « Mairaiy ».');
        state = 'cooldown';
        renderState();
        setTimeout(() => startHandsFree(), Math.max(350, Number(data.rearm_after_ms || 500)));
        return;
      }

      setHint('Réponse envoyée', `${data.latency_ms || 0} ms${data.sent_to_chat ? ' · publiée dans Twitch' : ''}`);
      state = 'cooldown';
      renderState();
      const rearm = Math.max(900, Number(data.rearm_after_ms || 1600));
      setTimeout(() => {
        if (handsFree.checked) startHandsFree();
        else pauseListening('Clique quand tu veux lui reparler.');
      }, rearm);
      await refreshStatus();
    } catch (error) {
      state = 'idle';
      renderState();
      setHint('Mairaiy n’a pas pu répondre', error.message || String(error), true);
      if (handsFree.checked) setTimeout(() => startHandsFree(), 900);
    }
  }

  function encodeWav(parts, rate) {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const buffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(buffer);
    const write = (offset, text) => {
      for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
    };
    write(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, 'data');
    view.setUint32(40, length * 2, true);
    let offset = 44;
    for (const part of parts) {
      for (let i = 0; i < part.length; i += 1) {
        const value = Math.max(-1, Math.min(1, part[i]));
        view.setInt16(offset, value < 0 ? value * 32768 : value * 32767, true);
        offset += 2;
      }
    }
    return buffer;
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      binary += String.fromCharCode(...bytes.subarray(i, i + step));
    }
    return btoa(binary);
  }

  async function recoverWithoutReload() {
    if (audioContext?.state === 'suspended') {
      try { await audioContext.resume(); } catch {}
    }
    if (handsFree.checked && !['processing', 'cooldown', 'capturing'].includes(state)) {
      await startHandsFree();
    }
    refreshStatus();
  }

  async function autoStart() {
    if (autoStartAttempted || !handsFree.checked) return;
    autoStartAttempted = true;
    try {
      if (navigator.permissions?.query) {
        const permission = await navigator.permissions.query({ name: 'microphone' });
        if (permission.state === 'denied') {
          setHint('Micro bloqué', 'Autorise le microphone dans les paramètres du navigateur.', true);
          return;
        }
      }
    } catch {}
    await startHandsFree();
  }

  button.addEventListener('click', event => {
    event.preventDefault();
    if (handsFree.checked) {
      if (state === 'listening') pauseListening('Clique de nouveau pour reprendre.');
      else if (state === 'idle') startHandsFree();
      return;
    }
    if (state === 'idle') startManualRecording();
    else if (state === 'capturing') queueStopRecording(false);
  });

  handsFree.addEventListener('change', () => {
    if (handsFree.checked) {
      startHandsFree();
    } else {
      pauseListening('Mode manuel : un clic démarre, un second envoie.');
    }
  });

  window.addEventListener('pageshow', recoverWithoutReload);
  window.addEventListener('focus', recoverWithoutReload);
  window.addEventListener('online', recoverWithoutReload);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') recoverWithoutReload();
  });
  navigator.mediaDevices?.addEventListener?.('devicechange', async () => {
    await disposeHardware();
    state = 'idle';
    renderState();
    if (handsFree.checked) startHandsFree();
  });
  window.addEventListener('beforeunload', () => disposeHardware());

  renderState();
  refreshStatus();
  autoStart();
  setInterval(refreshStatus, 10000);
})();
