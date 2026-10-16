// Each agent's win rate against the market's prices at entry, with the exact
// range luck alone explains. Ported from rescore.py (win_distribution, against_market).
import { type Pick, sidePrice, won } from './score'

const Z95 = 1.96
const Z80 = 0.8416
export const EDGE_POINTS = 5

/**
 * The chance of each total win count if every contract resolved at the market's price.
 * Repeat bets on one Polymarket contract share its outcome: with a bets on YES and b on NO
 * at a mean entry price q for YES, the contract adds a wins with chance q and b wins otherwise.
 */
export function winDistribution(picks: Pick[], contractOf: Map<string, string>) {
  const byContract = new Map<string, Pick[]>()
  for (const p of picks) {
    const c = contractOf.get(p.eventId)!
    if (!byContract.has(c)) byContract.set(c, [])
    byContract.get(c)!.push(p)
  }
  let dist = [1.0]
  let expected = 0
  for (const xs of byContract.values()) {
    const yes = xs.filter((p) => p.prediction === 'YES').length
    const no = xs.length - yes
    let q = 0
    for (const p of xs) q += p.marketProbAtEntry
    q /= xs.length
    expected += yes * q + no * (1 - q)
    const next = new Array<number>(dist.length + Math.max(yes, no)).fill(0)
    dist.forEach((chance, k) => {
      next[k + yes] += chance * q
      next[k + no] += chance * (1 - q)
    })
    dist = next
  }
  return { dist, expected, contracts: byContract.size }
}

export interface VsMarket {
  n: number
  wins: number
  contracts: number
  won: number
  market: number
  gap: number
  luckLow: number
  luckHigh: number
  /** Win counts at the edges of the middle 95%. */
  lowWins: number
  highWins: number
  inside: boolean
  chanceAtOrAbove: number
  betsFor5PointEdge: number
  dist: number[]
}

export function againstMarket(picks: Pick[], contractOf: Map<string, string>): VsMarket {
  const n = picks.length
  const wins = picks.filter(won).length
  const { dist, expected, contracts } = winDistribution(picks, contractOf)
  const atOrBelow: number[] = []
  let acc = 0
  for (const x of dist) {
    acc += x
    atOrBelow.push(acc)
  }
  const atOrAbove = dist.map((_, k) => 1 - (k ? atOrBelow[k - 1] : 0))
  const tail = (1 - 0.95) / 2
  let low = 0
  while (!(atOrBelow[low] > tail)) low += 1
  let high = dist.length - 1
  while (!(atOrAbove[high] > tail)) high -= 1
  const market = expected / n
  let perBet = 0
  for (const p of picks) perBet += sidePrice(p) * (1 - sidePrice(p))
  perBet /= n
  return {
    n,
    wins,
    contracts,
    won: wins / n,
    market,
    gap: wins / n - market,
    luckLow: low / n - market,
    luckHigh: high / n - market,
    lowWins: low,
    highWins: high,
    inside: low <= wins && wins <= high,
    chanceAtOrAbove: atOrAbove[wins],
    betsFor5PointEdge: Math.ceil(((Z95 + Z80) ** 2 * perBet) / (EDGE_POINTS / 100) ** 2),
    dist,
  }
}
