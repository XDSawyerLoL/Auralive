# Quantic Glide Android 1.3.0 beta

Cette application est le client Android officiel bêta de Quantic Glide.

- moteur Web : Android System WebView / Chromium du téléphone ;
- cookies tiers bloqués ;
- géolocalisation refusée ;
- accès fichier local désactivé ;
- mixed content HTTP/HTTPS refusé ;
- Safe Browsing activé lorsque disponible ;
- recherche par défaut : DuckDuckGo ;
- bouton AURA : ouvre l'interface AURA Cloud officielle.

Cette bêta Android n'est pas une recompilation d'Electron et n'annonce pas la parité
fonctionnelle complète avec Glide Windows (Tor/Veil, SideStage et intégration locale
AURA/Quantic Studio restent des fonctions desktop à ce stade).

Le workflow `build-glide-android.yml` génère un APK debug signé installable pour la
distribution bêta directe. Une clé de signature Android de production persistante sera
nécessaire avant diffusion Play Store / canal stable.
