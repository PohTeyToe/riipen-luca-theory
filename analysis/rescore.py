"""Rescore Agent Street Season 1 from a pull of its public API.

Reads data/raw/<date>/ (the newest folder unless --raw is given) after checking
each file against the pull's manifest, builds the snapshot (only what the tests
need), runs the tests on it, then writes data/snapshot.json and data/page.json
(everything the page shows, with the test results and a hash of each input).
If a test or a copy check fails, neither file is touched.

Standard library only; pytest for the test step.
Run from the repo root:  python -I analysis/rescore.py
"""
import argparse
import collections
import hashlib
import itertools
import json
import math
import os
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
EDGE_POINTS = 5  # the win-rate edge over the market price used for "how many bets to tell it from luck"
Z95 = 1.96
Z80 = 0.8416    # for the planning estimate: a real edge clears the luck range about 4 times in 5
STRIP_WEEKS = range(13, 42)
STRIP_YEAR = 2026
# Gamma supply count: Agent Street publishes "No sports. No entertainment."
# These are the Polymarket event tags read as sports or entertainment. Polymarket
# doesn't tag every sports event "sports" (NFL division winners carry only
# nfl/football, a tennis market only sport/tennis), so the league and sport
# tags are listed too. Any one of them drops the event.
EXCLUDED_TAGS = {
    "sports", "sport", "esports", "games", "pop-culture", "awards", "celebrities", "music", "movies",
    "football", "nfl", "cfb", "ncaaf", "soccer", "tennis", "atp", "wta", "boxing", "ufc", "mma",
    "nba", "basketball", "mlb", "baseball", "nhl", "hockey", "golf", "f1", "cricket", "olympics",
}


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


def side_price(pick):
    """The market's price at entry for the side the agent picked (P(YES) or 1 - P(YES))."""
    return pick["marketProbAtEntry"] if pick["prediction"] == "YES" else 1 - pick["marketProbAtEntry"]


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


def consensus(breakdown):
    """The King's consensus: sum(trust x confidence/15 over YES) / sum(over all votes),
    with the trust recorded on each vote."""
    def weight(v):
        return v["trustScore"] * v["confidence"] / 15
    total = sum(weight(v) for v in breakdown)
    return sum(weight(v) for v in breakdown if v["prediction"] == "YES") / total


def king_call(bet):
    """Approximate King rule (LUCA's code is private, so this is a reconstruction).

    Side is YES when consensus > 0.5. EXECUTE when both anchor agents named in
    the reasoning voted that side and |consensus - market| >= 4 points; else WAIT.
    A bet whose reasoning names no anchor pair can't meet the anchor test.
    """
    c = consensus(bet["breakdown"])
    side = "YES" if c > 0.5 else "NO"
    votes = {v["agentId"]: v["prediction"] for v in bet["breakdown"]}
    anchors_agree = bool(bet["anchors"]) and all(votes.get(a) == side for a in bet["anchors"])
    decision = "EXECUTE" if anchors_agree and abs(c - bet["marketProb"]) >= EDGE else "WAIT"
    return {"decision": decision, "side": side, "consensus": c}


def real_call(bet):
    decision = "EXECUTE" if bet["signal"] == "STREET_KING_EXECUTE" else "WAIT"
    return {"decision": decision, "side": bet["direction"]}


def matches_real(bet):
    mine, real = king_call(bet), real_call(bet)
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
    # Only the events the snapshot's picks and King bets refer to.
    used = {p["eventId"] for p in preds} | {b["eventId"] for b in bets}
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
        "events": [{k: e[k] for k in ("id", "polymarketId", "category", "resolution", "weekNumber", "year")}
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


def contracts(snap):
    """Event id -> Polymarket contract. A contract can come back in a later week as a new event."""
    return {e["id"]: e["polymarketId"] for e in snap["events"]}


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
    """Per agent and domain: the fixed Brier, blended toward the agent's overall score
    (every cell, so a 10-pick cell is half its own score), and the cell's win rate against
    the win rate the market's prices implied for its own bets. The page shows no luck range
    per cell: with 50 cells, two or three would land outside a 95% range by luck alone."""
    cat = {e["id"]: e["category"] for e in snap["events"]}
    contract_of = contracts(snap)
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
                "vs": against_market(cp, contract_of) if cp else None,
            }
    return cells


