# AURA Toolbox v1 — ressources utiles, classées et non exécutées automatiquement

Le post viral présente 50 lignes, dont **remove.bg deux fois**. AURA conserve 49 ressources distinctes de cette liste, ajoute OpenAlex (successeur de la recherche Unpaywall) et deux alternatives locales pour les PDF sensibles, **pdfcpu** et **qpdf** : 52 entrées.

## Objectif

AURA identifie les outils utiles et leurs limites sans envoyer un document, un email, une clé ou une requête à un tiers simplement parce qu'un service figure dans une liste populaire.

Chaque entrée de `src/toolbox_resources.js` contient :

- l'URL publique de la ressource ;
- la catégorie, les besoins associés, le niveau de gratuité estimé ;
- le type d'accès (local, navigateur, API publique, abonnement/compte, bloqueur) ;
- la confidentialité des données ;
- le fait que **l'exécution automatique est toujours désactivée** ;
- une règle de sécurité ou d'usage.

Les suggestions sont indexées **sans IA ni appels payants** et injectées seulement au contexte de conversations privées qui évoquent la découverte d'outils, un traitement de fichier ou une alternative logicielle.

**Important** : le catalogue ne donne à AURA ni droit d'accès à un compte ni permission de copier des contenus.

## Deux recherches publiques facultatives

`src/toolbox_research.js` permet sur requête humaine explicite :

1. Recherche ponctuelle de titres dans **Open Library**, via `/search.json` (jusqu'à cinq résultats).
2. Recherche ponctuelle de métadonnées dans **Internet Archive**, via `/advancedsearch.php` (jusqu'à cinq résultats).

Ces requêtes sont strictement conditionnées à `allow_external: true`, accessibles uniquement en privé, limitées en fréquence, sur deux hôtes codés en dur, avec un délai maximum de 8 s, un cache de 5 minutes et sans analyse automatique de documents privés. Ce ne sont pas des récupérateurs de texte intégral.

Open Library a une politique spécifique d'usage : les APIs sont destinées à la découverte humaine ponctuelle, pas à un backend à fort trafic ni au téléchargement massif. Pour un usage fréquent, configurer un User-Agent identifiable et contacter le service. Un taux de requête limité par processus n'est pas un limiteur distribué pour plusieurs instances Hostinger.

## Endpoints privés

- `GET /api/toolbox/resources?category=documents` : catalogue filtré.
- `GET /api/toolbox/resources?include_blocked=true` : afficher aussi les services exclus, pour audit.
- `GET /api/toolbox/recommend?q=compresser%20un%20PDF` : classement sans connexion externe.
- `POST /api/toolbox/research` : recherche distante manuelle, explicitement autorisée.

Exemple :

```bash
curl -X POST "https://VOTRE-AURA/api/toolbox/research" \
  -H "Authorization: Bearer ${AURA_CLOUD_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"provider":"openlibrary","query":"Victor Hugo","allow_external":true}'
```

Les paramètres `provider` acceptés sont uniquement `openlibrary` et `internetarchive`. Les résultats sont des **métadonnées**; les droits de téléchargement ne sont jamais déduits.

## Choix importants pour AURA

| Besoin | Ressource suggérée | Pourquoi |
|---|---|---|
| Base scientifique | OpenAlex / Unpaywall | Recherche de publications et accès ouvert, sous réserve des conditions des API |
| PDF local confidentiel | pdfcpu / qpdf | Aucun téléversement externe et commandes possibles dans le futur Runtime |
| Compression d'image | Squoosh | Compression dans le navigateur; attention aux analytics du site |
| Vidéo | HandBrake / yt-dlp | Outils locaux, uniquement contenus autorisés |
| Transfert PC/téléphone | LocalSend | Réseau local sans stockage dans un cloud |
| Savoir durable | Obsidian / Anki / Excalidraw | Inspirations pour les formats, relations et rappels |
| Livres | Open Library / Gutenberg | Métadonnées officielles, politiques robot à respecter |
| Archives | Internet Archive / Wayback | Métadonnées historiques et sources à vérifier |

### Services non intégrés au moteur automatique

- **Sci-Hub** : risques juridiques et sécuritaires, pas de connecteur.
- **remove.bg, iLovePDF, CloudConvert, TinyPNG, Cleanup.pictures** : transferts de fichiers vers des serveurs externes.
- **Have I Been Pwned, Privnote, mails temporaires** : données et comptes sensibles, décision humaine requise.
- **Notion, Trello, Figma, Canva, Todoist** : comptes extérieurs, aucun connecteur implicite.
- **PageSpeed Insights** : outil tiers optionnel, réservé à des URLs explicitement publiques.
- **OpenAlex** : ne pas utiliser automatiquement une API susceptible de générer des coûts. Une clé gratuite, un budget et des plafonds doivent être configurés et vérifiés avant intégration.

## État

Cette version ajoute un *moteur de choix* et deux connecteurs de recherche publics à invocation explicite. **Elle n'ajoute pas 52 outils d'exécution** ni d'automatisations en boucle.

À valider avant fusion ou déploiement Hostinger : `npm run check`, `npm test`, autorisation des routes, absence de retour de recommandations privées dans le chat public, faible consommation, politiques et quotas des fournisseurs et traitement des erreurs réseau.

### Sources vérifiées (8 novembre 2026)

- https://unpaywall.org/api — recherche Unpaywall remplacée par OpenAlex en septembre 2026.
- https://help.openalex.org/api/authentication/ — clé gratuite, limitations et tarification selon volume.
- https://openlibrary.org/developers/api — usage humain ponctuel et limites.
- https://openlibrary.org/dev/docs/api/search — schéma de la recherche.
- https://www.gutenberg.org/policy/robot_access.html — accès automatisé réservé aux méthodes officielles.
- https://archive.org/services/docs/api/ — accès au catalogue Internet Archive.
- https://github.com/pdfcpu/pdfcpu, https://github.com/qpdf/qpdf — outils PDF locaux.
- https://github.com/GoogleChromeLabs/squoosh — confidentialité et analytics documentés.
