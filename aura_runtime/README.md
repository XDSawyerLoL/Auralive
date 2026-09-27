# AURA Runtime

AURA Runtime est le plan d'exécution local universel d'AURA.

Il n'est pas Quantic Studio. Quantic Studio peut l'héberger comme adaptateur de compatibilité, mais le Runtime peut aussi fonctionner seul.

## Capacités standalone v0.1

- connexion sortante authentifiée vers AURA Cloud;
- heartbeat et inventaire machine;
- leases de jobs et reprise après expiration;
- Compute Mesh déterministe;
- inférence locale via Ollama;
- participation au Mesh si l'utilisateur l'active explicitement.

Les capacités voix, image, opérateur et Evolution sont injectées par des adaptateurs d'hôte. L'adaptateur Quantic Studio les fournit aujourd'hui sans remettre Studio au centre de l'architecture.

## Démarrage

1. Installer Python 3.12+ et Ollama si l'inférence locale est souhaitée.
2. Installer la dépendance:

```bash
pip install -r aura_runtime/requirements.txt
```

3. Configurer les variables de `aura_runtime/.env.example` dans l'environnement.
4. Lancer:

```bash
python -m aura_runtime
```

Le Runtime n'écoute aucun port entrant. Il initie des connexions HTTPS sortantes vers AURA Cloud.

## Invariant

AURA Runtime doit pouvoir vivre sans Quantic Studio. Quantic Studio doit pouvoir utiliser AURA Runtime sans posséder l'identité ou la politique centrale d'AURA.