def win_distribution(picks, contract_of):
    """The chance of each total win count if every contract resolved at the market's price.

    Repeat bets on one Polymarket contract share its outcome. With a bets on YES
    and b on NO at a mean entry price q for YES, the contract adds a wins with
    chance q and b wins otherwise. Returns the distribution (index = wins), the
    expected wins under it, and the number of contracts.
    """
    by_contract = collections.defaultdict(list)
    for p in picks:
        by_contract[contract_of[p["eventId"]]].append(p)
    dist, expected = [1.0], 0.0
    for xs in by_contract.values():
        yes = sum(p["prediction"] == "YES" for p in xs)
        no = len(xs) - yes
        q = sum(p["marketProbAtEntry"] for p in xs) / len(xs)
        expected += yes * q + no * (1 - q)
        nxt = [0.0] * (len(dist) + max(yes, no))
        for k, chance in enumerate(dist):
            nxt[k + yes] += chance * q
            nxt[k + no] += chance * (1 - q)
        dist = nxt
    return dist, expected, len(by_contract)


def against_market(picks, contract_of):
    """How often picks won, against the win rate the market's prices at entry implied.

    The luck range is exact: the middle 95% of win counts under win_distribution,
    leaving at most 2.5% on each side. A win rate outside it is an edge luck
    doesn't explain. It doesn't model links between different contracts (two
    markets on one election). betsFor5PointEdge is a rough planning number from
    the usual normal approximation: settled bets, each on a different contract at
    these prices, for a real 5-point edge to clear the range about 4 times in 5.
    """
    n = len(picks)
    wins = sum(won(p) for p in picks)
    dist, expected, n_contracts = win_distribution(picks, contract_of)
    at_or_below = list(itertools.accumulate(dist))
    at_or_above = [1 - (at_or_below[k - 1] if k else 0) for k in range(len(dist))]
    tail = (1 - 0.95) / 2
    low = min(k for k in range(len(dist)) if at_or_below[k] > tail)
    high = max(k for k in range(len(dist)) if at_or_above[k] > tail)
    market = expected / n
    per_bet = sum(side_price(p) * (1 - side_price(p)) for p in picks) / n
    return {
        "n": n,
        "contracts": n_contracts,
        "won": wins / n,
        "market": market,
        "gap": wins / n - market,
        "luckLow": low / n - market,
        "luckHigh": high / n - market,
        "inside": low <= wins <= high,
        "chanceAtOrAbove": at_or_above[wins],
        "betsFor5PointEdge": math.ceil((Z95 + Z80) ** 2 * per_bet / (EDGE_POINTS / 100) ** 2),
    }


def rating_bands(scored):
    """Two bands split where losing stops scoring better: what each reading says against what happened."""
    out = []
    for lo, hi in ((1, LOW), (LOW + 1, 15)):
        xs = [p for p in scored if lo <= p["confidence"] <= hi]
        n = len(xs)
        out.append({
            "from": lo, "to": hi, "n": n,
            "won": sum(won(p) for p in xs) / n,
            "asScored": sum(p_side(p["confidence"], "asScored") for p in xs) / n,
            "fixed": sum(p_side(p["confidence"], "fixed") for p in xs) / n,
            "market": sum(side_price(p) for p in xs) / n,
        })
    return out


def king_fidelity(snap):
    bets = snap["kingBets"]
    consensus_ok = [b["id"] for b in bets if abs(consensus(b["breakdown"]) - b["consensusProb"]) < 5e-5]
    fidelity_miss = [b["id"] for b in bets if not matches_real(b)]
    return {"consensusOk": consensus_ok, "fidelityMiss": fidelity_miss}


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
    ("calibration", "site_bundle.js", "https://lucatheory.com/thinking/benchmarks-vs-markets", None,
     "calibration, a property that closed-book benchmarks barely measure and live markets measure constantly."),
    ("positionSize", "street_bundle.js", "https://street.lucatheory.com/methodology", None,
     "The confidence rating (1–15) determines position size."),
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


