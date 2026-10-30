#!/usr/bin/env python3
"""AURA isolated CPU-only GGUF comparison, never imports or modifies production state.

Inputs: official frozen LANGUAGE_BENCHMARK exported by Node plus optional
synthetic greeting tests. Requires only Python 3 standard library.
Outputs: JSON and Markdown with measured evidence, not fabricated scores.
"""
import argparse
import json
import math
import os
import re
import signal
import statistics
import subprocess
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

MODELS = {
    "lfm2.5-350m-q4": {
        "file": "LFM2.5-350M-Q4_K_M.gguf",
        "license": "lfm1.0 (specific terms; manual legal review required)",
        "publisher": "LiquidAI",
    },
    "qwen2.5-0.5b-q4": {
        "file": "qwen2.5-0.5b-instruct-q4_k_m.gguf",
        "license": "Apache-2.0",
        "publisher": "Qwen",
    },
    "qwen3-0.6b-q4": {
        "file": "Qwen3-0.6B-Q4_K_M.gguf",
        "license": "Apache-2.0",
        "publisher": "Unsloth quantization of Qwen3",
    },
}

EXTRAS = [
    {"id": "greeting", "dimension": "natural-greeting", "context": [],
     "question": "Salut !", "checks": [{"pattern": r"\b(bonjour|salut|coucou|bonsoir|hello|enchant[eé])\b", "flags": "i"}],
     "excludes": []},
    {"id": "simple-fr", "dimension": "french-grammar", "context": [],
     "question": "Corrige cette phrase sans changer le sens : « Les enfant joue dehors. »",
     "checks": [{"pattern": r"les enfants jouent dehors", "flags": "i"}], "excludes": []},
    {"id": "math-check", "dimension": "fact-check", "context": [],
     "question": "Combien font 7 + 5 ? Réponds en français, brièvement.",
     "checks": [{"pattern": r"\b(12|douze)\b", "flags": "i"}], "excludes": []},
]

def fold(s):
    raw = unicodedata.normalize("NFD", str(s).lower())
    return "".join(ch for ch in raw if unicodedata.category(ch) != "Mn")

def pass_test(answer, case):
    text = fold(answer)
    if not text.strip():
        return False
    def matches(spec):
        # Emulate the AURA JS test regexes, including French accents.
        try:
            pattern = fold(spec["pattern"])
            return bool(re.search(pattern, text, re.IGNORECASE if "i" in spec.get("flags", "") else 0))
        except re.error:
            raise RuntimeError("Invalid scoring regexp in benchmark fixture: " + case["id"])
    return all(matches(x) for x in case.get("checks", [])) and not any(
        matches(x) for x in case.get("excludes", []))

def memory_mb(pid):
    try:
        status = Path(f"/proc/{pid}/status").read_text()
        m = re.search(r"^VmRSS:\s+(\d+)\s+kB", status, re.M)
        return round(int(m.group(1)) / 1024, 1) if m else None
    except (OSError, ValueError):
        return None

