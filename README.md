# Agent Street Season 1, rescored

A static page that rescores Season 1 of Agent Street (street.lucatheory.com) from its public API.

It starts by rebuilding the published numbers: all 10 Brier scores to 3 decimals, all 10 trust scores within 0.5, and the King's consensus on all 89 bets that list each agent's vote. Then it shows one line in the scoring. The published scores read a 1 to 15 confidence rating as `confidence / 15`, the chance the agent's own side is right. Under that reading, a pick rated 7 or lower scores better when it loses. The page shows what changes when the rating is read as `0.5 + confidence / 30` instead: the trust ranking, trust by domain, and a hindsight replay of the King's calls.

Built by Abdallah Safi as part of an application to LUCA Theory's Collective Intelligence project on Riipen. Not affiliated with or endorsed by LUCA Theory. If LUCA Theory would rather this not be public, email abdalsf5@gmail.com and it comes down.

## Pages

- `/` is a short intro: what was found, what to try first, and what's LUCA's versus mine.
- `/season-1` is the note itself. Sections have anchors: `#proof`, `#line`, `#scorecard`, `#domains`, `#king`, `#change`, `#plan`.

## Run it

Node 20.19 or newer.

```
npm install
npm run dev        # http://localhost:5104
npm run build      # checks the data, type-checks, builds to dist/
npm run preview    # serves dist/ on port 5104
```

`npm run build` runs `scripts/check-data.mjs` first. It stops the build if any test in `data/page.json` failed or if any claim the copy depends on no longer holds (for example "the Simons agent drops 4 places"). After a re-pull, a failure there means a sentence on the page needs rewriting, not working around.

## Rerun the analysis

Python 3 (run here on 3.12), standard library plus pytest.

```
python -I analysis/fetch.py      # pulls the public sources into data/raw/<date>/ (not committed)
python -I analysis/rescore.py    # writes data/snapshot.json and data/page.json, runs the tests
pytest analysis                  # the tests run on the committed snapshot, no network needed
```

The page imports `data/page.json` and computes nothing itself. Every number on it comes from that file.

## Data sources

All public, pulled on 2026-10-15 between 18:02 and 18:11 UTC. `data/SOURCES.md` lists every URL with its retrieval time and how the Polymarket count was made.

- Agent Street's public API: `/api/predictions`, `/api/events`, `/api/king/bets`, `/api/trust-scores`, `/api/analytics/calibration`, `/api/batches/all`, `/api/seasons/current`.
- The methodology page (for the trust formula and the quoted lines) and two essays on lucatheory.com (for the two quotes). Both sites ship their text in a JavaScript bundle; `rescore.py` checks every quote against it.
- Polymarket's public Gamma API, for one line in the plan section: how many open markets pass Agent Street's published event filters.

## What's real, what's proposed, what's mock

- Real, from the pull: every pick, outcome, published score, King call and batch row. Agent Street ran on play money, and the page says so in every source line.
- LUCA's, unchanged: the trust formula and the King's consensus formula.
- Mine, labelled on the page as proposals or approximations: the fixed reading of confidence, the per-domain blend for thin cells, domain trust, the market-price row, the approximate King execute rule, the hindsight replay, and the proposed `/api/trust-scores?category=` response.
- Mock: nothing. There is no generated or LLM-written data here.

## Deploy

Vercel, as-is: framework Vite, build `npm run build`, output `dist`. No environment variables or secrets.

- `vercel.json` rewrites `/season-1` to the app, so deep links and anchors load directly.
- The site asks not to be indexed: a `noindex, nofollow` meta tag, an `X-Robots-Tag` header, and `robots.txt`. `robots.txt` lets link-preview bots (LinkedIn, Slack, X, Facebook) read the page so a shared link shows its title and image; every other crawler is turned away.
- The `og:image` URL needs an absolute origin. On Vercel it comes from `VERCEL_PROJECT_PRODUCTION_URL` at build time; set `SITE_URL` to override it.
- Fonts are self-hosted through Fontsource. The page makes no third-party requests.

## Images

`public/shots/slider.png`, `public/shots/grid.png` and `public/og.png` are screenshots of the built page, taken with Playwright from the Oct 15 pull. After a re-pull, retake them so they match.

## Stack

Vite 7, React 19 and TypeScript for the page. Python (standard library) and pytest for the scoring.
