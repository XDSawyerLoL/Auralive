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
