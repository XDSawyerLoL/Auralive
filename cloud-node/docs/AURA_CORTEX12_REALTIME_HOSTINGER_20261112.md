# AURA CORTEX 12 — architecture réactive et autonomie Hostinger

**Cible :** temps réel observable, sans faux neurones ni animation décorative. PR de travail, non déployée.

## Trois fréquences distinctes

| Couche | Intervalle demandé | Fait réellement |
|---|---|---|
| Micro-réflexes | 1 ms | Vérifie l'arrivée de stimuli externes, l'état d'un cycle en cours et la pression CPU ; déclenche si admissible un véritable traitement. Sans nouvelle information, il ne crée ni pensée ni nouvelle trace. |
| Calcul cognitif complet | 5 s par défaut | Homéostasie, compétition de l'espace de travail, attention, journal causal, mémoire et auto-vérification selon budget, avec persistance MySQL. |
| Capteurs Node | 200 ms | Mesure CPU/heap/process sans requête navigateur. |
| Transport de mesures | SSE toutes les 250 ms au plus | Affiche les observations mesurées, les Hz réellement atteints et les nouveaux cycles persistés. |
| Relance indépendante Hostinger | Cron planifié | Rappelle un endpoint **authentifié** lorsque le site est suspendu ou redémarré. Ce n'est pas un substitut à une machine toujours allumée. |

Le minuteur Node n'est **pas** un vrai temps réel matériel : une cible de 1 ms peut se traduire par 250, 500 ou 900 vérifications/s selon la charge. L'interface montre le Hz mesuré, la latence réelle et le nombre de cycles cognitifs achevés, sans confondre ces indicateurs.

## Mise en place sur Hostinger Web/Cloud, sans VPS

Hostinger ne garantit pas les workers permanents. Depuis le 8 octobre 2026, ses **Cron Jobs pour sites Node.js** permettent de relancer un script planifié.

1. Installer le ZIP AURA Cloud canonical Node (fichiers `src/`, `scripts/`, `package.json`, etc.) dans l'application Node Hostinger ; conserver la base MySQL et les variables d'environnement.
2. Vérifier `AURA_PUBLIC_BASE_URL=https://votre-domaine` et un `AURA_CLOUD_TOKEN` long et secret, côté serveur uniquement.
3. Dans Hostinger, ouvrir le site Node.js → Avancé → Cron Jobs, puis programmer la commande Node correspondant à votre version et à vos chemins `hbuilds`, par exemple :
   ```sh
   /opt/alt/alt-nodejs22/root/bin/node --env-file=/home/UTILISATEUR/domains/DOMAINE/hbuilds/config/.env /home/UTILISATEUR/domains/DOMAINE/hbuilds/current/nodejs/scripts/cron-continuity.mjs
   ```
   Adapter le compte, le domaine et le numéro de version Node ; les chemins sont des **exemples**, pas les chemins identifiés de votre hébergement.
4. Utiliser la fréquence Cron la plus rapprochée permise par votre plan (généralement la minute), pas 1 ms. Hostinger exécute les Cron selon UTC ; chaque tâche doit terminer en moins de 30 minutes.
5. Contrôler les journaux Cron, le statut `/api/kernel/status`, le flux `/api/brain/live` et la base MySQL, avec le navigateur fermé au moins 30 minutes.

La commande utilise `--env-file` pour lire le jeton en local et le transmet dans un en-tête Bearer. **Ne pas mettre de jeton dans l'URL, la page Web ni le dépôt GitHub.**

## Limites importantes

- Les timers millisecondes ne fonctionnent que lorsque le processus Node est effectivement en cours d'exécution.
- Le Cron garantit seulement des relances *planifiées* si elles sont correctement configurées, et aucun travail n'est prétendu avoir eu lieu pendant une suspension.
- Le flux SSE peut être mis en tampon ou interrompu par le proxy ; le tableau conserve un repli par requêtes classiques.
- Aucune opération lourde (SQL, recherche Web, LLM) n'est déclenchée 1 000 fois/s : ce serait inefficace et potentiellement bloquant sur hébergement partagé.
- La variation des constantes est **mesurée**, pas générée au hasard ; une valeur stable peut rester stable.
- Les vrais résultats de mission restent soumis à leurs reçus d'exécution. Micro-contrôle et activité réelle ne prouvent ni pensée consciente ni expérience subjective.
