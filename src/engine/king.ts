// The Street King: LUCA's orchestrator that weighs the ten agents' votes and
// decides EXECUTE or WAIT. Ported from rescore.py (consensus, king_call, log_checks).
import { EDGE, halfUp, type KingBet, type Side, type Vote } from './score'

/** Vote weight: the trust recorded on the vote x confidence / 15. */
export function voteWeight(v: Vote): number {
  return (v.trustScore * v.confidence) / 15
}

/** The King's consensus: summed YES weight over summed weight. */
export function consensus(breakdown: Vote[]): number {
  let total = 0
  let yes = 0
  for (const v of breakdown) total += voteWeight(v)
  for (const v of breakdown) if (v.prediction === 'YES') yes += voteWeight(v)
  return yes / total
}

export interface Replay {
  consensus: number
  side: Side
  split: [number, number]
  gap: number
  gapPercent: number
  consensusPercent: number
  anchorsAgree: boolean
  gapClears: boolean
  decision: 'EXECUTE' | 'WAIT'
  recorded: { decision: 'EXECUTE' | 'WAIT'; side: Side }
  /** Replayed decision (and side, for an EXECUTE) equals the recorded one. */
  matches: boolean
  /** Replayed consensus equals the recorded consensusProb to 4 decimals. */
  consensusMatches: boolean
  votes: Map<string, Vote>
}

/**
 * Approximate King rule (LUCA's code is private, so this is a reconstruction).
 * Side is YES when consensus > 0.5. EXECUTE when both anchor agents named in the
 * log voted that side and |consensus - market| >= 4 points; else WAIT.
 */
export function replay(bet: KingBet): Replay {
  const c = consensus(bet.breakdown)
  const side: Side = c > 0.5 ? 'YES' : 'NO'
  const votes = new Map(bet.breakdown.map((v) => [v.agentId, v]))
  const anchorsAgree = Boolean(bet.anchors) && bet.anchors!.every((a) => votes.get(a)?.prediction === side)
  const gap = Math.abs(c - bet.marketProb)
  const gapClears = gap >= EDGE
  const decision = anchorsAgree && gapClears ? 'EXECUTE' : 'WAIT'
  const recorded = { decision: bet.signal === 'STREET_KING_EXECUTE' ? 'EXECUTE' : 'WAIT', side: bet.direction } as const
  const yes = bet.breakdown.filter((v) => v.prediction === 'YES').length
  return {
    consensus: c,
    side,
    split: [yes, bet.breakdown.length - yes],
    gap,
    gapPercent: halfUp(100 * gap, 1),
    consensusPercent: halfUp(100 * c, 1),
    anchorsAgree,
    gapClears,
    decision,
    recorded,
    matches: decision === recorded.decision && (decision === 'WAIT' || side === recorded.side),
    consensusMatches: Math.abs(c - bet.consensusProb) < 5e-5,
    votes,
  }
}

type Rule = [RegExp, (m: RegExpMatchArray, b: KingBet, r: Replay) => boolean]

