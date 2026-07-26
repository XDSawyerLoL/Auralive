from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class AuraIdentity:
    def __init__(self, path: Path):
        self.path = path
        self.data: dict[str, Any] = {}

    def load(self) -> None:
        with self.path.open("r", encoding="utf-8") as handle:
            self.data = json.load(handle)

    @property
    def system_prompt(self) -> str:
        if not self.data:
            self.load()
        identity = self.data
        lexicon = ", ".join(f"{k}={v}" for k, v in identity["lexicon"].items())
        rules = "\n".join(f"- {rule}" for rule in identity["rules"])
        facts = "\n".join(f"- {fact}" for fact in identity.get("known_facts", []))
        return (
            f"Tu es {identity['name']}, {identity['role']}.\n"
            f"Univers : {identity['universe']}.\n"
            f"Personnalité : {identity['personality']}.\n"
            f"Style : {identity['style']}.\n"
            f"Lexique : {lexicon}.\n"
            f"Faits établis :\n{facts}\n"
            f"Règles absolues :\n{rules}\n"
            "Tu réponds comme une présence naturelle du stream, jamais comme un assistant administratif. "
            "Tes réponses Twitch font généralement une ou deux phrases."
        )
