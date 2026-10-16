"""The reader run's answer check, and the committed run against the snapshot."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import reader as rd  # noqa: E402
import rescore as rs  # noqa: E402

TEXT = "This sits outside my circle of competence.  A deal by June 30 is highly improbable."


def answer(view="likely", vq="A deal by June 30 is highly improbable", low=True, lq="outside my circle of competence"):
    return {"view": view, "viewQuote": vq, "lowConviction": low, "convictionQuote": lq}


def test_reader_keeps_exact_quotes():
    assert rd.problems(answer(), TEXT) == []
    # Whitespace runs don't matter; words do.
    assert rd.problems(answer(lq="sits  outside\nmy circle"), TEXT) == []


def test_reader_rejects_bad_answers():
    assert rd.problems(answer(vq="a deal is highly improbable"), TEXT) == ["viewQuote is not an exact span of the reasoning"]
    assert rd.problems(answer(vq=""), TEXT) == ["viewQuote is empty"]
    assert rd.problems(answer(view="none"), TEXT) == ["viewQuote should be empty"]
    assert rd.problems(answer(low=False), TEXT) == ["convictionQuote should be empty"]
    long_text = " ".join(f"w{i}" for i in range(40))
    assert rd.problems(answer(vq=long_text, low=False, lq=""), long_text) == [f"viewQuote is longer than {rd.MAX_WORDS} words"]


RUN = rs.DATA / "reader-run.json"


@pytest.fixture(scope="module")
def run():
    return json.loads(RUN.read_text(encoding="utf-8"))


def test_reader_run_covers_every_scored_pick(run):
    snap = json.loads((rs.DATA / "snapshot.json").read_text(encoding="utf-8"))
    scored = {rd.pick_key(p) for p in snap["picks"] if rs.is_scored(p)}
    assert {p["key"] for p in run["picks"]} == scored
    assert all(p["A"] and p["B"] for p in run["picks"])
    assert run["prompt"] == rd.PROMPT and run["promptSha256"] == rd.sha(rd.PROMPT)


def test_reader_run_quotes_are_in_the_pulled_text(run):
    # The raw pull isn't committed; this runs where one exists.
    raw = rs.DATA / "raw" / run["pull"]
    if not (raw / "predictions.json").exists():
        pytest.skip("no raw pull here")
    text = {rd.pick_key(p): p["reasoning"] for p in rs.load(raw, "predictions.json")}
    for p in run["picks"]:
        assert rd.sha(text[p["key"]])[:16] == p["textSha"], p["key"]
        for r in ("A", "B"):
            a = p[r]
            back = {"view": a["view"], "viewQuote": a["viewQuote"], "lowConviction": a["low"], "convictionQuote": a["lowQuote"]}
            assert rd.problems(back, text[p["key"]]) == [], (p["key"], r)


def test_reader_retries_bad_answers_and_survives_a_crash(tmp_path, monkeypatch):
    # Mocked calls, no model: reader A's first call crashes, reader B's first call
    # answers one id twice and skips the rest. Both must be retried and kept once.
    try:
        raw = rs.newest_raw()
    except SystemExit:
        pytest.skip("no raw pull here")
    if not (raw / "predictions.json").exists():
        pytest.skip("no raw pull here")
    seen = {}

    def fake_ask(reader, items, feedback, workdir):
        n = seen[reader["id"]] = seen.get(reader["id"], 0) + 1
        if n == 1 and reader["id"] == "A":
            raise RuntimeError("worker crashed")
        if n == 1 and reader["id"] == "B":
            return {"items": [answer_for(items[0][0])] * 2}, {}, None
        return {"items": [answer_for(i) for i, *_ in items]}, {"inTokens": 1, "outTokens": 1}, None

    def answer_for(i):
        return {"id": i, "view": "none", "viewQuote": "", "lowConviction": False, "convictionQuote": ""}

    monkeypatch.setattr(rd, "ask", fake_ask)
    out = tmp_path / "run.json"
    monkeypatch.setattr(sys, "argv", ["reader.py", "--limit", "12", "--workers", "2", "--out", str(out)])
    rd.main()
    run = json.loads(out.read_text(encoding="utf-8"))
    assert len(run["picks"]) == 12 and all(p["A"] and p["B"] for p in run["picks"])
    assert run["failed"] == {"A": {}, "B": {}}
    first_b = next(c for c in run["calls"] if c["reader"] == "B" and c["attempt"] == 1)
    assert first_b["kept"] == 0 and len(first_b["rejected"]) == 12
    first_a = next(c for c in run["calls"] if c["reader"] == "A" and c["attempt"] == 1)
    assert first_a["error"].startswith("RuntimeError")
    assert sum(c["kept"] for c in run["calls"]) == 24
