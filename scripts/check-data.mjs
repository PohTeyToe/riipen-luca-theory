// Runs before every build. The page copy states things that must hold on the
// pulled data (the Simons agent drops 4 places, the proof strip is 10 of 10,
// and so on). rescore.py records each one as a yes/no check in page.json.
// If a re-pull makes any of them false, or a test failed, stop the build so
// the copy gets rewritten on purpose instead of drifting.
import { readFileSync } from 'node:fs'

const page = JSON.parse(readFileSync(new URL('../data/page.json', import.meta.url), 'utf8'))
const problems = []

for (const [name, ok] of Object.entries(page.checks ?? {})) {
  if (ok !== true) problems.push(`check failed: ${name}`)
}
for (const test of page.change?.tests ?? []) {
  if (test.status !== 'passed') problems.push(`test not passing: ${test.name} (${test.status})`)
}
const proof = page.proof ?? {}
if (proof.brierMatches !== proof.agents || proof.trustWithinHalf !== proof.agents) {
  problems.push(`proof strip is not ${proof.agents} of ${proof.agents}`)
}
if (proof.kingConsensusMatches !== proof.kingBetsWithBreakdown) {
  problems.push('King consensus does not match on every bet')
}
if (!page.checks || Object.keys(page.checks).length === 0) problems.push('page.json has no checks')

if (problems.length) {
  console.error('data/page.json does not support the page copy:\n  ' + problems.join('\n  '))
  process.exit(1)
}
console.log(`data/page.json ok: ${Object.keys(page.checks).length} checks, ${page.change.tests.length} tests passed, pulled ${page.pullDate}`)
