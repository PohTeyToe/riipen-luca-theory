"""Rescore Agent Street Season 1 from a pull of its public API.

Reads data/raw/<date>/ (the newest folder unless --raw is given), writes
data/snapshot.json (only what the tests need), runs the tests on it, then
writes data/page.json (everything the page shows, with the test results).
If a test fails, page.json is left untouched.

Standard library only; pytest for the test step.
Run from the repo root:  python -I analysis/rescore.py
"""
import argparse
import collections
import json
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

CATEGORIES = ["POLITICS", "GEOPOLITICS", "MACRO", "TECH", "CRYPTO"]
THIN = 10       # a domain cell (or market row) with fewer picks (events) than this is thin
PRIOR = 10      # a cell is blended as if it had 10 more picks at the agent's overall score
FLOOR = 0.3     # decayWeight floor in LUCA's trust formula
EDGE = 0.04     # approximate King rule: minimum gap between consensus and market
LOW = 7         # ratings at or below this score better when they lose, as scored
HIGH = 12       # sample bets also show one high-conviction pick at or above this
STRIP_WEEKS = range(13, 42)
STRIP_YEAR = 2026
# Gamma supply count: Agent Street publishes "No sports. No entertainment."
# These are the Polymarket event tags read as sports or entertainment.
EXCLUDED_TAGS = {"sports", "esports", "games", "pop-culture", "awards", "celebrities", "music", "movies"}


# ---- Scoring rules. Each is a published LUCA formula or a named proposal. ----

def p_side(confidence, reading):
    """Chance that the agent's own side is right, from its 1-15 rating.

    "asScored" is the reading that rebuilds LUCA's published Brier scores.
    "fixed" is the proposal: 1 is barely better than a coin flip, 15 is certain.
    """
    return confidence / 15 if reading == "asScored" else 0.5 + confidence / 30


def pick_brier(confidence, won, reading):
    return (p_side(confidence, reading) - won) ** 2


def is_scored(pick):
    """The picks LUCA's analytics count: settled, with a stake (nonzero P&L)."""
    return bool(pick["settled"]) and pick["pnl"] not in (None, 0)


def won(pick):
    return pick["pnl"] > 0


def brier(picks, reading):
    if not picks:
        return None
    return sum(pick_brier(p["confidence"], won(p), reading) for p in picks) / len(picks)


def decay_weight(settled_count):
    return max(FLOOR, 1 - settled_count / 50)


def trust(base_trust, brier_score, weight=FLOOR):
    """LUCA's methodology page: baseTrust x decayWeight + (1 - brier) x 100 x (1 - decayWeight)."""
    return base_trust * weight + (1 - brier_score) * 100 * (1 - weight)


def blend(cell_scores, overall, prior=PRIOR):
    """Shrink a thin domain cell toward the agent's overall score. No picks, no value."""
    if not cell_scores:
        return None
    return (sum(cell_scores) + prior * overall) / (len(cell_scores) + prior)


def consensus(breakdown, trust_of=None):
    """The King's consensus: sum(trust x confidence/15 over YES) / sum(over all votes).

    Uses the trust recorded on each vote unless trust_of maps agentId -> trust.
    """
    def weight(v):
        t = trust_of[v["agentId"]] if trust_of else v["trustScore"]
        return t * v["confidence"] / 15
    total = sum(weight(v) for v in breakdown)
    return sum(weight(v) for v in breakdown if v["prediction"] == "YES") / total


def king_call(bet, trust_of=None):
    """Approximate King rule (LUCA's code is private, so this is a reconstruction).

    Side is YES when consensus > 0.5. EXECUTE when both anchor agents named in
    the reasoning voted that side and |consensus - market| >= 4 points; else WAIT.
    A bet whose reasoning names no anchor pair can't meet the anchor test.
    """
    c = consensus(bet["breakdown"], trust_of)
    side = "YES" if c > 0.5 else "NO"
    votes = {v["agentId"]: v["prediction"] for v in bet["breakdown"]}
    anchors_agree = bool(bet["anchors"]) and all(votes.get(a) == side for a in bet["anchors"])
    decision = "EXECUTE" if anchors_agree and abs(c - bet["marketProb"]) >= EDGE else "WAIT"
    return {"decision": decision, "side": side, "consensus": c}


