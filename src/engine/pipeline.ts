// The rebuild, as the steps the page runs and times in the browser: rescore every
// settled bet, match LUCA's published numbers, replay the Street King, then the
// finding. Each step's time is measured with the clock passed in.
import { kingSummary } from './king'
import { AS_SCORED, type Dataset, type Pick, lossBetterBelow, proofChecks, scoreAgents, scoredByAgent, won } from './score'

export interface Timed<T> {
  ms: number
  value: T
}

export function timed<T>(fn: () => T, now: () => number): Timed<T> {
  const t0 = now()
  const value = fn()
  return { ms: now() - t0, value }
}

export function runPipeline(ds: Dataset, now: () => number = () => performance.now()) {
  // Select the settled bets with a stake, then score every agent (Brier and trust).
  const rescore = timed(() => {
    const byAgent = scoredByAgent(ds)
    let n = 0
    for (const xs of byAgent.values()) n += xs.length
    return { byAgent, scored: n, scores: scoreAgents(ds, byAgent, AS_SCORED) }
  }, now)
  const match = timed(() => proofChecks(ds, rescore.value.byAgent), now)
  const king = timed(() => kingSummary(ds.kingBets), now)
  const finding = timed(() => {
    // Ratings below this score better when they lose under the published reading.
    const cut = lossBetterBelow(AS_SCORED)
    const top = Math.ceil(cut) - 1
    const low: Pick[] = []
    for (const xs of rescore.value.byAgent.values()) for (const p of xs) if (p.confidence <= top) low.push(p)
    return { top, bets: low.length, won: low.filter(won).length }
  }, now)
  return {
    picks: ds.picks.length,
    rescore: { ms: rescore.ms, scored: rescore.value.scored, agents: ds.agents.length },
    match: { ms: match.ms, ...match.value },
    king: { ms: king.ms, ...king.value },
    finding: { ms: finding.ms, ...finding.value },
    byAgent: rescore.value.byAgent,
  }
}

export type PipelineResult = ReturnType<typeof runPipeline>
