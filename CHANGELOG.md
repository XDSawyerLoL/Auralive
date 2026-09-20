# Quantic Studio 2.7.4 — Integrated Core

- Le moteur de diffusion devient **Quantic Studio Core 0.4.1** et fonctionne en arrière-plan par défaut.
- Suppression de la seconde fenêtre « Aura Live — Native Broadcast » en usage normal.
- Tous les processus FFmpeg sont lancés sans fenêtre console sous Windows.
- Le panneau de stream reste intégré directement à Quantic Studio.
- Installation forcée dans `%LOCALAPPDATA%\\Programs\\Quantic Studio`.
- Migration de l’ancienne installation `Aura Live` et nettoyage du vieux dossier/raccourcis.
- Passage en 2.7.4 pour forcer une vraie mise à niveau des installations 2.7.3 existantes.

# Quantic Studio 2.7.3 — Rebrand

## Identité produit

- Aura Live devient **Quantic Studio**.
- Nouveau symbole distinct de Quantic Sillage : panneaux superposés violet, magenta et or avec lecture centrale.
- Logo intégré dans l'interface Studio et dans l'icône Windows.
- Exécutable renommé en `QuanticStudio.exe`.
- Installateur renommé en `QuanticStudio-Setup-2.7.3.exe`.
- Aura reste l'assistante IA intégrée à Quantic Studio.

# Aura Live 2.7.2 — Windows Product Finish

## Distribution Windows

- Installateur officiel `AuraLive-Setup-2.7.2.exe` basé sur Inno Setup.
- Installation utilisateur sans élévation administrative obligatoire.
- Conservation de `.env` et des données runtime pendant les mises à jour.
- Raccourcis Windows et relance de l'application après mise à niveau.
- ZIP Full/Lite conservés pour l'usage portable.

## Mise à jour intégrée

- Centre de mise à jour dans « Mon compte & services ».
- Vérification de la dernière release GitHub officielle.
- Téléchargement limité à l'installateur correspondant exactement à la version publiée.
- Vérification SHA-256 avant exécution.
- Cache de mise à jour stocké hors du dossier d'installation.

## Signature

- Pipeline Authenticode pour AuraLive.exe, AuraNativeBroadcast.exe et l'installateur.
- Signature activée automatiquement lorsque le certificat PFX est configuré dans les secrets CI.
- Empreintes SHA-256 publiées dans tous les cas.

# Aura Live 2.7.1 — Native Pro Suite

## Diffusion native

- Aura Native Broadcast passe en 0.4.0.
- Gestion complète des scènes depuis Aura Studio : création, renommage, suppression et sélection.
- Transitions Cut / Fondu configurables lors du changement de scène.
- Replay buffer local réglable de 10 à 300 secondes avec sauvegarde instantanée en MKV.
- Multistream jusqu’à trois destinations secondaires via un encodage unique FFmpeg `tee`.
- Clés RTMP secondaires protégées par Windows DPAPI et jamais persistées en clair dans `engine.json`.
- Guidage Live : Aura ouvre directement la configuration de diffusion lorsqu’aucune sortie n’est prête.

## Distribution

- Nouveau build Windows complet `AuraLive-2.7.1-Windows-Native-2026-09-20`.
- Nouveau build Windows Lite `AuraLive-2.7.1-Windows-Native-LITE-2026-09-20`.
- Nouvelle release indépendante `auralive-2.7.1-native`, sans modifier la release stable 2.7.
- README et inventaire fonctionnel alignés sur Aura Native comme moteur par défaut ; OBS reste un mode de compatibilité.

# Aura Live 1.2.0 — Neural Presence

## Conversation IA

- Mémoire de conversation persistante et séparée pour chaque interlocuteur.
- Les questions de suivi comme « pourquoi ? », « quoi d’autre ? » ou « et ? » utilisent les échanges précédents avec la même personne.
- Les annonces de StreamElements, Nightbot et autres bots ne contaminent plus la réponse directe.
- Faits d’identité verrouillés : Sansa/SANSAHD désignent le diffuseur, un homme ; Aura est l’identité, `mairaiy` le compte Twitch.
- Interdiction d’inventer des anecdotes ou des informations personnelles.
- Réponses d’identité et faits sur Sansa sécurisés localement pour empêcher les inventions du modèle.
- Mode de réparation sans moquerie lorsque l’interlocuteur signale une incohérence.
- Suppression forcée des réponses Twitch imbriquées.
- Blocage à deux niveaux de tout message contenant « je réfléchis » ou « analyse en cours ».

## Avatar et voix

- Nouvelle source OBS : `http://localhost:8787/overlay/avatar`.
- Image au repos et image parlante fournies par l’utilisateur.
- Passage automatique à la pose parlante pendant la synthèse vocale.
- Sous-titres, vitesse, hauteur, volume et choix de voix.
- Page dédiée « Avatar & voix » avec aperçu et test.

## Interface

- Nouveau thème Neural Glass homogène entre le tableau de bord et la Power Suite.
- Portrait de Mairaiy intégré au panneau.
- Correction du menu Power Suite qui recevait deux clics et ne pouvait donc pas se replier.
- État réduit de la barre latérale conservé après rechargement.
- Suppression du terme imposé « Riders » au profit de « communauté », « membres » et « habitués ».
