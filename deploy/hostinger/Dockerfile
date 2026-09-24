FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    AURA_HOST=0.0.0.0 \
    AURA_NATIVE_ENGINE_AUTOSTART=false \
    OBS_AUTO_CONNECT=false \
    OBS_DISCOVER_LOCAL=false \
    OBS_ENABLED=false

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libsndfile1 espeak-ng \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY config ./config
COPY tests ./tests
COPY docs ./docs
COPY pytest.ini README.md FONCTIONS.md SECURITY.md LICENSE ./
COPY deploy ./deploy

RUN mkdir -p /app/data/media && chmod +x /app/deploy/hostinger/start.sh

EXPOSE 8787
CMD ["/app/deploy/hostinger/start.sh"]
