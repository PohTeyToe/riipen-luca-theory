# Sources

Everything here comes from public pages and public APIs, pulled on 2026-10-15 (UTC) between 18:02 and 18:11. Agent Street ran on play money. This project is not affiliated with or endorsed by LUCA Theory.

Rerun from the repo root:

```
python -I analysis/fetch.py
python -I analysis/rescore.py
pytest analysis
```

`fetch.py` saves raw responses to `data/raw/<date>/` with a `manifest.json` that records each URL, its retrieval time, size and SHA-256. `rescore.py` reads the newest pull, checks that the manifest lists each file it reads and that each file matches, runs the tests on the new snapshot, and writes `snapshot.json` and `page.json` only if they all pass.

The raw files aren't committed: they're LUCA's API responses and site code, so this repo links them instead of republishing them. Each file's size and SHA-256 are committed in `page.json` → `sources`, so a copy of the Oct 15 pull can be checked against them. A fresh pull should match while Season 1 stays closed; if LUCA changes the data or the site, the hashes show it.

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
| https://lucatheory.com/ and its bundle https://lucatheory.com/assets/index-C1_mihoM.js | 2026-10-15 18:02:37 to 18:02:38 | The three quotes from https://lucatheory.com/thinking/proof-of-trust, https://lucatheory.com/thinking/last-mile-accuracy and https://lucatheory.com/thinking/benchmarks-vs-markets |
| https://www.linkedin.com/posts/davidoram8_which-of-the-leading-ai-models-are-the-best-activity-7491473731027116032-e9LS | 2026-10-15, read by hand | David Oram's question "Which of the leading AI models are the best superforecasters?" (see below) |
| https://gamma-api.polymarket.com/markets/keyset and /events | 2026-10-15, last request 18:11:08 | Count of open Polymarket markets that pass Agent Street's published filters (method below) |

Both LUCA sites are single-page apps, so their text ships inside one JavaScript bundle per site. `rescore.py` checks every quoted line against the bundle it came from and stops if one is missing. That check proves a line is in the site, not which page shows it, so the page for each quote was traced by hand through the bundle's router:

- The methodology lines and the trust formula are inside the component the street site mounts at `/methodology`.
- "Trust is not a property of a person, an agent, or a credential. It is a per-domain measurement of track record." is the "Working Hypothesis" box. That box is its own small component, defined right after the Last-Mile Accuracy component in the bundle and rendered only inside the component mounted at `/thinking/proof-of-trust`.
- "Trust does not transfer globally." is in the FAQ of the component mounted at `/thinking/last-mile-accuracy`.
- "calibration, a property that closed-book benchmarks barely measure and live markets measure constantly." ends the sentence "The second is that the gap isn't random. It tracks calibration, ..." in the essay "Benchmarks are open-book. Markets aren't." Both the essay's title and this sentence sit inside the one component the router mounts at `/thinking/benchmarks-vs-markets` (component `m5`, which starts at offset 668,608 of the bundle and ends before the next component at 680,032; the quote is at 677,960).

One line comes from LinkedIn, which the script can't read without signing in, so `rescore.py` doesn't check it. The post (link above) was read on 2026-10-15 without signing in. Its first line is "Which of the leading AI models are the best superforecasters?" and the next is "Are Open or Closed source models better predictors?" The outreach notes quote the first; the page doesn't. LinkedIn shows the date only as "2mo"; the post's activity id, 7491473731027116032, carries its timestamp (the id shifted right by 22 bits is milliseconds since 1970), which is 2026-08-07 12:42 UTC. The post points to a newsletter with results; the page says nothing about them.

The quotes are stored in `page.json` under `quotes`, each with the page it appears on. The page itself no longer shows them.

## Polymarket supply count

Agent Street's methodology page says: "Minimum $5,000 volume. 3–90 day resolution window. No sports. No entertainment."

1. `GET /markets/keyset` with `closed=false`, `volume_num_min=5000`, `end_date_min=2026-10-18` (pull date + 3 days), `end_date_max=2027-01-13` (pull date + 90 days), `limit=100`, following `next_cursor` until none was returned. 57 pages, 5,606 markets. Plain offset paging stops at 2,100 rows, which is why this uses the keyset endpoint.
2. Parent event tags from `GET /events?id=...`, 50 ids per request. That list skips archived events, so the one id it missed was fetched from `/events/66119`. 2,429 events, all found.
3. Checked: no duplicate market ids, every market open, at or above $5,000 volume, and ending inside the window.
4. Dropped events with any sports or entertainment tag: `sports`, `sport`, `esports`, `games`, `pop-culture`, `awards`, `celebrities`, `music`, `movies`, and the league and sport tags (`football`, `nfl`, `cfb`, `ncaaf`, `soccer`, `tennis`, `atp`, `wta`, `boxing`, `ufc`, `mma`, `nba`, `basketball`, `mlb`, `baseball`, `nhl`, `hockey`, `golf`, `f1`, `cricket`, `olympics`). Polymarket doesn't tag every sports event `sports`: the NFC East winner markets carry only `nfl` and `football`, and a tennis market only `sport` and `tennis`. The list is my reading of "no sports, no entertainment"; LUCA's own filter code is private. 4,405 markets left.
5. Dropped 167 markets that are already Agent Street events (Gamma market id equals `polymarketId` in `/api/events`).

