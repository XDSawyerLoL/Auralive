# AURA Voice Node — Mairaiy

AURA Voice Node est un **sidecar séparé** du runtime AURA. Il utilise l'API publique OpenAI-compatible de VoiceStudio sans copier son code dans AURA.

## Pourquoi cette séparation

- VoiceStudio est sous AGPL-3.0.
- AURA ne vendore ni ne modifie son code ici.
- Le nœud VoiceStudio reste un service distinct et AURA dialogue uniquement via HTTP.
- Le moteur OmniVoice amont est Apache-2.0, mais VoiceStudio reste l'enveloppe AGPL utilisée par ce compose.

## Démarrage local

1. Générer un secret :

```bash
export OMNIVOICE_API_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
```

2. Lancer :

```bash
docker compose -f voice-node/docker-compose.yml up -d
```

3. Ouvrir VoiceStudio sur `http://127.0.0.1:3900`, créer une voix nommée **Mairaiy** à partir d'un échantillon de référence que vous avez le droit d'utiliser.

4. Vérifier :

```bash
curl http://127.0.0.1:3900/v1/audio/voices \
  -H "Authorization: Bearer $OMNIVOICE_API_KEY"
```

## Connexion à AURA Cloud

Le Cloud AURA doit atteindre ce nœud via une **URL HTTPS protégée**. Ne jamais exposer directement le port 3900 en HTTP sur Internet.

Variables AURA :

```env
AURA_VOICE_FABRIC_ENABLED=true
AURA_VOICE_FABRIC_BASE_URL=https://voice.example.net
AURA_VOICE_FABRIC_API_KEY=...
AURA_VOICE_FABRIC_MODEL=omnivoice
AURA_MAIRAIY_VOICE_PROFILE_NAME=Mairaiy
AURA_MAIRAIY_REQUIRE_PROFILE=true
AURA_VOICE_FABRIC_ZERO_COST_CONFIRMED=true
AURA_VOICE_FABRIC_STRICT_IDENTITY=true
```

`AURA_VOICE_FABRIC_ZERO_COST_CONFIRMED=true` signifie seulement que **ce backend précis est auto-hébergé et ne facture pas à l'appel**. Il ne signifie pas que le matériel, l'électricité ou l'hébergement sont gratuits.

## Identité vocale

Quand `AURA_VOICE_FABRIC_STRICT_IDENTITY=true`, si le profil Mairaiy n'est pas disponible, AURA **reste silencieuse**. Elle ne bascule pas sur une autre voix.
