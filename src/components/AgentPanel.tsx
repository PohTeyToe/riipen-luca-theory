import { useMemo, useState, type PointerEvent } from 'react'
import type { Model } from '../App'
import { agentName, agentRole } from '../data'
import type { RawPrediction } from '../engine/dataset'
import type { ReaderRun } from '../engine/reader'
import { AS_SCORED, type AgentScore, COIN_FLIP, type Pick, halfUp, lossBetterBelow, pickBrier, pSide, sidePrice, won } from '../engine/score'
import { brierTone, f3, pctText, pickKey, shortDate, useWidth } from '../lib/ui'
import { ReaderVerdicts } from './Reader'

const H = 220
const PAD = { l: 34, r: 8, t: 18, b: 30 }
/** A group of this many bets gets the largest mark; area grows with the count. */
const FULL = 40

interface Group {
  c: number
  won: boolean
  picks: Pick[]
  x: number
  y: number
  r: number
}

// One agent under the current reading: its numbers, its scored bets grouped by
// rating and outcome at the exact score each group gets, and the selected bet
// with its API record and what its reasoning says.
export function AgentPanel({
  model,
  floor,
  agentId,
  score,
  betKey,
  onBet,
  readerRun,
  records,
  setRecords,
}: {
  model: Model
  floor: number
  agentId: string
  score: AgentScore
  betKey: string | null
  onBet: (k: string) => void
  readerRun: ReaderRun | null
  records: Map<string, RawPrediction> | null
  setRecords: (m: Map<string, RawPrediction>) => void
}) {
  const [ref, width] = useWidth<HTMLDivElement>(480)
  const picks = model.byAgent.get(agentId) ?? []
  const pub = model.ds.published[agentId]
  const match = model.run.match.rows.find((r) => r.id === agentId)
  // Bets in chart order: by rating, wins before losses, oldest first.
  const ordered = useMemo(
    () =>
      [...picks].sort(
        (a, b) => a.confidence - b.confidence || Number(won(b)) - Number(won(a)) || a.createdAt.localeCompare(b.createdAt),
      ),
    [picks],
  )
  const W = Math.max(280, width)
  const band = (W - PAD.l - PAD.r) / 15
  const rMax = Math.min(15, band * 0.46)
  const y = (b: number) => PAD.t + (1 - b) * (H - PAD.t - PAD.b)

  const groups: Group[] = useMemo(() => {
    const by = new Map<string, Pick[]>()
    for (const p of ordered) {
      const k = `${p.confidence}|${won(p)}`
      if (!by.has(k)) by.set(k, [])
      by.get(k)!.push(p)
    }
    return [...by.values()].map((xs) => {
      const c = xs[0].confidence
      const w = won(xs[0])
      return {
        c,
        won: w,
        picks: xs,
        x: PAD.l + band * (c - 0.5),
        y: y(pickBrier(c, w, floor)),
        r: Math.max(2.6, rMax * Math.sqrt(Math.min(1, xs.length / FULL))),
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered, floor, W])

  const sel = ordered.find((p) => pickKey(p) === betKey) ?? null
  const selIndex = sel ? ordered.indexOf(sel) : -1
  const selGroup = sel ? groups.find((g) => g.picks.includes(sel)) : undefined
  const step = (d: number) => {
    if (!ordered.length) return
    const i = selIndex < 0 ? 0 : (selIndex + d + ordered.length) % ordered.length
    onBet(pickKey(ordered[i]))
  }

  // Tap a mark: open its latest bet, or the next bet in it if one is already open.
  const pickAt = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * W
    const py = ((e.clientY - box.top) / box.height) * H
    let best: Group | null = null
    let bd = Infinity
    for (const g of groups) {
      const d = Math.hypot(g.x - px, g.y - py) - g.r
      if (d < bd) {
        bd = d
        best = g
      }
    }
    if (!best || bd > 10) return
    const at = sel ? best.picks.indexOf(sel) : -1
    const next = at >= 0 ? best.picks[(at + 1) % best.picks.length] : best.picks[best.picks.length - 1]
    onBet(pickKey(next))
  }

  // Shade whole rating bands where a loss scores better than a win.
  const lossRatings = Math.max(0, Math.ceil(lossBetterBelow(floor)) - 1)
  const pubBrier = halfUp(pub.brierScore, 3)
  const nowBrier = halfUp(score.brier, 3)
  const moved = score.rankAsScored - score.rank
  const asPublished = floor === AS_SCORED

  return (
    <section className="panel agent" aria-labelledby="agent-h" aria-live="polite">
      <div className="panel-head agent-head">
        <div>
          <h2 id="agent-h">{agentName(agentId)}</h2>
          <span className="panel-meta role">{agentRole(agentId)}</span>
        </div>
        <span className="rank-pair num" aria-label={`Rank ${score.rankAsScored} published, ${score.rank} now`}>
          #{score.rankAsScored}
          {moved !== 0 && (
            <>
              <span className="arrow">→</span>
              <b className={moved > 0 ? 'up' : 'down'}>#{score.rank}</b>
            </>
          )}
        </span>
      </div>
      <dl className="agent-stats">
        <div>
          <dt>Brier</dt>
          <dd className={`big num ${brierTone(score.brier)}`}>{f3(score.brier)}</dd>
          <dd className="was num">{asPublished && match?.brierOk ? '= published' : `published ${pubBrier.toFixed(3)}`}</dd>
        </div>
        <div>
          <dt>Trust</dt>
          <dd className="big num">{halfUp(score.trust)}</dd>
          <dd className="was num">{asPublished && match?.trustOk ? '= published' : `published ${pub.dynamicTrust}`}</dd>
        </div>
        <div>
          <dt>Won</dt>
          <dd className="big num">{pctText(score.wins / score.n)}</dd>
          <dd className="was num">
            {score.wins} of {score.n}
          </dd>
        </div>
      </dl>
      <div className="bets" ref={ref}>
        <div className="bets-key" aria-hidden="true">
          <span>
            <i className="k-won" /> won
          </span>
          <span>
            <i className="k-lost" /> lost
          </span>
          <span className="k-axis">size = bets</span>
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          className="bets-svg"
          role="img"
          aria-label={`${score.n} bets by rating. Brier now ${f3(score.brier)}${nowBrier !== pubBrier ? `, published ${pubBrier.toFixed(3)}` : ''}.`}
          onPointerDown={pickAt}
        >
          {lossRatings > 0 && <rect className="zone-bad" x={PAD.l} y={PAD.t} width={lossRatings * band} height={H - PAD.t - PAD.b} />}
          {[0, 0.5, 1].map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
              <text className="ax" x={PAD.l - 6} y={y(t) + 3} textAnchor="end">
                {t === 0 ? '0' : t === 1 ? '1' : '.5'}
              </text>
            </g>
          ))}
          <line className="coin" x1={PAD.l} x2={W - PAD.r} y1={y(COIN_FLIP)} y2={y(COIN_FLIP)} />
          <text className="ax coin-t" x={PAD.l - 6} y={y(COIN_FLIP) + 3} textAnchor="end">
            .25
          </text>
          <text className="ax coin-t" x={W - PAD.r} y={y(COIN_FLIP) - 4} textAnchor="end">
            coin flip
          </text>
          {[1, 5, 10, 15].map((c) => (
            <text key={c} className="ax" x={PAD.l + band * (c - 0.5)} y={H - 8} textAnchor="middle">
              {c}
            </text>
          ))}
          {groups.map((g) =>
            g.won ? (
              <g key={`${g.c}w`} className="grp won">
                <circle cx={g.x} cy={g.y} r={g.r} />
                {g.r >= 8 && (
                  <text x={g.x} y={g.y + 3.5} textAnchor="middle">
                    {g.picks.length}
                  </text>
                )}
              </g>
            ) : (
              <g key={`${g.c}l`} className="grp lost">
                <rect x={g.x - g.r * 0.886} y={g.y - g.r * 0.886} width={g.r * 1.772} height={g.r * 1.772} />
                {g.r >= 8 && (
                  <text x={g.x} y={g.y + 3.5} textAnchor="middle">
                    {g.picks.length}
                  </text>
                )}
              </g>
            ),
          )}
          {selGroup && <circle className="dot-sel" cx={selGroup.x} cy={selGroup.y} r={selGroup.r + 4} />}
        </svg>
      </div>
      {sel ? (
        <BetInspector
          model={model}
          p={sel}
          floor={floor}
          index={selIndex}
          total={ordered.length}
          onStep={step}
          readerRun={readerRun}
          records={records}
          setRecords={setRecords}
        />
      ) : (
        <p className="empty">Tap a mark to open its bets.</p>
      )}
    </section>
  )
}

