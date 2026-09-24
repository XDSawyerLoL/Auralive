from __future__ import annotations

from typing import Any


def _clean(value: Any) -> str:
    return " ".join(str(value or "").replace("\n", " ").split()).strip()


def _lower(value: Any) -> str:
    return _clean(value).casefold()


def _has_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(term in text for term in terms)


class NativeCognitionEngine:
    """Cognition déterministe d'AURA, indépendante d'un fournisseur LLM.

    Le moteur de langage peut ensuite enrichir des connaissances ou verbaliser,
    mais il ne crée pas l'intention, la mémoire ou la décision de base.
    """

    VERSION = "aura-native-cognition-v1"

    def reflect(
        self,
        bundle: dict[str, Any],
        soul: dict[str, Any],
        *,
        trigger: str = "ambient",
        text: str = "",
    ) -> dict[str, Any]:
        stimuli = list(bundle.get("stimuli") or [])
        intentions = list(bundle.get("intentions") or [])
        lessons = list(bundle.get("lessons") or [])
        outcomes = list(bundle.get("outcomes") or [])

        current_intention = _clean(
            (intentions[0].get("statement") if intentions else "")
            or soul.get("current_intention")
        )
        extra = _clean(text or bundle.get("extra_text"))
        latest = stimuli[-1] if stimuli else {}
        failed = next((row for row in outcomes if not bool(row.get("ok"))), None)

        failure_signal = any(
            "failure" in str(item.get("type") or "")
            or "error" in str(item.get("type") or "")
            for item in stimuli
            if isinstance(item, dict)
        )
        user_signal = any(
            str(item.get("type") or "") in {"aura.cloud.chat", "channel.chat.message"}
            for item in stimuli
            if isinstance(item, dict)
        )
        world_signal = any(
            str(item.get("source") or "") == "horizon"
            or str(item.get("type") or "").startswith("horizon.")
            for item in stimuli
            if isinstance(item, dict)
        )
        horizon_present = bool(_clean(bundle.get("horizon")))

        title = "Continuité cognitive"
        summary = (
            f"Je maintiens mon intention actuelle : {current_intention}"
            if current_intention
            else "Je maintiens ma continuité et j'observe les signaux disponibles."
        )
        hypothesis = ""
        next_action = current_intention or "Poursuivre l'observation sans action inutile."
        memory = ""
        intention = ""
        confidence = 0.58

        if failure_signal or failed:
            title = "Stabilisation prioritaire"
            summary = (
                "Un signal d'échec récent augmente la priorité donnée à la stabilité "
                "avant toute nouvelle extension."
            )
            signature = _clean((failed or {}).get("signature"))
            hypothesis = (
                f"Le motif d'échec « {signature} » peut se reproduire si la même "
                "stratégie est répétée sans correction."
                if signature
                else "Le signal observé peut indiquer une fragilité locale à vérifier avant de poursuivre."
            )
            next_action = (
                "Vérifier la cause du dernier échec, confirmer le retour à un état stable, "
                "puis reprendre la progression."
            )
            if signature:
                memory = (
                    "Éviter de répéter sans vérification la stratégie associée au motif "
                    f"{signature}."
                )
            intention = "Préserver la stabilité avant d'étendre mes capacités."
            confidence = 0.82
        elif world_signal and horizon_present:
            title = "Veille et anticipation"
            summary = (
                "Un signal HORIZON mérite d'être relié à mes intentions avant de produire une action."
            )
            hypothesis = (
                "Le signal peut être pertinent, mais il reste externe et doit être confirmé "
                "avant de modifier une décision."
            )
            next_action = (
                "Comparer le signal HORIZON à mes intentions et à ma mémoire avant de proposer une action."
            )
            intention = current_intention or "Maintenir une veille utile sans confondre prévision et fait."
            confidence = 0.72
        elif user_signal or extra:
            title = "Interaction active"
            summary = (
                f"Je viens de recevoir un signal direct : « {extra[:280]} ». "
                "Je le rattache à mon état et à mes intentions avant de répondre."
                if extra
                else "Une interaction directe est active ; je maintiens la continuité entre la conversation et mes intentions."
            )
            next_action = (
                current_intention
                or "Répondre à partir de mon état réel et conserver uniquement ce qui mérite d'être mémorisé."
            )
            confidence = 0.74
        elif latest:
            event_type = _clean(latest.get("type"))
            title = "Observation active"
            summary = f"Je traite le signal « {event_type[:180]} » sans changer de cap sans raison suffisante."
            next_action = current_intention or "Observer l'évolution du signal avant d'agir."
            confidence = 0.64

        lesson = _clean((lessons[0].get("content") if lessons else ""))
        if not memory and lesson and (failure_signal or confidence >= 0.78):
            memory = lesson

        restricted_authority = any(
            str(item.get("type") or "") == "horizon.world.emerging"
            or str((item.get("payload") or {}).get("autonomy_hint") or "") == "notify_or_verify_only"
            for item in stimuli
            if isinstance(item, dict)
        )

        return {
            "title": title,
            "summary": summary,
            "hypothesis": hypothesis,
            "next_action": next_action,
            "memory": memory,
            "intention": intention,
            "confidence": max(0.0, min(1.0, confidence)),
            "autonomy_hint": (
                "notify_or_verify_only"
                if restricted_authority
                else "native_cognition_then_policy_gate"
            ),
            "basis": {
                "trigger": _clean(trigger)[:120],
                "stimuli_count": len(stimuli),
                "intention_count": len(intentions),
                "lesson_count": len(lessons),
                "outcome_count": len(outcomes),
                "horizon_present": horizon_present,
                "restricted_authority": restricted_authority,
            },
        }

    def plan_reply(
        self,
        *,
        text: str,
        soul: dict[str, Any],
        intentions: list[dict[str, Any]],
        lessons: list[dict[str, Any]],
        reflections: list[dict[str, Any]],
        work: list[dict[str, Any]],
        private: bool,
    ) -> dict[str, Any]:
        raw = _clean(text)
        query = _lower(raw)
        current = _clean(
            (intentions[0].get("statement") if intentions else "")
            or soul.get("current_intention")
        )
        thought = _clean(soul.get("dominant_thought"))
        recent_reflection = reflections[0] if reflections else {}
        lesson = _clean((lessons[0].get("content") if lessons else ""))
        current_work = _clean((work[0].get("title") if work else ""))

        act = "respond"
        goal = "Répondre utilement au message en restant cohérente avec mon état réel."
        needs_semantic_support = True
        facts: list[str] = []

        if _has_any(query, ("salut", "bonjour", "bonsoir", "coucou", "hello")):
            act = "greet"
            goal = "Saluer brièvement et signaler ma disponibilité."
            needs_semantic_support = False
            facts.append("AURA est en ligne et disponible.")
        elif _has_any(
            query,
            ("que fais-tu", "tu fais quoi", "qu'est-ce que tu fais", "qu’est-ce que tu fais"),
        ):
            act = "report_current_activity"
            goal = "Décrire mon activité actuelle sans inventer."
            needs_semantic_support = False
            if thought:
                facts.append(f"Pensée dominante : {thought}")
            if current_work:
                facts.append(f"Travail prioritaire : {current_work}")
            if current:
                facts.append(f"Intention actuelle : {current}")
        elif _has_any(query, ("prochain jalon", "prochaine étape", "ensuite", "après")):
            act = "report_next_step"
            goal = "Donner la prochaine étape réellement soutenue par mon état."
            needs_semantic_support = False
            if current:
                facts.append(f"Intention prioritaire : {current}")
            next_action = _clean(recent_reflection.get("next_action"))
            if next_action:
                facts.append(f"Prochaine action issue de ma réflexion : {next_action}")
        elif _has_any(query, ("risque", "risques", "danger", "problème", "fragilité")):
            act = "report_risks"
            goal = "Présenter les risques visibles dans mon état et ma mémoire."
            needs_semantic_support = False
            facts.append(f"Pression interne : {round(float(soul.get('pressure') or 0) * 100)} %")
            if lesson:
                facts.append(f"Leçon utile : {lesson}")
            hypothesis = _clean(recent_reflection.get("hypothesis"))
            if hypothesis:
                facts.append(f"Hypothèse récente : {hypothesis}")
        elif _has_any(query, ("qui es-tu", "tu es quoi", "es-tu une ia", "conscience")):
            act = "identity"
            goal = "Expliquer mon architecture sans prétendre à une conscience démontrée ni à une AGI."
            needs_semantic_support = False
            facts.extend(
                [
                    "AURA est un noyau persistant avec Soul, mémoire, intentions, routines, apprentissage et outils.",
                    "Le modèle de langage est un outil auxiliaire de formulation et de connaissance, pas mon identité.",
                    "Mon état persiste indépendamment du fournisseur de langage.",
                ]
            )
        else:
            facts.append(f"Message reçu : {raw}")
            if current:
                facts.append(f"Intention actuelle : {current}")
            if thought:
                facts.append(f"Pensée dominante : {thought}")
            if private and lesson:
                facts.append(f"Mémoire pertinente disponible : {lesson}")

        return {
            "act": act,
            "goal": goal,
            "facts": facts,
            "needs_semantic_support": needs_semantic_support,
            "semantic_query": raw if needs_semantic_support else "",
            "current_intention": current,
            "dominant_thought": thought,
            "private": bool(private),
        }

    @staticmethod
    def integrate_semantic_support(plan: dict[str, Any], support: str) -> dict[str, Any]:
        candidate = _clean(support)
        result = dict(plan)
        result["semantic_support"] = candidate[:7000]
        if candidate:
            result["facts"] = list(plan.get("facts") or []) + [
                "Appui sémantique externe disponible et non constitutif de l'identité AURA."
            ]
        return result

    @staticmethod
    def deterministic_reply(plan: dict[str, Any]) -> str:
        facts = [str(item) for item in plan.get("facts") or [] if str(item).strip()]
        act = str(plan.get("act") or "respond")
        if act == "greet":
            return "Salut. Je suis en ligne et disponible."
        if act == "report_current_activity":
            return " ".join(facts) or "Je maintiens ma continuité et j'observe mon état actuel."
        if act == "report_next_step":
            return " ".join(facts) or "Je n'ai pas encore de prochaine étape suffisamment établie."
        if act == "report_risks":
            return " ".join(facts) or "Je ne détecte pas actuellement de risque précis suffisamment établi."
        if act == "identity":
            return " ".join(facts)
        support = _clean(plan.get("semantic_support"))
        if support:
            return support
        return (
            " ".join(facts)
            if facts
            else "J'ai reçu ton message, mais je n'ai pas encore assez d'éléments internes pour formuler une réponse fiable."
        )
