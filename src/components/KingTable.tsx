import { categoryLabel, page, type Call } from '../data'

const { king } = page

function CallText({ c }: { c: Call }) {
  return (
    <span className="call-text">
      {c.decision === 'EXECUTE' ? (
        <>
          <b>Execute</b> {c.side}
        </>
      ) : (
        <>
          <b>Wait</b>, leans {c.side}
        </>
      )}
    </span>
  )
}

const same = (a: Call, b: Call) => a.decision === b.decision && a.side === b.side

/** Exhibit 3. Hindsight replay: the King's execute rule with end-of-season trust, as scored and fixed. */
export function KingTable() {
  return (
    <table className="data king-table">
      <thead>
        <tr>
          <th scope="col">Question</th>
          <th scope="col">Domain</th>
          <th scope="col" className="num">
            Market, YES
          </th>
          <th scope="col">Call as scored</th>
          <th scope="col">Call fixed</th>
          <th scope="col">Resolved</th>
        </tr>
      </thead>
      <tbody>
        {king.rows.map((r) => (
          <tr key={r.betId}>
            <th scope="row" className="q">
              {r.question}
            </th>
            <td data-label="Domain">{categoryLabel[r.category]}</td>
            <td data-label="Market, YES" className="num">
              {Math.round(r.marketProb * 100)}%
            </td>
            <td data-label="As scored" className="call as">
              <CallText c={r.asScored} />
            </td>
            <td data-label="Fixed" className={`call fixed${same(r.asScored, r.fixed) ? '' : ' changed'}`}>
              <CallText c={r.fixed} />
            </td>
            <td data-label="Resolved">{r.resolution ?? 'open'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