function BetInspector({
  model,
  p,
  floor,
  index,
  total,
  onStep,
  readerRun,
  records,
  setRecords,
}: {
  model: Model
  p: Pick
  floor: number
  index: number
  total: number
  onStep: (d: number) => void
  readerRun: ReaderRun | null
  records: Map<string, RawPrediction> | null
  setRecords: (m: Map<string, RawPrediction>) => void
}) {
  const [view, setView] = useState<'score' | 'source' | 'reasoning'>('score')
  const ev = model.events.get(p.eventId)
  const w = won(p)
  const price = sidePrice(p)
  const prob = pSide(p.confidence, floor)
  const now = pickBrier(p.confidence, w, floor)
  const other = pickBrier(p.confidence, !w, floor)
  const rp = readerRun?.picks.find((x) => x.key === pickKey(p)) ?? null

  return (
    <div className="inspector">
      <div className="insp-top">
        <p className="q">{ev?.question ?? p.eventId}</p>
        <div className="insp-nav">
          <button type="button" className="icon-btn" onClick={() => onStep(-1)} aria-label="Previous bet">
            ‹
          </button>
          <span className="num">
            {index + 1}/{total}
          </span>
          <button type="button" className="icon-btn" onClick={() => onStep(1)} aria-label="Next bet">
            ›
          </button>
        </div>
      </div>
      <ul className="chips">
        <li className="chip side">{p.prediction}</li>
        <li className="chip num">rated {p.confidence}/15</li>
        <li className="chip num mkt">market {pctText(price)} {p.prediction}</li>
        <li className={`chip ${w ? 'won' : 'lost'}`}>{w ? 'Won' : 'Lost'}</li>
        <li className="chip num faint">{shortDate(p.createdAt)}</li>
      </ul>
      <div className="tabs" role="tablist" aria-label="Bet detail">
        {(['score', 'source', 'reasoning'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={view === t} className={view === t ? 'on' : ''} onClick={() => setView(t)}>
            {t === 'score' ? 'Score' : t === 'source' ? 'API record' : 'Reasoning'}
          </button>
        ))}
      </div>
      {view === 'score' && (
        <div className="scores">
          <div>
            <span className="lab">{w ? 'Won, scored' : 'Lost, scored'}</span>
            <b className={`num ${brierTone(now)}`}>{f3(now)}</b>
          </div>
          <div>
            <span className="lab">{w ? 'If it had lost' : 'If it had won'}</span>
            <b className={`num ${brierTone(other)}`}>{f3(other)}</b>
          </div>
          <code className="calc">
            p = {pctText(prob)} → ({halfUp(prob, 3).toFixed(3)} − {w ? 1 : 0})² = {f3(now)}
          </code>
        </div>
      )}
      {view === 'source' && (
        <pre className="src" aria-label="API record">
          {'{\n'}
          <Line k="agentId" v={`"${p.agentId}"`} />
          <Line k="prediction" v={`"${p.prediction}"`} hot />
          <Line k="confidence" v={String(p.confidence)} hot />
          <Line k="marketProbAtEntry" v={String(p.marketProbAtEntry)} />
          <Line k="pnl" v={String(p.pnl)} hot />
          <Line k="settled" v={String(p.settled)} />
          <Line k="createdAt" v={`"${p.createdAt}"`} last />
          {'}'}
          <span className="src-cap">{'\n'}GET /api/predictions · scored: settled, P&amp;L ≠ 0, won when P&amp;L &gt; 0</span>
        </pre>
      )}
      {view === 'reasoning' &&
        (rp && readerRun ? <ReaderVerdicts pick={rp} run={readerRun} compact records={records} setRecords={setRecords} /> : <p className="empty">{readerRun ? 'Not in the reader run.' : 'Loading the reader run…'}</p>)}
    </div>
  )
}

function Line({ k, v, hot, last }: { k: string; v: string; hot?: boolean; last?: boolean }) {
  return (
    <span className={hot ? 'hot' : undefined}>
      {'  '}"{k}": {v}
      {last ? '' : ','}
      {'\n'}
    </span>
  )
}
