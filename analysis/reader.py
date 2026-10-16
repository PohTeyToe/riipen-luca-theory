"""Two model readers go through the written reasoning behind every scored Season 1 pick.

Each reader sees the market question, the side the agent bet and its reasoning. It
isn't given the agent, the 1-15 rating, the market price or the outcome, though
about a third of the texts quote the price themselves. For each
pick it says whether the text treats the side it bet as the likely outcome, and
whether the text says the agent lacks conviction, with an exact quote for each
(the prompt is analysis/reader_prompt.md).

Every answer is checked before it's kept: the ids must match the batch, each quote
must appear word for word in that pick's reasoning and be at most 25 words, and a
quote must be there exactly when the answer needs one. Picks that fail go back to
the same reader with the reasons, up to two more times.

Run from the repo root:  python -I analysis/reader.py [--limit N] [--workers 8]
Needs the Claude CLI (claude -p), logged in. Writes data/reader-run.json: every
call (worker, start, end, tokens, what passed and what didn't) and every answer.
Nothing here runs on the public site; the page replays this file.
"""
import argparse
import hashlib
import json
import os
import queue
import random
import re
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rescore  # noqa: E402

ROOT = rescore.ROOT
OUT = ROOT / "data" / "reader-run.json"
PROMPT = (Path(__file__).resolve().parent / "reader_prompt.md").read_text(encoding="utf-8").replace("\r\n", "\n")
READERS = [
    {"id": "A", "model": "claude-opus-5-5", "effort": "high"},
    {"id": "B", "model": "claude-sonnet-5-5", "effort": "high"},
]
BATCH = 12
SEED = 15
MAX_ATTEMPTS = 3
MAX_WORDS = 25
VIEWS = ("likely", "unlikely", "none")
SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "view": {"type": "string", "enum": list(VIEWS)},
                    "viewQuote": {"type": "string"},
                    "lowConviction": {"type": "boolean"},
                    "convictionQuote": {"type": "string"},
                },
                "required": ["id", "view", "viewQuote", "lowConviction", "convictionQuote"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["items"],
    "additionalProperties": False,
}