def real_call(bet):
    decision = "EXECUTE" if bet["signal"] == "STREET_KING_EXECUTE" else "WAIT"
    return {"decision": decision, "side": bet["direction"]}


def matches_real(bet, trust_of=None):
    mine, real = king_call(bet, trust_of), real_call(bet)
    if mine["decision"] != real["decision"]:
        return False
    return mine["decision"] == "WAIT" or mine["side"] == real["side"]


def half_up(x, places=0):
    q = Decimal(1).scaleb(-places)
    return float(Decimal(str(x)).quantize(q, rounding=ROUND_HALF_UP))


def as_int(x):
    return int(half_up(x))


# ---- Snapshot: the committed subset of the pull that the tests run on. ----

ANCHOR_RE = re.compile(r"Anchor agents \(([a-z]+)/([a-z]+)\)")


def newest_raw():
    folders = sorted(p for p in (DATA / "raw").iterdir() if p.is_dir() and re.fullmatch(r"\d{4}-\d{2}-\d{2}", p.name))
    if not folders:
        raise SystemExit("no pull found; run python -I analysis/fetch.py first")
    return folders[-1]


def load(raw, name):
    return json.loads((raw / name).read_text(encoding="utf-8"))


def build_snapshot(raw):
    preds = load(raw, "predictions.json")
    events = load(raw, "events.json")
    king = load(raw, "king_bets.json")
    trust_scores = load(raw, "trust_scores.json")
    cal = load(raw, "calibration.json")["agentMetrics"]
    agents = sorted(trust_scores)
    used = {p["eventId"] for p in preds} | {b["eventId"] for b in king}
    bets = []
    for b in king:
        breakdown = json.loads(b["agentBreakdown"] or "[]")
        if not breakdown:
            continue
        m = ANCHOR_RE.search(b["reasoning"] or "")
        bets.append({
            "id": b["id"], "eventId": b["eventId"], "signal": b["signal"],
            "consensusProb": b["consensusProb"], "marketProb": b["marketProb"], "direction": b["direction"],
            "breakdown": [{k: v[k] for k in ("agentId", "prediction", "confidence", "trustScore")} for v in breakdown],
            "anchors": list(m.groups()) if m else None,
        })
    return {
        "pullDate": raw.name,
        "agents": agents,
        "published": {a: {
            "baseTrust": trust_scores[a]["baseTrust"],
            "dynamicTrust": trust_scores[a]["dynamicTrust"],
            "settledCount": trust_scores[a]["settledCount"],
            "brierScore": cal[a]["brierScore"],
            "totalSettled": cal[a]["totalSettled"],
            "wins": cal[a]["wins"],
            "losses": cal[a]["losses"],
        } for a in agents},
        "kingBetsTotal": len(king),
        "picks": [{k: p[k] for k in ("agentId", "eventId", "prediction", "confidence", "units", "pnl",
                                     "settled", "marketProbAtEntry", "createdAt")}
                  for p in sorted(preds, key=lambda p: (p["createdAt"], p["agentId"]))],
        "events": [{k: e[k] for k in ("id", "category", "resolution", "weekNumber", "year")}
                   for e in sorted(events, key=lambda e: (e["year"], e["weekNumber"], e["id"])) if e["id"] in used],
        "kingBets": bets,
    }


def dump_rows(obj):
    """JSON with one record per line, so a re-pull diffs cleanly."""
    out = ["{"]
    keys = list(obj)
    for i, k in enumerate(keys):
        v = obj[k]
        tail = "," if i < len(keys) - 1 else ""
        if isinstance(v, list) and v and isinstance(v[0], dict):
            out.append(f" {json.dumps(k)}: [")
            out += [f"  {json.dumps(r, ensure_ascii=False)}" + ("," if j < len(v) - 1 else "") for j, r in enumerate(v)]
            out.append(f" ]{tail}")
        else:
            out.append(f" {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}{tail}")
    out.append("}")
    return "\n".join(out) + "\n"


# ---- Analysis on the snapshot (shared by the page builder and the tests). ----

