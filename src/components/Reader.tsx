import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Model } from '../App'
import { agentName, longDate, RUN_FAILED } from '../data'
import type { RawPrediction } from '../engine/dataset'
import {
  type Answer,
  type Decisions,
  type ReaderCall,
  type ReaderPick,
  type ReaderRun,
  type Tally,
  type View,
  locate,
  lowBoth,
  progressAt,
  runStats,
  tally,
  tallyByRating,
  verdict,
} from '../engine/reader'
import { AS_SCORED, LOW, type Pick, pSide } from '../engine/score'
import { pullPredictions } from '../lib/live'
import { clock, duration, int, pctText, pickKey, reducedMotion, useWidth } from '../lib/ui'

const SPEED = 20
const VIEW_LABEL: Record<View, string> = { likely: 'pick likely', none: 'no view', unlikely: 'pick unlikely' }

export const modelName = (m: string) =>
  m.replace(/^claude-/, '').replace(/-(\d+)-(\d+)$/, ' $1.$2').replace(/^\w/, (c) => c.toUpperCase())

/** reader.py's reasons, in plain words. */
const plainReason = (why: string) =>
  why.replace(/viewQuote|convictionQuote/g, 'quote').replace('is not an exact span of the reasoning', 'not word for word in the text')

// The recorded reader run: two models read every scored bet's question, side and
// reasoning. They weren't given its rating, price or outcome, though about a third
// of the texts quote the price themselves. Shows what the text says by rating, the run as it
// happened, and the bets where the two readers split, for the viewer to call.
// The run was made on the Oct 15 pull, so `model` is always the snapshot.
export const Reader = memo(function Reader({
  model,
  run,
  failed,
  decisions,
  decide,
  records,
  setRecords,
}: {
  model: Model
  run: ReaderRun | null
  failed: boolean
  decisions: Decisions
  decide: (key: string, v: View | null) => void
  records: Map<string, RawPrediction> | null
  setRecords: (m: Map<string, RawPrediction>) => void
}) {
  return (
    <section id="reader" className="sect" aria-labelledby="reader-h">
      <div className="wrap">
        <div className="sect-head">
          <h2 id="reader-h">What the agents wrote</h2>
          <span className="sect-meta">
            {run ? `Recorded run, ${longDate(run.ranAt)}, ${clock(run.ranAt)}` : failed ? RUN_FAILED : 'Loading the recorded run…'}
          </span>
        </div>
        {run && <ReaderBody model={model} run={run} decisions={decisions} decide={decide} records={records} setRecords={setRecords} />}
      </div>
    </section>
  )
})

function ReaderBody({
  model,
  run,
  decisions,
  decide,
  records,
  setRecords,
}: {
  model: Model
  run: ReaderRun
  decisions: Decisions
  decide: (key: string, v: View | null) => void
  records: Map<string, RawPrediction> | null
  setRecords: (m: Map<string, RawPrediction>) => void
}) {
  const ratingOf = useMemo(() => new Map(model.scored.map((p) => [pickKey(p), p.confidence])), [model])
  const stats = useMemo(() => runStats(run), [run])
  const joined = useMemo(() => run.picks.filter((p) => ratingOf.has(p.key)), [run, ratingOf])
  const low = useMemo(() => joined.filter((p) => ratingOf.get(p.key)! <= LOW), [joined, ratingOf])
  const high = useMemo(() => joined.filter((p) => ratingOf.get(p.key)! > LOW), [joined, ratingOf])
  const tLow = tally(low, decisions)
  const tHigh = tally(high, decisions)
  const perRating = tallyByRating(joined, ratingOf, decisions)
  // Bets the published reading treats as more likely lost than won (chance under 50%).
  const readLoss = low.filter((p) => pSide(ratingOf.get(p.key)!, AS_SCORED) < 0.5).length

  return (
    <>
      <p className="finding">
        Rated 1–{LOW}: the published score reads all {readLoss} as more likely lost than won. The text calls the pick unlikely in{' '}
        {tLow.unlikely}
        {tLow.open ? ` (${tLow.open} still your call)` : ''} and admits low conviction in {tLow.low}.
      </p>
      <div className="reader-results">
        <WordsTable tLow={tLow} tHigh={tHigh} />
        <ByRating rows={perRating} />
      </div>
      <RunTimeline run={run} stats={stats} />
      <Disputes model={model} run={run} ratingOf={ratingOf} decisions={decisions} decide={decide} records={records} setRecords={setRecords} />
    </>
  )
}

