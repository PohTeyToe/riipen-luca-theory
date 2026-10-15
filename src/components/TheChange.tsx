import { page, TEST_FILE } from '../data'

const { change } = page
const CATEGORY = 'GEOPOLITICS'
const AGENT = 'sbf'
const agentCount = Object.keys(change.proposedResponses[CATEGORY]).length

// Plain-language gloss for each test, so the list reads without opening the file.
const gloss: Record<string, string> = {
  test_rebuilds_published_brier: 'Every published Brier score comes back to 3 decimals',
  test_rebuilds_published_trust: 'Every published trust score comes back within 0.5',
  test_king_consensus_matches: "The King's consensus matches on every bet that lists its votes",
  test_king_rule_fidelity: 'The approximate execute rule misses at most one real call',
  test_as_scored_rewards_losing: 'As scored, a loss beats a win at every rating from 1 to 7, and only there',
  test_fixed_never_rewards_losing: 'Fixed, a win never scores worse than a loss',
  test_blend: 'Empty cells get no value; a blend lands between the cell and the agent overall',
}

type Line = { text: string; added?: boolean }

const pairs = (o: Record<string, unknown>, keys: string[]) => keys.map((k) => `"${k}": ${JSON.stringify(o[k])}`).join(', ')

function responseLines(): Line[] {
  const r = change.proposedResponses[CATEGORY][AGENT] as Record<string, unknown>
  const d = r.domain as Record<string, unknown>
  return [
    { text: '{' },
    { text: `  "${AGENT}": {` },
    { text: `    ${pairs(r, ['agentId', 'baseTrust', 'dynamicTrust', 'brierScore'])},` },
    { text: `    ${pairs(r, ['settledCount', 'baseWeight'])},` },
    { text: '    "domain": {', added: true },
    { text: `      ${pairs(d, ['category', 'scoring'])},`, added: true },
    { text: `      ${pairs(d, ['settledCount', 'brierScore', 'blendedBrier'])},`, added: true },
    { text: `      ${pairs(d, ['trust', 'thin'])}`, added: true },
    { text: '    }', added: true },
    { text: '  },' },
    { text: '  …' },
    { text: '}' },
  ]
}

/** Exhibit 4. The fix as a formula, the tests that guard it, and an API response that extends theirs. */
export function TheChange() {
  return (
    <div className="change">
      <div className="change-part">
        <h3 className="part-h">The formula</h3>
        <p className="part-note">Your code is private, so this is the formula, not a patch to your files.</p>
        <pre className="code diff" aria-label="Formula change">
          {change.diff.map((l) => (
            <span key={l} className={l.startsWith('+') ? 'add' : 'del'}>
              {l}
            </span>
          ))}
        </pre>
      </div>

      <div className="change-part">
        <h3 className="part-h">The tests</h3>
        <p className="part-note">
          Run at build time on the committed snapshot. <a href={TEST_FILE}>Read them</a>.
        </p>
        <ul className="tests">
          {change.tests.map((t) => (
            <li key={t.name}>
              <span className={`status ${t.status}`}>{t.status === 'passed' ? 'Pass' : t.status}</span>
              <span className="test-text">
                <code>{t.name}</code>
                {gloss[t.name] && <span className="test-gloss">{gloss[t.name]}</span>}
              </span>
            </li>
          ))}
        </ul>
        <p className="run-it">
          Run it: <code>{change.runIt}</code>
        </p>
      </div>

      <div className="change-part">
        <h3 className="part-h">
          Proposed response for <code>GET /api/trust-scores?category={CATEGORY}</code>
        </h3>
        <p className="part-note">
          Every field you return today keeps its name and meaning, so existing clients don't break. The highlighted block is
          new. One agent shown; the response has all {agentCount}.
        </p>
        <pre className="code json" aria-label="Proposed JSON response">
          {responseLines().map((l, i) => (
            <span key={i} className={l.added ? 'add' : undefined}>
              {l.text}
            </span>
          ))}
        </pre>
        <p className="part-note">
          Domain trust uses your formula at the 0.3 floor on the blended Brier: <code>{change.domainTrust}</code>.
        </p>
      </div>
    </div>
  )
}