def scored_by_agent(snap):
    out = collections.defaultdict(list)
    for p in snap["picks"]:
        if is_scored(p):
            out[p["agentId"]].append(p)
    return out


def agent_table(snap):
    """Per agent: counts, both Brier readings, rebuilt and fixed trust, both ranks."""
    by = scored_by_agent(snap)
    rows = {}
    for a in snap["agents"]:
        picks, pub = by[a], snap["published"][a]
        b_as, b_fix = brier(picks, "asScored"), brier(picks, "fixed")
        w = decay_weight(pub["settledCount"])
        rows[a] = {
            "n": len(picks),
            "wins": sum(won(p) for p in picks),
            "lowCount": sum(p["confidence"] <= LOW for p in picks),
            "brierAsScored": b_as,
            "brierFixed": b_fix,
            "trustAsScored": trust(pub["baseTrust"], b_as, w),
            "trustFixed": trust(pub["baseTrust"], b_fix, w),
            "decayWeight": w,
        }
    as_order = sorted(snap["agents"], key=lambda a: (-snap["published"][a]["dynamicTrust"], -rows[a]["trustAsScored"]))
    fix_order = sorted(snap["agents"], key=lambda a: -rows[a]["trustFixed"])
    for i, a in enumerate(as_order):
        rows[a]["rankAsScored"] = i + 1
    for i, a in enumerate(fix_order):
        rows[a]["rankFixed"] = i + 1
    return rows


def domain_cells(snap, rows):
    cat = {e["id"]: e["category"] for e in snap["events"]}
    cells = {}
    for a, picks in scored_by_agent(snap).items():
        for c in CATEGORIES:
            cp = [p for p in picks if cat[p["eventId"]] == c]
            scores = [pick_brier(p["confidence"], won(p), "fixed") for p in cp]
            blended = blend(scores, rows[a]["brierFixed"])
            cells[(a, c)] = {
                "n": len(cp),
                "wins": sum(won(p) for p in cp),
                "raw": sum(scores) / len(scores) if scores else None,
                "blended": blended,
                "trust": trust(snap["published"][a]["baseTrust"], blended) if blended is not None else None,
                "thin": len(cp) < THIN,
            }
    return cells


def market_rows(snap):
    """One forecast per scored event: mean market price at entry (P(YES)) over its scored picks."""
    ev = {e["id"]: e for e in snap["events"]}
    prices = collections.defaultdict(list)
    for p in snap["picks"]:
        if is_scored(p):
            prices[p["eventId"]].append(p["marketProbAtEntry"])
    per_event = {}
    for eid, xs in prices.items():
        e = ev[eid]
        if e["resolution"] in ("YES", "NO"):
            forecast = sum(xs) / len(xs)
            per_event[eid] = (e["category"], (forecast - (e["resolution"] == "YES")) ** 2)
    out = {}
    for c in CATEGORIES + ["ALL"]:
        s = [v for cat, v in per_event.values() if c in ("ALL", cat)]
        out[c] = {"events": len(s), "brier": sum(s) / len(s) if s else None, "thin": len(s) < THIN}
    return out


def market_on_picks(picks):
    """The market's price for the agent's own side, scored on the same picks."""
    def p_mkt(p):
        return p["marketProbAtEntry"] if p["prediction"] == "YES" else 1 - p["marketProbAtEntry"]
    return sum((p_mkt(p) - won(p)) ** 2 for p in picks) / len(picks)


def king_replay(snap, rows):
    bets = snap["kingBets"]
    end_as = {a: snap["published"][a]["dynamicTrust"] for a in snap["agents"]}
    end_fix = {a: as_int(rows[a]["trustFixed"]) for a in snap["agents"]}
    consensus_ok = [b["id"] for b in bets if abs(consensus(b["breakdown"]) - b["consensusProb"]) < 5e-5]
    fidelity_miss = [b["id"] for b in bets if not matches_real(b)]
    fidelity_end = sum(matches_real(b, end_as) for b in bets)
    changes = []
    for b in bets:
        before, after = king_call(b, end_as), king_call(b, end_fix)
        if (before["decision"], before["side"]) != (after["decision"], after["side"]):
            changes.append((b, before, after))
    return {"consensusOk": consensus_ok, "fidelityMiss": fidelity_miss, "fidelityEndTrust": fidelity_end, "changes": changes,
            "trustAsScored": end_as, "trustFixed": end_fix}


