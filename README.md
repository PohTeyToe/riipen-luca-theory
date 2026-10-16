# Agent Street Rescore

A one-page app that rescores Season 1 of Agent Street (street.lucatheory.com) from its public API, and shows its work as a pipeline.

In the browser it rescores all 893 settled bets, matches all 10 published Brier scores (to 3 decimals) and trust scores (within 0.5), replays all 89 Street King decisions that list each agent's vote and checks every sentence of the King's log, then shows the finding: the published scores read a 1 to 15 confidence rating as `confidence / 15`, so a pick rated 7 or lower scores better when it loses. A slider moves the reading from that to `0.5 + confidence / 30` and every bet, the ranking and the calibration chart move with it. "Rerun live" pulls the five endpoints from LUCA's API now and runs the same pipeline on them.

It also replays a recorded agent run: two models (Opus 5.5 and Sonnet 5.5) read the question, side and written reasoning behind every scored bet, and say whether the text treats the agent's side as likely, with a quote. They aren't given its rating, price or outcome, though about a third of the texts quote the price. Every quote was checked word for word against the pulled text before it was kept. The page shows the run's worker timeline, what the text says by rating, and the 81 bets the readers split on, for the viewer to call.

Built by Abdallah Safi for LUCA Theory's Level UP project on Riipen. Not affiliated with or endorsed by LUCA Theory. If LUCA Theory would rather this not be public, email abdalsf5@gmail.com and it comes down.

## Page

One page, served at `/` and at `/season-1` (`vercel.json` rewrites it). Anchors: `#run` (`#proof` opens the match table), `#scorecard`, `#line`, `#reader` (`#your-call`), `#king`, `#market`, `#how` (opens the method panel).

## Run it

Node 20.19 or newer.

```
npm install
npm run dev        # http://localhost:5104
npm test           # the browser engine against rescore.py's numbers, and the reader run
npm run build      # checks the data, runs the tests, type-checks, builds to dist/
npm run preview    # serves dist/ on port 5104
```

"Rerun live" calls `/luca/api/...` on the page's own origin, because Agent Street's API sends no CORS headers. `vercel.json` (and `vite.config.ts` for dev and preview) forwards exactly five GET paths to street.lucatheory.com and nothing else.

`npm run build` runs `scripts/check-data.mjs` first. It doesn't run pytest (the build has no Python). `rescore.py` runs the tests and records the results in `data/page.json`, with a yes/no check for each claim the outreach depends on and a SHA-256 of every input (`data/snapshot.json`, `data/reader-run.json`, the analysis code and its tests). The build stops unless every expected test and check passed and those files still match their hashes.

## Rerun the analysis

Python 3.12, standard library plus pytest.

```
python -I analysis/fetch.py      # pulls the public sources into data/raw/<date>/ (not committed)
python -I analysis/reader.py     # the two-model reading (needs the Claude CLI, logged in); writes data/reader-run.json
python -I analysis/rescore.py    # checks the pull, runs the tests, then writes data/snapshot.json and data/page.json
pytest analysis                  # the tests run on the committed files; the quote check needs the raw pull
```

`reader.py` sends batches of 12 bets to `claude -p` across 8 workers, both readers in parallel, with the prompt in `analysis/reader_prompt.md` and a JSON schema for the answers. Each answer is checked before it's kept: the ids match the batch, each quote is an exact span of that bet's reasoning (whitespace aside) and at most 25 words, and a quote is there exactly when the answer needs one. Failed answers go back to the same reader with the reasons, up to two more times. The run records every call (worker, start, end, tokens, what was kept and sent back). The Oct 16 run made 151 calls in 5 m 06 s; one answer was sent back for a quote that wasn't word for word, and its retry was kept.

`rescore.py` checks that the pull's `manifest.json` lists every raw file it reads and that each matches its size and SHA-256, and it writes nothing if a test or a copy check fails. The raw files aren't committed: they're LUCA's API responses and site code, so they're linked, not republished. Their hashes are in `data/page.json` → `sources`. `data/reader-run.json` keeps only short quotes; the page loads full reasoning from the API on demand.

## Data sources

All public, pulled on 2026-10-15 between 18:02 and 18:11 UTC. `data/SOURCES.md` lists every URL with its retrieval time.

- Agent Street's public API: `/api/predictions`, `/api/events`, `/api/king/bets`, `/api/trust-scores`, `/api/analytics/calibration`, `/api/batches/all`, `/api/seasons/current`.
- The methodology page (for the trust formula) and essays on lucatheory.com, checked against each site's JavaScript bundle.
- Polymarket's public Gamma API, for how many open markets pass Agent Street's published filters (in `page.json`, not on the page).

## What's real, what's proposed, what's mock

- Real, from the pull: every pick, outcome, published score, King call and log. Agent Street ran on play money; the footer and How it works say so.
- Real, recorded: the reader run (`data/reader-run.json`), labelled "Recorded run" with its date. The page makes no model calls.
- Measured in the viewer's browser: every step time on the pipeline bar, and the live pull's status, bytes and time per endpoint.
- LUCA's, unchanged: the Brier and trust formulas and the King's consensus formula.
- Mine, labelled on the page: the fixed reading (`0.5 + c / 30`), the reconstructed King EXECUTE rule (it matches all 89 recorded calls), the market check and its exact luck range (repeat bets on one contract share one outcome), and the rough count of bets needed to see a 5-point edge.
- Mock: nothing.

## Deploy

Vercel, as-is: framework Vite, build `npm run build`, output `dist`. No environment variables or secrets.

- The site asks not to be indexed: a `noindex, nofollow` meta tag, an `X-Robots-Tag` header, and `robots.txt` (link-preview bots may read it).
- Files under `/assets/` have content hashes in their names, so `vercel.json` lets browsers cache them for a year.
- The `og:image` URL needs an absolute origin. On Vercel it comes from `VERCEL_PROJECT_PRODUCTION_URL` at build time; set `SITE_URL` to override it.
- Fonts are self-hosted through Fontsource. The only third-party request is "Rerun live" (and "Show the full text"), through the site's own proxy.

## Images

`public/og.png` is a 1200x630 screenshot of the built page with the reading at a 50% floor, taken with Playwright. Retake it after a re-pull.

## Look

LUCA Theory's own grammar: square frames, 1px ink rules, Josefin Sans titles, JetBrains Mono numbers and labels, deep emerald for the pipeline, cream for detail, Agent Street's lime and its Brier colours. `PRODUCT.md` and `DESIGN.md` hold the design context.

## Stack

Vite 7, React 19 and TypeScript for the page. Python (standard library) and pytest for the scoring and the reader run.
