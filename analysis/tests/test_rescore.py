"""Checks the rescore against LUCA's published numbers before trusting any change.

Runs on data/snapshot.json, so a fresh clone can run `pytest analysis`.
rescore.py points RESCORE_SNAPSHOT at a new snapshot to test it before writing it.
"""
import json
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import rescore as rs  # noqa: E402

SNAPSHOT = Path(os.environ.get("RESCORE_SNAPSHOT") or Path(__file__).resolve().parents[2] / "data" / "snapshot.json")


@pytest.fixture(scope="module")
def snap():
    return json.loads(SNAPSHOT.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def rows(snap):
    return rs.agent_table(snap)


def test_rebuilds_published_brier(snap, rows):
    for a in snap["agents"]:
        pub = snap["published"][a]
        assert rows[a]["n"] == pub["totalSettled"], a
        assert rs.half_up(rows[a]["brierAsScored"], 3) == rs.half_up(pub["brierScore"], 3), a


def test_rebuilds_published_trust(snap, rows):
    for a in snap["agents"]:
        assert abs(rows[a]["trustAsScored"] - snap["published"][a]["dynamicTrust"]) <= 0.5, a


def test_king_consensus_matches(snap):
    assert snap["kingBets"]
    for b in snap["kingBets"]:
        assert abs(rs.consensus(b["breakdown"]) - b["consensusProb"]) < 5e-5, b["id"]


def test_king_rule_fidelity(snap):
    # The rule is a reconstruction of private code. On the committed snapshot it
    # reproduces every real call. The closest one is bet 4874f1da-..., a WAIT
    # whose reasoning says "Anchor agents missing predictions" and names no
    # anchor pair: treating a missing pair as agreement turns it into an EXECUTE.
    bets = snap["kingBets"]
    misses = [b["id"] for b in bets if not rs.matches_real(b)]
    assert misses == [], misses


def test_as_scored_rewards_losing():
    for c in range(1, 16):
        loss_better = rs.pick_brier(c, False, "asScored") < rs.pick_brier(c, True, "asScored")
        assert loss_better == (c <= 7), c


def test_fixed_never_rewards_losing():
    for c in range(1, 16):
        assert rs.pick_brier(c, True, "fixed") <= rs.pick_brier(c, False, "fixed"), c


def test_blend(snap, rows):
    assert rs.blend([], 0.2) is None
    cells = rs.domain_cells(snap, rows)
    for (a, _), x in cells.items():
        if x["n"] == 0:
            assert x["blended"] is None and x["trust"] is None
            continue
        lo, hi = sorted((x["raw"], rows[a]["brierFixed"]))
        assert lo - 1e-12 <= x["blended"] <= hi + 1e-12


def test_repeat_bets_share_one_outcome():
    def pick(event, side, p_yes=0.5):
        return {"eventId": event, "prediction": side, "marketProbAtEntry": p_yes}
    contract_of = {"e1": "c1", "e2": "c1", "e3": "c2"}
    # Two bets on one contract, same side: both win or both lose.
    assert rs.win_distribution([pick("e1", "YES"), pick("e2", "YES")], contract_of) == ([0.5, 0.0, 0.5], 1.0, 1)
    # Two bets on different contracts: independent.
    assert rs.win_distribution([pick("e1", "YES"), pick("e3", "YES")], contract_of) == ([0.25, 0.5, 0.25], 1.0, 2)
    # A YES and a NO on one contract, even at different prices: exactly one wins, and the
    # expected wins agree with that (Codex round-2 finding: they didn't when each bet kept its own price).
    dist, expected, _ = rs.win_distribution([pick("e1", "YES", 0.175), pick("e2", "NO", 0.375)], contract_of)
    assert dist == [0.0, 1.0] and expected == 1.0


def test_luck_range_is_exact():
    contract_of = {f"e{i}": f"c{i}" for i in range(4)}
    picks = [{"eventId": f"e{i}", "prediction": "YES", "marketProbAtEntry": 0.5, "pnl": 1} for i in range(4)]
    # 4 independent coin flips: 0 or 4 wins each have chance 1/16 > 2.5%, so all 4 wins is inside.
    vs = rs.against_market(picks, contract_of)
    assert vs["inside"] and vs["chanceAtOrAbove"] == 1 / 16 and vs["luckHigh"] == 0.5


def test_every_scored_event_has_a_contract(snap):
    contract_of = rs.contracts(snap)
    assert all(contract_of[p["eventId"]] for p in snap["picks"] if rs.is_scored(p))