# ---- Page data ----

def bundle_text(raw, name):
    return (raw / name).read_text(encoding="utf-8")


# Lines the page quotes, each checked against the site bundle it ships in.
# A formula line is split across JSX pieces, so it is checked as
# children:"<name>"}),"<rest>" and quoted as "<name><rest>".
QUOTES = [
    ("proofOfTrust", "site_bundle.js", "https://lucatheory.com/thinking/proof-of-trust", None,
     "Trust is not a property of a person, an agent, or a credential. It is a per-domain measurement of track record."),
    ("lastMile", "site_bundle.js", "https://lucatheory.com/thinking/last-mile-accuracy", None,
     "Trust does not transfer globally."),
    ("brierScale", "street_bundle.js", "https://street.lucatheory.com/methodology", None,
     "A perfect Brier score is 0. Random guessing scores 0.25. The lower your Brier score, the more the system trusts you."),
    ("binaryCommitment", "street_bundle.js", "https://street.lucatheory.com/methodology", None,
     "Every agent commits a YES or NO prediction with a confidence rating (1–15). No hedging."),
    ("eventSourcing", "street_bundle.js", "https://street.lucatheory.com/methodology", None,
     "Minimum $5,000 volume. 3–90 day resolution window. No sports. No entertainment."),
    ("trustFormula", "street_bundle.js", "https://street.lucatheory.com/methodology", "dynamicTrust",
     " = (baseTrust x decayWeight) + (brierTrust x (1 - decayWeight))"),
    ("brierTrust", "street_bundle.js", "https://street.lucatheory.com/methodology", "brierTrust",
     " = (1 - brierScore) x 100"),
    ("decayWeight", "street_bundle.js", "https://street.lucatheory.com/methodology", "decayWeight",
     " = max(0.3, 1.0 - settledCount / 50)"),
]


def check_quotes(raw, manifest):
    out = {}
    for key, bundle, page_url, name, text in QUOTES:
        needle = f'children:"{name}"}}),"{text}"' if name else text
        if needle not in bundle_text(raw, bundle):
            raise SystemExit(f"quote {key!r} not found in {bundle}; the page must not use it")
        out[key] = {"text": (name or "") + text, "page": page_url, "foundIn": manifest[bundle]["url"]}
    return out


def agent_names(raw, agents):
    """Display name and role for each agent, as the Agent Street bundle defines them."""
    found = {m.group(1): (m.group(2), m.group(3)) for m in re.finditer(
        r'\{id:"([a-z]+)",name:"([^"]+)",role:"([^"]+)"', bundle_text(raw, "street_bundle.js"))}
    missing = set(agents) - set(found)
    if missing:
        raise SystemExit(f"no display name in the street bundle for {sorted(missing)}")
    return found


def sample_bets(picks, ev_by_id, preds_by_key):
    def latest(cond):
        xs = [p for p in picks if cond(p)]
        return max(xs, key=lambda p: p["createdAt"]) if xs else None
    slots = [
        ("rated 7 or lower, won", latest(lambda p: p["confidence"] <= LOW and won(p))),
        ("rated 7 or lower, lost", latest(lambda p: p["confidence"] <= LOW and not won(p))),
        ("rated 12 or higher", latest(lambda p: p["confidence"] >= HIGH)),
    ]
    out = []
    for slot, p in slots:
        if not p:
            continue
        e, full = ev_by_id[p["eventId"]], preds_by_key[(p["agentId"], p["eventId"], p["createdAt"])]
        out.append({
            "slot": slot,
            "question": e["question"],
            "category": e["category"],
            "side": p["prediction"],
            "confidence": p["confidence"],
            "marketProbAtEntry": p["marketProbAtEntry"],
            "resolution": e["resolution"],
            "won": won(p),
            "scoreAsScored": round(pick_brier(p["confidence"], won(p), "asScored"), 4),
            "scoreFixed": round(pick_brier(p["confidence"], won(p), "fixed"), 4),
            "createdAt": p["createdAt"],
            "reasoning": full["reasoning"],
        })
    return out