def pct(x):
    return None if x is None else as_int(100 * x)


def points(x):
    return None if x is None else half_up(100 * x, 1)


def cell_out(x):
    vs = x["vs"] or {}
    return {"n": x["n"], "wins": x["wins"], "losses": x["n"] - x["wins"], "thin": x["thin"],
            "rawBrier": r3(x["raw"]), "blendedBrier": r3(x["blended"]),
            "trust": None if x["trust"] is None else as_int(x["trust"]),
            "wonPercent": pct(vs.get("won")), "marketPercent": pct(vs.get("market")), "gapPoints": points(vs.get("gap"))}


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
    king = king_fidelity(snap)
    by = scored_by_agent(snap)
    contract_of = contracts(snap)
    vs = {a: against_market(by[a], contract_of) for a in snap["agents"]}
    bands = rating_bands([p for ps in by.values() for p in ps])
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
            "marketPercent": pct(vs[a]["market"]),
            "sampleBets": sample_bets(by[a], ev_by_id, preds_by_key),
        })

    grid = [{**agent_meta(a), "cells": {c: cell_out(cells[(a, c)]) for c in CATEGORIES}} for a in order_fix]

    def best_in(c, key):
        xs = [(cells[(a, c)][key], a) for a in snap["agents"] if cells[(a, c)][key] is not None and not cells[(a, c)]["thin"]]
        return min(xs)[1] if xs else None

    vs_rows = sorted(snap["agents"], key=lambda a: -vs[a]["gap"])
    # "comes closest" to clearly beating the market: of the agents above the market, the one luck explains least
    closest = min((a for a in snap["agents"] if vs[a]["gap"] > 0), key=lambda a: vs[a]["chanceAtOrAbove"])

    def vs_cell(a, c, key):
        x = cells[(a, c)]["vs"]
        return None if x is None else x[key]
    bets_needed = sorted(vs[a]["betsFor5PointEdge"] for a in snap["agents"])

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
                    "wonRate": r3(vs_cell(a, c, "won")),
                    "marketImplied": r3(vs_cell(a, c, "market")),
                },
            }
        return body

    picks_sorted = sorted(p["createdAt"] for p in snap["picks"])
    simons, munger, ackman = rows["simons"], rows["munger"], rows["ackman"]
    simons_lost = [p for p in by["simons"] if not won(p)]
    sbf_pol = cells[("sbf", "POLITICS")]["vs"]
    sbf_geo = cells[("sbf", "GEOPOLITICS")]["vs"]
    # The walkthrough's example: the Ackman agent's latest low-rated win.
    example = next(b for b in next(a for a in scorecard if a["id"] == "ackman")["sampleBets"] if b["slot"] == "rated 7 or lower, won")
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
        # "rated it 2 ... it was right ... the win scored 0.751. A loss would have scored 0.018."
        "ackmanExampleWinScoresWorseThanALoss": (
            example["won"] and example["confidence"] <= LOW
            and example["scoreAsScored"] > 0.25 > pick_brier(example["confidence"], False, "asScored")),
        # "30% base trust and 70% Brier after 35 settled bets, which all ten have passed"
        "allAgentsAtTrustFloor": all(rows[a]["decayWeight"] == FLOOR for a in snap["agents"]),
        "simonsWins15": as_int(100 * simons["wins"] / simons["n"]) == 15,
        "sbfBestGeopoliticsRaw": best_in("GEOPOLITICS", "raw") == "sbf",
        "sbfBestGeopoliticsBlended": best_in("GEOPOLITICS", "blended") == "sbf",
        "sbfPoliticsWithin2OfMarket": abs(sbf_pol["gap"]) <= 0.02,
        "sbfGeopoliticsInsideLuck": sbf_geo["gap"] > 0 and sbf_geo["inside"],
        # "Neither reading is a probability": in both bands each reading misses the
        # win rate by 10 points or more, and the market price lands within 2.
        "readingsMissWinRateInBothBands": all(abs(b[k] - b["won"]) >= 0.10 for b in bands for k in ("asScored", "fixed")),
        "marketWithin2OfWinRateInBothBands": all(abs(b["market"] - b["won"]) <= 0.02 for b in bands),
        "noAgentOutsideLuck": all(vs[a]["inside"] for a in snap["agents"]),
        "insiderClosestToAnEdge": closest == "insider",
        # "within about 2 points": the unrounded gap rounds to 2 points or less
        "mungerAckmanAbout2OfMarket": all(abs(vs[a]["gap"]) < 0.025 for a in ("munger", "ackman")),
        # "a confident miss costs little": the Simons agent's losses are almost all rated 8 or higher
        "simonsLossesMostlyRated8Up": sum(p["confidence"] >= 8 for p in simons_lost) / len(simons_lost) >= 0.9,
    }

    return {
        "pullDate": snap["pullDate"],
        "playMoney": True,
        "season": {"label": season["label"], "status": season["status"], "crystallisedAt": season["crystallisedAt"],
                   "firstPickAt": picks_sorted[0], "lastPickAt": picks_sorted[-1]},
        "sources": [{k: f[k] for k in ("file", "url", "retrievedAt", "bytes", "sha256")} for f in manifest.values()],
        "quotes": check_quotes(raw, manifest),
        "method": {
            "scoredSet": "Settled bets with a stake (pnl not null and not 0), as LUCA's analytics count them. A win is pnl > 0.",
            "asScored": "p = confidence / 15",
            "fixed": "p = 0.5 + confidence / 30",
            "trust": "baseTrust x 0.3 + (1 - brier) x 100 x 0.7 (LUCA's formula at the 0.3 floor)",
            "blend": f"(sum of fixed cell scores + {PRIOR} x agent's overall fixed Brier) / (n + {PRIOR})",
            "thinBelow": THIN,
            "prior": PRIOR,
            "againstMarket": "Win rate minus the win rate the market's prices at entry implied, if each contract resolved at the mean entry price of the agent's bets on it. Repeat bets on one contract share its outcome. Luck range: the middle 95% of win rates under that model, computed exactly.",
            "betsForEdge": "Rough planning estimate (normal approximation): settled bets, each on a different contract at the agent's Season 1 prices, for a real 5-point edge to clear the luck range about 4 times in 5: (1.96 + 0.84)^2 x mean p(1-p) / 0.05^2.",
            "kingRule": "Approximate: side YES if consensus > 0.5; EXECUTE if both named anchors voted that side and |consensus - market| >= 0.04, else WAIT.",
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
            "bands": [{"from": b["from"], "to": b["to"], "n": b["n"], "wonPercent": pct(b["won"]),
                       "asScoredPercent": pct(b["asScored"]), "fixedPercent": pct(b["fixed"]),
                       "marketPercent": pct(b["market"])} for b in bands],
        },
        "market": {
            "rows": [{**agent_meta(a), "n": vs[a]["n"], "wonPercent": pct(vs[a]["won"]), "marketPercent": pct(vs[a]["market"]),
                      "contracts": vs[a]["contracts"],
                      "gapPoints": points(vs[a]["gap"]),
                      "luckLowPoints": points(vs[a]["luckLow"]), "luckHighPoints": points(vs[a]["luckHigh"])}
                     for a in vs_rows],
            "closest": closest,
            "edgePoints": EDGE_POINTS,
            "betsForEdgeMin": bets_needed[0],
            "betsForEdgeMax": bets_needed[-1],
            "settledMin": min(vs[a]["n"] for a in snap["agents"]),
            "settledMax": max(vs[a]["n"] for a in snap["agents"]),
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
            "betsWithoutAnchorPair": [b["id"] for b in snap["kingBets"] if not b["anchors"]],
            "edgeThreshold": EDGE,
        },
        "change": {
            "diff": ["- p_side = confidence / 15", "+ p_side = 0.5 + confidence / 30"],
            "domainTrust": "0.3 x baseTrust + 70 x (1 - blendedBrier)",
            "proposedResponses": {c: proposed(c) for c in CATEGORIES},
            "tests": tests,
            "runIt": "pytest analysis",
        },
        "batches": batch_strip(raw),
        "supply": gamma_supply(raw, events),
        "checks": checks,
    }