function WordsTable({ tLow, tHigh }: { tLow: Tally; tHigh: Tally }) {
  const row = (label: string, a: number, b: number, cls: string) => (
    <tr className={cls}>
      <th scope="row">{label}</th>
      <td className="r num">
        {a} <small>{pctText(a / tLow.n)}</small>
      </td>
      <td className="r num">
        {b} <small>{pctText(b / tHigh.n)}</small>
      </td>
    </tr>
  )
  return (
    <div className="panel words">
      <table className="tbl words-tbl">
        <thead>
          <tr>
            <th>The reasoning</th>
            <th className="r">Rated 1–{LOW}</th>
            <th className="r">Rated {LOW + 1}–15</th>
          </tr>
        </thead>
        <tbody>
          {row('Calls its pick likely', tLow.likely, tHigh.likely, 'v-likely')}
          {row('Gives no view on the odds', tLow.none, tHigh.none, 'v-none')}
          {row('Calls its pick unlikely', tLow.unlikely, tHigh.unlikely, 'v-unlikely')}
          {(tLow.open > 0 || tHigh.open > 0) && row('Readers split: your call', tLow.open, tHigh.open, 'v-open')}
          <tr className="say">
            <th scope="row" colSpan={3}>
              Separately
            </th>
          </tr>
          {row('Admits low conviction', tLow.low, tHigh.low, 'v-low')}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Bets</th>
            <td className="r num">{tLow.n}</td>
            <td className="r num">{tHigh.n}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function ByRating({ rows }: { rows: Tally[] }) {
  const [ref, width] = useWidth<HTMLDivElement>(560)
  const W = Math.max(280, width)
  // Taller beside the table on wide screens, so the two panels end together.
  const H = W > 520 ? 280 : 210
  const PAD = { l: 34, r: 8, t: 10, b: 26 }
  const band = (W - PAD.l - PAD.r) / 15
  const y = (v: number) => PAD.t + (1 - v) * (H - PAD.t - PAD.b)
  const order: (keyof Tally)[] = ['unlikely', 'open', 'none', 'likely']
  const lowPts = rows
    .map((r, i) => (r.n ? `${(PAD.l + band * (i + 0.5)).toFixed(1)},${y(r.low / r.n).toFixed(1)}` : null))
    .filter(Boolean)
    .join(' ')
  const anyOpen = rows.some((r) => r.open > 0)
  return (
    <div className="panel byrating" ref={ref}>
      <div className="cal-key" aria-hidden="true">
        <span>
          <i className="k-likely" /> pick likely
        </span>
        <span>
          <i className="k-none" /> no view
        </span>
        <span>
          <i className="k-unlikely" /> pick unlikely
        </span>
        {anyOpen && (
          <span>
            <i className="k-open" /> split
          </span>
        )}
        <span>
          <i className="k-low" /> low conviction
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Share of bets by what the reasoning says, per rating">
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
            <text className="ax" x={PAD.l - 6} y={y(v) + 3} textAnchor="end">
              {v * 100}%
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          if (!r.n) return null
          let acc = 0
          const bw = Math.min(24, band * 0.7)
          const cx = PAD.l + band * (i + 0.5)
          return (
            <g key={i}>
              {order.map((k) => {
                const v = (r[k] as number) / r.n
                const y0 = y(acc + v)
                const h = y(acc) - y0
                acc += v
                return v > 0 ? <rect key={k} className={`seg s-${k}`} x={cx - bw / 2} y={y0} width={bw} height={h} /> : null
              })}
              <text className="ax" x={cx} y={H - 10} textAnchor="middle">
                {i + 1}
              </text>
            </g>
          )
        })}
        <text className="ax" x={PAD.l - 4} y={H - 10} textAnchor="end">
          rated
        </text>
        <line className="cut" x1={PAD.l + band * LOW} x2={PAD.l + band * LOW} y1={PAD.t} y2={H - PAD.b} />
        <polyline className="lowline" points={lowPts} />
        {rows.map((r, i) => (r.n ? <circle key={i} className="lowdot" cx={PAD.l + band * (i + 0.5)} cy={y(r.low / r.n)} r={2.6} /> : null))}
      </svg>
    </div>
  )
}