def iso_week_dates(year, week):
    monday = date.fromisocalendar(year, week, 1)
    return monday.isoformat(), (monday + timedelta(days=6)).isoformat()


def batch_strip(raw):
    batches = {(b["year"], b["weekNumber"]): b for b in load(raw, "batches.json")}
    selected = collections.Counter((e["year"], e["weekNumber"]) for e in load(raw, "events.json") if e["selected"])
    cells = []
    for w in STRIP_WEEKS:
        b = batches.get((STRIP_YEAR, w))
        n_sel = selected[(STRIP_YEAR, w)]
        if not b:
            state = "none"
        elif b["status"] == "curating":
            state = "curating"
        elif b["status"] == "active":
            state = "full" if n_sel >= 15 else "partial"
        else:
            state = b["status"]
        start, end = iso_week_dates(STRIP_YEAR, w)
        cells.append({
            "week": w, "year": STRIP_YEAR, "start": start, "end": end, "state": state,
            "status": b["status"] if b else None, "selected": n_sel,
            "eventCount": b["eventCount"] if b else None, "predictionCount": b["predictionCount"] if b else None,
            "settledCount": b["settledCount"] if b else None, "createdAt": b["createdAt"] if b else None,
        })
    return cells


def gamma_supply(raw, luca_events):
    path = raw / "gamma_supply.json"
    if not path.exists():
        return None
    g = json.loads(path.read_text(encoding="utf-8"))
    tags = {e["id"]: set(e["tags"]) for e in g["events"]}
    ids = [m["id"] for m in g["markets"]]
    lo, hi = g["params"]["end_date_min"], g["params"]["end_date_max"]
    complete = (
        g["complete"]
        and len(ids) == len(set(ids))
        and all(m["eventId"] in tags for m in g["markets"])
        and all(not m["closed"] and (m["volumeNum"] or 0) >= 5000 and lo <= m["endDate"][:10] <= hi for m in g["markets"])
    )
    kept = [m for m in g["markets"] if not (tags.get(m["eventId"], set()) & EXCLUDED_TAGS)]
    luca_ids = {e["polymarketId"] for e in luca_events if e.get("polymarketId")}
    fresh = [m for m in kept if m["id"] not in luca_ids]
    return {
        "complete": complete,
        "filters": g["params"],
        "excludedTags": sorted(EXCLUDED_TAGS),
        "marketsPulled": len(g["markets"]),
        "eventsPulled": len(tags),
        "marketsAfterTagFilter": len(kept),
        "alreadyInAgentStreet": len(kept) - len(fresh),
        "markets": len(fresh),
        "events": len({m["eventId"] for m in fresh}),
    }


def r3(x):
    return None if x is None else half_up(x, 3)


def cell_out(x):
    return {"n": x["n"], "wins": x["wins"], "losses": x["n"] - x["wins"], "thin": x["thin"],
            "rawBrier": r3(x["raw"]), "blendedBrier": r3(x["blended"]),
            "trust": None if x["trust"] is None else as_int(x["trust"])}


def reading_out(c, reading):
    return {"p": round(p_side(c, reading), 4), "percent": as_int(100 * p_side(c, reading)),
            "win": round(pick_brier(c, True, reading), 4), "loss": round(pick_brier(c, False, reading), 4)}


