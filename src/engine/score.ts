// The scoring rules, ported line for line from analysis/rescore.py so the page
// can rescore in the browser. src/engine/score.test.ts checks this file against
// the numbers rescore.py wrote to data/page.json.

export type Side = 'YES' | 'NO'
export const CATEGORIES = ['POLITICS', 'GEOPOLITICS', 'MACRO', 'TECH', 'CRYPTO'] as const
export type Category = (typeof CATEGORIES)[number]

export interface Pick {
  agentId: string
  eventId: string
  prediction: Side
  confidence: number
  units: number
  pnl: number | null
  settled: boolean
  marketProbAtEntry: number
  createdAt: string
}

export interface Event {
  id: string
  polymarketId: string
  question: string
  category: Category
  resolution: string | null
  weekNumber: number
  year: number
}

export interface Vote {
  agentId: string
  prediction: Side
  confidence: number
  trustScore: number
}

export interface KingBet {
  id: string
  eventId: string
  createdAt: string
  signal: string
  consensusProb: number
  marketProb: number
  edge: number
  direction: Side
  breakdown: Vote[]
  anchors: [string, string] | null
  log: string[]
  logOmitted: number
}

export interface Published {
  baseTrust: number
  dynamicTrust: number
  settledCount: number
  brierScore: number
  totalSettled: number
  wins: number
  losses: number
}

/** The committed snapshot shape (data/snapshot.json), also what a live pull is normalised to. */
export interface Dataset {
  pullDate: string
  agents: string[]
  published: Record<string, Published>
  kingBetsTotal: number
  picks: Pick[]
  events: Event[]
  kingBets: KingBet[]
}

export const FLOOR = 0.3 // decayWeight floor in LUCA's trust formula
export const EDGE = 0.04 // approximate King rule: minimum gap between consensus and market
export const LOW = 7 // ratings at or below this score better when they lose, as scored
export const COIN_FLIP = 0.25

/**
 * How a 1-15 rating is read: the chance the agent's own side is right.
 * `floor` 0 is LUCA's published reading (confidence / 15); 0.5 is the fixed
 * reading (0.5 + confidence / 30). In between is a straight line from `floor`
 * at rating 0 to 1 at rating 15. The two ends use rescore.py's exact
 * expressions so the floats match Python bit for bit.
 */
export function pSide(confidence: number, floor: number): number {
  if (floor === 0) return confidence / 15
  if (floor === 0.5) return 0.5 + confidence / 30
  return floor + ((1 - floor) * confidence) / 15
}

export const AS_SCORED = 0
export const FIXED = 0.5

export function pickBrier(confidence: number, won: boolean, floor: number): number {
  return (pSide(confidence, floor) - (won ? 1 : 0)) ** 2
}

/** Ratings below this score better when they lose (a loss is closer to the reading than a win). */
export function lossBetterBelow(floor: number): number {
  return floor >= 0.5 ? 0 : (15 * (0.5 - floor)) / (1 - floor)
}

/** The picks LUCA's analytics count: settled, with a stake (nonzero P&L). */
export function isScored(p: Pick): boolean {
  return Boolean(p.settled) && p.pnl !== null && p.pnl !== undefined && p.pnl !== 0
}

export function won(p: Pick): boolean {
  return (p.pnl ?? 0) > 0
}

/** The market's price at entry for the side the agent picked. */
export function sidePrice(p: Pick): number {
  return p.prediction === 'YES' ? p.marketProbAtEntry : 1 - p.marketProbAtEntry
}

export function brier(picks: Pick[], floor: number): number | null {
  if (!picks.length) return null
  let sum = 0
  for (const p of picks) sum += pickBrier(p.confidence, won(p), floor)
  return sum / picks.length
}

export function decayWeight(settledCount: number): number {
  return Math.max(FLOOR, 1 - settledCount / 50)
}

/** LUCA's methodology page: baseTrust x decayWeight + (1 - brier) x 100 x (1 - decayWeight). */
export function trust(baseTrust: number, brierScore: number, weight = FLOOR): number {
  return baseTrust * weight + (1 - brierScore) * 100 * (1 - weight)
}

/**
 * Python's Decimal(str(x)).quantize(..., ROUND_HALF_UP): round the shortest
 * decimal form of x, ties away from zero. Plain Math.round works on the binary
 * value and can disagree (0.1695 is stored as 0.16949999...).
 */
export function halfUp(x: number, places = 0): number {
  if (!Number.isFinite(x)) return x
  const neg = x < 0
  let [mant, expPart] = Math.abs(x).toString().split('e')
  const exp = expPart ? Number(expPart) : 0
  let [intPart, frac = ''] = mant.split('.')
  let digits = intPart + frac
  let point = intPart.length + exp // position of the decimal point within digits
  if (point < 0) {
    digits = '0'.repeat(-point) + digits
    point = 0
  }
  if (digits.length < point) digits = digits + '0'.repeat(point - digits.length)
  const cut = point + places
  if (cut < 0) return 0
  if (digits.length <= cut) return x
  const keep = digits.slice(0, cut)
  const roundUp = Number(digits[cut]) >= 5
  // Add one unit in the last kept place, as decimal string arithmetic.
  let out = (keep || '0').split('').map(Number)
  if (roundUp) {
    let i = out.length - 1
    while (i >= 0) {
      if (out[i] === 9) {
        out[i] = 0
        i -= 1
      } else {
        out[i] += 1
        break
      }
    }
    if (i < 0) out = [1, ...out]
  }
  const shift = out.length - (keep.length || 1)
  const intDigits = out.slice(0, point + shift).join('') || '0'
  const fracDigits = out.slice(point + shift).join('')
  const value = Number(fracDigits ? `${intDigits}.${fracDigits}` : intDigits)
  return neg ? -value : value
}

