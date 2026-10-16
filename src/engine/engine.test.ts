// The browser engine must agree with analysis/rescore.py on every number the
// page shows. rescore.py wrote data/page.json from the same snapshot; these
// tests recompute each figure in TypeScript and compare.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import pageJson from '../../data/page.json'
import snapshotJson from '../../data/snapshot.json'
import { fromApi, type RawApi } from './dataset'
import { kingSummary, logChecks, logParts, replay } from './king'
import { againstMarket } from './market'
import {
  AS_SCORED,
  FIXED,
  type Dataset,
  byRating,
  contractsOf,
  halfUp,
  isScored,
  lossBetterBelow,
  pSide,
  pct,
  pickBrier,
  points,
  proofChecks,
  r3,
  ratingBands,
  scoreAgents,
  scoredByAgent,
} from './score'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const page = pageJson as any
const ds = snapshotJson as unknown as Dataset
const byAgent = scoredByAgent(ds)
const contractOf = contractsOf(ds)

describe('halfUp matches Python Decimal ROUND_HALF_UP', () => {
  it.each([
    [0.1695, 3, 0.17],
    [0.4710699588477365, 3, 0.471],
    [84.5, 0, 85],
    [-7.45, 1, -7.5],
    [99.95, 1, 100],
    [0.0004, 3, 0],
    [1e-7, 3, 0],
    [2.5, 0, 3],
    [0.125, 2, 0.13],
    [76.84999999999999, 1, 76.9],
    [0.2849, 2, 0.28],
    [1.005, 2, 1.01],
  ])('halfUp(%s, %s) = %s', (x, places, want) => {
    expect(halfUp(x, places)).toBe(want)
  })
})

describe('readings', () => {
  it('the two ends are the published and fixed formulas', () => {
    for (let c = 1; c <= 15; c++) {
      expect(pSide(c, AS_SCORED)).toBe(c / 15)
      expect(pSide(c, FIXED)).toBe(0.5 + c / 30)
    }
  })
  it('the general form meets both ends', () => {
    for (let c = 1; c <= 15; c++) {
      expect(pSide(c, 1e-12)).toBeCloseTo(c / 15, 9)
      expect(pSide(c, 0.5 - 1e-12)).toBeCloseTo(0.5 + c / 30, 9)
    }
  })
  it('as scored, a loss beats a win at ratings 1-7 and nowhere under the fixed reading', () => {
    for (let c = 1; c <= 15; c++) {
      expect(pickBrier(c, false, AS_SCORED) < pickBrier(c, true, AS_SCORED)).toBe(c <= 7)
      expect(pickBrier(c, false, FIXED) < pickBrier(c, true, FIXED)).toBe(false)
      expect(c < lossBetterBelow(AS_SCORED)).toBe(c <= 7)
    }
    expect(lossBetterBelow(FIXED)).toBe(0)
  })
  it('per-rating scores match page.json line', () => {
    for (const row of page.line.byConfidence) {
      const c = row.confidence
      expect(pickBrier(c, true, AS_SCORED)).toBeCloseTo(row.asScored.win, 4)
      expect(pickBrier(c, false, AS_SCORED)).toBeCloseTo(row.asScored.loss, 4)
      expect(pickBrier(c, true, FIXED)).toBeCloseTo(row.fixed.win, 4)
      expect(pickBrier(c, false, FIXED)).toBeCloseTo(row.fixed.loss, 4)
      expect(byRating([...byAgent.values()].flat())[c - 1].n).toBe(row.scoredPicks)
    }
  })
})

describe('rebuild of the published numbers', () => {
  const proof = proofChecks(ds, byAgent)
  it('10 of 10 Brier scores to 3 decimals and 10 of 10 trust scores within 0.5', () => {
    expect(proof.brierMatches).toBe(page.proof.brierMatches)
    expect(proof.trustWithinHalf).toBe(page.proof.trustWithinHalf)
    expect(proof.brierMatches).toBe(ds.agents.length)
  })
  it('each row equals rescore.py', () => {
    for (const want of page.proof.rows) {
      const got = proof.rows.find((r) => r.id === want.id)!
      expect(got.rebuiltBrier).toBe(want.rebuiltBrier)
      expect(got.publishedBrier).toBe(want.publishedBrier)
      expect(got.rebuiltTrust).toBe(want.rebuiltTrust)
      expect(got.settled).toBe(want.settled)
    }
  })
  it('counts 893 scored bets', () => {
    expect(ds.picks.filter(isScored).length).toBe(page.line.scoredPicks)
  })
})

describe('scorecard under both readings', () => {
  const asScored = scoreAgents(ds, byAgent, AS_SCORED)
  const fixed = scoreAgents(ds, byAgent, FIXED)
  it('Brier, trust and rank match page.json for every agent', () => {
    for (const want of page.scorecard) {
      const a = asScored.find((r) => r.id === want.id)!
      const f = fixed.find((r) => r.id === want.id)!
      expect(r3(a.brier)).toBe(want.brierAsScored)
      expect(r3(f.brier)).toBe(want.brierFixed)
      expect(halfUp(a.trust)).toBe(want.trustAsScored)
      expect(halfUp(f.trust)).toBe(want.trustFixed)
      expect(a.rank).toBe(want.rankAsScored)
      expect(f.rank).toBe(want.rankFixed)
      expect(f.rankAsScored).toBe(want.rankAsScored)
      expect(pct(a.wins / a.n)).toBe(want.winPercent)
    }
  })
  it('the published reading ranks agents in published trust order', () => {
    const published = [...ds.agents].sort((x, y) => ds.published[y].dynamicTrust - ds.published[x].dynamicTrust)
    expect(asScored.map((r) => r.id)).toEqual(published)
    // Rounded rebuilt trust equals the published integer for every agent.
    for (const r of asScored) expect(halfUp(r.trust)).toBe(ds.published[r.id].dynamicTrust)
  })
})

