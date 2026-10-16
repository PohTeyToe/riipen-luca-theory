import { useMemo, useState } from 'react'
import type { Model } from '../App'
import { AS_SCORED, byRating, FIXED, LOW, lossBetterBelow, pickBrier, pSide, ratingBands } from '../engine/score'
import { f3, int, pctText, useWidth } from '../lib/ui'

const H = 300
const PAD = { l: 40, r: 12, t: 16, b: 40 }

// All scored bets by rating: how often they won, what the market priced them at,
// and what the current reading says they should win.
export function Calibration({ model, floor, glide }: { model: Model; floor: number; glide: (v: number) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>(760)
  const [focus, setFocus] = useState(2)
  const stats = useMemo(() => byRating(model.scored), [model])
  const bands = useMemo(() => ratingBands(model.scored, floor), [model, floor])
  const W = Math.max(300, width)
  const band = (W - PAD.l - PAD.r) / 15
  const x = (c: number) => PAD.l + band * (c - 0.5)
  const y = (v: number) => PAD.t + (1 - v) * (H - PAD.t - PAD.b)
  // Ratings strictly below the cut score better when they lose; shade whole rating bands.
  const lossRatings = Math.max(0, Math.ceil(lossBetterBelow(floor)) - 1)
  const line = Array.from({ length: 31 }, (_, i) => i / 2)
    .filter((c) => c >= 0.5)
    .map((c) => `${x(c).toFixed(1)},${y(pSide(c, floor)).toFixed(1)}`)
    .join(' ')
  const f = stats[focus - 1]
  const narrow = W < 520

  return (
    <section id="line" className="sect" aria-labelledby="cal-h">
      <div className="wrap">
        <div className="sect-head">
          <h2 id="cal-h">Ratings against results</h2>
          <span className="sect-meta">All {int(model.scored.length)} settled bets, every agent</span>
        </div>
        <div className="cal">
          <div className="panel cal-chart" ref={ref}>
            <div className="cal-key" aria-hidden="true">
              <span>
                <i className="k-bar" /> won
              </span>
              <span>
                <i className="k-mkt" /> market price
              </span>
              <span>
                <i className="k-read" /> read as
              </span>
              <span>
                <i className="k-zone" /> a loss scores better
              </span>
            </div>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              width={W}
              height={H}
              role="img"
              tabIndex={0}
              className="kbd-chart"
              aria-label={`By rating: won, market price and the reading. Rated 1 to ${LOW}: won ${pctText(bands[0].won)}, read as ${pctText(bands[0].reading)}. Arrow keys step through ratings.`}
              onKeyDown={(e) => {
                const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
                if (!step) return
                e.preventDefault()
                setFocus((c) => Math.min(15, Math.max(1, c + step)))
              }}
            >
              {lossRatings > 0 && <rect className="zone-bad" x={PAD.l} y={PAD.t} width={lossRatings * band} height={H - PAD.t - PAD.b} />}
              {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                <g key={t}>
                  <line className={t === 0.5 ? 'half' : 'grid'} x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
                  <text className="ax" x={PAD.l - 8} y={y(t) + 3} textAnchor="end">
                    {Math.round(t * 100)}%
                  </text>
                </g>
              ))}
              {stats.map((s) => {
                const bw = Math.min(26, band * 0.62)
                return (
                  <g
                    key={s.confidence}
                    className={`col ${focus === s.confidence ? 'on' : ''}`}
                    onPointerEnter={() => setFocus(s.confidence)}
                    onClick={() => setFocus(s.confidence)}
                  >
                    <rect className="hit" x={x(s.confidence) - band / 2} y={PAD.t} width={band} height={H - PAD.t - PAD.b + 30} />
                    {s.wonRate !== null && (
                      <rect className="bar" x={x(s.confidence) - bw / 2} y={y(s.wonRate)} width={bw} height={y(0) - y(s.wonRate)} />
                    )}
                    {s.marketRate !== null && (
                      <line className="mkt" x1={x(s.confidence) - bw / 2 - 3} x2={x(s.confidence) + bw / 2 + 3} y1={y(s.marketRate)} y2={y(s.marketRate)} />
                    )}
                    <text className="ax" x={x(s.confidence)} y={H - PAD.b + 16} textAnchor="middle">
                      {s.confidence}
                    </text>
                    <text className={`ax n ${narrow ? 'tight' : ''}`} x={x(s.confidence)} y={H - PAD.b + 30} textAnchor="middle">
                      {s.n}
                    </text>
                  </g>
                )
              })}
              <text className="ax n" x={PAD.l - 8} y={H - PAD.b + 30} textAnchor="end">
                bets
              </text>
              <polyline className="read" points={line} />
              {stats.map((s) => (
                <circle key={s.confidence} className="read-dot" cx={x(s.confidence)} cy={y(pSide(s.confidence, floor))} r={2.6} />
              ))}
            </svg>
            <div className="cal-focus" aria-live="polite">
              <span className="num">
                <b>Rated {f.confidence}</b> · {f.n} bets
              </span>
              <span className="num">won {f.wonRate === null ? '–' : pctText(f.wonRate)}</span>
              <span className="num mkt-t">market {f.marketRate === null ? '–' : pctText(f.marketRate)}</span>
              <span className="num read-t">read as {pctText(pSide(f.confidence, floor))}</span>
              <span className="num">
                win {f3(pickBrier(f.confidence, true, floor))} · loss {f3(pickBrier(f.confidence, false, floor))}
              </span>
            </div>
          </div>
          <div className="bands">
            {bands.map((b) => (
              <div key={b.from} className="panel band-card">
                <h3 className="num">
                  Rated {b.from}–{b.to}
                  <span>{int(b.n)} bets</span>
                </h3>
                <div className="band-big">
                  <div>
                    <span className="lab">Won</span>
                    <b className="num">{pctText(b.won)}</b>
                  </div>
                  <div>
                    <span className="lab">Read as</span>
                    <b className={`num ${Math.abs(b.reading - b.won) > 0.1 ? 'bad' : 'good'}`}>{pctText(b.reading)}</b>
                  </div>
                </div>
                <div className="band-mkt num">market price {pctText(b.market)}</div>
              </div>
            ))}
            <div className="snap">
              <button type="button" className={`btn ${floor === AS_SCORED ? 'on' : ''}`} onClick={() => glide(AS_SCORED)}>
                Published
              </button>
              <button type="button" className={`btn ${floor === FIXED ? 'on' : ''}`} onClick={() => glide(FIXED)}>
                50% floor
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