export const r3 = (x: number) => halfUp(x, 3)
export const pct = (x: number) => halfUp(100 * x)
export const points = (x: number) => halfUp(100 * x, 1)

/** Event id -> Polymarket contract. A contract can come back in a later week as a new event. */
export function contractsOf(ds: Dataset): Map<string, string> {
  return new Map(ds.events.map((e) => [e.id, e.polymarketId]))
}

export function scoredByAgent(ds: Dataset): Map<string, Pick[]> {
  const out = new Map<string, Pick[]>(ds.agents.map((a) => [a, []]))
  for (const p of ds.picks) {
    if (!isScored(p)) continue
    if (!out.has(p.agentId)) out.set(p.agentId, [])
    out.get(p.agentId)!.push(p)
  }
  return out
}

export interface AgentScore {
  id: string
  n: number
  wins: number
  brier: number
  trust: number
  rank: number
  /** Rank under LUCA's published reading, the baseline every rank change is measured from. */
  rankAsScored: number
}

/**
 * Brier, trust and rank for every agent under one reading. Ranks sort by trust;
 * the published reading breaks ties the way rescore.py does (published trust first).
 */
export function scoreAgents(ds: Dataset, byAgent: Map<string, Pick[]>, floor: number): AgentScore[] {
  const rows = ds.agents.map((a) => {
    const picks = byAgent.get(a) ?? []
    const pub = ds.published[a]
    const b = brier(picks, floor) ?? 0
    return {
      id: a,
      n: picks.length,
      wins: picks.filter(won).length,
      brier: b,
      trust: trust(pub.baseTrust, b, decayWeight(pub.settledCount)),
      trustAsScored: trust(pub.baseTrust, brier(picks, AS_SCORED) ?? 0, decayWeight(pub.settledCount)),
      published: pub.dynamicTrust,
    }
  })
  // rows follow ds.agents (alphabetical), and Array.prototype.sort is stable, so ties keep
  // that order, as Python's sorted() does in rescore.py.
  const asOrder = [...rows].sort((x, y) => y.published - x.published || y.trustAsScored - x.trustAsScored)
  const asRank = new Map(asOrder.map((r, i) => [r.id, i + 1]))
  const order = floor === AS_SCORED ? asOrder : [...rows].sort((x, y) => y.trust - x.trust)
  return order.map((r, i) => ({
    id: r.id,
    n: r.n,
    wins: r.wins,
    brier: r.brier,
    trust: r.trust,
    rank: i + 1,
    rankAsScored: asRank.get(r.id)!,
  }))
}

/** The rebuild checks behind the proof strip: published values against the rebuild. */
export function proofChecks(ds: Dataset, byAgent: Map<string, Pick[]>) {
  const rows = ds.agents.map((a) => {
    const picks = byAgent.get(a) ?? []
    const pub = ds.published[a]
    const b = brier(picks, AS_SCORED) ?? 0
    const t = trust(pub.baseTrust, b, decayWeight(pub.settledCount))
    return {
      id: a,
      settled: picks.length,
      publishedSettled: pub.totalSettled,
      rebuiltBrier: r3(b),
      publishedBrier: r3(pub.brierScore),
      rebuiltTrust: halfUp(t, 1),
      publishedTrust: pub.dynamicTrust,
      brierOk: r3(b) === r3(pub.brierScore) && picks.length === pub.totalSettled,
      trustOk: Math.abs(t - pub.dynamicTrust) <= 0.5,
    }
  })
  return {
    rows,
    brierMatches: rows.filter((r) => r.brierOk).length,
    trustWithinHalf: rows.filter((r) => r.trustOk).length,
  }
}

export interface RatingStat {
  confidence: number
  n: number
  wonRate: number | null
  marketRate: number | null
}

/** Per rating 1-15: how many scored bets, how often they won, and the mean market price for the side picked. */
export function byRating(picks: Pick[]): RatingStat[] {
  const out: RatingStat[] = []
  for (let c = 1; c <= 15; c++) {
    const xs = picks.filter((p) => p.confidence === c)
    const n = xs.length
    let w = 0
    let m = 0
    for (const p of xs) {
      if (won(p)) w += 1
      m += sidePrice(p)
    }
    out.push({ confidence: c, n, wonRate: n ? w / n : null, marketRate: n ? m / n : null })
  }
  return out
}

export interface Band {
  from: number
  to: number
  n: number
  won: number
  reading: number
  asScored: number
  fixed: number
  market: number
}

/** Two bands split where losing stops scoring better, as rescore.py's rating_bands, plus any reading. */
export function ratingBands(scored: Pick[], floor: number): Band[] {
  return [
    [1, LOW],
    [LOW + 1, 15],
  ].map(([lo, hi]) => {
    const xs = scored.filter((p) => p.confidence >= lo && p.confidence <= hi)
    const n = xs.length
    const mean = (f: (p: Pick) => number) => {
      let s = 0
      for (const p of xs) s += f(p)
      return s / n
    }
    return {
      from: lo,
      to: hi,
      n,
      won: mean((p) => (won(p) ? 1 : 0)),
      reading: mean((p) => pSide(p.confidence, floor)),
      asScored: mean((p) => pSide(p.confidence, AS_SCORED)),
      fixed: mean((p) => pSide(p.confidence, FIXED)),
      market: mean(sidePrice),
    }
  })
}
