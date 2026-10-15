import { TEST_FILE, brier3, page, pulled } from '../data'

const { proof } = page

/** Flow step 2: the published numbers come back before anything is changed. */
export function ProofStrip() {
  return (
    <section id="proof" className="proof" aria-label="Checked against your numbers">
      <details>
        <summary>
          <span className="proof-line">
            <b>Rebuilt from your public API:</b>{' '}
            <span>
              {proof.brierMatches} of {proof.agents} Brier scores match to 3 decimals.
            </span>{' '}
            <span>
              {proof.trustWithinHalf} of {proof.agents} trust scores within 0.5.
            </span>{' '}
            <span>
              King consensus {proof.kingConsensusMatches} of {proof.kingBetsWithBreakdown}.
            </span>
          </span>
          <span className="disclosure">
            Show the {proof.agents}
            <svg className="chevron" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 4.5 6 7.5 9 4.5" />
            </svg>
          </span>
        </summary>
        <div className="proof-body">
          <div className="table-scroll">
            <table className="data proof-table">
              <thead>
                <tr>
                  <th scope="col">Agent</th>
                  <th scope="col" className="num">
                    Brier, published
                  </th>
                  <th scope="col" className="num">
                    Brier, rebuilt
                  </th>
                  <th scope="col" className="num">
                    Trust, published
                  </th>
                  <th scope="col" className="num">
                    Trust, rebuilt
                  </th>
                  <th scope="col" className="num">
                    Settled
                  </th>
                </tr>
              </thead>
              <tbody>
                {proof.rows.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">{r.name}</th>
                    <td className="num">{brier3(r.publishedBrier)}</td>
                    <td className="num">{brier3(r.rebuiltBrier)}</td>
                    <td className="num">{r.publishedTrust}</td>
                    <td className="num">{r.rebuiltTrust.toFixed(1)}</td>
                    <td className="num">{r.settled}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="source">
            Rebuilt by <a href={TEST_FILE}>analysis/tests/test_rescore.py</a> from /api/predictions, checked against
            /api/trust-scores and /api/analytics/calibration, pulled {pulled}. Published trust is a whole number, so the
            test allows 0.5 either way. Play money.
          </p>
        </div>
      </details>
    </section>
  )
}
