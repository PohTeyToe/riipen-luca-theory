// Every number on the page comes from data/page.json, which analysis/rescore.py
// writes from the public pull. Nothing here computes a score; it only looks up
// and formats what the pull produced.
import raw from '../data/page.json'

export type Category = 'POLITICS' | 'GEOPOLITICS' | 'MACRO' | 'TECH' | 'CRYPTO'

export interface Reading {
  p: number
  percent: number
  win: number
  loss: number
}

export interface ConfidenceRow {
  confidence: number
  asScored: Reading
  fixed: Reading
  lossScoresBetter: boolean
  scoredPicks: number
}

export interface SampleBet {
  slot: string
  question: string
  category: Category
  side: 'YES' | 'NO'
  confidence: number
  marketProbAtEntry: number
  resolution: string
  won: boolean
  scoreAsScored: number
  scoreFixed: number
  createdAt: string
  reasoning: string
}

export interface Agent {
  id: string
  name: string
  role: string
  rankAsScored: number
  rankFixed: number
  n: number
  wins: number
  losses: number
  winPercent: number
  lowCount: number
  brierAsScored: number
  brierFixed: number
  worseThanCoinFlipAsScored: boolean
  trustAsScored: number
  trustFixed: number
  baseTrust: number
  /** The win rate the market's prices at entry implied for its bets, in percent. */
  marketPercent: number
  sampleBets: SampleBet[]
}

export interface Cell {
  n: number
  wins: number
  losses: number
  thin: boolean
  rawBrier: number | null
  blendedBrier: number | null
  trust: number | null
  /** Won, the win rate the market's prices implied, and the gap in points. Null when the cell has no picks. */
  wonPercent: number | null
  marketPercent: number | null
  gapPoints: number | null
}

export interface Band {
  from: number
  to: number
  n: number
  wonPercent: number
  asScoredPercent: number
  fixedPercent: number
  marketPercent: number
}

export interface MarketRow {
  id: string
  name: string
  role: string
  n: number
  /** Distinct Polymarket contracts behind the n bets. */
  contracts: number
  wonPercent: number
  marketPercent: number
  /** Win rate minus the win rate the market's prices implied, in points. */
  gapPoints: number
  /** The middle 95% of gaps luck alone produces, in points. Repeat bets on one contract share its outcome. */
  luckLowPoints: number
  luckHighPoints: number
}

export interface ProofRow {
  id: string
  name: string
  settled: number
  publishedSettled: number
  publishedBrier: number
  rebuiltBrier: number
  publishedTrust: number
  rebuiltTrust: number
}

export interface Batch {
  week: number
  year: number
  start: string
  end: string
  state: 'full' | 'partial' | 'curating' | 'none'
  status: string | null
  selected: number
  eventCount: number | null
  predictionCount: number | null
}

export interface PageData {
  pullDate: string
  season: { label: string; status: string; crystallisedAt: string; firstPickAt: string; lastPickAt: string }
  sources: { file: string; url: string; retrievedAt: string }[]
  quotes: Record<
    | 'proofOfTrust'
    | 'lastMile'
    | 'calibration'
    | 'brierScale'
    | 'binaryCommitment'
    | 'positionSize'
    | 'eventSourcing'
    | 'trustFormula'
    | 'brierTrust'
    | 'decayWeight',
    { text: string; page: string }
  >
  method: Record<string, string | number>
  proof: { agents: number; brierMatches: number; trustWithinHalf: number; kingConsensusMatches: number; kingBetsWithBreakdown: number; rows: ProofRow[] }
  line: { scoredPicks: number; ratedLowOrBelow: number; lowThreshold: number; coinFlipBrier: number; byConfidence: ConfidenceRow[]; bands: Band[] }
  market: {
    rows: MarketRow[]
    closest: string
    edgePoints: number
    /** Rough planning number: settled bets, each on a different contract, for a real 5-point edge to clear luck about 4 times in 5. */
    betsForEdgeMin: number
    betsForEdgeMax: number
    settledMin: number
    settledMax: number
  }
  scorecard: Agent[]
  domains: {
    categories: Category[]
    scoredEvents: number
    scoredEventsByCategory: Record<Category, number>
    politicsPercent: number
    cellsWithTenOrMore: number
    cellsTotal: number
    grid: { id: string; name: string; role: string; cells: Record<Category, Cell> }[]
    notes: {
      sbf: { geopolitics: Cell; politics: Cell }
      wood: { tech: Cell; crypto: Cell; politics: Cell }
    }
  }
  king: {
    betsTotal: number
    betsWithBreakdown: number
    consensusMatches: number
    ruleMatches: number
    edgeThreshold: number
  }
  change: {
    diff: string[]
    domainTrust: string
    proposedResponses: Record<Category, Record<string, unknown>>
    tests: { name: string; status: string }[]
    runIt: string
  }
  batches: Batch[]
  /** Null when the pull has no Gamma file. */
  supply: { complete: boolean; markets: number; events: number } | null
  checks: Record<string, boolean>
}

export const page = raw as unknown as PageData

export const agentsById = new Map(page.scorecard.map((a) => [a.id, a]))
export const agent = (id: string): Agent => {
  const a = agentsById.get(id)
  if (!a) throw new Error(`No agent ${id} in page.json`)
  return a
}

export const confidenceRow = (c: number): ConfidenceRow => page.line.byConfidence[c - 1]

export const categoryLabel: Record<Category, string> = {
  POLITICS: 'Politics',
  GEOPOLITICS: 'Geopolitics',
  MACRO: 'Macro',
  TECH: 'Tech',
  CRYPTO: 'Crypto',
}
export const categoryShort: Record<Category, string> = {
  POLITICS: 'POL',
  GEOPOLITICS: 'GEO',
  MACRO: 'MAC',
  TECH: 'TEC',
  CRYPTO: 'CRY',
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-10-15" or an ISO timestamp -> "Oct 15, 2026" (calendar date, no time zone shift). */
export function longDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${months[m - 1]} ${d}, ${y}`
}
/** -> "Oct 15" */
export function shortDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${months[m - 1]} ${d}`
}

export const pulled = longDate(page.pullDate)

export const brier3 = (x: number) => x.toFixed(3)
export const score2 = (x: number) => x.toFixed(2)
export const pct = (x: number) => `${Math.round(x * 100)}%`
export const record = (w: number, l: number) => `${w}–${l}`
export const int = (x: number) => x.toLocaleString('en-US')
/** Points with a sign and one decimal: +6.0, −5.6. */
export const signed = (points: number) => `${points > 0 ? '+' : points < 0 ? '−' : ''}${Math.abs(points).toFixed(1)}`

export const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// David Oram's public LinkedIn post of 2026-08-07 (date from the post's activity id).
// LinkedIn needs a sign-in for scripts, so rescore.py can't check this line; it was
// checked by hand on 2026-10-15 (see data/SOURCES.md).
export const SUPERFORECASTER_POST = {
  url: 'https://www.linkedin.com/posts/davidoram8_which-of-the-leading-ai-models-are-the-best-activity-7491473731027116032-e9LS',
  date: 'Aug 7',
  text: 'Which of the leading AI models are the best superforecasters?',
}

export const REPO = 'https://github.com/PohTeyToe/riipen-luca-theory'
export const TEST_FILE = `${REPO}/blob/main/analysis/tests/test_rescore.py`
export const OWNER = {
  name: 'Abdallah Safi',
  email: 'abdalsf5@gmail.com',
  github: 'https://github.com/PohTeyToe',
  linkedin: 'https://linkedin.com/in/abdallah-safi',
}
