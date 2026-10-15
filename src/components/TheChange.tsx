import { page, TEST_FILE } from '../data'

const { change, quotes } = page
const CATEGORY = 'GEOPOLITICS'
const AGENT = 'sbf'
const agentCount = Object.keys(change.proposedResponses[CATEGORY]).length

// Plain-language gloss for each test, so the list reads without opening the file.
const gloss: Record<string, string> = {
  test_rebuilds_published_brier: 'Every published Brier score comes back to 3 decimals',
  test_rebuilds_published_trust: 'Every published trust score comes back within 0.5',
  test_king_consensus_matches: "The King's consensus matches on every bet that lists its votes",
  test_king_rule_fidelity: "My approximation of the King's execute rule reproduces every real call",
  test_as_scored_rewards_losing: 'As scored, a loss beats a win at every rating from 1 to 7, and only there',
  test_fixed_never_rewards_losing: 'Fixed, a win never scores worse than a loss',
  test_blend: 'Empty cells get no value; a blend lands between the cell and the agent overall',
  test_repeat_bets_share_one_outcome: 'Repeat bets on one contract share its outcome, at any prices',
  test_luck_range_is_exact: 'The luck range is the exact middle 95%, not an approximation',
  test_every_scored_event_has_a_contract: 'Every scored bet maps to a Polymarket contract',
}

type Line = { text: string; added: boolean }

/** One agent's proposed response, pretty-printed, with the new domain block marked. */
function responseLines(): Line[] {
  const text = JSON.stringify({ [AGENT]: change.proposedResponses[CATEGORY][AGENT] }, null, 2).split('\n')
  const start = text.findIndex((l) => l.trimStart().startsWith('"domain"'))
  const end = text.indexOf('    }', start)
  const lines = text.map((t, i) => ({ text: t, added: i >= start && i <= end }))
  // The response has every agent; show one and mark the rest.
  lines.splice(lines.length - 2, 1, { text: '  },', added: false }, { text: '  …', added: false })
  return lines
}

/** Exhibit 5. A stopgap for Season 1, the real change for Season 2, the tests, and an API response that extends theirs. */
export function TheChange() {
  return (
    <div className="change">
      <div className="change-part">
        <h3 className="part-h">For Season 1: a stopgap</h3>
        <p className="part-note">
          It stops a loss scoring better than a win. It doesn't make the rating a probability. Your code is private, so this
          is the formula, not a patch to your files.
        </p>
        <pre className="code diff" aria-label="Formula change">
          {change.diff.map((l) => (
            <span key={l} className={l.startsWith('+') ? 'add' : 'del'}>
              {l}
            </span>
          ))}
        </pre>
      </div>

      <div className="change-part">
        <h3 className="part-h">For Season 2: a stated probability</h3>
        <p className="part-note">
          Your methodology page says "{quotes.positionSize.text}" Keep it for that, and ask each agent for the chance its
          side is right, as a number, next to the rating. Score that number with Brier, and show each agent's win rate
          against the market price at entry beside it. Then trust measures forecasting, and the rating stays a stake.
        </p>
      </div>

      <div className="change-part">
        <h3 className="part-h">The tests</h3>
        <p className="part-note">
          rescore.py runs them on the committed snapshot before it writes the page data, and the build stops unless all of
          them passed. <a href={TEST_FILE}>Read them</a>.
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
          Run them: <code>{change.runIt}</code>
        </p>
      </div>

      <div className="change-part">
        <h3 className="part-h">
          Proposed response for <code>GET /api/trust-scores?category={CATEGORY}</code>
        </h3>
        <p className="part-note">
          Every field you return today keeps its name and meaning, so existing clients don't break. The highlighted block is
          new: domain trust, plus the domain's <code>wonRate</code> next to <code>marketImplied</code>, the win rate the
          market's prices implied. One agent shown; the response has all {agentCount}.
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
