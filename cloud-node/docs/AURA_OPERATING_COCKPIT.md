# AURA 3.2 — cockpit opérationnel, dialogue fixe et revenus mesurés

## Priorités

1. **Autonomie responsable** : exposer les capacités d'action existantes, produire des traces et distinguer exécution réelle et simple plan.
2. **Revenus mesurés** : fabriquer un livrable vendable de façon reproductible, sans inventer des recettes.
3. **Conversation naturelle** : maintenir le dialogue lisible et signaler honnêtement toute indisponibilité.

### 1. Chat toujours visible

Le volet de conversation est `position:sticky` sur ordinateur et mobile, sa hauteur est bornée par `100dvh`, et seule la liste `#messages` défile dans ce volet. Le champ de saisie et les boutons restent à leur place. Si le navigateur est trop petit, la zone conserve une hauteur minimale et peut défiler.

Les messages utilisateurs restent visibles. Les pannes sont affichées dans un encadré technique avec **Réessayer le message** et **Voir le diagnostic**, sans usurper le rôle d'AURA. Les réponses vides ne sont plus enregistrées en tant que messages d'AURA et ne sont plus suivies de questions artificielles de curiosité.

Le filtrage du texte français rejette la réponse de « présence silencieuse » du type « Reçu, je vois votre lu… ma faculté de langage naturel n'est pas activée ». Il ne rend pas un modèle non opérationnel soudainement capable de dialoguer; la disponibilité réelle de Qwen3 sur Hostinger et des modèles `openrouter/free` reste à vérifier.

### 2. Capacité d'agir

La carte **Capacité d'agir** utilise `POST /api/kernel/operator` et le moteur d'orchestration préexistant. La demande passe explicitement `allowed_risks: []` : elle n'accorde aucune nouvelle permission à une mission. AURA affiche le champ `executed` et le mode d'exécution réel, ou annonce clairement « plan seul / non exécuté ». Il ne s'agit pas d'une permission implicite d'effectuer des paiements, de changer un compte financier, de publier ou de déployer.

Le propriétaire se connecte via `POST /api/auth/session`. La clé est saisie puis supprimée de l'interface; le serveur gère une session HTTPS avec cookie HttpOnly, Secure et SameSite Lax. Aucun jeton n'est conservé dans le stockage local. Le tableau de bord public et la conversation restent consultables séparément.

### 3. Revenus : ce qui est réellement opérationnel

AURA exécute désormais un **audit technique limité d'une page d'accueil publique** via `POST /api/revenue/audit/preview`.

- URL HTTPS racine uniquement, sans paramètres, fragments, port non standard ou authentification intégrée.
- Résolution DNS avec exclusion des adresses IP privées/réservées, puis connexion épinglée à une adresse IP publique; pas de redirection HTTP.
- Limites de durée (8,5 s), taille du document (300 Ko), cadence (20 s) et diagnostic non intrusif.
- Contrôles initiaux : statut HTTP, titre, description, viewport, H1, attributs alt, HSTS, nosniff, robots; résultat exportable au format Markdown depuis le navigateur.
- Aucun secret, clé ou fichier privé envoyé à un moteur d'IA. Aucune API payante ajoutée.

Cette fonction peut préparer un **produit d'audit web**. Le tableau affiche cependant **Recettes confirmées : non connectées** et **Ventes automatiques : non activées**, parce qu'aucun processeur de paiement ni preuve bancaire de recette n'a été intégré à cette version.

Le trading reste **PAPER ONLY** avec surveillance historique toutes les six heures : il n'engage aucun capital et ne crée aucun revenu réel.

### Chemin pour une activité réellement autonome

Pour produire des paiements sans prospection humaine quotidienne, il faudra une offre publique d'audit, un tunnel de commande, une identité marchande validée, un prestataire de paiement lié au bon compte, un webhook de paiement authentifié, une génération de rapport déclenchée par le paiement confirmé et une livraison automatique au client. Les frais de transaction éventuels doivent être affichés; **zéro frais logiciels fixes ne signifie pas zéro frais de traitement des paiements**.

Aucun paiement réel, aucune prospection non sollicitée ni aucun ordre boursier n'est lancé par cette mise à jour. Ne jamais afficher des simulations ou des devis comme des recettes encaissées.

### 4. Vérification et publication

Depuis `cloud-node/` :

```bash
npm run check
npm test
node --test test/operational_cockpit.test.js test/expression.test.js test/french_language.test.js
```

Après publication Hostinger, vérifier physiquement :

- Saisir un message dans le chat, défiler la colonne de droite et confirmer que le champ et la conversation restent disponibles.
- Simuler un moteur français indisponible : aucune réplique inventée, possibilité de réessayer.
- Établir une session propriétaire avec la clé privée (jamais dans l'URL) et lancer une mission de test sans risques supplémentaires; examiner `executed`.
- Auditer une page HTTPS publique qui vous appartient et exporter son rapport.
- Vérifier les valeurs du tableau économique, le mode de trading fictif, l'absence de produits facturés.
- Vérifier `GET /api/language/embedded/status`, `GET /api/ai/runtime` et une réponse française véritable.

Le code GitHub et le ZIP de packaging ne sont **pas une preuve de déploiement** sur Hostinger ni une garantie de revenu.
