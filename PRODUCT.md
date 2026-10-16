# Product

## Register

product

## Users

One reader matters: Dave Oram, founder of LUCA Theory. He designed Agent Street's scoring and trust formulas and will check every number on this page against his own dashboard (street.lucatheory.com) in another tab. He is skeptical, short on time, reads finance documents for a living and is not an engineer. He opens the link from a Riipen application, an email or a LinkedIn DM, most likely on a laptop, sometimes on a phone.

Secondary readers: Aidan Nugent, and the technical people Dave forwards it to. They will open the code and look closer at the machinery.

The job: decide in a minute or two whether the numbers are right and whether the person who built this can build real agent systems on LUCA's data.

## Product Purpose

A working rescore of Agent Street Season 1, run as a visible pipeline. In the browser it pulls the data (the Oct 15 snapshot, or LUCA's live API on demand), rescores all 893 settled bets, matches all 10 published Brier and trust scores, replays every recorded Street King decision and checks its log, then shows the finding: a 1 to 15 rating read as `c / 15` makes a loss score better than a win at ratings 1 to 7.

The viewer moves one control (how a rating becomes a chance) and watches every bet, the ranking and the calibration move. A recorded agent run shows two models reading every bet's written reasoning (not given its rating, price or outcome, though some texts quote the price), with quotes checked word for word, and hands the bets they split on to the viewer to decide.

Success: Dave checks two or three numbers, they match, he drags the control, reads what his own agents wrote, and the finding lands as "this is my problem, solved on my data" rather than a gotcha.

## Brand Personality

Exact, calm, capable. The voice of a careful engineer showing their working: numbers first, few words, every claim one click from its source. It should look like a tool LUCA could ship next to Agent Street, in LUCA's own visual language.

## Anti-references

- The generic AI demo: centered marketing hero, gradient blobs, glass cards, emoji, badge soup, KPI tile rows with tiny grey captions.
- The previous version of this page: an essay on beige paper with a numbered "Try this first" list and the product below the fold.
- Fake agent theatre: invented steps, timings or "thinking" spinners on deterministic code. Every step shown ran; every time shown was measured or recorded.
- Anything that reads as an audit or a list of LUCA's bugs. One finding, shown well.

## Design Principles

1. The product is the first screen. The pipeline, the control and the ranking are above the fold; no intro text stands between Dave and them.
2. Show the machinery and what it does for him. Steps, counts, timings, checks and the point where a person decides are visible and clickable, in words a non-engineer follows.
3. Every number is computed, and one click shows where it came from: the API record, the formula, the published value it matches, the quote in the text.
4. Recorded is labelled recorded. Live is labelled live. Nothing calls an LLM from the page.
5. Fewest words that keep each number true. Caveats stay, in a few words.

## Accessibility & Inclusion

WCAG 2.2 AA. All controls keyboard reachable with visible focus. Charts have text equivalents (tables, the focus readout, aria labels). Color is never the only signal: won and lost also differ by shape, readers by label. Honour prefers-reduced-motion (replays jump to the end). Works at 375px with no sideways scroll.
