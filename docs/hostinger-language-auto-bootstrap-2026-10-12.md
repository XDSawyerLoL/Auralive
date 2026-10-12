# AURA Hostinger autonomous French bootstrap (2026-10-12)

This is a **public-weights, on-host, no-token-charge** installer. The application does not buy inference API calls. It downloads the following pinned artifacts over HTTPS, compares SHA-256, rejects unknown redirects and uses an isolated private cache:

- ggml-org/llama.cpp b11425 CPU-only Linux x64 or arm64 archive (release digests pinned).
- Qwen/Qwen3-0.6B-GGUF Q8_0, Apache 2.0 (weight SHA-256 pinned).

The engine is launched on loopback only and its dynamic linker is configured from the actual extracted binary directory and library paths. It is never evaluated by arbitrary shell commands.

On first boot, optionally warm-start asynchronously. Model download is approximately 639 MB plus binary (~18 MB); verify RAM, disk, CPU and bandwidth. The installer prefers $HOME/.cache/aura-language-runtime across Hostinger hbuild versions; subsequent upgrades can reuse verified cached files. EACCES/noexec cgroup memory blocking cannot be safely bypassed. A model this small may produce low-quality French; passing the HTTP /health endpoint is NOT a semantic quality guarantee.

Settings:
- AURA_EMBEDDED_AUTOPROVISION_ENABLED=true (default on Linux)
- AURA_EMBEDDED_LANGUAGE_ENABLED=true (default)
- AURA_EMBEDDED_LANGUAGE_WARMUP=false (optional to skip startup preloading)
- AURA_EMBEDDED_CACHE_DIR=/path/to/persistent/private/cache (optional)
- AURA_EMBEDDED_LLAMA_BIN, AURA_EMBEDDED_LANGUAGE_MODEL override auto location when pre-installed.

Acceptance on actual Hostinger: GET /healthz SHA of new deployed commit, /api/language/embedded/status status verified-responsive after an actual test conversation, conversation with French correction and follow-ups, no /api/build or /api/capabilities 500, and no paid service provider. **GitHub CI does not certify deployment**.

No server runtime or hosted model files were uploaded by this PR: Hostinger must deploy the updated application and permit outbound fetches, local subprocesses and sufficient memory.