// Each sentence kept from the King's log is a claim about its own votes.
// Percentages in the log have one decimal.
const RULES: Rule[] = [
  [
    /^EXECUTE: (\d+)Y\/(\d+)N split with ([\d.]+)% edge/,
    (m, _b, r) => +m[1] === r.split[0] && +m[2] === r.split[1] && +m[3] === r.gapPercent,
  ],
  [
    /^Anchor agents \(([a-z]+)\/([a-z]+)\) selected by trust-weighted heuristic, aligned on (YES|NO)/,
    (m, _b, r) => r.votes.get(m[1])?.prediction === m[3] && r.votes.get(m[2])?.prediction === m[3],
  ],
  [
    /^(?:WAIT: )?Anchor agents \(([a-z]+)\/([a-z]+)\) not aligned on (YES|NO)/,
    (m, _b, r) => m[3] === r.side && !(r.votes.get(m[1])?.prediction === m[3] && r.votes.get(m[2])?.prediction === m[3]),
  ],
  [/^Insider confirms/, (_m, b, r) => r.votes.get('insider')?.prediction === b.direction],
  // A missing insider vote counts as dissent in the log (3 bets with 2 or 3 votes).
  [/^Insider dissents/, (_m, b, r) => r.votes.get('insider')?.prediction !== b.direction],
  [
    /^Highest conviction: ([a-z]+) at (\d+)\/15/,
    (m, b, r) =>
      r.votes.get(m[1])?.confidence === +m[2] && +m[2] === Math.max(...b.breakdown.map((v) => v.confidence)),
  ],
  [
    /^Split: (\d+)Y\/(\d+)N, consensus ([\d.]+)% vs market ([\d.]+)%/,
    (m, b, r) =>
      +m[1] === r.split[0] &&
      +m[2] === r.split[1] &&
      +m[3] === r.consensusPercent &&
      +m[4] === halfUp(100 * b.marketProb, 1),
  ],
  [/^WAIT: Edge ([\d.]+)% below ([\d.]+)% threshold/, (m, _b, r) => +m[1] === r.gapPercent && +m[1] < +m[2] && +m[2] === 100 * EDGE],
  [/^WAIT: Anchor agents missing predictions: ([a-z]+)/, (m, _b, r) => !r.votes.has(m[1])],
]

// Phrases inside a matched sentence that no check verifies: how the anchors were
// chosen, and the sizing tier.
const UNVERIFIED = [/ selected by trust-weighted heuristic,?/, / \([a-z -]*tier\)/]

export interface LogPart {
  text: string
  checked: boolean
}

/** Split a sentence into the parts a check verifies and the parts it doesn't. */
export function logParts(sentence: string, checkedUpTo: number): LogPart[] {
  const mask = Array.from(sentence, (_, i) => i < checkedUpTo)
  for (const re of UNVERIFIED) {
    const m = sentence.match(re)
    if (m && m.index !== undefined) for (let i = m.index; i < m.index + m[0].length; i++) mask[i] = false
  }
  // Closing punctuation after the last word joins whatever comes before it.
  let lastWord = sentence.length - 1
  while (lastWord > 0 && !/[A-Za-z0-9]/.test(sentence[lastWord])) lastWord -= 1
  const parts: LogPart[] = []
  for (let i = 0; i < sentence.length; i++) {
    const checked = i > lastWord && parts.length ? parts[parts.length - 1].checked : mask[i]
    const last = parts[parts.length - 1]
    if (last && last.checked === checked) last.text += sentence[i]
    else parts.push({ text: sentence[i], checked })
  }
  return parts
}

/**
 * Each log sentence with whether the replay agrees (null: no rule covers it), split
 * into the parts the check verifies and the parts it doesn't (text past the rule's
 * match, the sizing tier, how the anchors were selected).
 */
export function logChecks(bet: KingBet, r = replay(bet)): { sentence: string; ok: boolean | null; parts: LogPart[] }[] {
  return bet.log.map((sentence) => {
    for (const [re, check] of RULES) {
      const m = sentence.match(re)
      if (m) return { sentence, ok: check(m, bet, r), parts: logParts(sentence, m[0].length) }
    }
    return { sentence, ok: null, parts: [{ text: sentence, checked: false }] }
  })
}

export function kingSummary(bets: KingBet[]) {
  let consensusOk = 0
  let ruleOk = 0
  let claims = 0
  let claimsOk = 0
  for (const b of bets) {
    const r = replay(b)
    if (r.consensusMatches) consensusOk += 1
    if (r.matches) ruleOk += 1
    for (const c of logChecks(b, r)) {
      if (c.ok === null) continue
      claims += 1
      if (c.ok) claimsOk += 1
    }
  }
  return { bets: bets.length, consensusOk, ruleOk, claims, claimsOk }
}
