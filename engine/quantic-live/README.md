# Aura Native Broadcast — 0.3.0

Moteur de diffusion desktop natif intégré à Aura Live.

## Capacités actuelles

- moteur Rust + egui, utilisé en mode headless par Aura Live ;
- scènes et sources persistantes ;
- compositeur FFmpeg multi-source ;
- capture écran Windows ;
- capture Fenêtre / Jeu via **Windows Graphics Capture (`gfxcapture`)** quand disponible, avec fallback GDI ;
- webcam DirectShow ;
- image, texte et navigateur headless ;
- overlays Aura et Mairaiy ;
- aperçu natif ;
- enregistrement MKV ;
- diffusion RTMP ;
- détection NVIDIA NVENC / AMD AMF / Intel Quick Sync / x264 ;
- édition de scène/source pendant Live/REC avec rebuild contrôlé ;
- mix audio 3 voies : micro + son système WASAPI + Aura/Mairaiy/alertes ;
- aucune obligation de compte ni cloud.

## Distribution Windows

Aura Live embarque :

- `AuraNativeBroadcast.exe` ;
- un FFmpeg Windows vérifié par SHA-256 ;
- le support `gfxcapture` ;
- le backend WASAPI loopback.

Le chemin FFmpeg est fourni automatiquement au moteur par Aura Live. Aucun réglage manuel n’est requis dans le package Windows normal.

## Développement

```powershell
cargo run --release
```

Compilation :

```powershell
./scripts/build-windows.ps1
```

Le binaire se trouve dans :

```text
target\release\quantic-live.exe
```

## Direct RTMP

Aura Native diffuse directement du PC vers l’endpoint RTMP choisi.

La clé de stream doit rester locale. Le stockage historique dans la configuration JSON est en cours de remplacement par le coffre secret local Aura afin qu’elle ne soit plus persistée en clair.

## Audio

En usage intégré, le moteur reçoit trois flux :

1. micro ;
2. son Windows / jeu via WASAPI loopback ;
3. bus Aura pour Mairaiy et les alertes.

Les trois niveaux sont réglables indépendamment depuis Aura Studio.

## Architecture

- **Cerveau / UX** : Aura Live FastAPI + Studio web local
- **Moteur média** : Rust + FFmpeg
- **Capture jeu/fenêtre** : Windows Graphics Capture / `gfxcapture`
- **Capture système audio** : WASAPI loopback
- **Overlays** : Chromium/Edge headless → MJPEG local
- **Contrôle moteur** : fichiers commande/statut locaux
- **Fallback** : OBS, activable manuellement

## Prochain durcissement

- secret RTMP dans le coffre local Aura/Quantic, hors JSON ;
- transitions graphiques ;
- replay buffer / clips ;
- multistream.