def run_tests(snapshot_text):
    """Runs pytest on a snapshot that isn't written to data/ yet (the tests read RESCORE_SNAPSHOT)."""
    with tempfile.TemporaryDirectory() as tmp:
        xml_path = Path(tmp) / "results.xml"
        snap_path = Path(tmp) / "snapshot.json"
        snap_path.write_text(snapshot_text, encoding="utf-8", newline="\n")
        proc = subprocess.run(
            [sys.executable, "-I", "-B", "-m", "pytest", str(ROOT / "analysis"), "-q",
             "-p", "no:cacheprovider", f"--junitxml={xml_path}"],
            cwd=ROOT, capture_output=True, text=True, env={**os.environ, "RESCORE_SNAPSHOT": str(snap_path)})
        if not xml_path.exists():
            raise SystemExit("pytest did not run:\n" + proc.stdout + proc.stderr)
        tests = []
        for case in ET.parse(xml_path).getroot().iter("testcase"):
            failed = case.find("failure") is not None or case.find("error") is not None
            skipped = case.find("skipped") is not None
            tests.append({"name": case.get("name"), "status": "failed" if failed else "skipped" if skipped else "passed"})
        return tests, proc.returncode, proc.stdout + proc.stderr


# Every raw file rescore.py reads. gamma_supply.json is optional (the plan's supply line).
PULL_FILES = ["predictions.json", "events.json", "king_bets.json", "trust_scores.json", "calibration.json",
              "batches.json", "season.json", "street_bundle.js", "site_bundle.js"]


