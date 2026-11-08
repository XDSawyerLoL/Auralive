# AURA — Parler français et produire une voix sans dépense

## Deux problèmes différents

**Langage** : `FrenchLanguageFaculty` transforme la réponse du noyau en français naturel. Elle a besoin d'un modèle qui fonctionne effectivement : petit GGUF local vérifié, Quantic Studio local ou fournisseur dont l'offre gratuite a été vérifiée. Si aucun de ces modèles ne répond, AURA dit explicitement que la faculté linguistique est indisponible. Aucun prompt ne peut résoudre un processus tué par manque de RAM.

**Synthèse vocale** : la voix historique **Mairaiy / Gemini Aoede** reste la voix par défaut. L'API `/api/voice/speak` continue à refuser toute voix non certifiée comme Aoede. Cela protège l'identité vocale mais peut rendre AURA silencieuse quand la voix externe n'est pas accessible.

## Nouveau secours gratuit et explicite

Dans le chat, cliquer sur **Voix locale : OFF** pour activer **Voix locale : ON**.

- Le navigateur sélectionne uniquement une voix `fr-*` avec `SpeechSynthesisVoice.localService === true` (installée localement).
- AURA lit une courte phrase de contrôle immédiatement après l'activation.
- En mode local ON, le texte ne traverse **aucun endpoint TTS**, y compris lorsque Aoede serait accessible; l'exécution est sur l'appareil.
- Les liens, le Markdown et les blocs de code sont normalisés avant lecture; les messages longs sont divisés en courts segments.
- La voix de secours est affichée comme **AURA · voix locale**, jamais comme Mairaiy/Aoede.
- En mode OFF, le fonctionnement Aoede historique est inchangé, sans remplacement automatique.
- Le choix est conservé dans le stockage local du navigateur. Pas de micro ni de reconnaissance vocale impliqués dans la sortie audio.
- S'il n'existe pas de voix française locale, le bouton l'indique. Aucune voix distante ne sera utilisée à son insu.

Les voix intégrées à Windows/Edge peuvent être moins naturelles que des modèles neuronaux. Cette option rétablit la lecture vocale gratuite, **pas** la voix Aoede ni une qualité studio.

### Sur Windows/Edge

Installer une voix française **locale** dans les paramètres de langue et de synthèse vocale de Windows. Vérifier ensuite que le navigateur expose cette voix comme locale, puis réouvrir la page AURA. Une voix « Online » ne compte pas comme installée localement.

## Amélioration du modèle local

Pour le petit Qwen3 exécuté sur l'hébergement, `compactFrenchPrompt` :

- réduit le prompt à 2 400 caractères avec seulement le message, le but, jusqu'à quatre tours récents, quelques faits et informations déclarées ;
- utilise `/no_think` reconnu par Qwen3 pour réduire le raisonnement interne qui consomme inutilement les jetons de sortie ;
- limite cette voie aux réponses courtes (450 jetons maximum) ;
- conserve le prompt riche sur les autres fournisseurs ;
- ne modifie ni le modèle, ni la mémoire ni le choix du fournisseur.

## Politique financière

**Zéro euro de dépenses additionnelles.** Aucun paquet npm, VPS, abonnement, service d'API TTS ou modèle payant supplémentaire n'a été introduit.

La voix locale ne dépend pas des quotas Gemini. Le mode historique Aoede peut utiliser une offre gratuite Gemini **uniquement si cette offre et son quota ont été explicitement confirmés**, et il ne doit jamais passer automatiquement sur un niveau facturé. Les prix/quotas externes changent; les contrôler dans la console du fournisseur.

Pour le moteur de dialogue, la disponibilité d'une clé gratuite n'assure pas une conversation illimitée ou de qualité équivalente à un modèle plus gros.

## Vérification avant publication

- `npm run check`, `npm test` et `node --test test/dashboard_voice_fallback.test.js test/compact_french_prompt.test.js`.
- Tester le bouton local avec une voix française installée : phrase de contrôle, réponse courte, longue réponse et changement OFF/ON.
- Vérifier dans l'onglet Réseau que **le mode ON ne déclenche aucune requête `/api/voice/speak`**.
- Vérifier qu'en mode OFF une voix autre qu'Aoede est refusée.
- Vérifier séparément `GET /api/capabilities` (statut du modèle linguistique) et `GET /api/voice/status` (statut Aoede).
- La branche GitHub et l'archive de packaging ne prouvent **pas** l'installation sur Hostinger. Un test réel de conversation après déploiement est obligatoire.

## Documentation technique

- `src/dashboard-runtime.js` : synthèse locale en navigateur et sélection explicite.
- `src/dashboard.js` : bouton visuel et libellés.
- `src/french_language.js` : prompt local compact et suppression du mode de pensée.
- `test/dashboard_voice_fallback.test.js`, `test/compact_french_prompt.test.js` : tests de non-régression.
- Documentation Qwen3 sur `/no_think` : https://github.com/QwenLM/Qwen3
- Grille tarifaire Gemini (tiers gratuit ET payant) : https://ai.google.dev/gemini-api/docs/pricing
