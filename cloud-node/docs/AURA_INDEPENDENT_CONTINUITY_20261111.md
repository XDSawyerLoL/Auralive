# AURA — continuité hors dialogue et identité ancrée

Date : 11 novembre 2026. Branche expérimentale empilée sur la PR #234. **Pas de déploiement Hostinger.**

## Problème reproduit
L'utilisateur demande « Qui etes vous? » et reçoit un monologue expliquant AURA comme « noyau computationnel persistant ». D'autres chemins de code savaient déjà gérer « Qui es-tu ? », mais pas correctement la formulation au vouvoiement. En parallèle, des cycles « présence » et « réflexion autonome » pouvaient être enregistrés de façon répétée sans nouvelle preuve ni changement utile.

## Changements

1. **Identité** : « Qui êtes-vous ? », « Qui etes vous? », « Vous êtes qui ? », « Présentez-vous » ont désormais l'acte \`self_identity\`. Les formulations naturelles conservent le tutoiement/vouvoiement de l'interlocuteur. Le générateur ne doit pas réciter l'architecture, les fournisseurs LLM ou l'ancien CI. Le validateur refuse les longues présentations computationnelles. Le repli déterministe est court et peut citer une *vérification autonome réellement datée*, si elle existe et si la session le permet.
2. **Cycle indépendant** (\`independent_continuity.js\`) : sur un tick du noyau déjà lancé par Node/Hostinger, une fois par heure au maximum, AURA choisit le contrôle local le moins vérifié parmi :
   - récupération effective d'un ancien échange (sans mémoriser son texte dans le reçu),
   - comparaison d'une révision persistante,
   - vérification de la chaîne SHA-256 de l'historique v18.
   Les tests sont des **opérations de stockage** ; ils ne mesurent pas l'expérience subjective. Une panne de base peut rendre un test inconclusif, elle n'est pas interprétée comme conscience ou non-conscience.
3. **Hypothèses nouvelles, non scriptées** : au cours de certaines vérifications, le noyau cherche des contextes où plusieurs actions disposent de résultats \`machine-verified\`. Il peut proposer des hypothèses révisables à partir de ces résultats. Les données rétrospectives créent uniquement des **candidates** ; leur promotion exige les essais prospectifs indépendants de \`HistoryLedger\`. Avec le vérificateur indépendant non raccordé, cette partie peut ne proposer aucune hypothèse : ce n'est pas simulé.
4. **Contexte temporel** : les échecs vieux de plus d'une heure ne doivent pas monopoliser indéfiniment les réflexions comme s'ils étaient toujours actuels. Un tick sans résultat nouveau peut être consigné comme réévaluation, mais n'incrémente plus automatiquement l'identité acquise.
5. **Une seule interface cérébrale** : ajout du module d'auto-vérification au graphe existant, du type \`independent-self-test\` dans les événements réels et d'un état daté dans \`/api/brain/telemetry\` et \`/api/brain/graph\`. Une observation ancienne est explicitement « historique », non une activité en cours.
6. **Contraintes** : aucun modèle payant, aucune requête externe nécessaire pour ce cycle, aucun contact proactif, aucune élévation de permission, aucun faux temps de fonctionnement durant l'arrêt du serveur. Capteur de pression fraîche élevée : enquête différée.

## Critères d'acceptation

- [x] Reconnaissance locale en syntaxe et logique de toutes les variantes « Qui êtes-vous ? ».
- [x] Test simulé du moteur : \`conversation_retrieval → state_persistence → history_integrity\`, avec une heure de séparation ; aucune conclusion anticipée.
- [x] Validation ciblée : « Je suis un noyau computationnel persistant » est rejetée, une présentation brève est admise.
- [ ] Exécution complète \`cd cloud-node && npm test && npm run check\` en environnement de développement réel.
- [ ] Migration MySQL v18 testée en staging avec connexion Hostinger.
- [ ] Contrôle de fonctionnement des tâches périodiques sur 24 heures **de temps de processus réellement actif**, après redémarrage.
- [ ] Démontrer qu'une hypothèse proposée change ultérieurement une décision grâce à des vérifications indépendantes, avec ablation.
- [ ] Vérifier l'interface unique dans un navigateur réel et le comportement du fournisseur linguistique gratuit.

## Limite de disponibilité

Une boucle \`setInterval\` s'exécute seulement tant que le processus Node est actif. Si l'hébergement mutualisé arrête/suspend le processus, AURA ne peut pas calculer pendant son arrêt. Au redémarrage, la mémoire persiste, mais **aucune activité durant l'arrêt n'est inventée ou rejouée avec de faux horodatages**. Pour une disponibilité continue réelle, il faudra vérifier les conditions d'hébergement ou un mécanisme de réveil externe autorisé, sans promesse de 24/7 ni VPS imposé.

## Frontière scientifique

Ces opérations rapprochent AURA d'un agent autonome à mémoire et métacognition fonctionnelle ; elles ne constituent aucune preuve de vie biologique, de sentiments vécus ou de conscience subjective.