def sha(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def pick_key(p):
    return f"{p['agentId']}|{p['eventId']}|{p['createdAt']}"


def squash(s):
    return re.sub(r"\s+", " ", s).strip()


def problems(answer, reasoning):
    """Why an answer can't be kept (empty if it can)."""
    out = []
    for field, needed in (("viewQuote", answer["view"] != "none"), ("convictionQuote", answer["lowConviction"])):
        q = answer[field]
        if needed and not q.strip():
            out.append(f"{field} is empty")
        elif not needed and q.strip():
            out.append(f"{field} should be empty")
        elif q.strip():
            if squash(q) not in squash(reasoning):
                out.append(f"{field} is not an exact span of the reasoning")
            elif len(q.split()) > MAX_WORDS:
                out.append(f"{field} is longer than {MAX_WORDS} words")
    return out


def ask(reader, items, feedback, workdir):
    """One claude -p call. Returns (structured output or None, usage dict, error text)."""
    body = {"items": [{"id": i, "question": q, "side": s, "reasoning": r} for i, q, s, r in items]}
    text = json.dumps(body, ensure_ascii=False, indent=1)
    if feedback:
        text = "Your last answer for these items had problems:\n" + "\n".join(feedback) + "\n\nAnswer them again.\n\n" + text
    cmd = [
        "claude", "-p", "--model", reader["model"], "--effort", reader["effort"],
        "--system-prompt", PROMPT, "--tools", "", "--strict-mcp-config", "--setting-sources", "",
        "--no-session-persistence", "--output-format", "json", "--json-schema", json.dumps(SCHEMA),
    ]
    env = {**os.environ, "CLAUDE_CODE_DISABLE_CLAUDE_MDS": "1"}
    try:
        res = subprocess.run(cmd, input=text, capture_output=True, text=True, encoding="utf-8",
                             timeout=900, env=env, cwd=workdir)
    except subprocess.TimeoutExpired:
        return None, {}, "timed out after 900 s"
    try:
        out = json.loads(res.stdout)
    except json.JSONDecodeError:
        return None, {}, f"exit {res.returncode}: {(res.stderr or res.stdout)[-300:]}"
    u = out.get("usage") or {}
    usage = {
        "inTokens": sum(u.get(k, 0) or 0 for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")),
        "outTokens": u.get("output_tokens", 0),
        "costUsd": out.get("total_cost_usd"),
        "apiMs": out.get("duration_api_ms"),
    }
    if out.get("is_error") or not isinstance(out.get("structured_output"), dict):
        return None, usage, f"no structured output ({out.get('subtype')})"
    return out["structured_output"], usage, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="read only the first N picks (a test run)")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()

    raw = rescore.newest_raw()
    rescore.verify_pull(raw)
    preds = rescore.load(raw, "predictions.json")
    events = {e["id"]: e for e in rescore.load(raw, "events.json")}
    scored = sorted((p for p in preds if rescore.is_scored(p)), key=lambda p: (p["createdAt"], p["agentId"], p["eventId"]))
    keys = [pick_key(p) for p in scored]
    if len(set(keys)) != len(keys):
        raise SystemExit("two scored picks share agent, event and time")
    gaps = [pick_key(p) for p in scored if p["eventId"] not in events or not p.get("reasoning")]
    if gaps:
        raise SystemExit(f"{len(gaps)} scored picks have no event or no reasoning, e.g. {gaps[0]}")
    random.Random(SEED).shuffle(scored)
    if args.limit:
        scored = scored[: args.limit]
    by_key = {pick_key(p): p for p in scored}
    batches = [scored[i: i + BATCH] for i in range(0, len(scored), BATCH)]

    jobs = queue.Queue()
    for b, _ in enumerate(batches):
        for reader in READERS:
            jobs.put((reader, b, [pick_key(p) for p in batches[b]], 1, []))
    answers = {r["id"]: {} for r in READERS}
    failed = {r["id"]: {} for r in READERS}
    calls = []
    lock = threading.Lock()
    pending = [jobs.qsize()]
    started = datetime.now(timezone.utc)
    t_start = time.monotonic()
    ms = lambda: round(1000 * (time.monotonic() - t_start))  # noqa: E731

    def handle(worker, workdir, job):
        reader, b, pick_keys, attempt, feedback = job
        ids = [chr(ord("a") + i) for i in range(len(pick_keys))]
        items = [(i, events[by_key[k]["eventId"]]["question"], by_key[k]["prediction"], by_key[k]["reasoning"])
                 for i, k in zip(ids, pick_keys)]
        t0 = ms()
        try:
            out, usage, error = ask(reader, items, feedback, workdir)
        except Exception as e:  # noqa: BLE001 - a crashed call is retried like a failed one
            out, usage, error = None, {}, f"{type(e).__name__}: {e}"
        t1 = ms()
        kept, bad = 0, []
        if out is not None:
            answered = [a.get("id") for a in out.get("items", []) if isinstance(a, dict)]
            got = {a["id"]: a for a in out.get("items", []) if isinstance(a, dict) and answered.count(a.get("id")) == 1}
            for i in set(answered) - set(ids):
                bad.append((i, "id not in this batch"))
            for i, k in zip(ids, pick_keys):
                a = got.get(i)
                if answered.count(i) > 1:
                    why = ["answered twice"]
                elif a is None:
                    why = ["no answer"]
                else:
                    try:
                        why = problems(a, by_key[k]["reasoning"])
                    except (KeyError, TypeError, AttributeError):
                        why = ["answer doesn't match the schema"]
                if why:
                    bad.append((i, "; ".join(why)))
                else:
                    with lock:
                        answers[reader["id"]][k] = {
                            "view": a["view"], "viewQuote": squash(a["viewQuote"]),
                            "low": a["lowConviction"], "lowQuote": squash(a["convictionQuote"]),
                        }
                    kept += 1
        retry_keys = [k for i, k in zip(ids, pick_keys) if out is None or any(x[0] == i for x in bad)]
        why_by_key = {pick_keys[ids.index(i)]: w for i, w in bad if i in ids}
        call = {
            "reader": reader["id"], "worker": worker, "batch": b, "attempt": attempt,
            "items": len(pick_keys), "t0": t0, "t1": t1, **usage, "kept": kept,
            "rejected": [{"pick": pick_keys[ids.index(i)] if i in ids else None, "why": w} for i, w in bad],
            "error": error,
        }
        with lock:
            calls.append(call)
            status = "ok" if not retry_keys else f"{len(retry_keys)} to retry"
            print(f"[{t1 / 1000:7.1f}s] w{worker} {reader['id']} batch {b:3d} try {attempt}: kept {kept}/{len(pick_keys)} {status}"
                  + (f" ({error})" if error else ""), flush=True)
            if retry_keys and attempt < MAX_ATTEMPTS:
                # The retry numbers its items afresh (a, b, ...), so the feedback uses the new ids.
                fb = [f"- item {chr(ord('a') + n)}: {why_by_key[k]}" for n, k in enumerate(retry_keys) if k in why_by_key]
                jobs.put((reader, b, retry_keys, attempt + 1, fb))
                pending[0] += 1
            else:
                for k in retry_keys:
                    failed[reader["id"]][k] = why_by_key.get(k, error)

    def work(worker):
        workdir = tempfile.mkdtemp(prefix="reader-")
        while True:
            try:
                job = jobs.get(timeout=1)
            except queue.Empty:
                with lock:
                    if pending[0] == 0:
                        return
                continue
            try:
                handle(worker, workdir, job)
            except Exception as e:  # noqa: BLE001 - never leave a job uncounted, or the run hangs
                with lock:
                    for k in job[2]:
                        failed[job[0]["id"]][k] = f"{type(e).__name__}: {e}"
            finally:
                with lock:
                    pending[0] -= 1

    threads = [threading.Thread(target=work, args=(w,)) for w in range(args.workers)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    wall = ms()

    picks = []
    for p in sorted(scored, key=lambda p: (p["createdAt"], p["agentId"], p["eventId"])):
        k = pick_key(p)
        picks.append({"key": k, "textSha": sha(p["reasoning"])[:16],
                      **{r["id"]: answers[r["id"]].get(k) for r in READERS}})
    pred_file = next(f for f in rescore.load(raw, "manifest.json")["files"] if f["file"] == "predictions.json")
    run = {
        "ranAt": started.isoformat(timespec="seconds"),
        "wallMs": wall,
        "pull": raw.name,
        "predictionsSha256": pred_file["sha256"],
        "limit": args.limit or None,
        "readers": READERS,
        "workers": args.workers,
        "batchSize": BATCH,
        "seed": SEED,
        "maxAttempts": MAX_ATTEMPTS,
        "prompt": PROMPT,
        "promptSha256": sha(PROMPT),
        "schema": SCHEMA,
        "calls": sorted(calls, key=lambda c: (c["t0"], c["worker"])),
        "failed": failed,
        "picks": picks,
    }
    args.out.write_text(json.dumps(run, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    n_ok = {r["id"]: len(answers[r["id"]]) for r in READERS}
    n_failed = {k: len(v) for k, v in failed.items()}
    print(f"done in {wall / 1000:.1f}s: {len(calls)} calls, answers {n_ok}, failed {n_failed} -> {args.out}")


if __name__ == "__main__":
    main()
