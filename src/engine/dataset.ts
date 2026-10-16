// Turns raw Agent Street API responses into the snapshot shape, the same way
// rescore.py's build_snapshot does, so a live pull runs through the same code
// as the committed snapshot.
import type { Dataset, Event, KingBet, Pick, Published, Side, Vote } from './score'

export interface RawPrediction extends Pick {
  id?: string
  reasoning?: string
}

export interface RawApi {
  predictions: RawPrediction[]
  events: (Event & Record<string, unknown>)[]
  kingBets: {
    id: string
    eventId: string
    createdAt: string
    signal: string
    consensusProb: number
    marketProb: number
    edge: number
    direction: Side
    agentBreakdown: string | null
    reasoning: string | null
  }[]
  trustScores: Record<string, { baseTrust: number; dynamicTrust: number; settledCount: number }>
  calibration: { agentMetrics: Record<string, { brierScore: number; totalSettled: number; wins: number; losses: number }> }
}

const ANCHOR_RE = /Anchor agents \(([a-z]+)\/([a-z]+)\)/
const LOG_SPLIT = /(?<=\.) (?=[A-Z])/
// Log sentences the page doesn't show: the human forecasters, the Water Cooler
// endorsements and the sizing clause (rescore.py LOG_DROP).
const LOG_DROP = ['Human forecaster', 'Water Cooler', 'Dynamic Kelly sizing']

export function kingLog(reasoning: string | null) {
  const sentences = (reasoning ?? '').split(LOG_SPLIT)
  const log = sentences.filter((s) => !LOG_DROP.some((d) => s.startsWith(d)))
  return { log, logOmitted: sentences.length - log.length }
}

const byKey = <T,>(key: (x: T) => (string | number)[]) => (a: T, b: T) => {
  const ka = key(a)
  const kb = key(b)
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] < kb[i]) return -1
    if (ka[i] > kb[i]) return 1
  }
  return 0
}

/** build_snapshot in TypeScript. `pullDate` labels the data (the UTC date of the pull). */
export function fromApi(raw: RawApi, pullDate: string): Dataset {
  const agents = Object.keys(raw.trustScores).sort()
  const kingBets: KingBet[] = []
  for (const b of raw.kingBets) {
    const breakdown = JSON.parse(b.agentBreakdown || '[]') as (Vote & Record<string, unknown>)[]
    if (!breakdown.length) continue
    const m = (b.reasoning ?? '').match(ANCHOR_RE)
    kingBets.push({
      id: b.id,
      eventId: b.eventId,
      createdAt: b.createdAt,
      signal: b.signal,
      consensusProb: b.consensusProb,
      marketProb: b.marketProb,
      edge: b.edge,
      direction: b.direction,
      breakdown: breakdown.map((v) => ({
        agentId: v.agentId,
        prediction: v.prediction,
        confidence: v.confidence,
        trustScore: v.trustScore,
      })),
      anchors: m ? [m[1], m[2]] : null,
      ...kingLog(b.reasoning),
    })
  }
  const used = new Set([...raw.predictions.map((p) => p.eventId), ...kingBets.map((b) => b.eventId)])
  const published: Record<string, Published> = {}
  for (const a of agents) {
    const t = raw.trustScores[a]
    const c = raw.calibration.agentMetrics[a]
    published[a] = {
      baseTrust: t.baseTrust,
      dynamicTrust: t.dynamicTrust,
      settledCount: t.settledCount,
      brierScore: c.brierScore,
      totalSettled: c.totalSettled,
      wins: c.wins,
      losses: c.losses,
    }
  }
  return {
    pullDate,
    agents,
    published,
    kingBetsTotal: raw.kingBets.length,
    picks: [...raw.predictions]
      .sort(byKey((p) => [p.createdAt, p.agentId]))
      .map((p) => ({
        agentId: p.agentId,
        eventId: p.eventId,
        prediction: p.prediction,
        confidence: p.confidence,
        units: p.units,
        pnl: p.pnl,
        settled: p.settled,
        marketProbAtEntry: p.marketProbAtEntry,
        createdAt: p.createdAt,
      })),
    events: [...raw.events]
      .sort(byKey((e) => [e.year, e.weekNumber, e.id]))
      .filter((e) => used.has(e.id))
      .map((e) => ({
        id: e.id,
        polymarketId: e.polymarketId,
        question: e.question,
        category: e.category,
        resolution: e.resolution,
        weekNumber: e.weekNumber,
        year: e.year,
      })),
    kingBets,
  }
}
