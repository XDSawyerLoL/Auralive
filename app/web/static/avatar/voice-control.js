(() => {
  const button = document.querySelector('#mic-button');
  const hint = document.querySelector('#mic-hint');
  const transcript = document.querySelector('#transcript');
  const answer = document.querySelector('#answer');
  const statusNode = document.querySelector('#system-status');
  const sendChat = document.querySelector('#send-chat');

  let state = 'idle';
  let audioContext = null;
  let stream = null;
  let source = null;
  let processor = null;
  let silentGain = null;
  let chunks = [];
  let sampleRate = 48000;
  let startedAt = 0;
  let stopTimer = null;
  let maxSeconds = 20;
  let requestSerial = 0;

  const setHint = (title, detail = '', error = false) => {
    hint.innerHTML = `<b class="${error ? 'error' : ''}">${title}</b>${detail}`;
  };

  function renderState() {
    button.classList.toggle('recording', state === 'recording');
    button.classList.toggle('processing', state === 'processing');
    button.disabled = state === 'processing';
    if (state === 'recording') button.innerHTML = 'Cliquer<br>pour envoyer';
    else if (state === 'processing') button.innerHTML = 'Mairaiy<br>réfléchit';
    else button.innerHTML = 'Cliquer<br>pour parler';
  }

  async function refreshStatus() {
    try {
      const response = await fetch('/api/voice/status', { cache: 'no-store' });
      const data = await response.json();
      maxSeconds = Number(data.max_seconds || 20);
      statusNode.textContent = data.configured
        ? (data.avatar_connected ? 'PRÊTE · AVATAR CONNECTÉ' : 'PRÊTE · OUVRE L’AVATAR OBS')
        : 'CONFIGURATION GEMINI MANQUANTE';
      statusNode.style.color = data.configured ? '#a9f7df' : '#ff9ab2';
    } catch {
      statusNode.textContent = 'AURA LIVE INJOIGNABLE';
      statusNode.style.color = '#ff9ab2';
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
    processor.onaudioprocess = event => {
      if (state === 'recording') {
        chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      }
    };
    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioContext.destination);
    const track = stream.getAudioTracks()[0];
    track.addEventListener('ended', () => {
      if (state === 'recording') cancelRecording('Le microphone a été déconnecté.');
      disposeHardware();
    }, { once: true });
  }

  async function startRecording() {
    if (state !== 'idle') return;
    try {
      await ensureHardware();
      chunks = [];
      startedAt = Date.now();
      state = 'recording';
      renderState();
      setHint('Je t’écoute', 'Clique de nouveau pour envoyer ta phrase.');
      stopTimer = setTimeout(() => stopRecording(), Math.max(3, maxSeconds) * 1000);
    } catch (error) {
      state = 'idle';
      renderState();
      setHint('Micro inaccessible', error.message || 'Autorise le microphone dans le navigateur.', true);
    }
  }

  function cancelRecording(message = '') {
    clearTimeout(stopTimer);
    stopTimer = null;
    chunks = [];
    state = 'idle';
    renderState();
    if (message) setHint('Micro réinitialisé', message, true);
  }

  async function stopRecording() {
    if (state !== 'recording') return;
    clearTimeout(stopTimer);
    stopTimer = null;
    const duration = Date.now() - startedAt;
    if (duration < 350 || !chunks.length) {
      cancelRecording();
      setHint('Phrase trop courte', 'Parle un peu plus longtemps avant le second clic.', true);
      return;
    }

    state = 'processing';
    renderState();
    setHint('Transcription et réponse en cours', 'Le micro reste prêt et se réarmera automatiquement.');
    const serial = ++requestSerial;
    try {
      const wav = encodeWav(chunks, sampleRate);
      const payload = {
        audio_base64: arrayBufferToBase64(wav),
        mime_type: 'audio/wav',
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
      setHint('Prête pour la phrase suivante', `${data.latency_ms || 0} ms${data.sent_to_chat ? ' · publiée dans Twitch' : ''}`);
      await refreshStatus();
    } catch (error) {
      setHint('Mairaiy n’a pas pu répondre', error.message || String(error), true);
    } finally {
      chunks = [];
      state = 'idle';
      renderState();
      try {
        if (audioContext?.state === 'suspended') await audioContext.resume();
      } catch {}
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
    if (state === 'recording' && document.visibilityState === 'hidden') {
      cancelRecording('La page a perdu le focus avant l’envoi.');
    }
    if (state !== 'processing' && !hardwareAlive()) {
      await disposeHardware();
      state = 'idle';
      renderState();
    } else if (audioContext?.state === 'suspended') {
      try { await audioContext.resume(); } catch {}
    }
    refreshStatus();
  }

  button.addEventListener('click', event => {
    event.preventDefault();
    if (state === 'idle') startRecording();
    else if (state === 'recording') stopRecording();
  });
  window.addEventListener('keydown', event => {
    if (event.code === 'Space' && !event.repeat && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      event.preventDefault();
      startRecording();
    }
  });
  window.addEventListener('keyup', event => {
    if (event.code === 'Space' && state === 'recording') {
      event.preventDefault();
      stopRecording();
    }
  });
  window.addEventListener('pageshow', recoverWithoutReload);
  window.addEventListener('focus', recoverWithoutReload);
  window.addEventListener('online', recoverWithoutReload);
  document.addEventListener('visibilitychange', recoverWithoutReload);
  navigator.mediaDevices?.addEventListener?.('devicechange', recoverWithoutReload);
  window.addEventListener('beforeunload', () => disposeHardware());

  renderState();
  refreshStatus();
  setInterval(refreshStatus, 10000);
})();