def request_json(url, obj=None, timeout=5):
    body = json.dumps(obj, ensure_ascii=False).encode("utf-8") if obj is not None else None
    req = urllib.request.Request(url, data=body, headers={
        "Content-Type": "application/json"
    } if body is not None else {}, method="POST" if body is not None else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as result:
        return json.loads(result.read(1024 * 1024).decode("utf-8"))

def wait_health(base, proc, seconds=100):
    start = time.monotonic()
    while time.monotonic() - start < seconds:
        if proc.poll() is not None:
            return False, time.monotonic() - start
        try:
            result = request_json(base + "/health", timeout=2)
            if result.get("status") in ("ok", "ready") or result.get("status") is None:
                return True, time.monotonic() - start
        except (urllib.error.URLError, TimeoutError, ValueError, OSError):
            pass
        time.sleep(.5)
    return False, time.monotonic() - start

def measure_one(base, case, timeout):
    start = time.monotonic()
    system = ("Tu es le moteur d'expression d'AURA. Réponds en français naturel, "
              "fidèlement au message. Pas de raisonnement caché visible ni d'explication superflue.")
    messages = [{"role": "system", "content": system}]
    for msg in case["context"]:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": case["question"]})
    payload = {"model": "local", "stream": False, "temperature": 0.1,
               "max_tokens": 28 if case["id"] == "greeting" else 64,
               "chat_template_kwargs": {"enable_thinking": False},
               "messages": messages}
    try:
        result = request_json(base + "/v1/chat/completions", payload, timeout)
        answer = str(result.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
        tokens = int((result.get("usage") or {}).get("completion_tokens") or 0)
        elapsed = round(time.monotonic() - start, 3)
        return {"test": case["id"], "dimension": case["dimension"],
                "elapsed_s": elapsed, "tokens": tokens,
                "tokens_per_s": round(tokens / elapsed, 2) if elapsed else 0,
                "valid": pass_test(answer, case), "error": "",
                "answer": answer[:500], "timeout": False}
    except Exception as exc:
        elapsed = round(time.monotonic() - start, 3)
        error_type = ("timeout" if isinstance(exc, (TimeoutError, ConnectionError))
                      or "timed out" in str(exc).lower() else "request-error")
        return {"test": case["id"], "dimension": case["dimension"],
                "elapsed_s": elapsed, "tokens": 0, "tokens_per_s": 0,
                "valid": False, "error": error_type,
                "answer": "", "timeout": error_type == "timeout"}

def percentile(vals, q):
    if not vals:
        return None
    vals = sorted(vals)
    n = (len(vals) - 1) * q
    return round(vals[math.floor(n)] + (vals[math.ceil(n)] - vals[math.floor(n)]) * (n - math.floor(n)), 2)

def summarize(model, records, uptime, mem, boot_error=""):
    good = [r for r in records if r["valid"]]
    count = len(records)
    return {"model": model, "license": MODELS[model]["license"],
            "samples": count, "correct": len(good),
            "accuracy_pct": round(100 * len(good) / count, 1) if count else None,
            "timeouts": sum(r["timeout"] for r in records),
            "failures": sum(bool(r["error"]) for r in records),
            "p50_s": percentile([r["elapsed_s"] for r in records], .5),
            "p95_s": percentile([r["elapsed_s"] for r in records], .95),
            "tokens_per_s_mean": round(statistics.mean([r["tokens_per_s"] for r in records if r["tokens"]]), 2)
                if any(r["tokens"] for r in records) else None,
            "rss_peak_mb": mem,
            "startup_s": round(uptime, 2) if uptime is not None else None,
            "error": boot_error,
            "pass_winner_gate": bool(count and len(good) >= int(count * .75)
                and not any(r["timeout"] for r in records)
                and percentile([r["elapsed_s"] for r in records], .95) < 30),
            "samples_detail": records}

def run_model(name, args, cases, output):
    cfg = MODELS[name]
    gguf = Path(args.models_dir) / cfg["file"]
    if not gguf.exists() or gguf.stat().st_size < 100_000_000:
        raise RuntimeError("GGUF missing/too small: " + cfg["file"])
    binary = Path(args.llama_server).resolve()
    log = open(output / (name + ".server.log"), "w", encoding="utf-8")
    # Each model gets its own process, 1 CPU thread and fixed GGUF context.
    cmd = [str(binary), "-m", str(gguf), "--host", "127.0.0.1",
           "--port", str(args.port), "--ctx-size", "1536", "--threads", "1",
           "--threads-batch", "1", "--threads-http", "1", "--parallel", "1",
           "--batch-size", "32", "--ubatch-size", "16", "--no-warmup"]
    proc = subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    base = f"http://127.0.0.1:{args.port}"
    records = []
    peak = None
    try:
        ready, wait_s = wait_health(base, proc, seconds=args.startup_timeout)
        if not ready:
            return summarize(name, [], wait_s, memory_mb(proc.pid), "health-unavailable")
        for i in range(args.repeats):
            for case in cases:
                mem = memory_mb(proc.pid)
                peak = max(peak or 0, mem or 0) or None
                record = measure_one(base, case, args.request_timeout)
                record["repeat"] = i + 1
                records.append(record)
                mem = memory_mb(proc.pid)
                peak = max(peak or 0, mem or 0) or None
                print(json.dumps({"model": name, "test": case["id"], "round": i+1,
                                  "correct": record["valid"], "sec": record["elapsed_s"],
                                  "error": record["error"]}), flush=True)
                if proc.poll() is not None:
                    return summarize(name, records, wait_s, peak, "native-process-exited")
        return summarize(name, records, wait_s, peak)
    finally:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
            proc.wait(timeout=5)
        except (ProcessLookupError, subprocess.TimeoutExpired):
            try: os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError: pass
        log.close()

def markdown(report):
    text = [
        "# AURA — Comparaison indépendante de modèles français",
        "",
        "**Production Hostinger intacte.** Expérience sur GitHub Actions CPU uniquement, non représentative des quotas Hostinger.",
        "Les tests sont synthétiques ; réussite automatisée par expressions régulières, non évaluation humaine de la fluidité.",
        "",
        "| Modèle | Licence | Score | p50 | p95 | RAM maximale | Tokens/s | Timeouts |",
        "|---|---|---:|---:|---:|---:|---:|---:|"
    ]
    for row in report["results"]:
        val = lambda x, unit="": "—" if x is None else str(x) + unit
        text.append("| " + " | ".join([
            row["model"], row["license"],
            val(row["accuracy_pct"], "%"), val(row["p50_s"], " s"),
            val(row["p95_s"], " s"), val(row["rss_peak_mb"], " Mo"),
            val(row["tokens_per_s_mean"]), str(row["timeouts"])
        ]) + " |")
    text += ["", "**Conditions :** " + str(report["repeat"]) + " passages, "
             + str(report["tests_count"]) + " cas, llama.cpp " + report["engine_revision"]
             + ", 1 thread, contexte 1536, 64 tokens maximum (28 pour salutation).",
             "",
             "## Résultats détaillés",
             ""]
    for row in report["results"]:
        text += ["### " + row["model"], ""]
        if row["error"]:
            text += ["Échec de démarrage : " + row["error"], ""]
        for sample in row["samples_detail"]:
            text.append("- " + sample["test"] + " (" + str(sample["repeat"]) + ") : "
                        + ("OK" if sample["valid"] else "ÉCHEC")
                        + ", " + str(sample["elapsed_s"]) + " s, "
                        + "«" + sample["answer"].replace("\n", " ")[:160] + "»")
        text.append("")
    text += ["## Décision", "",
             "Aucun changement automatique du moteur AURA. "
             "Un candidat ne peut passer en essai Hostinger qu'après vérification de la licence, "
             "absence de timeouts, qualité minimale et mesure CPU sous les contraintes de l'hébergement.",
             ""]
    return "\n".join(text)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--llama-server", required=True)
    parser.add_argument("--models-dir", required=True)
    parser.add_argument("--benchmark", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--models", default=",".join(MODELS))
    parser.add_argument("--repeats", type=int, default=1)
    parser.add_argument("--request-timeout", type=int, default=30)
    parser.add_argument("--startup-timeout", type=int, default=100)
    parser.add_argument("--port", type=int, default=18197)
    args = parser.parse_args()
    if args.repeats < 1 or args.repeats > 3:
        parser.error("repeats must be 1..3")
    selected = args.models.split(",")
    if any(m not in MODELS for m in selected) or len(set(selected)) != len(selected):
        parser.error("invalid or repeated models")
    cases = json.loads(Path(args.benchmark).read_text(encoding="utf-8")) + EXTRAS
    assert len(cases) == 12, "Nine frozen AURA questions plus three synthetic tests"
    output = Path(args.output); output.mkdir(parents=True, exist_ok=True)
    results = []
    for name in selected:
        print("BENCHMARK_MODEL=" + name, flush=True)
        try: results.append(run_model(name, args, cases, output))
        except Exception as exc:
            results.append(summarize(name, [], None, None, "setup-error:"+type(exc).__name__))
    report = {"engine_revision":"b11425", "repeat":args.repeats,
              "tests_count":len(cases), "results":results}
    (output / "results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (output / "REPORT.md").write_text(markdown(report), encoding="utf-8")
    print(markdown(report), flush=True)
    # Deliberately exit nonzero if any model cannot complete; no false winners.
    if any(row["samples"] != len(cases)*args.repeats for row in results):
        raise SystemExit(2)

if __name__ == "__main__":
    main()
