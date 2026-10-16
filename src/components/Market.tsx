import { useMemo } from 'react'
import type { Model } from '../App'
import { agentName } from '../data'
import { EDGE_POINTS, againstMarket } from '../engine/market'
import { halfUp } from '../engine/score'
import { int, signed } from '../lib/ui'

const p1 = (x: number) => `${halfUp(100 * x, 1).toFixed(1)}%`

// Each agent's win rate against the market's price at entry, with the range luck
// alone explains if every contract resolved at that price.
export function Market({ model, agentId, onAgent }: { model: Model; agentId: string; onAgent: (id: string) => void }) {
  const rows = useMemo(
    () =>
      model.ds.agents
        .map((a) => ({ id: a, vs: againstMarket(model.byAgent.get(a) ?? [], model.contractOf) }))
        .sort((x, y) => y.vs.gap - x.vs.gap),
    [model],
  )
  const outside = rows.filter((r) => !r.vs.inside).length
  const span = Math.max(...rows.flatMap((r) => [Math.abs(r.vs.luckLow), Math.abs(r.vs.luckHigh), Math.abs(r.vs.gap)])) * 1.08
  const at = (v: number) => `${50 + (v / span) * 50}%`
  const needed = rows.map((r) => r.vs.betsFor5PointEdge)
  const settled = rows.map((r) => r.vs.n)
  const contracts = rows.map((r) => r.vs.contracts)

  return (
    <section id="market" className="sect" aria-labelledby="market-h">
      <div className="wrap">
        <div className="sect-head">
          <h2 id="market-h">Does any agent beat the market?</h2>
          <span className="sect-meta num">
            {outside} of {rows.length} outside the luck range
          </span>
        </div>
        <div className="panel market">
          <div className="mk-row mk-h" aria-hidden="true">
            <span>Agent</span>
            <span className="r">Bets</span>
            <span className="r">Won</span>
            <span className="r">Market</span>
            <span className="mk-axis">
              <span>
                {signed(-span * 100, 0)}
              </span>
              <span>won − market, points (exact)</span>
              <span>
                {signed(span * 100, 0)}
              </span>
            </span>
          </div>
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`mk-row ${r.id === agentId ? 'sel' : ''}`}
              aria-pressed={r.id === agentId}
              onClick={() => onAgent(r.id)}
              aria-label={`${agentName(r.id)}: won ${p1(r.vs.won)}, market ${p1(r.vs.market)}, ${signed(r.vs.gap * 100)} points, luck range ${signed(r.vs.luckLow * 100)} to ${signed(r.vs.luckHigh * 100)}`}
            >
              <span className="who">{agentName(r.id)}</span>
              <span className="r num">{r.vs.n}</span>
              <span className="r num">{p1(r.vs.won)}</span>
              <span className="r num mkt-t">{p1(r.vs.market)}</span>
              <span className="mk-plot" aria-hidden="true">
                <span className="mk-zero" />
                <span className="mk-luck" style={{ left: at(r.vs.luckLow), right: `calc(100% - ${at(r.vs.luckHigh)})` }} />
                <span className={`mk-dot ${r.vs.inside ? '' : 'out'}`} style={{ left: at(r.vs.gap) }} />
                <span className={`mk-val num ${r.vs.gap / span > 0.4 ? 'left' : ''}`} style={{ left: at(r.vs.gap) }}>
                  {signed(r.vs.gap * 100)}
                </span>
              </span>
            </button>
          ))}
          <div className="mk-foot">
            <span className="mk-key" aria-hidden="true">
              <i className="k-luck" /> 95% luck range
            </span>
            <span className="num">
              A {EDGE_POINTS}-point edge needs about {int(Math.min(...needed))}–{int(Math.max(...needed))} independent bets to tell
              from luck. Each agent has {Math.min(...settled)}–{Math.max(...settled)} bets on {Math.min(...contracts)}–
              {Math.max(...contracts)} contracts.
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
