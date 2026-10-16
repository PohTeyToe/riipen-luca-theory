---
name: Agent Street Rescore
description: Agent Street Season 1, rebuilt from LUCA's public API and rescored live in the browser.
colors:
  paper: "oklch(0.992 0.003 106)"
  surface: "oklch(0.998 0.0015 106)"
  ink: "oklch(0.2 0.012 165)"
  ink-2: "oklch(0.34 0.01 165)"
  muted: "oklch(0.45 0.008 165)"
  hair: "oklch(0.905 0.006 150)"
  cream: "oklch(0.974 0.026 86)"
  cream-2: "oklch(0.945 0.045 86)"
  emerald-deep: "oklch(0.37 0.07 168)"
  emerald: "oklch(0.56 0.12 163)"
  emerald-wash: "oklch(0.955 0.03 163)"
  lime: "oklch(0.85 0.13 118)"
  red: "oklch(0.55 0.2 22)"
  red-wash: "oklch(0.962 0.025 22)"
  amber: "oklch(0.6 0.14 65)"
  market-blue: "oklch(0.56 0.19 259)"
typography:
  display:
    fontFamily: "Josefin Sans Variable, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 600
    lineHeight: 1.1
  body:
    fontFamily: "Helvetica Neue, Inter Variable, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "JetBrains Mono Variable, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    letterSpacing: "0.08em"
  number:
    fontFamily: "JetBrains Mono Variable, ui-monospace, monospace"
    fontSize: "2.125rem"
    fontWeight: 500
    lineHeight: 1.1
    fontFeature: "tnum"
rounded:
  none: "0px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "40px"
components:
  run-bar:
    backgroundColor: "{colors.emerald-deep}"
    textColor: "{colors.surface}"
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    height: "36px"
  button-primary:
    backgroundColor: "{colors.emerald-deep}"
    textColor: "{colors.surface}"
    rounded: "{rounded.none}"
  button-live:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.none}"
  detail:
    backgroundColor: "{colors.cream}"
    rounded: "{rounded.none}"
---

# Design System: Agent Street Rescore

## 1. Overview

**Creative North Star: "LUCA's own instrument panel"**

The page looks like a tool LUCA Theory could ship next to Agent Street. It borrows lucatheory.com's grammar: square frames and 1px ink rules, Josefin Sans titles, JetBrains Mono for every number and label (small caps, wide tracking, like LUCA's nav and its "System Telemetry" panel), deep emerald for the machine, cream for detail, a dot grid behind the emerald band, and Agent Street's lime for EXECUTE and the live action.

Scene: Dave at his desk mid-morning on a laptop, Agent Street open in the next tab, comparing numbers line by line. That forces light, matching his dashboard so the two read side by side.

It is an instrument, not a report. One global control (how a confidence rating is read) drives the ranking, the bets and the calibration. Density is deliberate: tables with real rows, charts where every bet or call is a mark, big mono numbers. Prose is nearly absent.

**Key Characteristics:**
- Square corners everywhere. Frames are 1px ink; inner rows use hairlines.
- The deep emerald band is the pipeline: the only dark surface, so the machinery reads as one thing.
- Restrained color on paper; data colors carry fixed meanings.
- Motion shows state only: rows re-sort, dots glide to their new score, a replay steps through a recorded run.

## 2. Colors

Tinted neutrals toward LUCA's emerald, one dark band, and data colors with one meaning each.

### Primary
- **Deep Emerald** (`emerald-deep`): the pipeline band, primary buttons, the reading line, the "Fixed" end, reader A. From lucatheory.com's panels (#064E3B).
- **Emerald** (`emerald`): a bet that won, a rank that rose, a check that passed, "side likely", reader B. From LUCA's #009966.
- **Lime** (`lime`): Agent Street's accent. The live action, step timings on the band, EXECUTE cells.

### Neutral
- **Ink**, **Paper**, **Surface**, **Hairline**: text, page, panels, row rules.
- **Muted** passes AA on paper and is the floor for any text.
- **Cream** (`cream`): detail surfaces (inspector, drawers, the King's log, "Your call"). From LUCA's #FFF5E0.

### Data
- **Red**: a bet that lost, a rank that fell, "side unlikely", and the zone where a loss scores better than a win.
- **Amber**: Brier between 0.2 and 0.3 (Agent Street's own coloring), and bets the readers split on.
- **Market Blue**: the market price, always.

**The one-meaning rule.** A data color means one thing across the page. Blue is never decoration.

## 3. Typography

**Display:** Josefin Sans (LUCA's display face), for the app name and section titles only.
**Body:** Helvetica Neue, falling back to Inter (LUCA's body stack).
**Mono:** JetBrains Mono (LUCA's telemetry face), for numbers, labels, chips, code and the King's log.

- **Display** (600, 26px section titles; 700, 22px app name).
- **Body** (400, 14px/1.45).
- **Label** (500, 10.5-11px, uppercase, 0.08em tracking).
- **Number** (500, 34px for big stats; 24px on the band; table numbers 13-14px), always tabular.

## 4. Elevation

Flat. Depth comes from the 1px frame, the one dark band and tonal surfaces (cream for detail). No shadows.

## 5. Components

- **Run bar:** six steps on deep emerald with a dot grid; each step has an index, label, value, sub-label and a measured time in lime, and opens a cream drawer with its table. The live button is lime.
- **Reading control:** a range input between two named ends ("As scored c / 15" and "Fixed 0.5 + c / 30") with a readout and a zone chip.
- **Ranking rows:** 48px, FLIP re-sort on transform only (340ms ease-out-quart).
- **Charts:** inline SVG, hairline grids, mono 10px axis text. Every mark is a real record (a bet, a call, a rating). Focus and selection are shown in ink.
- **Inspector and drawers:** cream panels; tabs in mono caps with an ink underline.
- **Buttons:** 36px, square, 1px ink border, mono caps. Primary is deep emerald; live is lime.

## 6. Do's and Don'ts

- Do show the source of a number one click away.
- Do label recorded data with its date ("Recorded run, Oct 16, 2026 06:31 UTC").
- Don't add a step, timing or status that no code produced.
- Don't use cards in a grid, side-stripe borders, gradients, glass or emoji.
- Don't write a sentence where a label will do. Hints sit next to their control, 8 words max.
