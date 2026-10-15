# Sources

Everything here comes from public pages and public APIs, pulled on 2026-10-15 (UTC) between 18:02 and 18:11. Agent Street ran on play money. This project is not affiliated with or endorsed by LUCA Theory.

Rerun from the repo root:

```
python -I analysis/fetch.py
python -I analysis/rescore.py
pytest analysis
```

`fetch.py` saves raw responses to `data/raw/<date>/` (not committed) with a `manifest.json` that records each URL, its retrieval time, size and SHA-256. `rescore.py` reads the newest pull, writes `snapshot.json`, runs the tests, and writes `page.json` only if they all pass.

## Collected

One GET per endpoint, a one-second pause between requests, no `/api/admin` paths. The User-Agent names this project and gives a GitHub contact.

| Source | Retrieved (UTC) | Used for |
|---|---|---|
| https://street.lucatheory.com/api/predictions | 2026-10-15 18:02:22 | Every agent pick: side, confidence, units, P&L, settled, market price at entry, reasoning |
| https://street.lucatheory.com/api/events | 2026-10-15 18:02:23 | Question, category, resolution, week, selected flag |
| https://street.lucatheory.com/api/king/bets | 2026-10-15 18:02:25 | King calls: signal, consensus, market price, direction, per-agent votes, anchor names in the reasoning |
| https://street.lucatheory.com/api/trust-scores | 2026-10-15 18:02:26 | Published trust, Brier, base trust, settled count |
| https://street.lucatheory.com/api/analytics/calibration | 2026-10-15 18:02:28 | Published Brier, settled count, wins and losses per agent |
| https://street.lucatheory.com/api/batches/all | 2026-10-15 18:02:32 | Weekly batch status and counts |
| https://street.lucatheory.com/api/seasons/current | 2026-10-15 18:02:33 | Season label and status |
| https://street.lucatheory.com/ and its bundle https://street.lucatheory.com/assets/index-CGCh0oXP.js | 2026-10-15 18:02:34 to 18:02:36 | Agent display names and roles; the methodology lines and trust formula shown at https://street.lucatheory.com/methodology |
| https://lucatheory.com/ and its bundle https://lucatheory.com/assets/index-C1_mihoM.js | 2026-10-15 18:02:37 to 18:02:38 | The two quotes from https://lucatheory.com/thinking/proof-of-trust and https://lucatheory.com/thinking/last-mile-accuracy |
| https://gamma-api.polymarket.com/markets/keyset and /events | 2026-10-15, last request 18:11:08 | Count of open Polymarket markets that pass Agent Street's published filters (method below) |

Both LUCA sites are single-page apps, so their text ships inside one JavaScript bundle per site. `rescore.py` checks every quoted line against the bundle it came from and stops if one is missing. That check proves a line is in the site, not which page shows it, so the page for each quote was traced by hand through the bundle's router:

- The methodology lines and the trust formula are inside the component the street site mounts at `/methodology`.
- "Trust is not a property of a person, an agent, or a credential. It is a per-domain measurement of track record." is the "Working Hypothesis" box. That box is its own small component, defined right after the Last-Mile Accuracy component in the bundle and rendered only inside the component mounted at `/thinking/proof-of-trust`.
- "Trust does not transfer globally." is in the FAQ of the component mounted at `/thinking/last-mile-accuracy`.

The quotes are stored in `page.json` under `quotes`, each with the page it appears on.

## Polymarket supply count

Agent Street's methodology page says: "Minimum $5,000 volume. 3–90 day resolution window. No sports. No entertainment."

1. `GET /markets/keyset` with `closed=false`, `volume_num_min=5000`, `end_date_min=2026-10-18` (pull date + 3 days), `end_date_max=2027-01-13` (pull date + 90 days), `limit=100`, following `next_cursor` until none was returned. 57 pages, 5,606 markets. Plain offset paging stops at 2,100 rows, which is why this uses the keyset endpoint.
2. Parent event tags from `GET /events?id=...`, 50 ids per request. That list skips archived events, so the one id it missed was fetched from `/events/66119`. 2,429 events, all found.
3. Checked: no duplicate market ids, every market open, at or above $5,000 volume, and ending inside the window.
4. Dropped events with any sports or entertainment tag: `sports`, `sport`, `esports`, `games`, `pop-culture`, `awards`, `celebrities`, `music`, `movies`, and the league and sport tags (`football`, `nfl`, `cfb`, `ncaaf`, `soccer`, `tennis`, `atp`, `wta`, `boxing`, `ufc`, `mma`, `nba`, `basketball`, `mlb`, `baseball`, `nhl`, `hockey`, `golf`, `f1`, `cricket`, `olympics`). Polymarket doesn't tag every sports event `sports`: the NFC East winner markets carry only `nfl` and `football`, and a tennis market only `sport` and `tennis`. The list is my reading of "no sports, no entertainment"; LUCA's own filter code is private. 4,405 markets left.
5. Dropped 167 markets that are already Agent Street events (Gamma market id equals `polymarketId` in `/api/events`).

Result: about 4,238 markets in 1,848 events (`page.json` → `supply`). It's an estimate under my reading of the filters, and a snapshot of a live market list, so it moves from minute to minute.

## What's collected and what's computed

| File | Committed | What it is |
|---|---|---|
| `raw/<date>/` | No | The responses exactly as served, plus `manifest.json`. One exception: `gamma_supply.json` is built by `fetch.py` from the 57 market pages and the event lookups (the fields used, the filters, the page count, and whether paging ended). The per-page responses and cursors aren't kept, so `complete: true` records that paging ran out of cursors; it can't be rechecked from the file alone |
| `snapshot.json` | Yes | Collected. Only the fields the tests need, with no free text: all 2,571 picks, the 261 events those picks and the King bets refer to, the 89 King bets that list each agent's vote (votes parsed from the JSON string, anchor pair parsed from "Anchor agents (x/y)" in the reasoning), and each agent's published trust and calibration figures |
| `page.json` | Yes | Computed by `rescore.py`, plus collected text: event questions, the agents' own reasoning for the sample bets, agent display names and roles, the quotes, and the batch rows |

What's LUCA's, unchanged: every pick, outcome, published score, King call, batch row, the trust formula and the King's consensus formula.

What's mine, and labelled as a proposal or approximation in `page.json` → `method`:

- The fixed reading of confidence, `p = 0.5 + confidence / 30`.
- The domain blend: a cell with n picks is scored as if it had 10 more at the agent's overall fixed Brier. Cells under 10 picks are flagged thin.
- Domain trust: LUCA's trust formula at its 0.3 floor, applied to the blended Brier.
- The market row: per scored event, the mean market price at entry across its scored picks, scored against the resolution.
- The approximate King rule: side YES if consensus is above 0.5; EXECUTE if both anchors named in the reasoning voted that side and consensus is at least 4 points from the market, else WAIT. It reproduces all 89 real calls using the trust recorded on each vote.
- The comparison with the market: each agent's win rate minus the mean market price at entry of the sides it picked, with a luck range of 1.96 x sqrt(sum of p(1-p)) / n, where p is each pick's price. That's where 95% of win rates would land over the same bets if the market's prices were right.
- The proposed `/api/trust-scores?category=...` response.

Mock data: none. There is no generated or LLM-written data in this project.

## Checks on this pull

`rescore.py` writes the test results to `page.json` → `change.tests` and a set of yes/no checks for each number the page copy relies on to `page.json` → `checks`. On this pull all 7 tests pass and every check holds.
