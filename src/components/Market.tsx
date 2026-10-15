import { int, page } from '../data'

const { line, market } = page

/** Exhibit 2. What each reading says a rating means, against how often those bets won and what the market priced them at. */
export function RatingBands() {
  return (
    <table className="data bands-table">
      <thead>
        <tr>
          <th scope="col">Rated</th>
          <th scope="col" className="num">
            Bets
          </th>
          <th scope="col" className="num">
            Won
          </th>
          <th scope="col" className="num">
            As scored, reads as
          </th>
          <th scope="col" className="num">
            Fixed, reads as
          </th>
          <th scope="col" className="num">
            Market price at entry
          </th>
        </tr>
      </thead>
      <tbody>
        {line.bands.map((b) => (
          <tr key={b.from}>
            <th scope="row">
              {b.from} to {b.to}
            </th>
            <td className="num">{int(b.n)}</td>
            <td className="num key">{b.wonPercent}%</td>
            <td className="num as">{b.asScoredPercent}%</td>
            <td className="num fixed">{b.fixedPercent}%</td>
            <td className="num key">{b.marketPercent}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// Points either side of zero: the widest gap or luck range, rounded up to a multiple of 5.
const AXIS = Math.ceil(Math.max(...market.rows.map((r) => Math.max(Math.abs(r.gapPoints), r.luckPoints))) / 5) * 5
const x = (points: number) => `${50 + (points / AXIS) * 50}%`
const signed = (points: number) => `${points > 0 ? '+' : points < 0 ? '−' : ''}${Math.abs(points).toFixed(1)}`

/** Exhibit 3. Each agent's win rate minus the market price of the sides it picked, inside the range luck alone covers. */
export function MarketGap() {
  return (
    <div className="gap-chart">
      <p className="gap-legend" aria-hidden="true">
        <span className="key">
          <span className="gc-dot" /> win rate minus market price
        </span>
        <span className="key">
          <span className="gc-luck" /> what luck alone covers (95%)
        </span>
      </p>
      <div className="gc-head" aria-hidden="true">
        <span className="gc-agent">Agent</span>
        <span className="gc-won">Won</span>
        <span className="gc-mkt">Market</span>
        <span className="gc-axis">
          <span style={{ left: '0%' }}>−{AXIS}</span>
          <span style={{ left: '50%' }}>0</span>
          <span style={{ left: '100%' }}>+{AXIS} points</span>
        </span>
        <span className="gc-gap">Gap</span>
      </div>
      <ol className="gc-rows">
        {market.rows.map((r) => (
          <li key={r.id} className="gc-row">
            <span className="sr-only">
              {r.name}: won {r.wonPercent}% of {r.n} settled bets, market price {r.marketPercent}%, a gap of {signed(r.gapPoints)}{' '}
              points. Luck alone covers {r.luckPoints} points either way.
            </span>
            <span className="gc-agent" aria-hidden="true">
              <span className="agent-name">{r.name}</span>
              <span className="agent-role">{r.n} settled bets</span>
            </span>
            <span className="gc-won" aria-hidden="true">
              {r.wonPercent}%
            </span>
            <span className="gc-mkt" aria-hidden="true">
              {r.marketPercent}%
            </span>
            <span className="gc-axis" aria-hidden="true">
              <span className="gc-luck" style={{ left: x(-r.luckPoints), right: `calc(100% - ${x(r.luckPoints)})` }} />
              <span className="gc-zero" />
              <span className="gc-dot" style={{ left: x(r.gapPoints) }} />
            </span>
            <span className="gc-gap" aria-hidden="true">
              {signed(r.gapPoints)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
