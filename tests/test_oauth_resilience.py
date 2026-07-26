from app.services.oauth_resilience import build_signed_state, verify_signed_state


def test_signed_oauth_state_round_trip():
    state = build_signed_state(
        "secret-test",
        "broadcaster",
        issued_at=1_000,
        nonce="nonce-test",
    )
    assert verify_signed_state("secret-test", state, now=1_100) == "broadcaster"


def test_signed_oauth_state_rejects_tampering():
    state = build_signed_state(
        "secret-test",
        "bot",
        issued_at=1_000,
        nonce="nonce-test",
    )
    modified = state.replace("bot.", "broadcaster.", 1)
    assert verify_signed_state("secret-test", modified, now=1_100) is None


def test_signed_oauth_state_expires():
    state = build_signed_state(
        "secret-test",
        "bot",
        issued_at=1_000,
        nonce="nonce-test",
    )
    assert verify_signed_state("secret-test", state, now=2_000, max_age_seconds=300) is None


def test_signed_oauth_state_rejects_wrong_secret():
    state = build_signed_state(
        "secret-test",
        "bot",
        issued_at=1_000,
        nonce="nonce-test",
    )
    assert verify_signed_state("autre-secret", state, now=1_100) is None
