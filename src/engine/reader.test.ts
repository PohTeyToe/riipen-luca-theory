// The reader run's join and counts. The run itself (analysis/reader.py) checked
// every quote against the pulled text; these tests check what the page does with it.
import { describe, expect, it } from 'vitest'
import pageJson from '../../data/page.json'
import runJson from '../../data/reader-run.json'
import snapshotJson from '../../data/snapshot.json'
import { runPipeline } from './pipeline'
import { type Answer, type ReaderPick, type ReaderRun, locate, progressAt, runStats, tally, tallyByRating, verdict } from './reader'
import { type Dataset, LOW, isScored } from './score'

const run = runJson as unknown as ReaderRun
const ds = snapshotJson as unknown as Dataset
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const page = pageJson as any
const key = (p: { agentId: string; eventId: string; createdAt: string }) => `${p.agentId}|${p.eventId}|${p.createdAt}`
const ratingOf = new Map(ds.picks.filter(isScored).map((p) => [key(p), p.confidence]))

const a = (view: Answer['view'], low = false): Answer => ({
  view,
  viewQuote: view === 'none' ? '' : 'q',
  low,
  lowQuote: low ? 'q' : '',
})
const pick = (k: string, A: Answer | null, B: Answer | null): ReaderPick => ({ key: k, textSha: '', A, B })

describe('verdicts and counts', () => {
  it('agreed, decided, open and missing', () => {
    expect(verdict(pick('x', a('likely'), a('likely')), {})).toEqual({ view: 'likely', status: 'agreed' })
    expect(verdict(pick('x', a('likely'), a('none')), {})).toEqual({ view: null, status: 'open' })
    expect(verdict(pick('x', a('likely'), a('none')), { x: 'none' })).toEqual({ view: 'none', status: 'decided' })
    expect(verdict(pick('x', null, a('none')), {})).toEqual({ view: null, status: 'missing' })
  })
  it('a viewer call moves a pick out of open, and low conviction needs both readers', () => {
    const picks = [pick('p1', a('likely', true), a('likely', true)), pick('p2', a('unlikely', true), a('none')), pick('p3', a('none'), a('none', true))]
    expect(tally(picks, {})).toEqual({ n: 3, likely: 1, none: 1, unlikely: 0, open: 1, missing: 0, low: 1 })
    expect(tally(picks, { p2: 'unlikely' })).toMatchObject({ unlikely: 1, open: 0 })
    const byRating = tallyByRating(picks, new Map([['p1', 2], ['p2', 2], ['p3', 15]]), {})
    expect(byRating[1].n).toBe(2)
    expect(byRating[14].n).toBe(1)
    expect(byRating.reduce((s, t) => s + t.n, 0)).toBe(3)
  })
})

describe('locate', () => {
  it('finds a whitespace-collapsed quote in the original text', () => {
    const text = 'It is  outside my\ncircle of competence. NO.'
    const at = locate(text, 'outside my circle of competence')!
    expect(text.slice(at[0], at[1])).toBe('outside my\ncircle of competence')
  })
  it('returns null for a quote that is not in the text', () => {
    expect(locate('abc def', 'abc  xyz')).toBeNull()
    expect(locate('abc', '')).toBeNull()
  })
})

describe('the recorded run', () => {
  it('read every scored bet once, with both readers', () => {
    expect(run.picks.length).toBe(ratingOf.size)
    expect(new Set(run.picks.map((p) => p.key)).size).toBe(run.picks.length)
    for (const p of run.picks) {
      expect(ratingOf.has(p.key), p.key).toBe(true)
      expect(p.A && p.B, p.key).toBeTruthy()
    }
  })
  it('every kept answer has a quote exactly when it needs one', () => {
    for (const p of run.picks)
      for (const ans of [p.A!, p.B!]) {
        expect(ans.view === 'none' ? ans.viewQuote === '' : ans.viewQuote.length > 0, p.key).toBe(true)
        expect(ans.low ? ans.lowQuote.length > 0 : ans.lowQuote === '', p.key).toBe(true)
      }
  })
  it('the calls account for every answer, and the replay ends where the run did', () => {
    const s = runStats(run)
    const end = progressAt(run, run.wallMs)
    expect(end.done).toBe(s.calls)
    expect(end.running).toBe(0)
    expect(end.kept).toBe(run.picks.length * run.readers.length)
    expect(progressAt(run, 0).done).toBe(0)
    for (const c of run.calls) expect(c.t1).toBeGreaterThanOrEqual(c.t0)
    // Every answer sent back was retried and kept on a later try.
    expect(Object.values(run.failed).every((f) => Object.keys(f).length === 0)).toBe(true)
    expect(s.retries).toBeGreaterThanOrEqual(s.rejectedAnswers > 0 ? 1 : 0)
  })
  it('the low band is the 255 bets the published reading scores better when lost', () => {
    const low = run.picks.filter((p) => ratingOf.get(p.key)! <= LOW)
    expect(low.length).toBe(page.line.bands[0].n)
    const t = tally(low, {})
    expect(t.likely + t.none + t.unlikely + t.open).toBe(low.length)
  })
})

describe('pipeline', () => {
  it('reports the rebuild and the finding from the snapshot', () => {
    let clock = 0
    const r = runPipeline(ds, () => (clock += 1))
    expect(r.picks).toBe(ds.picks.length)
    expect(r.rescore.scored).toBe(page.line.scoredPicks)
    expect(r.match.brierMatches).toBe(page.proof.brierMatches)
    expect(r.match.trustWithinHalf).toBe(page.proof.trustWithinHalf)
    expect(r.king.ruleOk).toBe(page.king.ruleMatches)
    expect(r.finding.top).toBe(LOW)
    expect(r.finding.bets).toBe(page.line.bands[0].n)
    expect(r.rescore.ms).toBe(1)
  })
})
