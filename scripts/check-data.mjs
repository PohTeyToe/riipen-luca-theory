// Runs before every build. It doesn't run the tests itself (the build has no
// Python); rescore.py runs them and records the results in page.json, along
// with a yes/no check for each thing the page copy states (the Simons agent
// drops 4 places, the proof strip is 10 of 10, and so on). This stops the
// build unless every expected test and check is there and passed, so a
// re-pull that breaks a sentence gets the sentence rewritten, not shipped.
// It also stops the build unless page.json was written from the snapshot and
// the analysis code in this checkout: rescore.py records a hash of each.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const TESTS = [
  'test_reader_keeps_exact_quotes',
  'test_reader_rejects_bad_answers',
  'test_reader_run_covers_every_scored_pick',
  'test_reader_run_quotes_are_in_the_pulled_text',
  'test_reader_retries_bad_answers_and_survives_a_crash',
  'test_rebuilds_published_brier',
  'test_rebuilds_published_trust',
  'test_king_consensus_matches',
  'test_king_rule_fidelity',
  'test_king_log_matches_replay',
  'test_as_scored_rewards_losing',
  'test_fixed_never_rewards_losing',
  'test_blend',
  'test_repeat_bets_share_one_outcome',
  'test_luck_range_is_exact',
  'test_every_scored_event_has_a_contract',
]
const INPUTS = [
  'data/snapshot.json',
  'analysis/rescore.py',
  'analysis/tests/test_rescore.py',
  'data/reader-run.json',
  'analysis/reader.py',
  'analysis/reader_prompt.md',
  'analysis/tests/test_reader.py',
]
const CHECKS = [
  'proofTenOfTen',
  'kingConsensusAll',
  'kingLogAllMatch',
  'pick3WinsScores064LosesScores004',
  'lossBetterExactlyAt1to7',
  'simonsAsScored4thFixed8th',
  'simonsDrops4Places',
  'mungerAsScored5thFixed2nd',
  'ackmanAsScored7thFixed4th',
  'ackmanWins77AndWorseThanCoinFlipAsScored',
  'ackmanExampleWinScoresWorseThanALoss',
  'allAgentsAtTrustFloor',
  'simonsWins15',
  'sbfBestGeopoliticsRaw',
  'sbfBestGeopoliticsBlended',
  'sbfPoliticsWithin2OfMarket',
  'sbfGeopoliticsInsideLuck',
  'readingsMissWinRateInBothBands',
  'marketWithin2OfWinRateInBothBands',
  'noAgentOutsideLuck',
  'insiderClosestToAnEdge',
  'mungerAckmanAbout2OfMarket',
  'simonsLossesMostlyRated8Up',
]

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const page = JSON.parse(read('data/page.json'))
const problems = []

// Same hash as rescore.py's text_hash: SHA-256 of the text with CRLF read as LF.
const textHash = (text) => createHash('sha256').update(text.replaceAll('\r\n', '\n'), 'utf8').digest('hex')
const inputs = page.inputs ?? {}
for (const path of INPUTS) {
  if (!inputs[path]) problems.push(`no input hash for ${path}; rerun python -I analysis/rescore.py`)
  else if (inputs[path] !== textHash(read(path))) problems.push(`${path} changed since page.json was written; rerun python -I analysis/rescore.py`)
}

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
