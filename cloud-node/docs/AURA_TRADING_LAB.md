# AURA Trading Lab — laboratoire autonome de stratégie sans capital réel

## Statut actuel

Le module **Trading Lab v1** est utilisable depuis le tableau de bord AURA sous réserve du déploiement de l’application. Le bouton « Tester la stratégie » réalise un backtest sur des données publiques récentes de Kraken.

Il ne s'agit **pas** d'un robot de gains autonomes en production : AURA ne connaît pas l'issue future des marchés et **n'envoie jamais d'ordre réel**. La version 1 est volontairement un point de départ mesurable.

### Données et politique de coût

- Source : API REST publique Kraken `GET https://api.kraken.com/0/public/OHLC`.
- Marchés limités à `XBTEUR` (BTC/EUR) et `ETHEUR` (ETH/EUR).
- Bougies d'une heure, les bougies encore ouvertes sont écartées.
- Kraken ne livre que les 720 dernières bougies par requête : la simulation couvre environ **30 jours**, insuffisant pour valider durablement une stratégie.
- Aucune API privée Kraken, aucun compte, aucun token, aucun achat, aucune vente et aucun levier.
- Aucun paquet npm ajouté, aucune API payante, aucun VPS.
- Fréquence maximale d'une simulation toutes les 15 secondes, depuis une session AURA privée.

### Stratégie transparente v1

Croisement de moyennes exponentielles 12 et 48 heures, exécution supposée sur l'ouverture de la bougie suivante, position acheteuse seulement, allocation fictive maximale de **10 % d'un capital fictif initial de 1 000 €**.

Hypothèses de simulation : 0,4 % de frais par opération, 0,1 % de glissement par opération. Signal de vente sur croisement contraire ou sur ouverture sous un stop de 4 % ; **ce stop ne protège pas contre une chute intrabougie ni un gap**. Le capital fictif reste à risque dans la simulation. La liquidité et les conditions du marché réel peuvent être bien pires.

La simulation affiche : capital final virtuel, P&L fictif, drawdown calculé, nombre de ventes clôturées, pourcentage de transactions gagnantes et opérations fictives. Le tableau de bord n'affiche jamais un bénéfice encaissé sans preuve financière indépendante.

### APIs privées

```http
GET /api/trading/mode
POST /api/trading/paper/backtest
Content-Type: application/json

{"pair":"XBTEUR"}
```

Les routes sont protégées par l'authentification privée existante. Les requêtes utilisateur ne peuvent pas changer les paramètres de risque ni choisir arbitrairement un domaine de données.

### Critères avant toute réflexion sur le trading réel

1. Réparer et valider la génération de réponses naturelles d'AURA et sa stabilité sous Hostinger.
2. Ajouter un **forward test** : au moins plusieurs semaines de signaux enregistrés et de décisions prises exclusivement avec des données disponibles à leur date. La simulation historique de 30 jours ne remplace pas cette étape.
3. Comparer à une stratégie passive de référence, mesurer maximum drawdown, taux de pertes, frais, slippage, indisponibilités d'API et situations de marché défavorables.
4. Vérifier la viabilité d'une stratégie hors-échantillon et les contraintes légales, fiscales et de frais de l'opérateur réel.
5. Exiger une **autorisation distincte** avant d'approvisionner un compte ou d'ajouter une API de trading réel. N'envoyer aucun ordre sans limites explicites et garde-fous vérifiés.

Aucun bénéfice ni revenu passif n'est garanti. Le mode papier n'engage **aucun capital** et rapporte **0 € réels**.

Références :
- https://docs.kraken.com/api/docs/rest-api/get-ohlc-data
- https://support.kraken.com/gb/articles/206548367-what-are-the-api-rate-limits-
- https://www.amf-france.org/fr/espace-epargnants/comprendre-les-produits-financiers/produits-complexes/cfd
