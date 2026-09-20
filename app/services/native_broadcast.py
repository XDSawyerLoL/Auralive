from __future__ import annotations

import base64
from array import array
import audioop
import ctypes
import importlib.util
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.request
from pathlib import Path
from typing import Any

from websockets.sync.client import connect as websocket_connect

from app.config import BASE_DIR, RUNTIME_DIR, Settings


class _BrowserSourceRenderer:
    def __init__(
        self,
        source_id: int,
        target_url: str,
        browser_executable: Path,
        frame_sink,
    ):
        self.source_id = int(source_id)
        self.target_url = target_url
        self.browser_executable = browser_executable
        self.frame_sink = frame_sink
        self.profile_dir = Path(tempfile.mkdtemp(prefix=f"AuraNativeBrowser-{self.source_id}-"))
        self.process: subprocess.Popen[bytes] | None = None
        self.stop_event = threading.Event()
        self.thread = threading.Thread(
            target=self._run,
            name=f"AuraBrowserSource-{self.source_id}",
            daemon=True,
        )

    def start(self) -> None:
        self.thread.start()

    def stop(self) -> None:
        self.stop_event.set()
        process = self.process
        if process is not None and process.poll() is None:
            try:
                process.terminate()
                process.wait(timeout=2)
            except Exception:
                try:
                    process.kill()
                except Exception:
                    pass
        if self.thread.is_alive():
            self.thread.join(timeout=2)
        shutil.rmtree(self.profile_dir, ignore_errors=True)

    def _run(self) -> None:
        args = [
            str(self.browser_executable),
            "--headless=new",
            f"--user-data-dir={self.profile_dir}",
            "--remote-debugging-address=127.0.0.1",
            "--remote-debugging-port=0",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-background-networking",
            "--disable-sync",
            "--disable-extensions",
            "--disable-notifications",
            "--hide-scrollbars",
            "--mute-audio",
            "--autoplay-policy=no-user-gesture-required",
            "--window-size=1280,720",
            self.target_url,
        ]
        creationflags = int(getattr(subprocess, "CREATE_NO_WINDOW", 0))
        try:
            self.process = subprocess.Popen(
                args,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=creationflags,
            )
            port = self._wait_for_debug_port()
            if port is None:
                return
            ws_url = self._page_websocket_url(port)
            if not ws_url:
                return
            with websocket_connect(ws_url, open_timeout=4, close_timeout=1, max_size=8_000_000) as socket:
                command_id = 0

                def command(method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
                    nonlocal command_id
                    command_id += 1
                    wanted = command_id
                    socket.send(json.dumps({"id": wanted, "method": method, "params": params or {}}))
                    while not self.stop_event.is_set():
                        message = json.loads(socket.recv(timeout=3))
                        if int(message.get("id") or 0) == wanted:
                            return message
                    return {}

                command("Page.enable")
                command(
                    "Emulation.setDeviceMetricsOverride",
                    {"width": 1280, "height": 720, "deviceScaleFactor": 1, "mobile": False},
                )
                command(
                    "Emulation.setDefaultBackgroundColorOverride",
                    {"color": {"r": 0, "g": 255, "b": 0, "a": 1}},
                )
                time.sleep(0.45)
                command(
                    "Runtime.evaluate",
                    {
                        "expression": (
                            "document.documentElement.style.background='#00ff00';"
                            "if(document.body){document.body.style.background='#00ff00';"
                            "document.body.style.margin='0';}"
                        ),
                        "awaitPromise": False,
                    },
                )

                while not self.stop_event.wait(0.10):
                    try:
                        response = command(
                            "Page.captureScreenshot",
                            {
                                "format": "jpeg",
                                "quality": 82,
                                "fromSurface": True,
                                "captureBeyondViewport": False,
                            },
                        )
                        data = ((response.get("result") or {}).get("data") or "")
                        if data:
                            self.frame_sink(self.source_id, base64.b64decode(data))
                    except Exception:
                        if self.stop_event.wait(0.25):
                            break
        except Exception:
            return
        finally:
            process = self.process
            if process is not None and process.poll() is None:
                try:
                    process.terminate()
                except Exception:
                    pass

    def _wait_for_debug_port(self) -> int | None:
        marker = self.profile_dir / "DevToolsActivePort"
        deadline = time.monotonic() + 8.0
        while time.monotonic() < deadline and not self.stop_event.is_set():
            try:
                lines = marker.read_text(encoding="utf-8", errors="ignore").splitlines()
                port = int(lines[0].strip())
                if 0 < port < 65536:
                    return port
            except (OSError, ValueError, IndexError):
                pass
            if self.process is not None and self.process.poll() is not None:
                return None
            time.sleep(0.08)
        return None

    @staticmethod
    def _page_websocket_url(port: int) -> str:
        deadline = time.monotonic() + 5.0
        url = f"http://127.0.0.1:{port}/json/list"
        while time.monotonic() < deadline:
            try:
                with urllib.request.urlopen(url, timeout=1) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                for target in payload:
                    if target.get("type") == "page" and target.get("webSocketDebuggerUrl"):
                        return str(target["webSocketDebuggerUrl"])
            except Exception:
                pass
            time.sleep(0.08)
        return ""


class NativeBroadcastService:
    """Local controller for Aura Live's Rust broadcast engine.

    Communication deliberately stays on the local filesystem. No socket is
    exposed and no stream key is returned through diagnostics.
    """

    def __init__(self, settings: Settings):
        self.settings = settings
        self.runtime_dir = RUNTIME_DIR / "data" / "native_broadcast"
        self.command_path = self.runtime_dir / "command.json"
        self.status_path = self.runtime_dir / "status.json"
        self.config_path = self.runtime_dir / "engine.json"
        self.preview_path = self.runtime_dir / "preview.jpg"
        self.stream_key_path = self.runtime_dir / "stream-key.dpapi"
        self.stream_destinations_path = self.runtime_dir / "stream-destinations.dpapi"
        self._process: subprocess.Popen[bytes] | None = None
        self._owns_process = False
        self._lock = threading.RLock()
        self._command_id = int(time.time() * 1000)
        self._browser_lock = threading.RLock()
        self._browser_renderers: dict[int, _BrowserSourceRenderer] = {}
        self._browser_frames: dict[int, bytes] = {}
        self._browser_targets: dict[int, str] = {}
        self._audio_lock = threading.RLock()
        self._audio_tracks: list[dict[str, Any]] = []
        self._audio_decode_threads: set[threading.Thread] = set()
        self._audio_last_pull = 0.0
        self._audio_cached_slot: tuple[int, int] | None = None
        self._audio_cached_chunk = b""
        self._system_audio_buffer = bytearray()
        self._system_cached_slot: tuple[int, int] | None = None
        self._system_cached_chunk = b""
        self._system_audio_thread: threading.Thread | None = None
        self._system_audio_stop = threading.Event()
        self._system_audio_last_pull = 0.0
        self._system_audio_ready = False
        self._system_audio_device = ""
        self._system_audio_error = ""
        self._migrate_legacy_stream_key()

    def stream_secret_configured(self) -> bool:
        env_secret = str(os.environ.get("AURA_NATIVE_STREAM_KEY") or "").strip()
        return bool(env_secret or self.stream_key_path.is_file())

    def stream_secret(self) -> str:
        env_secret = str(os.environ.get("AURA_NATIVE_STREAM_KEY") or "").strip()
        if env_secret:
            return env_secret
        if os.name != "nt" or not self.stream_key_path.is_file():
            return ""
        try:
            encrypted = self.stream_key_path.read_bytes()
            return self._dpapi_unprotect(encrypted).decode("utf-8").strip()
        except Exception:
            return ""

    def set_stream_secret(self, secret: str) -> None:
        secret = str(secret or "").strip()
        if not secret:
            raise ValueError("La clé de stream est vide")
        if os.name != "nt":
            raise RuntimeError("Le coffre RTMP chiffré est disponible sous Windows")
        encrypted = self._dpapi_protect(secret.encode("utf-8"))
        self.runtime_dir.mkdir(parents=True, exist_ok=True)
        temporary = self.stream_key_path.with_suffix(".tmp")
        temporary.write_bytes(encrypted)
        os.replace(temporary, self.stream_key_path)

    def clear_stream_secret(self) -> None:
        self.stream_key_path.unlink(missing_ok=True)

    def _stream_destinations_private(self) -> list[dict[str, Any]]:
        if os.name != "nt" or not self.stream_destinations_path.is_file():
            return []
        try:
            decrypted = self._dpapi_unprotect(self.stream_destinations_path.read_bytes()).decode("utf-8")
            rows = json.loads(decrypted)
            return [dict(row) for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []
        except Exception:
            return []

    def stream_destinations_public(self) -> list[dict[str, Any]]:
        return [
            {
                "id": str(row.get("id") or ""),
                "label": str(row.get("label") or "Destination"),
                "rtmp_url": str(row.get("rtmp_url") or ""),
                "enabled": bool(row.get("enabled", True)),
                "stream_key_configured": bool(str(row.get("stream_key") or "").strip()),
            }
            for row in self._stream_destinations_private()
        ]

    def configure_stream_destinations(self, rows: list[dict[str, Any]] | None) -> None:
        if rows is None:
            return
        if os.name != "nt":
            raise RuntimeError("Le coffre multistream chiffré est disponible sous Windows")
        if len(rows) > 3:
            raise ValueError("Aura Live accepte jusqu’à 3 destinations secondaires")

        existing = {
            str(row.get("id") or ""): row
            for row in self._stream_destinations_private()
            if str(row.get("id") or "")
        }
        clean: list[dict[str, Any]] = []
        for index, row in enumerate(rows):
            if not isinstance(row, dict):
                continue
            destination_id = re.sub(r"[^a-zA-Z0-9_-]", "", str(row.get("id") or f"dest-{index + 1}"))[:40]
            if not destination_id:
                destination_id = f"dest-{index + 1}"
            label = " ".join(str(row.get("label") or f"Destination {index + 1}").split()).strip()[:80]
            rtmp_url = str(row.get("rtmp_url") or "").strip()
            enabled = bool(row.get("enabled", True))
            if not (rtmp_url.startswith("rtmp://") or rtmp_url.startswith("rtmps://")):
                raise ValueError(f"URL RTMP invalide pour {label}")
            raw_key = row.get("stream_key")
            previous = existing.get(destination_id) or {}
            stream_key = (
                str(raw_key).strip()
                if raw_key is not None and str(raw_key).strip()
                else str(previous.get("stream_key") or "").strip()
            )
            if bool(row.get("clear_stream_key", False)):
                stream_key = ""
            if enabled and not stream_key:
                raise ValueError(f"Clé de stream manquante pour {label}")
            clean.append(
                {
                    "id": destination_id,
                    "label": label or f"Destination {index + 1}",
                    "rtmp_url": rtmp_url,
                    "stream_key": stream_key,
                    "enabled": enabled,
                }
            )

        if not clean:
            self.stream_destinations_path.unlink(missing_ok=True)
            return
        encrypted = self._dpapi_protect(json.dumps(clean, ensure_ascii=False).encode("utf-8"))
        self.runtime_dir.mkdir(parents=True, exist_ok=True)
        temporary = self.stream_destinations_path.with_suffix(".tmp")
        temporary.write_bytes(encrypted)
        os.replace(temporary, self.stream_destinations_path)

    def _stream_destination_targets(self) -> list[str]:
        targets: list[str] = []
        for row in self._stream_destinations_private():
            if not bool(row.get("enabled", True)):
                continue
            url = str(row.get("rtmp_url") or "").strip()
            key = str(row.get("stream_key") or "").strip()
            if url and key:
                targets.append(f"{url.rstrip('/')}/{key.lstrip('/')}")
        return targets

    def output_configuration(self) -> dict[str, Any]:
        rtmp_url = "rtmp://live.twitch.tv/app"
        try:
            payload = json.loads(self.config_path.read_text(encoding="utf-8"))
            settings = payload.get("settings") if isinstance(payload, dict) else None
            if isinstance(settings, dict):
                value = str(settings.get("rtmp_url") or "").strip()
                if value:
                    rtmp_url = value
        except Exception:
            pass
        return {
            "rtmp_url": rtmp_url,
            "stream_key_configured": self.stream_secret_configured(),
            "destinations": self.stream_destinations_public(),
            "multistream_enabled": any(row.get("enabled") for row in self.stream_destinations_public()),
            "vault": "windows-dpapi" if os.name == "nt" else "environment-only",
        }

    def configure_output(
        self,
        rtmp_url: str,
        stream_key: str | None = None,
        *,
        clear_stream_key: bool = False,
        destinations: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        rtmp_url = str(rtmp_url or "").strip()
        if not (rtmp_url.startswith("rtmp://") or rtmp_url.startswith("rtmps://")):
            raise ValueError("L'URL de diffusion doit commencer par rtmp:// ou rtmps://")

        if clear_stream_key:
            self.clear_stream_secret()
        elif stream_key is not None and str(stream_key).strip():
            self.set_stream_secret(str(stream_key))
        self.configure_stream_destinations(destinations)

        # On first use, start the native engine once so it creates a complete
        # secret-free configuration. Never create a partial ProjectState JSON.
        if not self.config_path.is_file():
            started = self.start()
            if not started.get("process_running"):
                raise RuntimeError("Impossible de démarrer Aura Native pour initialiser la sortie")
            deadline = time.monotonic() + 3.0
            while time.monotonic() < deadline and not self.config_path.is_file():
                time.sleep(0.05)

        was_running = self.process_running()
        if was_running:
            self.stop()

        config: dict[str, Any] = {}
        try:
            loaded = json.loads(self.config_path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                config = loaded
        except Exception as exc:
            if was_running:
                self.start()
            raise RuntimeError("Configuration Aura Native illisible") from exc

        settings = config.get("settings")
        if not isinstance(settings, dict):
            if was_running:
                self.start()
            raise RuntimeError("Configuration Aura Native incomplète")
        settings["rtmp_url"] = rtmp_url
        # Never persist the stream key in the engine JSON.
        settings["stream_key"] = ""
        self._atomic_json(self.config_path, config)

        if was_running:
            self.start()
        return self.output_configuration()

    def _migrate_legacy_stream_key(self) -> None:
        if os.name != "nt" or not self.config_path.is_file():
            return
        try:
            payload = json.loads(self.config_path.read_text(encoding="utf-8"))
            if not isinstance(payload, dict):
                return
            settings = payload.get("settings")
            if not isinstance(settings, dict):
                return
            legacy = str(settings.get("stream_key") or "").strip()
            if not legacy:
                return
            self.set_stream_secret(legacy)
            settings["stream_key"] = ""
            self._atomic_json(self.config_path, payload)
        except Exception:
            return

    @staticmethod
    def _dpapi_protect(data: bytes) -> bytes:
        if os.name != "nt":
            raise RuntimeError("DPAPI indisponible")

        from ctypes import wintypes

        class DATA_BLOB(ctypes.Structure):
            _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]

        def blob(payload: bytes):
            buffer = ctypes.create_string_buffer(payload)
            return DATA_BLOB(len(payload), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte))), buffer

        input_blob, input_buffer = blob(data)
        entropy_blob, entropy_buffer = blob(b"AuraNativeBroadcast:stream-key:v1")
        output_blob = DATA_BLOB()
        crypt32 = ctypes.WinDLL("Crypt32.dll")
        kernel32 = ctypes.WinDLL("Kernel32.dll")

        ok = crypt32.CryptProtectData(
            ctypes.byref(input_blob),
            ctypes.c_wchar_p("Aura Native RTMP"),
            ctypes.byref(entropy_blob),
            None,
            None,
            0x1,
            ctypes.byref(output_blob),
        )
        _ = (input_buffer, entropy_buffer)
        if not ok:
            raise ctypes.WinError()
        try:
            return ctypes.string_at(output_blob.pbData, output_blob.cbData)
        finally:
            kernel32.LocalFree(ctypes.cast(output_blob.pbData, ctypes.c_void_p))

    @staticmethod
    def _dpapi_unprotect(data: bytes) -> bytes:
        if os.name != "nt":
            raise RuntimeError("DPAPI indisponible")

        from ctypes import wintypes

        class DATA_BLOB(ctypes.Structure):
            _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]

        def blob(payload: bytes):
            buffer = ctypes.create_string_buffer(payload)
            return DATA_BLOB(len(payload), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte))), buffer

        input_blob, input_buffer = blob(data)
        entropy_blob, entropy_buffer = blob(b"AuraNativeBroadcast:stream-key:v1")
        output_blob = DATA_BLOB()
        crypt32 = ctypes.WinDLL("Crypt32.dll")
        kernel32 = ctypes.WinDLL("Kernel32.dll")

        ok = crypt32.CryptUnprotectData(
            ctypes.byref(input_blob),
            None,
            ctypes.byref(entropy_blob),
            None,
            None,
            0x1,
            ctypes.byref(output_blob),
        )
        _ = (input_buffer, entropy_buffer)
        if not ok:
            raise ctypes.WinError()
        try:
            return ctypes.string_at(output_blob.pbData, output_blob.cbData)
        finally:
            kernel32.LocalFree(ctypes.cast(output_blob.pbData, ctypes.c_void_p))

    def ffmpeg_executable(self) -> str:
        bundled = RUNTIME_DIR / "ffmpeg" / "ffmpeg.exe"
        if bundled.is_file():
            return str(bundled)

        try:
            config = json.loads(self.config_path.read_text(encoding="utf-8"))
            configured = str((config.get("settings") or {}).get("ffmpeg_path") or "").strip()
            if configured:
                return configured
        except Exception:
            pass

        return "ffmpeg"

    def audio_bus_active(self) -> bool:
        return time.monotonic() - self._audio_last_pull <= 2.0

    def system_audio_chunk(self, byte_count: int = 19200) -> bytes:
        now = time.monotonic()
        self._system_audio_last_pull = now
        self._ensure_system_audio_capture()

        byte_count = max(4, int(byte_count))
        byte_count -= byte_count % 4
        slot = (int(now * 10), byte_count)

        with self._audio_lock:
            if self._system_cached_slot == slot:
                return self._system_cached_chunk

            available = min(byte_count, len(self._system_audio_buffer))
            available -= available % 4
            chunk = bytes(self._system_audio_buffer[:available])
            if available:
                del self._system_audio_buffer[:available]
            if len(chunk) < byte_count:
                chunk += b"\x00" * (byte_count - len(chunk))

            self._system_cached_slot = slot
            self._system_cached_chunk = chunk
            return chunk

    def system_audio_status(self) -> dict[str, Any]:
        thread = self._system_audio_thread
        return {
            "backend": "WASAPI / PyAudioWPatch",
            "backend_present": importlib.util.find_spec("pyaudiowpatch") is not None,
            "available": self._system_audio_ready,
            "running": bool(thread is not None and thread.is_alive()),
            "device": self._system_audio_device,
            "error": self._system_audio_error,
        }

    def _ensure_system_audio_capture(self) -> None:
        if os.name != "nt":
            self._system_audio_error = "WASAPI loopback est disponible uniquement sous Windows"
            return
        thread = self._system_audio_thread
        if thread is not None and thread.is_alive():
            return

        self._system_audio_stop.clear()
        self._system_audio_thread = threading.Thread(
            target=self._system_audio_capture_loop,
            name="AuraSystemAudioLoopback",
            daemon=True,
        )
        self._system_audio_thread.start()

    def _system_audio_capture_loop(self) -> None:
        self._system_audio_ready = False
        self._system_audio_error = ""
        self._system_audio_device = ""
        try:
            import pyaudiowpatch as pyaudio

            with pyaudio.PyAudio() as audio:
                device = audio.get_default_wasapi_loopback()
                device_index = int(device["index"])
                input_rate = int(float(device.get("defaultSampleRate") or 48000))
                channels = 2 if int(device.get("maxInputChannels") or 0) >= 2 else 1
                self._system_audio_device = str(device.get("name") or "Sortie Windows")
                rate_state = None

                def callback(in_data, frame_count, time_info, status_flags):
                    nonlocal rate_state
                    if self._system_audio_stop.is_set():
                        return (in_data, pyaudio.paComplete)
                    try:
                        payload = bytes(in_data or b"")
                        if input_rate != 48000 and payload:
                            payload, rate_state = audioop.ratecv(
                                payload,
                                2,
                                channels,
                                input_rate,
                                48000,
                                rate_state,
                            )
                        if channels == 1 and payload:
                            payload = audioop.tostereo(payload, 2, 1.0, 1.0)
                        if payload:
                            with self._audio_lock:
                                self._system_audio_buffer.extend(payload)
                                max_bytes = 48000 * 2 * 2 * 4
                                if len(self._system_audio_buffer) > max_bytes:
                                    del self._system_audio_buffer[:-max_bytes]
                    except Exception:
                        pass
                    return (in_data, pyaudio.paContinue)

                with audio.open(
                    format=pyaudio.paInt16,
                    channels=channels,
                    rate=input_rate,
                    frames_per_buffer=1024,
                    input=True,
                    input_device_index=device_index,
                    stream_callback=callback,
                ) as stream:
                    self._system_audio_ready = True
                    while (
                        not self._system_audio_stop.wait(0.20)
                        and time.monotonic() - self._system_audio_last_pull <= 3.0
                    ):
                        if not stream.is_active():
                            break
        except Exception as exc:
            self._system_audio_error = str(exc or exc.__class__.__name__)[:240]
        finally:
            self._system_audio_ready = False
            self._system_audio_thread = None

    def _stop_system_audio_capture(self) -> None:
        self._system_audio_stop.set()
        thread = self._system_audio_thread
        if thread is not None and thread.is_alive():
            thread.join(timeout=2)
        self._system_audio_thread = None
        self._system_audio_ready = False
        with self._audio_lock:
            self._system_audio_buffer.clear()
            self._system_cached_slot = None
            self._system_cached_chunk = b""

    def enqueue_overlay_audio(self, event: dict[str, Any]) -> None:
        if not isinstance(event, dict):
            return
        if not self.audio_bus_active():
            return

        volume = max(0.0, min(2.0, float(event.get("volume", 1.0) or 1.0)))
        targets: list[str] = []
        for key in ("audio_url", "sound_path"):
            target = str(event.get(key) or "").strip()
            if target and target not in targets:
                targets.append(target)

        for target in targets:
            thread = threading.Thread(
                target=self._decode_audio_track,
                args=(target, volume),
                name="AuraNativeAudioDecode",
                daemon=True,
            )
            with self._audio_lock:
                self._audio_decode_threads.add(thread)
            thread.start()

    def native_audio_chunk(self, byte_count: int = 19200) -> bytes:
        now = time.monotonic()
        self._audio_last_pull = now
        byte_count = max(4, int(byte_count))
        byte_count -= byte_count % 4
        slot = (int(now * 10), byte_count)

        with self._audio_lock:
            if self._audio_cached_slot == slot:
                return self._audio_cached_chunk

            sample_count = byte_count // 2
            mixed = array("h", [0]) * sample_count
            active: list[dict[str, Any]] = []
            for track in self._audio_tracks:
                data = track.get("data", b"")
                offset = int(track.get("offset", 0))
                segment = data[offset : offset + byte_count]
                if segment:
                    samples = array("h")
                    samples.frombytes(segment[: len(segment) - (len(segment) % 2)])
                    for index, sample in enumerate(samples):
                        if index >= sample_count:
                            break
                        value = mixed[index] + sample
                        mixed[index] = max(-32768, min(32767, value))
                    track["offset"] = offset + len(segment)

                if int(track.get("offset", 0)) < len(data):
                    active.append(track)

            self._audio_tracks = active
            chunk = mixed.tobytes()
            self._audio_cached_slot = slot
            self._audio_cached_chunk = chunk
            return chunk

    def _decode_audio_track(self, target: str, volume: float) -> None:
        resolved = self._resolve_audio_target(target)
        if not resolved:
            return

        creationflags = int(getattr(subprocess, "CREATE_NO_WINDOW", 0))
        try:
            command = [
                self.ffmpeg_executable(),
                "-nostdin",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                resolved,
                "-vn",
                "-af",
                f"volume={volume:.3f}",
                "-f",
                "s16le",
                "-acodec",
                "pcm_s16le",
                "-ar",
                "48000",
                "-ac",
                "2",
                "pipe:1",
            ]
            result = subprocess.run(
                command,
                capture_output=True,
                timeout=45,
                creationflags=creationflags,
            )
            pcm = bytes(result.stdout or b"")
            if result.returncode != 0 or not pcm:
                return

            # Keep at most roughly two minutes per clip to protect memory.
            pcm = pcm[: 48000 * 2 * 2 * 120]
            with self._audio_lock:
                self._audio_tracks.append({"data": pcm, "offset": 0})
                if len(self._audio_tracks) > 16:
                    self._audio_tracks = self._audio_tracks[-16:]
        except Exception:
            return
        finally:
            current = threading.current_thread()
            with self._audio_lock:
                self._audio_decode_threads.discard(current)

    def _resolve_audio_target(self, target: str) -> str:
        target = str(target or "").strip()
        if not target:
            return ""
        if target.startswith("/"):
            return self.local_base_url() + target
        return target

    def local_base_url(self) -> str:
        host = str(getattr(self.settings, "host", "127.0.0.1") or "127.0.0.1").strip()
        if host in {"0.0.0.0", "::", "[::]", "localhost"}:
            host = "127.0.0.1"
        port = int(getattr(self.settings, "port", 18787) or 18787)
        return f"http://{host}:{port}"

    def discover_sources(self) -> dict[str, list[str]]:
        return {
            "windows": self._discover_windows(),
            "webcams": self._discover_webcams(),
        }

    def pick_image(self) -> str:
        if os.name != "nt":
            return ""
        script = (
            "Add-Type -AssemblyName System.Windows.Forms;"
            "$d=New-Object System.Windows.Forms.OpenFileDialog;"
            "$d.Filter='Images|*.png;*.jpg;*.jpeg;*.webp;*.bmp|Tous les fichiers|*.*';"
            "$d.Multiselect=$false;"
            "if($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){$d.FileName}"
        )
        creationflags = int(getattr(subprocess, "CREATE_NO_WINDOW", 0))
        try:
            result = subprocess.run(
                ["powershell.exe", "-NoProfile", "-STA", "-Command", script],
                capture_output=True,
                text=True,
                timeout=45,
                creationflags=creationflags,
            )
            path = str(result.stdout or "").strip()
            return path if path and Path(path).is_file() else ""
        except Exception:
            return ""

    def _discover_windows(self) -> list[str]:
        if os.name != "nt":
            return []
        script = (
            "Get-Process | Where-Object {$_.MainWindowTitle -and $_.MainWindowTitle.Trim()} | "
            "ForEach-Object {$_.MainWindowTitle.Trim()} | Sort-Object -Unique | ConvertTo-Json -Compress"
        )
        creationflags = int(getattr(subprocess, "CREATE_NO_WINDOW", 0))
        try:
            result = subprocess.run(
                ["powershell.exe", "-NoProfile", "-Command", script],
                capture_output=True,
                text=True,
                timeout=6,
                creationflags=creationflags,
            )
            payload = str(result.stdout or "").strip()
            if not payload:
                return []
            decoded = json.loads(payload)
            values = decoded if isinstance(decoded, list) else [decoded]
            return [
                str(value)
                for value in values
                if str(value).strip() and "Aura Live" not in str(value)
            ][:100]
        except Exception:
            return []

    def _discover_webcams(self) -> list[str]:
        ffmpeg_path = self.ffmpeg_executable()

        creationflags = int(getattr(subprocess, "CREATE_NO_WINDOW", 0))
        try:
            result = subprocess.run(
                [
                    ffmpeg_path,
                    "-hide_banner",
                    "-list_devices",
                    "true",
                    "-f",
                    "dshow",
                    "-i",
                    "dummy",
                ],
                capture_output=True,
                text=True,
                timeout=8,
                creationflags=creationflags,
            )
            text = str(result.stderr or "")
        except Exception:
            return []

        devices: list[str] = []
        in_video = False
        for line in text.splitlines():
            if "DirectShow video devices" in line:
                in_video = True
                continue
            if "DirectShow audio devices" in line:
                break
            if not in_video or "Alternative name" in line:
                continue
            match = re.search(r'"([^"]+)"', line)
            if match:
                name = match.group(1).strip()
                if name and name not in devices:
                    devices.append(name)
        return devices[:50]

    def browser_frame(self, source_id: int) -> bytes | None:
        with self._browser_lock:
            frame = self._browser_frames.get(int(source_id))
            return bytes(frame) if frame else None

    def _set_browser_frame(self, source_id: int, frame: bytes) -> None:
        if not frame.startswith(b"\xff\xd8") or not frame.endswith(b"\xff\xd9"):
            return
        with self._browser_lock:
            self._browser_frames[int(source_id)] = frame

    def _browser_executable(self) -> Path | None:
        candidates: list[Path] = []
        for executable in ("msedge.exe", "chrome.exe"):
            resolved = shutil.which(executable)
            if resolved:
                candidates.append(Path(resolved))

        env_paths = [
            (os.environ.get("PROGRAMFILES(X86)"), "Microsoft/Edge/Application/msedge.exe"),
            (os.environ.get("PROGRAMFILES"), "Microsoft/Edge/Application/msedge.exe"),
            (os.environ.get("LOCALAPPDATA"), "Microsoft/Edge/Application/msedge.exe"),
            (os.environ.get("PROGRAMFILES"), "Google/Chrome/Application/chrome.exe"),
            (os.environ.get("PROGRAMFILES(X86)"), "Google/Chrome/Application/chrome.exe"),
            (os.environ.get("LOCALAPPDATA"), "Google/Chrome/Application/chrome.exe"),
        ]
        for base, relative in env_paths:
            if base:
                candidates.append(Path(base) / relative)

        seen: set[str] = set()
        for candidate in candidates:
            key = str(candidate).casefold()
            if key not in seen and candidate.is_file():
                seen.add(key)
                return candidate
        return None

    def _browser_target_url(self, target: str) -> str:
        target = str(target or "").strip()
        if target.startswith("/"):
            return self.local_base_url() + target
        if target.startswith("http://") or target.startswith("https://"):
            return target
        return self.local_base_url() + "/overlay/avatar"

    def _sync_browser_sources(self, engine_status: dict[str, Any]) -> None:
        sources = list(engine_status.get("sources") or [])
        desired: dict[int, str] = {}
        for source in sources:
            if str(source.get("kind") or "") != "Navigateur" or not bool(source.get("visible", True)):
                continue
            source_id = int(source.get("id") or 0)
            if source_id <= 0:
                continue
            desired[source_id] = self._browser_target_url(str(source.get("target") or "/overlay/avatar"))

        to_stop: list[_BrowserSourceRenderer] = []
        to_start: list[_BrowserSourceRenderer] = []
        browser = self._browser_executable()

        with self._browser_lock:
            stale = [
                source_id
                for source_id in self._browser_renderers
                if source_id not in desired or self._browser_targets.get(source_id) != desired.get(source_id)
            ]
            for source_id in stale:
                renderer = self._browser_renderers.pop(source_id, None)
                self._browser_targets.pop(source_id, None)
                self._browser_frames.pop(source_id, None)
                if renderer is not None:
                    to_stop.append(renderer)

            if browser is not None:
                for source_id, target in desired.items():
                    if source_id in self._browser_renderers:
                        continue
                    renderer = _BrowserSourceRenderer(
                        source_id,
                        target,
                        browser,
                        self._set_browser_frame,
                    )
                    self._browser_renderers[source_id] = renderer
                    self._browser_targets[source_id] = target
                    to_start.append(renderer)

        for renderer in to_stop:
            renderer.stop()
        for renderer in to_start:
            renderer.start()

    def _stop_browser_sources(self) -> None:
        with self._browser_lock:
            renderers = list(self._browser_renderers.values())
            self._browser_renderers.clear()
            self._browser_targets.clear()
            self._browser_frames.clear()
        for renderer in renderers:
            renderer.stop()

    @property
    def selected(self) -> bool:
        return str(getattr(self.settings, "broadcast_engine", "obs") or "obs").lower() == "native"

    def executable(self) -> Path | None:
        configured = str(getattr(self.settings, "native_engine_exe", "") or "").strip()
        candidates: list[Path] = []
        if configured:
            configured_path = Path(configured)
            candidates.append(configured_path if configured_path.is_absolute() else RUNTIME_DIR / configured_path)

        candidates.extend(
            [
                RUNTIME_DIR / "AuraNativeBroadcast.exe",
                RUNTIME_DIR / "Quantic-Live.exe",
                BASE_DIR / "engine" / "quantic-live" / "target" / "release" / "quantic-live.exe",
                BASE_DIR / "engine" / "quantic-live" / "target" / "debug" / "quantic-live.exe",
            ]
        )

        seen: set[str] = set()
        for candidate in candidates:
            key = str(candidate.resolve(strict=False)).casefold()
            if key in seen:
                continue
            seen.add(key)
            if candidate.is_file():
                return candidate
        return None

    def process_running(self) -> bool:
        return self._process is not None and self._process.poll() is None

    def start(self) -> dict[str, Any]:
        with self._lock:
            if self.process_running():
                return self.status()

            executable = self.executable()
            if executable is None:
                return {
                    **self.status(),
                    "ok": False,
                    "error": "native_engine_missing",
                    "message": "Le moteur Aura Native Broadcast n'est pas encore compilé ou installé.",
                }

            self.runtime_dir.mkdir(parents=True, exist_ok=True)
            # Never let a restarted engine consume a stale command or report a
            # stale responsive status from the previous process.
            self.command_path.unlink(missing_ok=True)
            self.status_path.unlink(missing_ok=True)
            env = os.environ.copy()
            env["AURA_NATIVE_CONTROL_FILE"] = str(self.command_path)
            env["AURA_NATIVE_STATUS_FILE"] = str(self.status_path)
            env["AURA_NATIVE_CONFIG_FILE"] = str(self.config_path)
            env["AURA_NATIVE_PREVIEW_FILE"] = str(self.preview_path)
            env["AURA_NATIVE_HEADLESS"] = "1"
            env["AURA_LOCAL_BASE_URL"] = self.local_base_url()
            env["AURA_NATIVE_FFMPEG"] = self.ffmpeg_executable()
            stream_secret = self.stream_secret()
            if stream_secret:
                env["AURA_NATIVE_STREAM_KEY"] = stream_secret
            else:
                env.pop("AURA_NATIVE_STREAM_KEY", None)
            destinations = self._stream_destination_targets()
            if destinations:
                env["AURA_NATIVE_STREAM_DESTINATIONS"] = json.dumps(destinations, ensure_ascii=False)
            else:
                env.pop("AURA_NATIVE_STREAM_DESTINATIONS", None)

            creationflags = int(getattr(subprocess, "CREATE_NO_WINDOW", 0))
            self._process = subprocess.Popen(
                [str(executable)],
                cwd=str(RUNTIME_DIR),
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=creationflags,
            )
            self._owns_process = True

        deadline = time.monotonic() + 3.0
        while time.monotonic() < deadline:
            if self._read_status().get("ok"):
                break
            if not self.process_running():
                break
            time.sleep(0.05)
        return self.status()

    def stop(self) -> dict[str, Any]:
        with self._lock:
            process = self._process
            if process is not None and process.poll() is None and self._owns_process:
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=2)
            self._process = None
            self._owns_process = False

        self._stop_browser_sources()
        self._stop_system_audio_capture()
        return self.status()

    def close(self) -> None:
        self.stop()

    def command(self, action: str, value: str | None = None, *, auto_start: bool = True) -> dict[str, Any]:
        allowed = {
            "stream.start",
            "stream.stop",
            "record.start",
            "record.stop",
            "preview.start",
            "preview.stop",
            "replay.start",
            "replay.stop",
            "replay.save",
            "scene.select",
            "scene.create",
            "scene.rename",
            "scene.remove",
            "transition.update",
            "runtime.refresh",
            "source.transform",
            "source.visibility",
            "source.add",
            "source.configure",
            "source.remove",
            "audio.update",
        }
        if action not in allowed:
            raise ValueError(f"Commande native inconnue: {action}")

        if auto_start and not self.process_running():
            started = self.start()
            if not started.get("process_running"):
                return started

        with self._lock:
            self.runtime_dir.mkdir(parents=True, exist_ok=True)
            self._command_id += 1
            payload: dict[str, Any] = {"id": self._command_id, "action": action}
            if value is not None:
                payload["value"] = value
            self._atomic_json(self.command_path, payload)
            command_id = self._command_id

        reload_actions = {
            "scene.select",
            "scene.create",
            "scene.remove",
            "replay.save",
            "source.transform",
            "source.visibility",
            "source.add",
            "source.configure",
            "source.remove",
            "audio.update",
        }
        deadline = time.monotonic() + (12.0 if action in reload_actions else 2.0)
        while time.monotonic() < deadline:
            status = self._read_status()
            if int(status.get("last_command_id") or 0) >= command_id:
                return self.status()
            if not self.process_running():
                break
            time.sleep(0.04)
        return self.status()

    def status(self) -> dict[str, Any]:
        engine_status = self._read_status()
        executable = self.executable()
        process_running = self.process_running()
        if process_running:
            self._sync_browser_sources(engine_status)
        status_age = self._status_age_seconds()
        responsive = bool(engine_status.get("ok")) and status_age is not None and status_age < 3.0

        return {
            "ok": True,
            "mode": str(getattr(self.settings, "broadcast_engine", "obs") or "obs").lower(),
            "selected": self.selected,
            "engine_available": executable is not None,
            "process_running": process_running,
            "responsive": responsive,
            "executable": str(executable) if executable else "",
            "status_age_seconds": round(status_age, 3) if status_age is not None else None,
            "engine": engine_status,
            "obs_fallback_enabled": bool(getattr(self.settings, "obs_enabled", False)),
            "preview_frame_available": self.preview_path.is_file(),
            "audio_tracks_active": len(self._audio_tracks),
            "system_audio": self.system_audio_status(),
            "output": self.output_configuration(),
        }

    def _read_status(self) -> dict[str, Any]:
        try:
            payload = json.loads(self.status_path.read_text(encoding="utf-8"))
            return payload if isinstance(payload, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}

    def _status_age_seconds(self) -> float | None:
        try:
            return max(0.0, time.time() - self.status_path.stat().st_mtime)
        except OSError:
            return None

    @staticmethod
    def _atomic_json(path: Path, payload: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        os.replace(temporary, path)
