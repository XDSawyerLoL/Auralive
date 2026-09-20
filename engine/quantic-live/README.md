# Aura Native Broadcast — 0.4.0

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
- diffusion RTMP et **multistream** (jusqu’à 3 destinations secondaires) ;
- **replay buffer** configurable et sauvegarde instantanée de clips ;
- transitions **Cut / Fondu** configurables ;
- création, renommage et suppression de scènes depuis Aura Studio ;
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

La clé principale et les clés multistream restent locales et ne sont jamais persistées dans `engine.json`. Aura Live les protège avec Windows DPAPI dans `data/native_broadcast/`, lié au profil Windows local, puis les injecte au moteur uniquement au lancement. Une ancienne clé trouvée en clair est migrée automatiquement puis effacée du JSON.

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

## Native 0.4

- Cut ou fondu configurable lors du changement de scène ;
- replay buffer de 10 à 300 secondes, segmenté localement ;
- sauvegarde d’un replay en MKV sans interrompre le direct ;
- multistream via un seul encodage FFmpeg et le muxer `tee` ;
- destinations secondaires chiffrées par DPAPI ;
- gestion complète des scènes depuis le Studio.