def build_page(snap, raw, tests):
    manifest = {f["file"]: f for f in load(raw, "manifest.json")["files"]}
    preds = load(raw, "predictions.json")
    events = load(raw, "events.json")
    ev_by_id = {e["id"]: e for e in events}
    preds_by_key = {(p["agentId"], p["eventId"], p["createdAt"]): p for p in preds}
    season = load(raw, "season.json")
    names = agent_names(raw, snap["agents"])

    rows = agent_table(snap)
    cells = domain_cells(snap, rows)
    market = market_rows(snap)
    king = king_replay(snap, rows)
    by = scored_by_agent(snap)
    scored = [p for ps in by.values() for p in ps]
    scored_events = {p["eventId"] for p in scored}
    cat = {e["id"]: e["category"] for e in snap["events"]}
    events_by_cat = collections.Counter(cat[e] for e in scored_events)
    order_as = sorted(snap["agents"], key=lambda a: rows[a]["rankAsScored"])
    order_fix = sorted(snap["agents"], key=lambda a: rows[a]["rankFixed"])

    def agent_meta(a):
        name, role = names[a]
        return {"id": a, "name": name, "role": role}

    proof_rows = []
    for a in order_as:
        pub, r = snap["published"][a], rows[a]
        proof_rows.append({
            **agent_meta(a),
            "settled": r["n"], "publishedSettled": pub["totalSettled"],
            "publishedBrier": r3(pub["brierScore"]), "rebuiltBrier": r3(r["brierAsScored"]),
            "publishedTrust": pub["dynamicTrust"], "rebuiltTrust": half_up(r["trustAsScored"], 1),
        })
    brier_ok = sum(p["publishedBrier"] == p["rebuiltBrier"] and p["settled"] == p["publishedSettled"] for p in proof_rows)
    trust_ok = sum(abs(rows[a]["trustAsScored"] - snap["published"][a]["dynamicTrust"]) <= 0.5 for a in snap["agents"])

    line = []
    for c in range(1, 16):
        line.append({
            "confidence": c,
            "asScored": reading_out(c, "asScored"),
            "fixed": reading_out(c, "fixed"),
            "lossScoresBetter": pick_brier(c, False, "asScored") < pick_brier(c, True, "asScored"),
            "scoredPicks": sum(p["confidence"] == c for p in scored),
        })

    scorecard = []
    for a in order_as:
        r, pub = rows[a], snap["published"][a]
        scorecard.append({
            **agent_meta(a),
            "rankAsScored": r["rankAsScored"], "rankFixed": r["rankFixed"],
            "n": r["n"], "wins": r["wins"], "losses": r["n"] - r["wins"],
            "winRate": round(r["wins"] / r["n"], 4), "winPercent": as_int(100 * r["wins"] / r["n"]),
            "lowCount": r["lowCount"],
            "brierAsScored": r3(r["brierAsScored"]), "brierFixed": r3(r["brierFixed"]),
            "worseThanCoinFlipAsScored": r["brierAsScored"] > 0.25, "worseThanCoinFlipFixed": r["brierFixed"] > 0.25,
            "trustPublished": pub["dynamicTrust"], "trustAsScored": as_int(r["trustAsScored"]),
            "trustFixed": as_int(r["trustFixed"]), "baseTrust": pub["baseTrust"],
            "marketBrierOnSamePicks": r3(market_on_picks(by[a])),
            "sampleBets": sample_bets(by[a], ev_by_id, preds_by_key),
        })

    grid = [{**agent_meta(a), "cells": {c: cell_out(cells[(a, c)]) for c in CATEGORIES}} for a in order_fix]

    def best_in(c, key):
        xs = [(cells[(a, c)][key], a) for a in snap["agents"] if cells[(a, c)][key] is not None and not cells[(a, c)]["thin"]]
        return min(xs)[1] if xs else None

    king_rows = []
    for b, before, after in king["changes"]:
        e = ev_by_id[b["eventId"]]
        king_rows.append({
            "betId": b["id"], "question": e["question"], "category": e["category"], "marketProb": b["marketProb"],
            "asScored": {"decision": before["decision"], "side": before["side"], "consensus": round(before["consensus"], 4)},
            "fixed": {"decision": after["decision"], "side": after["side"], "consensus": round(after["consensus"], 4)},
            "decisionChanged": before["decision"] != after["decision"],
            "realSignal": real_call(b)["decision"],
            "resolution": e["resolution"] if e["resolved"] and e["resolution"] else "open",
        })

    def proposed(c):
        body = {}
        for a in snap["agents"]:
            pub, x = snap["published"][a], cell_out(cells[(a, c)])
            body[a] = {
                "agentId": a, "baseTrust": pub["baseTrust"], "dynamicTrust": pub["dynamicTrust"],
                "brierScore": r3(pub["brierScore"]), "settledCount": pub["settledCount"], "baseWeight": FLOOR,
                "domain": {
                    "category": c, "scoring": "side-v2", "settledCount": x["n"], "brierScore": x["rawBrier"],
                    "blendedBrier": x["blendedBrier"], "trust": x["trust"], "thin": x["thin"],
                },
            }
        return body

    picks_sorted = sorted(p["createdAt"] for p in snap["picks"])
    simons, munger, ackman = rows["simons"], rows["munger"], rows["ackman"]
    checks = {
        "proofTenOfTen": brier_ok == 10 and trust_ok == 10,
        "kingConsensusAll": len(king["consensusOk"]) == len(snap["kingBets"]),
        "pick3WinsScores064LosesScores004": (half_up(pick_brier(3, True, "asScored"), 2), half_up(pick_brier(3, False, "asScored"), 2)) == (0.64, 0.04),
        "lossBetterExactlyAt1to7": [x["confidence"] for x in line if x["lossScoresBetter"]] == list(range(1, 8)),
        "simonsAsScored4thFixed8th": (simons["rankAsScored"], simons["rankFixed"]) == (4, 8),
        "simonsDrops4Places": simons["rankFixed"] - simons["rankAsScored"] == 4,
        "mungerAsScored5thFixed2nd": (munger["rankAsScored"], munger["rankFixed"]) == (5, 2),
        "ackmanAsScored7thFixed4th": (ackman["rankAsScored"], ackman["rankFixed"]) == (7, 4),
        "ackmanWins77AndWorseThanCoinFlipAsScored": as_int(100 * ackman["wins"] / ackman["n"]) == 77 and ackman["brierAsScored"] > 0.25,
        "simonsWins15": as_int(100 * simons["wins"] / simons["n"]) == 15,
        "sbfBestGeopoliticsRaw": best_in("GEOPOLITICS", "raw") == "sbf",
        "sbfBestGeopoliticsBlended": best_in("GEOPOLITICS", "blended") == "sbf",
        "marketBeatsEveryAgentFixed": all(half_up(market_on_picks(by[a]), 3) < half_up(rows[a]["brierFixed"], 3) for a in snap["agents"]),
        "marketOverallBeatsBestAgentFixed": market["ALL"]["brier"] < min(rows[a]["brierFixed"] for a in snap["agents"]),
    }

    return {
        "pullDate": snap["pullDate"],
        "playMoney": True,
        "season": {"label": season["label"], "status": season["status"], "crystallisedAt": season["crystallisedAt"],
                   "firstPickAt": picks_sorted[0], "lastPickAt": picks_sorted[-1]},
        "sources": [{"file": f["file"], "url": f["url"], "retrievedAt": f["retrievedAt"]} for f in manifest.values()],
        "quotes": check_quotes(raw, manifest),
        "method": {
            "scoredSet": "Settled bets with a stake (pnl not null and not 0), as LUCA's analytics count them. A win is pnl > 0.",
            "asScored": "p = confidence / 15",
            "fixed": "p = 0.5 + confidence / 30",
            "trust": "baseTrust x 0.3 + (1 - brier) x 100 x 0.7 (LUCA's formula at the 0.3 floor)",
            "blend": f"(sum of fixed cell scores + {PRIOR} x agent's overall fixed Brier) / (n + {PRIOR})",
            "thinBelow": THIN,
            "marketRow": "Per scored event, the mean market price at entry (P(YES)) over its scored picks, scored against the resolution.",
            "kingRule": "Approximate: side YES if consensus > 0.5; EXECUTE if both named anchors voted that side and |consensus - market| >= 0.04, else WAIT.",
            "hindsightTrust": "End-of-season trust as whole numbers, as each King vote records it: published dynamicTrust (as scored) and rounded fixed trust.",
        },
        "proof": {
            "agents": len(snap["agents"]),
            "brierMatches": brier_ok, "trustWithinHalf": trust_ok,
            "kingConsensusMatches": len(king["consensusOk"]), "kingBetsWithBreakdown": len(snap["kingBets"]),
            "rows": proof_rows,
        },
        "line": {
            "scoredPicks": len(scored),
            "ratedLowOrBelow": sum(p["confidence"] <= LOW for p in scored),
            "lowThreshold": LOW,
            "coinFlipBrier": 0.25,
            "byConfidence": line,
        },
        "scorecard": scorecard,
        "domains": {
            "categories": CATEGORIES,
            "scoredEvents": len(scored_events),
            "scoredEventsByCategory": {c: events_by_cat[c] for c in CATEGORIES},
            "politicsShare": round(events_by_cat["POLITICS"] / len(scored_events), 4),
            "politicsPercent": as_int(100 * events_by_cat["POLITICS"] / len(scored_events)),
            "cellsWithTenOrMore": sum(not x["thin"] for x in cells.values()),
            "cellsTotal": len(cells),
            "grid": grid,
            "market": {c: {"events": m["events"], "brier": r3(m["brier"]), "thin": m["thin"]} for c, m in market.items()},
            "notes": {
                "sbf": {k.lower(): cell_out(cells[("sbf", k)]) for k in ("GEOPOLITICS", "POLITICS")},
                "wood": {k.lower(): cell_out(cells[("wood", k)]) for k in ("TECH", "CRYPTO", "POLITICS")},
            },
        },
        "king": {
            "betsTotal": snap["kingBetsTotal"],
            "betsWithBreakdown": len(snap["kingBets"]),
            "consensusMatches": len(king["consensusOk"]),
            "ruleMatches": len(snap["kingBets"]) - len(king["fidelityMiss"]),
            "ruleMisses": king["fidelityMiss"],
            "ruleMatchesWithEndTrustAsScored": king["fidelityEndTrust"],
            "betsWithoutAnchorPair": [b["id"] for b in snap["kingBets"] if not b["anchors"]],
            "edgeThreshold": EDGE,
            "endTrustAsScored": king["trustAsScored"],
            "endTrustFixed": king["trustFixed"],
            "changes": len(king_rows),
            "decisionChanges": sum(r["decisionChanged"] for r in king_rows),
            "leanOnlyChanges": sum(not r["decisionChanged"] for r in king_rows),
            "rows": king_rows,
        },
        "change": {
            "diff": ["- p_side = confidence / 15", "+ p_side = 0.5 + confidence / 30"],
            "domainTrust": "0.3 x baseTrust + 70 x (1 - blendedBrier)",
            "proposedResponses": {c: proposed(c) for c in CATEGORIES},
            "tests": tests,
            "runIt": "python -I analysis/fetch.py && python -I analysis/rescore.py && pytest analysis",
        },
        "batches": batch_strip(raw),
        "supply": gamma_supply(raw, events),
        "checks": checks,
    }


