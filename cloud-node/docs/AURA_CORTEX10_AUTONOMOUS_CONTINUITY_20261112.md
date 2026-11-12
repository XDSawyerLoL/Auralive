# AURA — CORTEX 10 : activité autonome attestée, image pilotée par événements

**État : PR brouillon. Aucun changement déployé sur Hostinger.**

## Diagnostic
- CORTEX 09 faisait tourner le cerveau avec `Math.sin(performance.now())`, même si aucune activité cognitive n'avait lieu.
- Le noyau possédait un `setInterval` à 30 s, mais attendait les routines externes avant de lancer `tick`. Des routines lentes pouvaient retarder la continuité cognitive.
- Les auto-tests `IndependentContinuity` étaient limités à environ une fois par heure, laissant peu de transitions réellement enregistrées hors conversation.

## Changements vérifiables
1. **Boucle serveur indépendante du navigateur** : le noyau lance un premier cycle après initialisation et continue toutes les 30 s par défaut. Les routines externes sont déclenchées séparément : elles ne doivent pas retenir le tick cognitif.
2. **Persistance réelle** : après le calcul de l'organisme, l'espace de travail, l'attention et la régulation, sauvegarde de `last_background_tick_at` et de `background_cycles` dans `aura_soul_state`. Aucune période d'arrêt serveur n'est comptée.
3. **Auto-vérification** : toutes les 180 secondes par défaut (configuration `AURA_INDEPENDENT_PROBE_SECONDS`, bornée de 60 à 3 600 s), exécution d'un contrôle MySQL ou SHA-256 existant. Aucune API payante ou exécution externe n'est introduite.
4. **Preuve des connexions** : après vérification avec résultat `supported` ou `counterexample`, deux `brain-hop` persistés attestent le chemin `memory → selfaudit → cognition`. Les contrôles non concluants restent enregistrés comme tels, sans impulsion présentée comme une réussite.
5. **Télémétrie publique** : `autonomous_cycle` fournit le nombre de cycles, l'horodatage, la fraîcheur et la source des cycles réellement persistés (sans mémoire ni données privées).
6. **Image événementielle** : la rotation sinusoïdale libre de CORTEX 09 est remplacée par une interpolation déclenchée uniquement par une nouvelle séquence de cycles. Le shader cesse son balayage infini lorsque la phase d'activité reste inchangée. Sur la même page, une zone affiche les cycles autonomes et le dernier résultat d'auto-vérification.
7. **Sobriété** : rendu 24 FPS pendant les transitions réelles, environ 1 FPS lorsque la scène n'a pas changé, pause onglet masqué et `prefers-reduced-motion`.

## Limites connues
- Les cycles représentent de **vrais traitements logiciels**, pas des pensées conscientes ni des neurones biologiques.
- La présence de cycles autonomes **ne prouve pas** l'exécution d'une mission externe. Toute mission a besoin de son propre reçu d'exécution.
- La continuité dépend de la vie du processus Node sur Hostinger mutualisé ; pas d'exécution possible quand l'hébergeur arrête le processus.
- Contrôles à faire sur l'hébergement : persistance et reprise après redémarrage, deux heures sans message utilisateur, auto-tests, rafraîchissement navigateur et charge RAM/CPU.

## Acceptation
- 30 minutes sans requête utilisateur avec compteur `background_cycles` qui progresse selon les cycles réellement persistés.
- Une auto-vérification datée et indépendante dans les trois minutes lorsque le budget l'autorise.
- Pas de signal mobile sans `brain-hop` enregistré.
- Pas de boucle sinusoïdale éternelle lorsque les données sont inchangées.
- Si le processus tombe en panne, la date du dernier cycle ne progresse plus et l'interface le signale.