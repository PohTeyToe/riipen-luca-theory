// The recorded reader run (analysis/reader.py -> data/reader-run.json): two models
// read the question, side and written reasoning behind every scored pick. They
// weren't given its rating, price or outcome, though about a third of the texts
// quote the price. This file joins their answers to the picks and counts them.

export type View = 'likely' | 'unlikely' | 'none'
export const VIEWS: View[] = ['likely', 'none', 'unlikely']

export interface Answer {
  view: View
  viewQuote: string
  low: boolean
  lowQuote: string
}

export interface ReaderPick {
  key: string
  textSha: string
  A: Answer | null
  B: Answer | null
}

export interface ReaderCall {
  reader: 'A' | 'B'
  worker: number
  batch: number
  attempt: number
  items: number
  t0: number
  t1: number
  inTokens?: number
  outTokens?: number
  costUsd?: number | null
  apiMs?: number | null
  kept: number
  rejected: { pick: string | null; why: string }[]
  error: string | null
}

export interface ReaderRun {
  ranAt: string
  wallMs: number
  pull: string
  predictionsSha256: string
  limit: number | null
  readers: { id: 'A' | 'B'; model: string; effort: string }[]
  workers: number
  batchSize: number
  seed: number
  maxAttempts: number
  prompt: string
  promptSha256: string
  calls: ReaderCall[]
  failed: Record<string, Record<string, string>>
  picks: ReaderPick[]
}

/** The viewer's own call on a pick the two readers disagree on. */
export type Decisions = Record<string, View>

export type Status = 'agreed' | 'decided' | 'open' | 'missing'

/** One pick's view: both readers agree, or the viewer decided, or it's still open. */
export function verdict(p: ReaderPick, decisions: Decisions): { view: View | null; status: Status } {
  if (!p.A || !p.B) return { view: null, status: 'missing' }
  if (p.A.view === p.B.view) return { view: p.A.view, status: 'agreed' }
  const d = decisions[p.key]
  return d ? { view: d, status: 'decided' } : { view: null, status: 'open' }
}

/** Both readers say the text admits low conviction (expertise, information or edge). */
export const lowBoth = (p: ReaderPick) => Boolean(p.A?.low && p.B?.low)

export interface Tally {
  n: number
  likely: number
  none: number
  unlikely: number
  open: number
  missing: number
  low: number
}

export function tally(picks: ReaderPick[], decisions: Decisions): Tally {
  const t: Tally = { n: 0, likely: 0, none: 0, unlikely: 0, open: 0, missing: 0, low: 0 }
  for (const p of picks) {
    t.n += 1
    const v = verdict(p, decisions)
    if (v.view) t[v.view] += 1
    else t[v.status === 'missing' ? 'missing' : 'open'] += 1
    if (lowBoth(p)) t.low += 1
  }
  return t
}

/** Tally per rating 1-15. `ratingOf` maps a pick key to its 1-15 confidence. */
export function tallyByRating(picks: ReaderPick[], ratingOf: Map<string, number>, decisions: Decisions): Tally[] {
  const groups: ReaderPick[][] = Array.from({ length: 15 }, () => [])
  for (const p of picks) {
    const c = ratingOf.get(p.key)
    if (c && c >= 1 && c <= 15) groups[c - 1].push(p)
  }
  return groups.map((g) => tally(g, decisions))
}

export interface RunStats {
  calls: number
  retries: number
  rejectedAnswers: number
  failedPicks: number
  inTokens: number
  outTokens: number
  wallMs: number
  /** Sum of call durations: the time one worker would have needed alone. */
  serialMs: number
  agreeView: number
  agreeLow: number
  both: number
}

export function runStats(run: ReaderRun): RunStats {
  let inTokens = 0
  let outTokens = 0
  let serialMs = 0
  let rejectedAnswers = 0
  for (const c of run.calls) {
    inTokens += c.inTokens ?? 0
    outTokens += c.outTokens ?? 0
    serialMs += c.t1 - c.t0
    rejectedAnswers += c.rejected.length
  }
  let both = 0
  let agreeView = 0
  let agreeLow = 0
  for (const p of run.picks) {
    if (!p.A || !p.B) continue
    both += 1
    if (p.A.view === p.B.view) agreeView += 1
    if (p.A.low === p.B.low) agreeLow += 1
  }
  return {
    calls: run.calls.length,
    retries: run.calls.filter((c) => c.attempt > 1).length,
    rejectedAnswers,
    failedPicks: Object.values(run.failed).reduce((s, f) => s + Object.keys(f).length, 0),
    inTokens,
    outTokens,
    wallMs: run.wallMs,
    serialMs,
    agreeView,
    agreeLow,
    both,
  }
}

/** What the run had finished by `t` ms after it started: calls done, answers kept, answers sent back. */
export function progressAt(run: ReaderRun, t: number) {
  let done = 0
  let kept = 0
  let rejected = 0
  let running = 0
  for (const c of run.calls) {
    if (c.t1 <= t) {
      done += 1
      kept += c.kept
      rejected += c.rejected.length
    } else if (c.t0 <= t) running += 1
  }
  return { done, kept, rejected, running }
}

/**
 * Where a reader's quote sits in the full reasoning, ignoring runs of whitespace
 * (reader.py stores quotes with whitespace collapsed). Returns [start, end) in the
 * original text, or null.
 */
export function locate(text: string, quote: string): [number, number] | null {
  if (!quote) return null
  // Build the collapsed text with a map back to original offsets.
  let collapsed = ''
  const map: number[] = []
  let space = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (/\s/.test(ch)) {
      if (!space && collapsed.length) {
        collapsed += ' '
        map.push(i)
      }
      space = true
    } else {
      collapsed += ch
      map.push(i)
      space = false
    }
  }
  const at = collapsed.indexOf(quote)
  if (at < 0) return null
  const end = at + quote.length - 1
  return [map[at], map[end] + 1]
}