def verify_pull(raw):
    """Each file rescore.py reads must be listed once in the manifest and match its size and SHA-256."""
    entries = collections.Counter(f["file"] for f in load(raw, "manifest.json")["files"])
    needed = PULL_FILES + (["gamma_supply.json"] if (raw / "gamma_supply.json").exists() else [])
    for name in needed:
        if entries[name] != 1:
            raise SystemExit(f"{raw.name}/manifest.json lists {name} {entries[name]} times, not once")
    for f in load(raw, "manifest.json")["files"]:
        body = (raw / f["file"]).read_bytes()
        if len(body) != f["bytes"] or hashlib.sha256(body).hexdigest() != f["sha256"]:
            raise SystemExit(f"{raw.name}/{f['file']} doesn't match its manifest entry")


# The files page.json is built from that the repo carries. scripts/check-data.mjs
# recomputes these hashes at build time, so a page.json left over from an older
# snapshot or older code stops the build.
INPUTS = ["data/snapshot.json", "analysis/rescore.py", "analysis/tests/test_rescore.py"]


def text_hash(text):
    """SHA-256 of the text with line endings normalized, so a CRLF checkout hashes the same."""
    return hashlib.sha256(text.replace("\r\n", "\n").encode("utf-8")).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", type=Path, help="pull folder, default the newest under data/raw/")
    args = ap.parse_args()
    raw = args.raw or newest_raw()
    verify_pull(raw)
    snap = build_snapshot(raw)
    snapshot_text = dump_rows(snap)
    tests, code, log = run_tests(snapshot_text)
    if code != 0 or any(t["status"] != "passed" for t in tests):
        print(log)
        raise SystemExit("tests failed; data/snapshot.json and data/page.json not written")
    page = build_page(snap, raw, tests)
    failed_checks = [k for k, v in page["checks"].items() if not v]
    if failed_checks:
        # Rewrite the sentence and its check in build_page, then rerun. The old files stay as they were.
        raise SystemExit("copy checks that no longer hold: " + ", ".join(failed_checks)
                         + "; data/snapshot.json and data/page.json not written")
    page["inputs"] = {path: text_hash(snapshot_text if path == "data/snapshot.json" else (ROOT / path).read_text(encoding="utf-8"))
                      for path in INPUTS}
    page_text = json.dumps(page, indent=1, ensure_ascii=False) + "\n"
    (DATA / "snapshot.json").write_text(snapshot_text, encoding="utf-8", newline="\n")
    (DATA / "page.json").write_text(page_text, encoding="utf-8", newline="\n")
    print(f"pull {raw.name}: {len(tests)} tests passed, {len(page['checks'])} copy checks hold; "
          "wrote data/snapshot.json and data/page.json")


if __name__ == "__main__":
    main()