export function RunTimeline({ run, stats }: { run: ReaderRun; stats: ReturnType<typeof runStats> }) {
  const [ref, width] = useWidth<HTMLDivElement>(900)
  const [t, setT] = useState(run.wallMs)
  const [playing, setPlaying] = useState(false)
  const firstReject = run.calls.find((c) => c.rejected.length) ?? null
  const [selected, setSelected] = useState<ReaderCall | null>(firstReject)
  const frame = useRef(0)

  const play = useCallback(() => {
    cancelAnimationFrame(frame.current)
    if (reducedMotion()) {
      setT(run.wallMs)
      return
    }
    setPlaying(true)
    const start = performance.now()
    const tick = (now: number) => {
      const next = Math.min(run.wallMs, (now - start) * SPEED)
      setT(next)
      if (next < run.wallMs) frame.current = requestAnimationFrame(tick)
      else setPlaying(false)
    }
    frame.current = requestAnimationFrame(tick)
  }, [run.wallMs])
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const lanes = run.workers
  const W = Math.max(300, width)
  const LANE = W < 560 ? 22 : 15
  const GAP = 5
  const PAD = { l: 26, r: 10, t: 6, b: 22 }
  const H = PAD.t + lanes * (LANE + GAP) - GAP + PAD.b
  const x = (ms: number) => PAD.l + (ms / run.wallMs) * (W - PAD.l - PAD.r)
  const prog = progressAt(run, t)
  const readers = new Map(run.readers.map((r) => [r.id, r]))
  const kept = run.picks.reduce((s, p) => s + (p.A ? 1 : 0) + (p.B ? 1 : 0), 0)
  const ticks = Array.from({ length: Math.floor(run.wallMs / 60000) + 1 }, (_, i) => i * 60000)
  const reasked = playing ? prog.rejected : stats.rejectedAnswers

  return (
    <div className="panel runline">
      <div className="runline-head">
        <dl className="run-stats">
          <div>
            <dt>Readers</dt>
            <dd>
              {run.readers.map((r) => (
                <span key={r.id} className={`rd rd-${r.id}`}>
                  {modelName(r.model)}
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt>Workers</dt>
            <dd className="num">{run.workers}</dd>
          </div>
          <div>
            <dt>Calls</dt>
            <dd className="num">{playing ? prog.done : stats.calls}</dd>
          </div>
          <div>
            <dt>Answers kept</dt>
            <dd className="num">{int(playing ? prog.kept : kept)}</dd>
          </div>
          <div>
            <dt>Re-asked</dt>
            <dd className={`num ${reasked ? 'warn-t' : ''}`}>{reasked}</dd>
          </div>
          <div>
            <dt>Wall · total call time</dt>
            <dd className="num">
              {duration(playing ? t : run.wallMs)} <small>· {duration(stats.serialMs)}</small>
            </dd>
          </div>
        </dl>
        <button type="button" className="btn primary" onClick={play} disabled={playing}>
          {playing ? `Replaying ${SPEED}×` : `Replay at ${SPEED}×`}
        </button>
      </div>
      <div className="gantt" ref={ref}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          role="img"
          tabIndex={0}
          className="kbd-chart"
          aria-label={`${stats.calls} calls across ${lanes} workers in ${duration(run.wallMs)}. Arrow keys step through the calls.`}
          onKeyDown={(e) => {
            const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
            if (!step) return
            e.preventDefault()
            const at = selected ? run.calls.indexOf(selected) : -1
            setSelected(run.calls[Math.min(run.calls.length - 1, Math.max(0, at + step))])
          }}
        >
          {Array.from({ length: lanes }, (_, w) => (
            <text key={w} className="ax" x={PAD.l - 8} y={PAD.t + w * (LANE + GAP) + LANE / 2 + 3} textAnchor="end">
              w{w + 1}
            </text>
          ))}
          {ticks.map((ms) => (
            <g key={ms}>
              <line className="grid" x1={x(ms)} x2={x(ms)} y1={PAD.t} y2={H - PAD.b + 4} />
              <text className="ax" x={x(ms)} y={H - 6} textAnchor="middle">
                {ms === 0 ? '0' : `${ms / 60000} m`}
              </text>
            </g>
          ))}
          {run.calls.map((c, i) => {
            const x0 = x(c.t0)
            return (
              <CallBar
                key={i}
                c={c}
                name={modelName(readers.get(c.reader)!.model)}
                x0={x0}
                y={PAD.t + c.worker * (LANE + GAP)}
                w={Math.max(1, x(c.t1) - x0 - 1)}
                h={LANE}
                fill={c.t0 <= t ? Math.max(1, x(Math.min(c.t1, t)) - x0 - 1) : null}
                done={c.t1 <= t}
                on={selected === c}
                onSelect={setSelected}
              />
            )
          })}
          {playing && <line className="playhead" x1={x(t)} x2={x(t)} y1={PAD.t - 4} y2={H - PAD.b + 4} />}
        </svg>
      </div>
      <div className="call-detail">
        <span aria-live="polite">
          {selected ? <CallLine c={selected} model={readers.get(selected.reader)!.model} run={run} /> : <span className="faint">Tap a call.</span>}
        </span>
        <span className="call-key" aria-hidden="true">
          <span>
            <i className="k-bad" /> re-asked
          </span>
          <span>
            <i className="k-retry" /> retry
          </span>
          <span>
            <i className="k-sel" /> selected
          </span>
        </span>
      </div>
    </div>
  )
}

/** One call on the timeline. Memoised: during a replay only the calls in progress
 *  get new props, so only they re-render each frame. */
const CallBar = memo(function CallBar({
  c,
  name,
  x0,
  y,
  w,
  h,
  fill,
  done,
  on,
  onSelect,
}: {
  c: ReaderCall
  name: string
  x0: number
  y: number
  w: number
  h: number
  /** Width drawn so far, or null before the call starts. */
  fill: number | null
  done: boolean
  on: boolean
  onSelect: (c: ReaderCall) => void
}) {
  const bad = c.rejected.length > 0 || c.error
  return (
    <g className={`call r-${c.reader} ${on ? 'on' : ''}`} onClick={() => onSelect(c)}>
      <title>{`${name}, ${c.items} bets, ${((c.t1 - c.t0) / 1000).toFixed(1)} s`}</title>
      <rect className="ghost" x={x0 + 0.5} y={y} width={w} height={h} />
      {fill !== null && <rect className="fill" x={x0 + 0.5} y={y} width={fill} height={h} />}
      {bad && done && <rect className="bad" x={x0 + 0.5} y={y} width={w} height={h} />}
      {c.attempt > 1 && done && <rect className="retry" x={x0 + 0.5} y={y} width={w} height={h} />}
    </g>
  )
})

function CallLine({ c, model, run }: { c: ReaderCall; model: string; run: ReaderRun }) {
  const retry = c.rejected.length ? run.calls.find((x) => x.reader === c.reader && x.batch === c.batch && x.attempt === c.attempt + 1) : null
  return (
    <span className="num">
      <b className={`rd rd-${c.reader}`}>{modelName(model)}</b> · worker {c.worker + 1} · {c.items} bets
      {c.attempt > 1 ? ` (try ${c.attempt})` : ''} · {((c.t1 - c.t0) / 1000).toFixed(1)} s
      {c.inTokens != null && ` · ${int(c.inTokens)} tokens in, ${int(c.outTokens ?? 0)} out`} · kept {c.kept}
      {c.rejected.length > 0 && (
        <span className="warn-t">
          {' '}
          · re-asked {c.rejected.length}: {plainReason(c.rejected[0].why)}
          {retry ? `; the retry took ${((retry.t1 - retry.t0) / 1000).toFixed(1)} s and was kept` : ''}
        </span>
      )}
      {c.error && <span className="warn-t"> · {c.error}</span>}
    </span>
  )
}

function Disputes({
  model,
  run,
  ratingOf,
  decisions,
  decide,
  records,
  setRecords,
}: {
  model: Model
  run: ReaderRun
  ratingOf: Map<string, number>
  decisions: Decisions
  decide: (key: string, v: View | null) => void
  records: Map<string, RawPrediction> | null
  setRecords: (m: Map<string, RawPrediction>) => void
}) {
  const split = useMemo(
    () =>
      run.picks
        .filter((p) => p.A && p.B && p.A.view !== p.B.view && ratingOf.has(p.key))
        .sort((a, b) => ratingOf.get(a.key)! - ratingOf.get(b.key)! || a.key.localeCompare(b.key)),
    [run, ratingOf],
  )
  const firstOpen = split.findIndex((p) => !decisions[p.key])
  const [i, setI] = useState(firstOpen < 0 ? 0 : firstOpen)
  const pickMap = useMemo(() => new Map(model.scored.map((x) => [pickKey(x), x])), [model])
  const p = split[i]
  if (!p) return null
  const decided = split.filter((x) => decisions[x.key]).length
  const bet = pickMap.get(p.key)
  const call = (v: View) => {
    decide(p.key, v)
    // The next open split after this one, wrapping round.
    for (let k = 1; k < split.length; k++) {
      const j = (i + k) % split.length
      if (!decisions[split[j].key]) {
        setI(j)
        return
      }
    }
  }
  const chosen = decisions[p.key]

  return (
    <div className="panel disputes" id="your-call">
      <div className="panel-head">
        <h3>Your call</h3>
        <span className="panel-meta num">
          {decided}/{split.length} decided · readers split on {split.length} of {int(run.picks.length)}
        </span>
      </div>
      <div className="dispute">
        <div className="dispute-bet">
          <p className="q">{bet ? model.events.get(bet.eventId)?.question : p.key}</p>
          {bet && <BetChips bet={bet} />}
          <ReaderVerdicts pick={p} run={run} records={records} setRecords={setRecords} />
        </div>
        <div className="dispute-act">
          <span className="lab">The text calls its pick</span>
          <div className="choice" role="group" aria-label="Your call">
            {(['likely', 'none', 'unlikely'] as View[]).map((v) => (
              <button key={v} type="button" className={`btn ${chosen === v ? 'on' : ''}`} aria-pressed={chosen === v} onClick={() => call(v)}>
                {v === 'none' ? 'No view' : v === 'likely' ? 'Likely' : 'Unlikely'}
              </button>
            ))}
          </div>
          <div className="pager">
            <button type="button" className="icon-btn" aria-label="Previous split" onClick={() => setI((i - 1 + split.length) % split.length)}>
              ‹
            </button>
            <span className="num">
              {i + 1}/{split.length}
            </span>
            <button type="button" className="icon-btn" aria-label="Next split" onClick={() => setI((i + 1) % split.length)}>
              ›
            </button>
            {chosen && (
              <button type="button" className="link-btn" onClick={() => decide(p.key, null)}>
                Undo
              </button>
            )}
          </div>
          <span className="hint">{decided ? `The table above counts your ${decided} ${decided === 1 ? 'call' : 'calls'}` : 'The table above counts your calls'}</span>
        </div>
      </div>
    </div>
  )
}

function BetChips({ bet }: { bet: Pick }) {
  return (
    <ul className="chips">
      <li className="chip">{agentName(bet.agentId)}</li>
      <li className="chip side">{bet.prediction}</li>
      <li className="chip num">rated {bet.confidence}/15</li>
      <li className={`chip ${(bet.pnl ?? 0) > 0 ? 'won' : 'lost'}`}>{(bet.pnl ?? 0) > 0 ? 'Won' : 'Lost'}</li>
    </ul>
  )
}

/** Both readers' answers on one bet, with their quotes, and the full text on demand. */
export function ReaderVerdicts({
  pick,
  run,
  compact,
  records,
  setRecords,
}: {
  pick: ReaderPick
  run: ReaderRun
  compact?: boolean
  records?: Map<string, RawPrediction> | null
  setRecords?: (m: Map<string, RawPrediction>) => void
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const v = verdict(pick, {})
  const text = records?.get(pick.key)?.reasoning ?? null
  const load = async () => {
    if (!setRecords) return
    setState('loading')
    try {
      const recs = await pullPredictions()
      setRecords(new Map(recs.map((r) => [pickKey(r), r])))
      setState('idle')
    } catch {
      setState('error')
    }
  }
  return (
    <div className={`verdicts ${compact ? 'compact' : ''}`}>
      {(['A', 'B'] as const).map((r) => (
        <AnswerRow key={r} reader={r} name={modelName(run.readers.find((x) => x.id === r)?.model ?? r)} a={pick[r]} />
      ))}
      {lowBoth(pick) && (
        <div className="verdict low">
          <span className="who">Both</span>
          <span className="what">low conviction</span>
          <q>{pick.A!.lowQuote}</q>
        </div>
      )}
      {compact && <div className="verdict-sum">{v.status === 'agreed' ? `Readers agree: ${VIEW_LABEL[v.view!]}` : 'Readers split'}</div>}
      {text ? (
        <FullText text={text} pick={pick} />
      ) : setRecords ? (
        <button type="button" className="link-btn" onClick={load} disabled={state === 'loading'}>
          {state === 'loading' ? 'Loading from the API…' : state === 'error' ? 'Couldn’t reach the API. Try again' : 'Show the full text from the API'}
        </button>
      ) : null}
    </div>
  )
}

function AnswerRow({ reader, name, a }: { reader: 'A' | 'B'; name: string; a: Answer | null }) {
  if (!a) return null
  return (
    <div className={`verdict v-${a.view}`}>
      <span className={`who rd rd-${reader}`}>{name}</span>
      <span className="what">{VIEW_LABEL[a.view]}</span>
      {a.viewQuote ? <q>{a.viewQuote}</q> : <span className="faint">no quote needed</span>}
    </div>
  )
}

function FullText({ text, pick }: { text: string; pick: ReaderPick }) {
  const spans: { at: [number, number]; cls: string }[] = []
  const add = (q: string | undefined, cls: string) => {
    const at = q ? locate(text, q) : null
    if (at) spans.push({ at, cls })
  }
  add(pick.A?.viewQuote, 'm-A')
  add(pick.B?.viewQuote, 'm-B')
  if (lowBoth(pick)) add(pick.A?.lowQuote, 'm-low')
  // Paint character classes, then group runs.
  const cls: string[] = Array.from({ length: text.length }, () => '')
  for (const s of spans) for (let i = s.at[0]; i < s.at[1]; i++) cls[i] = cls[i] ? `${cls[i]} ${s.cls}` : s.cls
  const parts: { t: string; c: string }[] = []
  for (let i = 0; i < text.length; i++) {
    const last = parts[parts.length - 1]
    if (last && last.c === cls[i]) last.t += text[i]
    else parts.push({ t: text[i], c: cls[i] })
  }
  return (
    <blockquote className="fulltext">
      {parts.map((p, i) => (p.c ? <mark key={i} className={p.c}>{p.t}</mark> : <span key={i}>{p.t}</span>))}
    </blockquote>
  )
}