Result: about 4,238 markets in 1,848 events (`page.json` → `supply`; the page no longer shows it). It's an estimate under my reading of the filters, and a snapshot of a live market list, so it moves from minute to minute.

## What's collected and what's computed

| File | Committed | What it is |
|---|---|---|
| `raw/<date>/` | No (hashes in `page.json` → `sources`) | The responses exactly as served, plus `manifest.json`. One exception: `gamma_supply.json` is built by `fetch.py` from the 57 market pages and the event lookups (the fields used, the filters, the page count, and whether paging ended). The per-page responses and cursors aren't kept, so `complete: true` records that paging ran out of cursors; it can't be rechecked from the file alone |
| `snapshot.json` | Yes | Collected. Only the fields the tests need, with no free text: all 2,571 picks, the 261 events those picks and the King bets refer to (each with its Polymarket contract id), the 89 King bets that list each agent's vote (votes parsed from the JSON string, anchor pair parsed from "Anchor agents (x/y)" in the reasoning), and each agent's published trust and calibration figures |
| `page.json` | Yes | Computed by `rescore.py`, plus collected text: event questions, the agents' own reasoning for the sample bets, agent display names and roles, the quotes, and the batch rows. `inputs` holds the SHA-256 of `snapshot.json`, `reader-run.json`, the analysis code and its tests; the build checks them |
| `reader-run.json` | Yes | Recorded by `reader.py` on 2026-10-16: every model call (reader, worker, start, end, tokens, what was kept and what was re-asked, and why) and both readers' answers on all 893 scored picks, with short quotes from the agents' reasoning and the first 16 hex digits of each text's SHA-256. The full reasoning isn't committed; the page loads it from the API on demand |

What's LUCA's, unchanged: every pick, outcome, published score, King call, batch row, the trust formula and the King's consensus formula.

What's mine, and labelled as a proposal or approximation in `page.json` → `method`:

- The 50% floor reading of confidence, `p = 0.5 + confidence / 30` (the slider's right end; in between, the floor moves from 0 to 50%).
- The domain blend (in `page.json`; the page no longer shows domains): every cell with n picks is scored as if it had 10 more at the agent's overall fixed Brier, so a 10-pick cell is half its own score. Cells under 10 picks are flagged thin.
- Domain trust: LUCA's trust formula at its 0.3 floor, applied to the blended Brier.
- The approximate King rule: side YES if consensus is above 0.5; EXECUTE if both anchors named in the reasoning voted that side and consensus is at least 4 points from the market, else WAIT. It reproduces all 89 real calls using the trust recorded on each vote.
- The comparison with the market: each agent's win rate against the win rate the market's prices at entry implied for its bets. The 124 scored events are 108 Polymarket contracts, because a contract can come back in a later week as a new event, and each agent has 7 to 11 repeat bets on a contract it had already bet on. Repeat bets share one outcome, so the model resolves each contract once, YES with the mean entry price of the agent's bets on it (for bets on one side that's the same as each bet keeping its own price). The luck range is the middle 95% of win rates under that model, computed exactly by adding up every combination of contract outcomes, so it holds at any number of bets and can be lopsided. Every agent is inside it. The range doesn't model links between different contracts, such as two markets on one election.
- Domain cells show the same comparison on their own bets, without a luck range: with 50 cells, two or three would land outside a 95% range by luck alone. The one cell earlier copy called out, the SBF agent's geopolitics (15 and 1), is inside its range (check `sbfGeopoliticsInsideLuck`).
- Bets needed: a rough planning estimate from the usual normal approximation, not an exact power calculation. It's how many settled bets, each on a different contract at the agent's Season 1 prices, a real 5-point edge needs to clear the luck range about 4 times in 5: (1.96 + 0.84)^2 x mean p(1-p) / 0.05^2, which is 355 to 396 across the ten agents. The page says "about 355–396 independent bets".
- The proposed `/api/trust-scores?category=...` response (in `page.json`, not on the page).
- The reader run: two models (Opus 5.5 and Sonnet 5.5) each read every scored pick's reasoning, given only the market question, the side bet and the text, and say whether the text calls the pick likely, unlikely or gives no view, and whether it admits low conviction, with a quote for each. The prompt is `analysis/reader_prompt.md`. Answers are kept only if each quote is a word-for-word span of the text (whitespace aside, at most 25 words); the others are re-asked. Where the readers disagree, the page leaves the call to the viewer.

Mock data: none. The only model output is the recorded reader run (`reader-run.json`), labelled as recorded on the page, with every quote checked against the pulled text (`test_reader_run_quotes_are_in_the_pulled_text`).

## Checks on this pull

`rescore.py` writes the test results to `page.json` → `change.tests` and a set of yes/no checks for each number the page copy relies on to `page.json` → `checks`. On this pull all 10 tests pass and all 22 checks hold. If a test or a check fails, `rescore.py` writes neither file.
