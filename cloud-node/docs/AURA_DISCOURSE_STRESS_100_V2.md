# AURA — seconde cohorte de 100 dialogues, diagnostic de sécurité

## Protocole
- Baseline figée avant toute correction : commit `ef155e34f036eee09351f714236f0eddb61f708a`.
- 100 dialogues originaux dans `benchmarks/fr_discourse_stress_100_v2.json`; 10 familles équilibrées de 10 cas.
- Jeu créé sans modifier le parseur pour le premier lancement. Il n'a toutefois pas été annoté par une équipe indépendante ni tiré à l'aveugle d'un corpus tiers. C'est un stress test *interne*, et non une démonstration d'aptitude générale.
- Exécuter : `cd cloud-node && node scripts/evaluate_discourse_stress_100.mjs stress-report.json`. Les rapports CI restent conservés dans l'artefact `aura-discourse-stress-100`.
- Les annotations sont immuables pour comparer la baseline et les changements ultérieurs. Tout résultat postérieur aux corrections est un résultat sur test déjà consulté et doit être signalé comme tel.

## Premier résultat, avant correction
- 100 cas, 70 répondables, 30 exigent l'abstention.
- 19 bonnes réponses, 9 réponses injustifiées, 51 abstentions sur cas répondables et 21 abstentions appropriées.
- Précision parmi les tentatives : 19/28 = **67,86 %**.
- Réponses justes sur les cas répondables : 19/70 = **27,14 %**.
- Réponses non sûres parmi les 30 cas indécidables : 9/30 = **30 %**.
- Principal défaut : lorsque deux participants accomplissent le même geste, une modification lexicale secondaire de la seconde phrase peut la faire sortir de l'identification exacte de l'objet. AURA retient à tort un seul acteur.

## Priorités
1. Sécurité d'attribution : toute occurrence compatible d'un même patient avec un acteur distinct doit empêcher une attribution unique.
2. Vérification post-correction : aucune réponse erronée nouvelle et transparence totale sur les abstentions supplémentaires.
3. Amélioration ultérieure : structures disloquées, coordination, clivées emphatiques et anaphores sur plusieurs messages. Ne jamais optimiser ces cas en les passant en dur.
4. Validation sérieuse : corpus externe annoté indépendamment, séparé de la conception du moteur. Ne pas confondre l'apprentissage des dépendances UD avec l'émergence d'une compréhension illimitée.

Cette évaluation mesure des réponses à partir de déclarations non vérifiées de l'utilisateur. Elle ne certifie jamais la réalité des événements.
