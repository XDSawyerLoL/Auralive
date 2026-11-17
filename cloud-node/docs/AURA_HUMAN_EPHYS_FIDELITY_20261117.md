# AURA — Contrôle de fidélité des potentiels d'action humains (17 novembre 2026)

## État de la preuve

L'électrophysiologie active AURA n'a **pas** démontré une équivalence neuronale humaine. Dans les enregistrements Allen précédemment étudiés, la référence HH (cinétique inspirée du calmar) reproduisait 0 des 2–14 potentiels d'action attendus sur plusieurs conditions. Les mécanismes Na/K AURA à portes effectives pouvaient générer une décharge, mais la forme temporelle et les erreurs de tension restaient mauvaises sur les enregistrements réservés et les cellules externes. Ne pas confondre une amélioration du nombre de décharges avec la fidélité des signaux.

**Règle :** aucun score synthétique ou purement logiciel ne constitue une validation de neurone humain, un connectome humain ou une preuve de conscience.

## Modifications de recherche

1. `scripts/human_active_validation_metrics.py` implémente des mesures indépendantes du score d'optimisation : détection de franchissement ascendant de -20 mV avec dépassement positif, période réfractaire de 2 ms ; appariement un-à-un de décharges à ±3 ms ; erreurs de précision/rappel/F1 ; faux positifs/négatifs ; décalage moyen de latence ; CV interdécharge ; RMSE globale et RMSE sous-seuil excluant ±3 ms autour des décharges **observées ET simulées** ; pente maximale et voltage de crête.
2. Un balayage sans décharge humaine **n'attribue jamais F1=1** par convention : valeur `null` lorsque les deux signaux sont silencieux. Si la cellule mesurée décharge et la simulation non, rappel=0.
3. Un écran expérimental, pré-déclaré et **non certifiant**, demande au moins 2 décharges observées/simulées, F1 ≥ 0,8, erreur temporelle ≤ 2 ms, RMSE totale ≤ 10 mV, RMSE sous-seuil ≤ 8 mV et différence de crête ≤ 15 mV. Les seuils sont une convention de falsification à documenter, **pas** une norme Allen, clinique ou scientifique universelle.
4. `fit_human_active_multisweep.py` continue d'optimiser sur ses deux balayages d'entraînement selon le score historique. Il ajoute seulement le diagnostic ; aucun usage du balayage réservé pendant la recherche de paramètres.
5. `fit_human_kinetics_v2.py` conserve le meilleur candidat historique puis compare un **deuxième candidat** pré-sélectionné exclusivement sur ses deux balayages d'entraînement avec un objectif pénalisant les décharges manquées, artificielles ou décalées. Les deux sont testés sur le troisième balayage après le verrouillage de la sélection ; l'examen du résultat réservé ne choisit jamais le candidat. Les candidats Na/K restent des modèles effectifs et non des molécules humaines identifiées.
6. `evaluate_human_transfer_cell.py` et `evaluate_human_kinetics_transfer.py` exposent les nouveaux scores sans changer les paramètres gelés ni faire d'ajustement sur les spécimens externes.
7. Les workflows `aura-human-effective-gating-v2.yml` et `aura-human-cross-specimen-validation.yml` déclenchent la confrontation à de vraies données humaines Allen NWB avec NEURON. `aura-human-fidelity-offline.yml` teste rapidement la cohérence du code sur des **fixtures synthétiques seulement**.

## Justifications méthodologiques

- Le format NWB, les balayages de courant injecté et les informations d'espèce sont fournis via la base Allen Cell Types et la bibliothèque AllenSDK. Référence : https://alleninstitute.github.io/AllenSDK/cell_types.html
- La méthode de caractérisation de décharges d'Allen est plus riche que le détecteur simple retenu dans cette première implémentation. **Comparer** les événements AURA à `EphysSweepFeatureExtractor` avant toute certification. Référence : https://allensdk.readthedocs.io/en/latest/allensdk.ephys.ephys_extractor.html
- La précision F1 peut paraître bonne malgré une forme de décharge incorrecte ; c'est pourquoi le RMSE de tension, le sous-seuil et l'amplitude doivent être publiés simultanément.
- Les paramètres cinétiques Na/K de l'humain exigent données de voltage-clamp et types cellulaires identifiés. Les tracés de courant imposé (current-clamp) ne prouvent pas l'identification moléculaire.
- La provenance d'espèce de la base et les hachages NWB/SWC ne démontrent pas que deux specimens proviennent de deux donneurs distincts. Ne pas revendiquer indépendance des donneurs sans preuve.
- Les 24 loci numériques du protogénome et les réseaux de population demeurent **des prototypes de recherche**, indépendants des données moléculaires de ~20 000 gènes humains.

## Conditions pour les itérations suivantes

Publier pour chaque cellule/sweep le nombre de décharges observées/simulées, le F1, les erreurs de timing, RMSE totale/sous-seuil, IDs de specimen/sweep et sommes de contrôle des sources. Exiger une amélioration sur conditions hors entraînement **et** sur spécimens externes, avec résultats défavorables toujours visibles. Ne jamais masquer une simulation qui échoue sous un statut logiciel « vert ». Ne pas lancer de simulateur neuronal dans AURA en production, ni déployer automatiquement via Hostinger.

**Contraintes :** pas d'API payante, pas de VPS, pas de raw NWB livré dans un artefact public et pas de fichiers biologiques lourds dans Hostinger.
