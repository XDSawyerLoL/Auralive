# ! /usr/bin/env bash
set -euo pipefail
command -v llama-server >/dev/null || { echo 'Installer llama.cpp sur votre serveur Linux.' >&2; exit 1; }
exec llama-server --host 127.0.0.1 --port 8080 --alias aura-fr --threads 2 -c 2048 --jinja -hf Qwen/Qwen3-0.6B-GGUF:Q8_0
