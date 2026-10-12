# AURA — on-host GGUF language runtime

The reported Hostinger error involving \`libllama-common.so.0\` is consistent with a Linux shared library loader failure, not proof of a model training defect. The live Hostinger build previously used an embedded runner absent from the canonical Auralive repository.

This module adds a canonical Node.js llama-server adapter using \`LD_LIBRARY_PATH\` containing the executable directory and adjacent \`lib/\` directories. It discovers binary and GGUF under \`.aura-language-runtime\`, supports absolute environment paths, spawns without shell, binds only to localhost on an allocated port, verifies the actual /health endpoint and only then attempts generation.

Optional host environment variables:
- AURA_EMBEDDED_LANGUAGE_ENABLED=true
- AURA_EMBEDDED_LLAMA_BIN=/absolute/path/to/llama-server
- AURA_EMBEDDED_LANGUAGE_MODEL=/absolute/path/to/model.gguf
- AURA_EMBEDDED_LANGUAGE_THREADS=2

**No binary/model files are bundled or downloaded**. They must be present on the deployment server with matching architecture and versioned .so symlinks. Hostinger hbuilds/version folders change on redeploy: avoid pointing to an obsolete build path. A shared hosting plan might forbid native subprocesses or lack RAM. EACCES cannot be bypassed; a permitted hosting runtime or tested WASM alternative is necessary.

The status endpoint must report \`verified-responsive\` after a *real* successful inference. Code and CI alone do not demonstrate on-host operation.
