# Aura Native Broadcast — V0.1

Studio de streaming desktop natif pour l'écosystème Aura Live.

## Ce qui fonctionne dans cette V0.1

- interface native Rust + egui, sans Electron ;
- scènes et sources persistantes ;
- aperçu réel du bureau Windows via FFmpeg ;
- enregistrement local MKV ;
- diffusion RTMP (Twitch, YouTube, Kick ou serveur personnalisé) ;
- détection automatique NVIDIA NVENC / AMD AMF / Intel Quick Sync / x264 ;
- choix résolution, FPS et bitrate ;
- entrée micro DirectShow facultative ;
- configuration locale `quantic-live.json` ;
- aucune obligation de compte ni cloud.

> La V0.1 encode réellement la source **Écran**. Les sources Fenêtre, Jeu, Webcam, Image, Texte et Navigateur sont déjà présentes dans le modèle UI mais seront raccordées au moteur de composition dans la V0.2.

## Prérequis Windows

1. Installer Rust stable avec `rustup`.
2. Installer une build FFmpeg Windows avec `gdigrab`, `dshow` et l'encodeur matériel voulu.
3. Mettre `ffmpeg.exe` dans le PATH, ou indiquer son chemin dans **Réglages > Système**.

## Lancer en développement

```powershell
cargo run --release
```

## Construire l'EXE

```powershell
./scripts/build-windows.ps1
```

Le binaire se trouvera dans :

```text
target\release\quantic-live.exe
```

## Direct RTMP

Dans **Réglages > Direct RTMP**, renseigner l'URL RTMP du service et la clé de stream privée.

La clé est stockée localement dans `quantic-live.json` dans cette V0.1. Une V0.2 devra la déplacer vers Windows Credential Manager / Quantic Identity Vault.

## Audio

Si le champ périphérique audio est vide, Aura Native Broadcast crée une piste silencieuse afin de garder un flux RTMP standard.
Pour le micro, indiquer le nom DirectShow exact du périphérique.

```powershell
ffmpeg -list_devices true -f dshow -i dummy
```

## Architecture cible

- **UI** : Rust + egui/eframe
- **V0.1 media** : FFmpeg en processus isolé
- **V0.2** : moteur de composition multi-source, capture fenêtre/jeu/webcam et vrai mix audio
- **V0.3** : capture native Windows Graphics Capture / DXGI + WASAPI
- **V0.4** : replay buffer, clips, hotkeys, transitions, overlays et chat
- **V0.5** : Quantic Pulse / Quantic Identity / multistream

## Sécurité

Aucun secret n'est envoyé à Aura Live. Le streaming va directement du PC vers l'endpoint RTMP choisi.