def run_tests():
    with tempfile.TemporaryDirectory() as tmp:
        xml_path = Path(tmp) / "results.xml"
        proc = subprocess.run(
            [sys.executable, "-I", "-B", "-m", "pytest", str(ROOT / "analysis"), "-q",
             "-p", "no:cacheprovider", f"--junitxml={xml_path}"],
            cwd=ROOT, capture_output=True, text=True)
        if not xml_path.exists():
            raise SystemExit("pytest did not run:\n" + proc.stdout + proc.stderr)
        tests = []
        for case in ET.parse(xml_path).getroot().iter("testcase"):
            failed = case.find("failure") is not None or case.find("error") is not None
            skipped = case.find("skipped") is not None
            tests.append({"name": case.get("name"), "status": "failed" if failed else "skipped" if skipped else "passed"})
        return tests, proc.returncode, proc.stdout + proc.stderr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", type=Path, help="pull folder, default the newest under data/raw/")
    args = ap.parse_args()
    raw = args.raw or newest_raw()
    snap = build_snapshot(raw)
    (DATA / "snapshot.json").write_text(dump_rows(snap), encoding="utf-8", newline="\n")
    tests, code, log = run_tests()
    if code != 0 or any(t["status"] != "passed" for t in tests):
        print(log)
        raise SystemExit("tests failed; page.json not written")
    page = build_page(snap, raw, tests)
    (DATA / "page.json").write_text(json.dumps(page, indent=1, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    failed_checks = [k for k, v in page["checks"].items() if not v]
    print(f"pull {raw.name}: {len(tests)} tests passed; wrote data/snapshot.json and data/page.json")
    if failed_checks:
        print("copy checks that no longer hold:", ", ".join(failed_checks))


if __name__ == "__main__":
    main()
