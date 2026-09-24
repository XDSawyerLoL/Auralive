#!/bin/sh
set -eu

export AURA_HOST="${AURA_HOST:-0.0.0.0}"
export AURA_PORT="${AURA_PORT:-${PORT:-8787}}"
export AURA_BROADCAST_ENGINE="${AURA_BROADCAST_ENGINE:-obs}"
export AURA_NATIVE_ENGINE_AUTOSTART="${AURA_NATIVE_ENGINE_AUTOSTART:-false}"
export OBS_AUTO_CONNECT="${OBS_AUTO_CONNECT:-false}"
export OBS_DISCOVER_LOCAL="${OBS_DISCOVER_LOCAL:-false}"
export OBS_ENABLED="${OBS_ENABLED:-false}"

mkdir -p data/media

exec python -m app.main_v3
