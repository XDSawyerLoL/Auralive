# AURA Runtime

AURA Runtime is the local execution plane of AURA. It is not Quantic Studio.

## Standalone

Minimal installation:

```bash
python -m pip install -r aura_runtime/requirements.txt
python -m aura_runtime --check
```

To connect a standalone runtime:

```text
AURA_CLOUD_BASE_URL=https://...
AURA_CLOUD_TOKEN=...
AURA_CLOUD_WORKER_ENABLED=true
AURA_COMPUTE_MESH_CONSENT=true
```

Then:

```bash
python -m aura_runtime
```

The base standalone daemon always supports deterministic `compute` jobs. Additional
capabilities are advertised only when an adapter actually exposes them, so a worker
cannot claim voice, image, operator, inference or evolution work it cannot perform.

## Studio compatibility

Quantic Studio imports the same implementation through
`app.services.aura_cloud_worker.AuraCloudWorker`. The Studio file is only an
adapter that injects its local AI, voice, image, operator and Evolution capabilities.

Invariant: AURA Runtime can exist without Quantic Studio; Studio can stream without
owning AURA's execution plane.
