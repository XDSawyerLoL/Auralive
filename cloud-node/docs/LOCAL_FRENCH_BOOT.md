# Démarrage et vérification du modèle français sur Hostinger — AURA 0 €

## Pourquoi « fichiers installés » ne suffit pas

L'installation de Qwen3-0.6B Q8_0 (environ 639 Mo) et de `llama.cpp` ne prouve pas que le binaire peut être lancé par Hostinger, que le modèle tient en mémoire, ou qu'il génère du texte.

AURA doit exécuter un test local `POST /v1/chat/completions` contre `127.0.0.1` sur un port éphémère. Le panneau affiche **Réponse vérifiée** uniquement si ce test génère des jetons et produit un texte non vide.

## Correctifs effectués

1. **Cache persistant retrouvé au redémarrage.** `locateEmbeddedRuntime` recherche maintenant `$HOME/.cache/aura-language-runtime`, l'ancien dossier AURA et l'éventuel `AURA_EMBEDDED_CACHE_DIR`, sans exposer les chemins dans l'API publique.
2. **Démarrage indépendamment de la base MySQL.** Le modèle déjà installé est lancé par `startRuntimeLoop` après la mise en écoute HTTP, même si le noyau attend encore sa base. Aucune réinstallation automatique dans ce nouveau parcours.
3. **Contrôle de mémoire cgroup.** `embeddedStartupBudget` considère `memory.max`, `memory.current` et le cache disque inactif récupérable. Si la marge calculée est inférieure à 740 Mo, AURA ne lance pas un processus susceptible de faire tomber le site. En environnement Hostinger limité, elle démarre directement avec le profil low-memory : une seule tâche HTTP, un seul thread, contexte réduit.
4. **Action privée de vérification.** Le bouton **Démarrer / vérifier** sur le tableau de bord déclenche `POST /api/language/embedded/start`. Cette route requiert une session privée ou un jeton administrateur, ne télécharge pas de fichier, respecte la temporisation après échec et répond immédiatement `202`.
5. **Diagnostic honnête.** Les fichiers détectés sont distingués de l'installateur, du démarrage, de la mémoire bloquante et de l'inférence réellement vérifiée. La présence du modèle ne produit plus une barre d'installation à zéro.

## Vérifier depuis le panneau

- Après déploiement, ouvrir le tableau de bord AURA et regarder **FACULTÉ LINGUISTIQUE · INFÉRENCE LOCALE**.
- Si les fichiers sont présents, le bouton privé **Démarrer / vérifier** est disponible. Une session administrateur valide est requise.
- La page se rafraîchit automatiquement et affiche les étapes : démarrage, contrôle de santé, puis preuve d'inférence.
- Si **Mémoire insuffisante** apparaît, le panneau doit montrer l'estimation de mémoire libre et le minimum de sécurité. Répéter la commande ne résoudra pas la limite physique.
- Pour un diagnostic programmatique, appeler `GET /api/language/embedded/status`; les champs `status`, `failure_code`, `memory_preflight`, `process_exit`, `log_signals`, `boot_attempts` et `probe_verified` permettent de distinguer les défauts.
- Vérifier finalement une **vraie réponse de chat français**, pas simplement le statut de l'API. La petite taille de 0,6 milliard de paramètres limite la richesse conversationnelle même quand le serveur répond.

### Exemples sans secrets dans les URLs

Avec une session fondatrice valide et l'interface hébergée sur le même domaine, le bouton évite d'exposer des identifiants. Pour une intégration autorisée par l'administrateur :

```sh
# Cette requête ne contient aucune clé et ne fait que lire l'état public.
curl https://VOTRE-DOMAINE/api/language/embedded/status

# L'action POST nécessite une authentification privée; ne jamais publier son jeton.
```

## Limites et politique 0 €

- Aucun VPS, conteneur payant, API de texte payante, nouvelle dépendance Node ou compte tiers n'est ajouté.
- Le poids du modèle est inclus dans l'hébergement; aucun coût par requête n'est demandé au fournisseur du modèle.
- Cela **ne garantit pas** que Hostinger autorise les binaires natifs, le `loopback` ou assez de RAM. Les limites physiques ne peuvent pas être corrigées par des prompts.
- Si le Q8 ne tient pas en mémoire, étudier la quantification Q4_K_M (environ 484 Mo dans certains dépôts) mais éviter tout remplacement silencieux; l'intégrité des modèles téléchargés doit être vérifiée par un SHA-256 épinglé, et leur qualité linguistique doit être re-testée.
- L'alternative sans nouveau coût est un moteur local sur un appareil existant, à condition qu'il soit disponible lorsque AURA doit répondre.
- Une archive ZIP GitHub prête à importer n'est **pas** une preuve de déploiement. Valider l'état et le chat réel après publication.

### Contrôles

Depuis `cloud-node/` : `npm run check` puis `npm test` (test ciblé `test/embedded_boot_control.test.js`). Les jobs de packaging Hostinger vérifient aussi les tests avant de produire le ZIP.