describe('against the market', () => {
  it('win rate, market rate, gap and exact luck range match page.json', () => {
    const needed: number[] = []
    for (const want of page.market.rows) {
      const vs = againstMarket(byAgent.get(want.id)!, contractOf)
      expect(pct(vs.won)).toBe(want.wonPercent)
      expect(pct(vs.market)).toBe(want.marketPercent)
      expect(vs.contracts).toBe(want.contracts)
      expect(points(vs.gap)).toBe(want.gapPoints)
      expect(points(vs.luckLow)).toBe(want.luckLowPoints)
      expect(points(vs.luckHigh)).toBe(want.luckHighPoints)
      expect(vs.inside).toBe(true)
      needed.push(vs.betsFor5PointEdge)
    }
    expect(Math.min(...needed)).toBe(page.market.betsForEdgeMin)
    expect(Math.max(...needed)).toBe(page.market.betsForEdgeMax)
  })
  it('the luck distribution sums to 1', () => {
    const vs = againstMarket(byAgent.get('ackman')!, contractOf)
    expect(vs.dist.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12)
  })
})

describe('rating bands', () => {
  it('match page.json under both readings', () => {
    const bands = ratingBands([...byAgent.values()].flat(), FIXED)
    bands.forEach((b, i) => {
      const want = page.line.bands[i]
      expect(b.n).toBe(want.n)
      expect(pct(b.won)).toBe(want.wonPercent)
      expect(pct(b.asScored)).toBe(want.asScoredPercent)
      expect(pct(b.fixed)).toBe(want.fixedPercent)
      expect(pct(b.market)).toBe(want.marketPercent)
      expect(pct(b.reading)).toBe(want.fixedPercent)
    })
  })
})

describe('Street King replay', () => {
  it('rebuilds every consensus, every call and every log claim', () => {
    const s = kingSummary(ds.kingBets)
    expect(s.bets).toBe(page.king.betsWithBreakdown)
    expect(s.consensusOk).toBe(page.king.consensusMatches)
    expect(s.ruleOk).toBe(page.king.ruleMatches)
    expect(s.claims).toBe(page.king.logClaims)
    expect(s.claimsOk).toBe(page.king.logClaimsMatch)
    expect(s.claimsOk).toBe(s.claims)
  })
  it('no kept log sentence goes unchecked', () => {
    for (const b of ds.kingBets) for (const c of logChecks(b)) expect(c.ok, c.sentence).not.toBeNull()
  })
  it('marks the phrases no check verifies', () => {
    const sentence = 'Anchor agents (dalio/munger) selected by trust-weighted heuristic, aligned on NO.'
    const anchor = logParts(sentence, sentence.length - 1)
    expect(anchor.filter((p) => !p.checked).map((p) => p.text.trim())).toEqual(['selected by trust-weighted heuristic,'])
    const exec = logParts('EXECUTE: 3Y/7N split with 22.4% edge (aggressive tier).', 'EXECUTE: 3Y/7N split with 22.4% edge'.length)
    expect(exec.filter((p) => !p.checked).map((p) => p.text.trim())).toEqual(['(aggressive tier).'])
    expect(exec[0]).toEqual({ text: 'EXECUTE: 3Y/7N split with 22.4% edge', checked: true })
  })
  it('a wrong log claim is caught', () => {
    const b = ds.kingBets.find((x) => x.log[0].startsWith('EXECUTE'))!
    const r = replay(b)
    const tampered = { ...b, log: [b.log[0].replace(/^EXECUTE: \d+Y/, `EXECUTE: ${r.split[0] + 1}Y`)] }
    expect(logChecks(tampered)[0].ok).toBe(false)
  })
})

// The normaliser that turns a live pull into the snapshot shape. The raw files
// aren't committed (they're LUCA's responses), so this runs where a pull exists.
const rawRoot = new URL('../../data/raw/', import.meta.url)
const pulls = existsSync(rawRoot) ? readdirSync(rawRoot).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort() : []
const pull = pulls.find((d) => d === ds.pullDate)
describe.skipIf(!pull)('fromApi on the raw pull', () => {
  it('rebuilds data/snapshot.json exactly', () => {
    const read = (f: string) => JSON.parse(readFileSync(new URL(`${pull}/${f}`, rawRoot), 'utf8'))
    const raw: RawApi = {
      predictions: read('predictions.json'),
      events: read('events.json'),
      kingBets: read('king_bets.json'),
      trustScores: read('trust_scores.json'),
      calibration: read('calibration.json'),
    }
    expect(fromApi(raw, pull!)).toEqual(ds)
  })
})
