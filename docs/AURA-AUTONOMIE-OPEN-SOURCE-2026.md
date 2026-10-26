# AURA — Autonomie concrète sans API payante (26 octobre 2026)

## Principe non négociable

AURA conserve son propre noyau, ses politiques locales et l'autorité de décision. Les composants tiers servent des fonctions bornées. **Zéro VPS, zéro API payante, zéro GitHub Actions déclenchée par les changements de cette branche.** Aucune opération bancaire, suppression, envoi, déclaration ou validation administrative sans capacité dédiée et contrôle humain.

## Recherche GitHub et documentation publique

| Projet | Fonction vérifiée | Adoption |
|---|---|---|
| [Python sqlite3](https://docs.python.org/3/library/sqlite3.html) | Transactions et stockage sur disque sans serveur | **Intégré** pour les validations locales |
| [LangGraph](https://github.com/langchain-ai/langgraph) / [SQLite checkpointer](https://github.com/langchain-ai/langgraph/tree/main/libs/checkpoint-sqlite) | Reprise de graphes et checkpoints synchrones | À intégrer seulement si les missions multi-étapes échouent avec le Runtime existant |
| [Pydantic AI](https://github.com/pydantic/pydantic-ai/blob/main/docs/deferred-tools.md) | Appels d'outils suspendus et approbations humaines | Référence de conception, pas un second système de décision |
| [APScheduler](https://github.com/agronholm/apscheduler) | Planification durable avec stockage SQLite via SQLAlchemy | Étape suivante pour les rappels lorsque l'application ne reste pas ouverte |
| [watchdog](https://github.com/gorakhargosh/watchdog) | Détection des changements de fichiers sous Windows | Facultatif : déclencher une réanalyse locale, sans accès automatique au contenu |
| [Ollama](https://github.com/ollama/ollama) ou [llama.cpp](https://github.com/ggml-org/llama.cpp) | Compréhension libre locale avec serveur de modèle | Respecter les limites de RAM, vérifier modèle et résultats ; AURA arbitre les outils |
| [OCRmyPDF](https://github.com/ocrmypdf/OCRmyPDF) | OCR local des PDF scannés, Tesseract | Facultatif et potentiellement coûteux en CPU ; conserver l'original |
| [MarkItDown](https://github.com/microsoft/markitdown) | Extraction Office/PDF vers Markdown | Extension facultative pour fichiers sélectionnés et taille bornée |
| [Mem0](https://github.com/mem0ai/mem0) | Mémoire de faits multi-session | **Non installé** : dépend de fournisseurs OpenAI par défaut, nécessite reconfiguration locale |

## Capacité réellement ajoutée

### AURA Durable Reviews — SQLite natif

- Une base **locale distincte par dossier explicitement autorisé** dans `LOCALAPPDATA/AURA/administratif/` sur Windows.
- Persiste les identifiants, catégories, chemins relatifs et empreintes de preuve ; **pas les PDF, relevés, extraits ou conversations**.
- Après analyse locale, l'utilisateur choisit explicitement d'enregistrer le tableau.
- Chaque validation est une **confirmation d'examen**, pas une preuve de paiement.
- Si les pièces changent (SHA-256 différent), les identifiants et/ou les empreintes des tâches changent, et les validations périmées sont invalidées.
- Un relevé incomplet ne fait pas disparaître les contrôles précédents : absence d'un fichier dans une analyse partielle n'est pas la preuve d'une suppression.
- Le journal d'événements conserve les décisions sans leur contexte documentaire intégral.
- Un rappel demande deux actes : marquer une vérification **examinée** et autoriser une date **choisie par l'utilisateur**, avec fuseau horaire. Il n'est **jamais créé automatiquement** à partir d'une date trouvée dans un PDF.
- Une notification approuvée est conservée jusqu'à affichage effectif et acquittement ; aucune émission email/SMS/push n'est implémentée.
- Un rappel s'affiche **lorsque AURA Windows est ouverte** et que le dossier autorisé est sélectionné. Si Windows ou AURA est fermée, rien ne s'exécute en arrière-plan pour l'instant.

Commande locale explicite, sans interface graphique :

```powershell
python -m aura_runtime.admin_durable_cli --root "C:\MesDocuments" snapshot
python -m aura_runtime.admin_durable_cli --root "C:\MesDocuments" list
python -m aura_runtime.admin_durable_cli --root "C:\MesDocuments" review --id "IDENTIFIANT16HEX" --decision reviewed
python -m aura_runtime.admin_durable_cli --root "C:\MesDocuments" propose --id "IDENTIFIANT16HEX" --when "2026-11-25T09:00:00+01:00"
python -m aura_runtime.admin_durable_cli --root "C:\MesDocuments" approve --reminder-id "IDENTIFIANT_DU_RAPPEL"
python -m aura_runtime.admin_durable_cli --root "C:\MesDocuments" due
```

Le CLI présente les rappels échus **sans les effacer** ; `ack` doit être appelé uniquement après affichage à l'utilisateur. Dans la fenêtre Windows, le module effectue l'acquittement une fois la boîte d'alerte fermée.

Les informations locales ne constituent **pas une base chiffrée**. Elles héritent des contrôles d'accès du profil Windows. Pour des secrets très sensibles, utiliser le chiffrement complet du disque du poste.

## Vérification effectuée

- `tests/test_aura_admin_durable.py` : 10 tests unitaires en conteneur local, 10/10 réussis.
- `python -m aura_runtime.admin_durable_benchmark` : 10 scénarios SQLite réels, 10/10 réussis.
- Les fichiers de ces trois modules ont été ajoutés sur la branche isolée `fix/aura-proof-french-free-20261025`. Le lanceur de contrôle Windows exige désormais **62 scénarios**.
- La compilation, les interactions graphiques réelles de Tkinter, le cycle complet sous Windows et la production Hostinger **ne sont pas certifiés** par ces tests.

## Étapes à implémenter ensuite (ordre strict)

1. **Scheduler autonome réellement opérationnel** : utiliser le Planificateur de tâches Windows ou APScheduler et exécuter un unique processus local de consultation des rappels. Valider la non-duplication, les changements d'heure, l'absence de notification perdue et la sortie propre après redémarrage.
2. **Surveillance de dossier consentie** : watchdog, observation de modifications seulement, délai anti-rebond et réanalyse sur autorisation. En cas d'incertitude, demander confirmation au lieu de modifier l'état.
3. **Compréhension libre** : modèles locaux Ollama/llama.cpp avec tests d'intention et sorties structurées ; le modèle n'exécute jamais directement des actions.
4. **Reprise multi-étapes** : intégrer les checkpoints LangGraph uniquement après benchmark de missions réelles et vérification de la désérialisation sûre.
5. **OCR optionnel** : OCRmyPDF/Tesseract limité aux documents choisis et sans écraser les originaux.

## Critère de réussite

Une mission qui survit à un redémarrage, garde sa preuve, change d'état uniquement après validation humaine, reprend et affiche un rappel confirmé **au bon moment**. La réussite sera mesurée sur Windows et ne pourra pas être revendiquée sur la base de fichiers GitHub présents uniquement.
