from app.services.voice_signature import expressive_performance


def test_fictional_game_violence_uses_cheerful_dark_comedy():
    instruction = expressive_performance(
        "screen game initiative",
        "Le dernier survivant vient d'être éliminé dans une explosion.",
    )
    assert "almost innocently" in instruction
    assert "fictional" in instruction
    assert "never childish" in instruction


def test_real_tragedy_disables_the_comic_contrast():
    instruction = expressive_performance(
        "conversation",
        "On parle d'un attentat et de victimes réelles.",
    )
    assert "sober" in instruction
    assert "remove the cheerful contrast" in instruction


def test_moderation_stays_unambiguous():
    instruction = expressive_performance(
        "moderation",
        "Ce comportement n'est pas accepté ici.",
    )
    assert "firmly authoritative" in instruction
    assert "no playful ambiguity" in instruction
