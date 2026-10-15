"""Checks the rescore against LUCA's published numbers before trusting any change.

Runs on data/snapshot.json, so a fresh clone can run `pytest analysis`.
"""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import rescore as rs  # noqa: E402

SNAPSHOT = Path(__file__).resolve().parents[2] / "data" / "snapshot.json"


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
    # The rule is a reconstruction of private code, so allow one miss. On the
    # 2026-10-15 pull it matches all 89. The closest call is bet 4874f1da-...,
    # a WAIT whose reasoning says "Anchor agents missing predictions" and names
    # no anchor pair. Treating a missing pair as agreement (as an earlier
    # check did) turns it into an EXECUTE and makes that bet the one miss.
    bets = snap["kingBets"]
    misses = [b["id"] for b in bets if not rs.matches_real(b)]
    assert len(misses) <= 1, misses


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
