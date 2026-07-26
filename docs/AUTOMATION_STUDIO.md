# Aura Live 2.0 — Automation Studio

## Objectif

Construire un moteur local natif plus cohérent qu’un assemblage de bots : Twitch, OBS, IA, médias, économie, modération et système réunis dans une seule architecture.

## Contrat d’une automatisation

Une automatisation contient :

1. un déclencheur ;
2. zéro ou plusieurs conditions ;
3. une ou plusieurs actions ;
4. un mode d’exécution séquentiel ou parallèle ;
5. une priorité ;
6. une file optionnelle ;
7. une politique d’échec ;
8. un historique d’exécution.

## Portées de variables

- `local` : durée d’une exécution ;
- `viewer` : persistante pour un utilisateur ;
- `global` : persistante pour Aura Live ;
- `session` : prévue pour la durée d’un live ;
- `secret` : prévue pour les valeurs chiffrées non exportables.

## Familles natives à intégrer

### Déclencheurs

- Twitch EventSub et chat ;
- OBS WebSocket ;
- cycle du live ;
- horaires et minuteries ;
- fichiers et dossiers ;
- clavier, MIDI et voix ;
- HTTP, WebSocket et UDP locaux ;
- événements Mairaiy ;
- économie, boutique, jeux et modération.

### Actions

- Twitch ;
- OBS ;
- avatar, TTS, audio et médias ;
- Mairaiy et mémoire ;
- variables et contrôle de flux ;
- fichiers, processus et réseau ;
- économie communautaire ;
- journalisation, notifications et sécurité.

## Exigences non négociables

- simulation sans effet réel ;
- journal par bloc ;
- reprise après erreur ;
- annulation ;
- sauvegarde versionnée ;
- secrets exclus des exports ;
- permissions explicites pour les actions système ;
- mode urgence ;
- aucun pont obligatoire avec un logiciel tiers.

## État du noyau

Le premier noyau versionné prend déjà en charge :

- registre extensible d’actions et de conditions ;
- événements typés ;
- automatisations prioritaires ;
- conditions inversables ;
- actions séquentielles ou parallèles ;
- files d’exécution verrouillées ;
- délais d’expiration ;
- variables locales, viewer et globales ;
- simulation sans mutation ;
- rapport détaillé par étape.
