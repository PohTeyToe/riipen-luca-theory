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

Both LUCA sites are single-page apps, so their text ships inside one JavaScript bundle per site. `rescore.py` checks every quoted line against the bundle it came from and stops if one is missing. The quotes are stored in `page.json` under `quotes`, each with the page it appears on.

## Polymarket supply count

Agent Street's methodology page says: "Minimum $5,000 volume. 3–90 day resolution window. No sports. No entertainment."

1. `GET /markets/keyset` with `closed=false`, `volume_num_min=5000`, `end_date_min=2026-10-18` (pull date + 3 days), `end_date_max=2027-01-13` (pull date + 90 days), `limit=100`, following `next_cursor` until none was returned. 57 pages, 5,606 markets. Plain offset paging stops at 2,100 rows, which is why this uses the keyset endpoint.
2. Parent event tags from `GET /events?id=...`, 50 ids per request. That list skips archived events, so the one id it missed was fetched from `/events/66119`. 2,429 events, all found.
3. Checked: no duplicate market ids, every market open, at or above $5,000 volume, and ending inside the window.
4. Dropped events tagged `sports`, `esports`, `games`, `pop-culture`, `awards`, `celebrities`, `music` or `movies`. That tag list is my reading of "no sports, no entertainment". LUCA's own filter code is private. 4,414 markets left.
5. Dropped 167 markets that are already Agent Street events (Gamma market id equals `polymarketId` in `/api/events`).

Result: 4,247 markets in 1,853 events (`page.json` → `supply`). The count is a snapshot of a live market list, so it moves from minute to minute.

## What's collected and what's computed

| File | Committed | What it is |
|---|---|---|
| `raw/<date>/` | No | The responses exactly as served, plus `manifest.json` |
| `snapshot.json` | Yes | Collected. Only the fields the tests need, with no free text: all 2,571 picks, the 261 events those picks and the King bets refer to, the 89 King bets that list each agent's vote (votes parsed from the JSON string, anchor pair parsed from "Anchor agents (x/y)" in the reasoning), and each agent's published trust and calibration figures |
| `page.json` | Yes | Computed by `rescore.py`, plus collected text: event questions, the agents' own reasoning for the sample bets, agent display names and roles, the quotes, and the batch rows |

What's LUCA's, unchanged: every pick, outcome, published score, King call, batch row, the trust formula and the King's consensus formula.

What's mine, and labelled as a proposal or approximation in `page.json` → `method`:

- The fixed reading of confidence, `p = 0.5 + confidence / 30`.
- The domain blend: a cell with n picks is scored as if it had 10 more at the agent's overall fixed Brier. Cells under 10 picks are flagged thin.
- Domain trust: LUCA's trust formula at its 0.3 floor, applied to the blended Brier.
- The market row: per scored event, the mean market price at entry across its scored picks, scored against the resolution.
- The approximate King rule: side YES if consensus is above 0.5; EXECUTE if both anchors named in the reasoning voted that side and consensus is at least 4 points from the market, else WAIT. It reproduces all 89 real calls using the trust recorded on each vote.
- The hindsight replay: the same rule run with end-of-season trust as scored and as fixed, both as whole numbers the way each King vote records trust.
- The proposed `/api/trust-scores?category=...` response.

Mock data: none. There is no generated or LLM-written data in this project.

## Checks on this pull

`rescore.py` writes the test results to `page.json` → `change.tests` and a set of yes/no checks for each number the page copy relies on to `page.json` → `checks`. On this pull all 7 tests pass and every check holds.
