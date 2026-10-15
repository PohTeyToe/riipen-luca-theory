// Runs before every build. It doesn't run the tests itself (the build has no
// Python); rescore.py runs them and records the results in page.json, along
// with a yes/no check for each thing the page copy states (the Simons agent
// drops 4 places, the proof strip is 10 of 10, and so on). This stops the
// build unless every expected test and check is there and passed, so a
// re-pull that breaks a sentence gets the sentence rewritten, not shipped.
import { readFileSync } from 'node:fs'

const TESTS = [
  'test_rebuilds_published_brier',
  'test_rebuilds_published_trust',
  'test_king_consensus_matches',
  'test_king_rule_fidelity',
  'test_as_scored_rewards_losing',
  'test_fixed_never_rewards_losing',
  'test_blend',
]
const CHECKS = [
  'proofTenOfTen',
  'kingConsensusAll',
  'pick3WinsScores064LosesScores004',
  'lossBetterExactlyAt1to7',
  'simonsAsScored4thFixed8th',
  'simonsDrops4Places',
  'mungerAsScored5thFixed2nd',
  'ackmanAsScored7thFixed4th',
  'ackmanWins77AndWorseThanCoinFlipAsScored',
  'simonsWins15',
  'sbfBestGeopoliticsRaw',
  'sbfBestGeopoliticsBlended',
  'sbfPoliticsWithin2OfMarket',
  'marketOverallBeatsBestAgentFixed',
  'readingsMissWinRateInBothBands',
  'marketWithin2OfWinRateInBothBands',
  'noAgentOutsideLuck',
  'insiderClosestToAnEdge',
  'mungerAckmanWithin2OfMarket',
  'simonsLossesMostlyRated8Up',
]

const page = JSON.parse(readFileSync(new URL('../data/page.json', import.meta.url), 'utf8'))
const problems = []

const checks = page.checks ?? {}
for (const name of CHECKS) {
  if (checks[name] !== true) problems.push(`check ${checks[name] === undefined ? 'missing' : 'failed'}: ${name}`)
}
for (const name of Object.keys(checks)) {
  if (!CHECKS.includes(name)) problems.push(`check not listed in scripts/check-data.mjs: ${name}`)
}
const tests = new Map((page.change?.tests ?? []).map((t) => [t.name, t.status]))
for (const name of TESTS) {
  if (tests.get(name) !== 'passed') problems.push(`test ${tests.has(name) ? `not passing (${tests.get(name)})` : 'missing'}: ${name}`)
}
for (const name of tests.keys()) {
  if (!TESTS.includes(name)) problems.push(`test not listed in scripts/check-data.mjs: ${name}`)
}
const proof = page.proof ?? {}
if (!(proof.agents > 0) || proof.brierMatches !== proof.agents || proof.trustWithinHalf !== proof.agents) {
  problems.push(`proof strip is not ${proof.agents} of ${proof.agents}`)
}
if (!(proof.kingBetsWithBreakdown > 0) || proof.kingConsensusMatches !== proof.kingBetsWithBreakdown) {
  problems.push('King consensus does not match on every bet')
}

if (problems.length) {
  console.error('data/page.json does not support the page copy:\n  ' + problems.join('\n  '))
  process.exit(1)
}
console.log(`data/page.json ok: ${CHECKS.length} checks, ${TESTS.length} tests passed, pulled ${page.pullDate}`)
