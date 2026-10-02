# Déploiement Hostinger — AURA V9.3 Cloud First

## Source canonique
- Branche GitHub : `hostinger/aura-cloud`
- Release attendue : `AURA-HOSTINGER-V9.3-CLOUD-FIRST`
- Politique d'exécution : `cloud-first-local-optional`
- Autorité de parole finale : `AURA native cognition`

## Réglages Hostinger attendus
- Runtime : Node.js 22.x
- Entry point : `server.js`
- Build : `npm run build`
- Start : `npm start`
- Output directory : vide
- Ne pas utiliser une ancienne archive AURA ni une autre branche GitHub.

## Vérification après déploiement
Les trois endpoints publics doivent exposer l'objet `release` :
- `/healthz`
- `/api/kernel/architecture`
- `/api/capabilities`

Ils doivent contenir :
```json
{
  "id": "AURA-HOSTINGER-V9.3-CLOUD-FIRST",
  "generation": "v9.3",
  "channel": "hostinger/aura-cloud",
  "execution_policy": "cloud-first-local-optional",
  "final_language_authority": "AURA native cognition"
}
```

La question `Quelles sont tes trois priorités actuelles ?` ne doit plus déclencher une recherche Web générique. Une relance `alors ?` dans la même session doit conserver ce fil.
