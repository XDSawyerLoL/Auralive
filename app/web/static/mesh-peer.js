(() => {
  "use strict";

  const DB_NAME = "aura-peer-mesh";
  const STORE = "identity";
  const KEY = "p256-v1";
  const POLL_MS = 900;
  const HEARTBEAT_MS = 15000;
  const sessions = new Map();

  const state = {
    enabled: false,
    workerId: "",
    peerId: "",
    publicJwk: null,
    privateKey: null,
    publicKey: null,
    gpuAdapter: null,
    capabilities: [],
    resources: {},
    afterId: 0,
    polling: false,
    lastError: "",
    connectedSessions: 0,
  };

  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
    }
    return value;
  }

  function stableStringify(value) {
    return JSON.stringify(stable(value));
  }

  function bytesToBase64Url(bytes) {
    let binary = "";
    const view = new Uint8Array(bytes);
    for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function base64UrlToBytes(value) {
    const padded = String(value || "").replace(/-/g, "+").replace(/_/g, "/")
      + "===".slice((String(value || "").length + 3) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, ch => ch.charCodeAt(0));
  }

  async function sha256Hex(value) {
    const data = new TextEncoder().encode(typeof value === "string" ? value : stableStringify(value));
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
    return [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
  }

  async function api(path, payload = null) {
    const options = payload == null
      ? { method: "GET", cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        };
    const response = await fetch(path, options);
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { detail: text }; }
    if (!response.ok) throw new Error(body.detail || body.error || `HTTP ${response.status}`);
    return body;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB indisponible"));
    });
  }

  async function loadIdentity() {
    const db = await openDb();
    const saved = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    let privateJwk = saved?.privateJwk;
    let publicJwk = saved?.publicJwk;
    if (!privateJwk || !publicJwk) {
      const pair = await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"],
      );
      privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
      publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put({ privateJwk, publicJwk }, KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
    state.privateKey = await crypto.subtle.importKey(
      "jwk",
      privateJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
    state.publicKey = await crypto.subtle.importKey(
      "jwk",
      publicJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    state.publicJwk = publicJwk;
    state.peerId = `peer-${(await sha256Hex(publicJwk)).slice(0, 48)}`;
  }

  async function signEnvelope(envelope) {
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      state.privateKey,
      new TextEncoder().encode(stableStringify(envelope)),
    );
    return bytesToBase64Url(signature);
  }

  async function verifyEnvelope(publicJwk, envelope, signature) {
    try {
      const key = await crypto.subtle.importKey(
        "jwk",
        publicJwk,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      );
      return await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        base64UrlToBytes(signature),
        new TextEncoder().encode(stableStringify(envelope)),
      );
    } catch {
      return false;
    }
  }

  async function detectResources() {
    let adapter = null;
    let adapterLabel = "";
    if (navigator.gpu) {
      try {
        adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
        const info = adapter?.info || {};
        adapterLabel = [info.vendor, info.architecture, info.device, info.description]
          .filter(Boolean).join(" ").slice(0, 480);
      } catch {}
    }
    state.gpuAdapter = adapter;
    state.capabilities = ["webrtc", "cpu-js"];
    if (adapter) state.capabilities.push("webgpu");
    state.resources = {
      hardware_concurrency: Number(navigator.hardwareConcurrency || 0),
      device_memory_gb: Number(navigator.deviceMemory || 0),
      webgpu: Boolean(adapter),
      adapter: adapterLabel,
      platform: String(navigator.userAgentData?.platform || navigator.platform || "").slice(0, 180),
    };
  }

  async function register(type = "heartbeat") {
    const envelope = {
      type,
      peer_id: state.peerId,
      worker_id: state.workerId,
      timestamp: Date.now(),
      nonce: crypto.randomUUID(),
      capabilities: state.capabilities,
      resources: state.resources,
    };
    const signature = await signEnvelope(envelope);
    return api("/api/mesh-peer/register", {
      peer_id: state.peerId,
      public_jwk: state.publicJwk,
      envelope,
      signature,
    });
  }

  async function sendSignal(toPeerId, sessionId, signalType, payload) {
    const envelope = {
      type: "signal",
      session_id: sessionId,
      from_peer_id: state.peerId,
      to_peer_id: toPeerId,
      signal_type: signalType,
      payload,
      timestamp: Date.now(),
      nonce: crypto.randomUUID(),
    };
    return api("/api/mesh-peer/signal", {
      envelope,
      signature: await signEnvelope(envelope),
    });
  }

  function rtcConfig(iceServers) {
    const rows = Array.isArray(iceServers) ? iceServers : [];
    return {
      iceServers: rows
        .map(item => typeof item === "string" ? { urls: item } : item)
        .filter(item => item?.urls),
      bundlePolicy: "max-bundle",
    };
  }

  function waitIceComplete(pc, timeoutMs = 8000) {
    if (pc.iceGatheringState === "complete") return Promise.resolve();
    return new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        pc.removeEventListener("icegatheringstatechange", onChange);
        resolve();
      };
      const onChange = () => {
        if (pc.iceGatheringState === "complete") finish();
      };
      pc.addEventListener("icegatheringstatechange", onChange);
      setTimeout(finish, timeoutMs);
    });
  }

  function boundedVectors(task) {
    const left = Array.from(task?.left || [], Number);
    const right = Array.from(task?.right || [], Number);
    if (!left.length || left.length !== right.length) throw new Error("Vecteurs P2P invalides");
    if (left.length > 262144) throw new Error("Vecteurs P2P trop volumineux");
    if (left.some(v => !Number.isFinite(v)) || right.some(v => !Number.isFinite(v))) {
      throw new Error("Valeur vectorielle non finie");
    }
    return { left, right };
  }

  async function webGpuVector(task) {
    const { left, right } = boundedVectors(task);
    const op = String(task?.op || "").toLowerCase();
    if (!["dot", "vector_add"].includes(op)) throw new Error(`Opération WebGPU interdite: ${op}`);
    if (!state.gpuAdapter) throw new Error("WebGPU indisponible");

    const device = await state.gpuAdapter.requestDevice();
    const a = new Float32Array(left);
    const b = new Float32Array(right);
    const bytes = a.byteLength;
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    const bufferA = device.createBuffer({ size: bytes, usage });
    const bufferB = device.createBuffer({ size: bytes, usage });
    const output = device.createBuffer({
      size: bytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const readback = device.createBuffer({
      size: bytes,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    device.queue.writeBuffer(bufferA, 0, a);
    device.queue.writeBuffer(bufferB, 0, b);

    const expression = op === "dot" ? "a[i] * b[i]" : "a[i] + b[i]";
    const module = device.createShaderModule({
      code: `
        @group(0) @binding(0) var<storage, read> a: array<f32>;
        @group(0) @binding(1) var<storage, read> b: array<f32>;
        @group(0) @binding(2) var<storage, read_write> out: array<f32>;
        @compute @workgroup_size(64)
        fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
          let i = gid.x;
          if (i < arrayLength(&out)) {
            out[i] = ${expression};
          }
        }
      `,
    });
    const pipeline = await device.createComputePipelineAsync({
      layout: "auto",
      compute: { module, entryPoint: "main" },
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: bufferA } },
        { binding: 1, resource: { buffer: bufferB } },
        { binding: 2, resource: { buffer: output } },
      ],
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(a.length / 64));
    pass.end();
    encoder.copyBufferToBuffer(output, 0, readback, 0, bytes);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const values = new Float32Array(readback.getMappedRange().slice(0));
    readback.unmap();

    const value = op === "dot"
      ? Array.from(values).reduce((sum, item) => sum + item, 0)
      : Array.from(values);
    for (const buffer of [bufferA, bufferB, output, readback]) {
      try { buffer.destroy(); } catch {}
    }
    try { device.destroy(); } catch {}
    return {
      op,
      value,
      length: left.length,
      engine: "webgpu",
      deterministic_input: true,
    };
  }

  async function executeTask(task) {
    return webGpuVector(task);
  }

  function attachConnectionLifecycle(sessionId, pc) {
    pc.addEventListener("connectionstatechange", () => {
      if (["failed", "closed"].includes(pc.connectionState)) {
        const current = sessions.get(sessionId);
        if (current?.pc === pc) sessions.delete(sessionId);
      }
    });
  }

  async function handleServerStart(signal) {
    const payload = signal.payload || {};
    const targetPeerId = String(payload.target_peer_id || "");
    if (!targetPeerId || !payload.target_public_jwk) return;
    const pc = new RTCPeerConnection(rtcConfig(payload.ice_servers));
    const channel = pc.createDataChannel("aura-mesh", {
      ordered: true,
      protocol: "aura-mesh-v1",
    });
    const record = {
      role: "initiator",
      pc,
      channel,
      targetPeerId,
      targetPublicJwk: payload.target_public_jwk,
      task: payload.task || {},
    };
    sessions.set(signal.session_id, record);
    attachConnectionLifecycle(signal.session_id, pc);

    channel.addEventListener("open", async () => {
      const taskHash = await sha256Hex(record.task);
      channel.send(JSON.stringify({
        type: "task",
        session_id: signal.session_id,
        task: record.task,
        task_hash: taskHash,
      }));
    });

    channel.addEventListener("message", async event => {
      try {
        const packet = JSON.parse(String(event.data || "{}"));
        const targetEnvelope = packet.envelope || {};
        const valid = await verifyEnvelope(
          record.targetPublicJwk,
          targetEnvelope,
          packet.signature,
        );
        if (!valid) throw new Error("Signature du pair cible invalide");
        if (targetEnvelope.session_id !== signal.session_id || targetEnvelope.type !== "result") {
          throw new Error("Résultat P2P lié à une autre session");
        }
        const completion = {
          type: "complete",
          session_id: signal.session_id,
          peer_id: state.peerId,
          target_packet: packet,
          timestamp: Date.now(),
          nonce: crypto.randomUUID(),
        };
        await api("/api/mesh-peer/complete", {
          envelope: completion,
          signature: await signEnvelope(completion),
        });
        state.connectedSessions += 1;
        try { channel.close(); } catch {}
        try { pc.close(); } catch {}
        sessions.delete(signal.session_id);
      } catch (error) {
        state.lastError = String(error?.message || error);
      }
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitIceComplete(pc);
    await sendSignal(targetPeerId, signal.session_id, "offer", {
      description: pc.localDescription,
    });
  }

  async function handleOffer(signal) {
    const remotePeerId = String(signal.from_peer_id || "");
    if (!remotePeerId) return;
    const pc = new RTCPeerConnection(rtcConfig([{ urls: "stun:stun.cloudflare.com:3478" }]));
    const record = { role: "target", pc, remotePeerId };
    sessions.set(signal.session_id, record);
    attachConnectionLifecycle(signal.session_id, pc);

    pc.addEventListener("datachannel", event => {
      const channel = event.channel;
      record.channel = channel;
      channel.addEventListener("message", async message => {
        try {
          const packet = JSON.parse(String(message.data || "{}"));
          if (packet.type !== "task" || packet.session_id !== signal.session_id) {
            throw new Error("Paquet tâche P2P invalide");
          }
          const taskHash = await sha256Hex(packet.task || {});
          if (taskHash !== packet.task_hash) throw new Error("Empreinte tâche P2P invalide");
          const result = await executeTask(packet.task || {});
          const envelope = {
            type: "result",
            session_id: signal.session_id,
            peer_id: state.peerId,
            task_hash: taskHash,
            result,
            timestamp: Date.now(),
            nonce: crypto.randomUUID(),
          };
          channel.send(JSON.stringify({
            envelope,
            signature: await signEnvelope(envelope),
          }));
        } catch (error) {
          const envelope = {
            type: "result",
            session_id: signal.session_id,
            peer_id: state.peerId,
            task_hash: await sha256Hex(packet?.task || {}),
            result: { ok: false, error: String(error?.message || error).slice(0, 1000) },
            timestamp: Date.now(),
            nonce: crypto.randomUUID(),
          };
          channel.send(JSON.stringify({
            envelope,
            signature: await signEnvelope(envelope),
          }));
        }
      });
    });

    await pc.setRemoteDescription(signal.payload?.description);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitIceComplete(pc);
    await sendSignal(remotePeerId, signal.session_id, "answer", {
      description: pc.localDescription,
    });
  }

  async function handleAnswer(signal) {
    const current = sessions.get(signal.session_id);
    if (!current || current.role !== "initiator") return;
    await current.pc.setRemoteDescription(signal.payload?.description);
  }

  async function processSignal(signal) {
    if (signal.signal_type === "server-start") return handleServerStart(signal);
    if (signal.signal_type === "offer") return handleOffer(signal);
    if (signal.signal_type === "answer") return handleAnswer(signal);
  }

  async function pollLoop() {
    if (state.polling) return;
    state.polling = true;
    while (state.enabled) {
      try {
        const payload = await api("/api/mesh-peer/poll", {
          peer_id: state.peerId,
          after_id: state.afterId,
        });
        for (const signal of payload.signals || []) {
          state.afterId = Math.max(state.afterId, Number(signal.id || 0));
          await processSignal(signal);
        }
        state.lastError = "";
      } catch (error) {
        state.lastError = String(error?.message || error);
      }
      await new Promise(resolve => setTimeout(resolve, POLL_MS));
    }
    state.polling = false;
  }

  async function start() {
    if (!window.crypto?.subtle || !window.RTCPeerConnection || !window.indexedDB) return;
    try {
      const status = await api("/api/mesh-peer/status");
      if (!status.enabled) return;
      state.enabled = true;
      state.workerId = String(status.worker_id || "");
      await loadIdentity();
      await detectResources();
      await register("register");
      pollLoop();
      setInterval(() => {
        if (!state.enabled) return;
        register("heartbeat").catch(error => {
          state.lastError = String(error?.message || error);
        });
      }, HEARTBEAT_MS);
    } catch (error) {
      state.lastError = String(error?.message || error);
      console.warn("AURA Peer Mesh inactif:", state.lastError);
    }
  }

  window.__auraPeerMesh = {
    state,
    start,
    stableStringify,
    sha256Hex,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => start(), { once: true });
  } else {
    start();
  }
})();
