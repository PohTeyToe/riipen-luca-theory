import type { ReactNode } from 'react'
import type { Model } from '../App'
import { agentName, longDate, page, pulled, STREET } from '../data'
import { type ReaderRun, runStats } from '../engine/reader'
import { AS_SCORED, pickBrier, pSide } from '../engine/score'
import { ENDPOINTS, type Fetched } from '../lib/live'
import { clock, duration, f3, int, msText, pctText } from '../lib/ui'

export type StepId = 'pull' | 'rescore' | 'match' | 'king' | 'readers' | 'finding'

export type LiveState =
  | { phase: 'idle' }
  | { phase: 'fetching'; fetched: Fetched[] }
  | {
      phase: 'done'
      fetched: Fetched[]
      fetchMs: number
      parseMs: number
      at: string
    }
  | { phase: 'error'; fetched: Fetched[]; message: string }

type Status = 'ok' | 'run' | 'fail' | 'wait'

interface Step {
  id: StepId
  label: string
  value: ReactNode
  sub: ReactNode
  ms: ReactNode
  status: Status
}

// The pipeline, as it ran in this browser: pull, rescore, match, replay, read, find.
// Every count and time comes from the run that produced the page below.
export function RunBar({
  model,
  step,
  setStep,
  live,
  onLive,
  onSnapshot,
  readerRun,
  textsSame,
}: {
  model: Model
  step: StepId | null
  setStep: (s: StepId | null) => void
  live: LiveState
  onLive: () => void
  onSnapshot: () => void
  readerRun: ReaderRun | null
  textsSame: { same: number; checked: number } | null
}) {
  const { run } = model
  const fetching = live.phase === 'fetching'
  const isLive = model.source.kind === 'live'
  const stats = readerRun ? runStats(readerRun) : null
  const n = run.rescore.agents

  const steps: Step[] = [
    {
      id: 'pull',
      label: 'Pull',
      value: fetching ? `${live.fetched.length}/5` : int(model.ds.picks.length),
      sub: fetching ? 'endpoints' : isLive ? `picks · live ${clock(model.source.at)}` : `picks · ${pulled.replace(/, \d{4}$/, '')}`,
      ms: fetching ? '' : live.phase === 'done' && isLive ? msText(live.fetchMs) : 'snapshot',
      status: fetching ? 'run' : live.phase === 'error' ? 'fail' : 'ok',
    },
    {
      id: 'rescore',
      label: 'Rescore',
      value: int(run.rescore.scored),
      sub: 'settled bets',
      ms: msText(run.rescore.ms),
      status: fetching ? 'wait' : 'ok',
    },
    {
      id: 'match',
      label: 'Match',
      value: `${run.match.brierMatches}/${n}`,
      sub: run.match.trustWithinHalf === n ? 'Brier 3 dp · trust ±0.5' : `Brier 3 dp · trust ${run.match.trustWithinHalf}/${n}`,
      ms: msText(run.match.ms),
      status: fetching ? 'wait' : run.match.brierMatches === n && run.match.trustWithinHalf === n ? 'ok' : 'fail',
    },
    {
      id: 'king',
      label: 'Replay King',
      value: `${run.king.ruleOk}/${run.king.bets}`,
      sub: `calls · log ${run.king.claimsOk}/${run.king.claims}`,
      ms: msText(run.king.ms),
      status: fetching ? 'wait' : run.king.ruleOk === run.king.bets && run.king.claimsOk === run.king.claims ? 'ok' : 'fail',
    },
    {
      id: 'readers',
      label: 'Read reasoning',
      value: stats ? int(stats.both) : '…',
      sub: !stats
        ? 'loading run'
        : textsSame
          ? `texts unchanged ${textsSame.same}/${textsSame.checked}`
          : `read twice · agree ${pctText(stats.agreeView / stats.both)}`,
      ms: stats ? `recorded · ${duration(stats.wallMs)}` : '',
      status: stats ? 'ok' : 'wait',
    },
    {
      id: 'finding',
      label: 'Finding',
      value: int(run.finding.bets),
      sub: `rated 1–${run.finding.top} · loss scores better`,
      ms: msText(run.finding.ms),
      status: fetching ? 'wait' : 'ok',
    },
  ]

  return (
    <section id="run" className="run" aria-label="Rebuild pipeline">
      <div className="wrap run-in">
        <ol className="steps">
          {steps.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                className={`step ${s.status} ${step === s.id ? 'on' : ''}`}
                aria-expanded={step === s.id}
                aria-controls="run-detail"
                onClick={() => setStep(step === s.id ? null : s.id)}
              >
                <span className="step-top">
                  <span className="step-i">{String(i + 1).padStart(2, '0')}</span>
                  <span className="step-l">{s.label}</span>
                  <Mark status={s.status} />
                </span>
                <span className="step-v num">{s.value}</span>
                <span className="step-s">{s.sub}</span>
                <span className="step-ms num">{s.ms}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="run-act">
          {isLive || live.phase === 'error' ? (
            <>
              <button type="button" className="btn lime" onClick={onLive} disabled={fetching}>
                {fetching ? 'Pulling…' : 'Pull again'}
              </button>
              <button type="button" className="btn on-dark" onClick={onSnapshot}>
                Back to {pulled}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn lime" onClick={onLive} disabled={fetching} aria-describedby="live-hint">
                {fetching ? 'Pulling…' : 'Rerun live'}
              </button>
              <span id="live-hint" className="run-hint">
                From LUCA's API, now
              </span>
            </>
          )}
        </div>
      </div>
      {step && (
        <div id="run-detail" className="run-detail">
          <div className="wrap">
            {step === 'pull' && <PullDetail live={live} showing={isLive ? `the live pull from ${clock(model.source.at)}` : `the ${pulled} snapshot`} />}
            {step === 'rescore' && <RescoreDetail model={model} />}
            {step === 'match' && <MatchDetail model={model} />}
            {step === 'king' && <KingDetail model={model} />}
            {step === 'readers' && <ReadersDetail run={readerRun} textsSame={textsSame} />}
            {step === 'finding' && <FindingDetail model={model} />}
          </div>
        </div>
      )}
    </section>
  )
}

function Mark({ status }: { status: Status }) {
  if (status === 'run') return <span className="mark run" role="img" aria-label="running" />
  if (status === 'wait') return <span className="mark wait" role="img" aria-label="waiting" />
  if (status === 'fail')
    return (
      <svg className="mark fail" viewBox="0 0 12 12" role="img" aria-label="failed">
        <path d="M3 3l6 6M9 3l-6 6" />
      </svg>
    )
  return (
    <svg className="mark ok" viewBox="0 0 12 12" role="img" aria-label="passed">
      <path d="M2.5 6.5l2.2 2.2L9.5 3.8" />
    </svg>
  )
}

const short = (sha: string) => `${sha.slice(0, 10)}…`

function PullDetail({ live, showing }: { live: LiveState; showing: string }) {
  const fetched = live.phase === 'idle' ? [] : live.fetched
  return (
    <div className="detail">
      <table className="tbl">
        <thead>
          <tr>
            <th>Endpoint</th>
            <th className="r">Bytes</th>
            <th>SHA-256, {pulled}</th>
            {live.phase !== 'idle' && <th className="r">Live</th>}
            {live.phase !== 'idle' && <th>vs {pulled}</th>}
          </tr>
        </thead>
        <tbody>
          {ENDPOINTS.map((ep) => {
            const src = page.sources.find((s) => s.file === ep.file)!
            const f = fetched.find((x) => x.path === ep.path)
            return (
              <tr key={ep.path}>
                <td>
                  <a href={`${STREET}${ep.path}`} className="mono-link">
                    {ep.path}
                  </a>
                </td>
                <td className="r num">{int(f ? f.bytes : src.bytes)}</td>
                <td className="num faint">{short(src.sha256)}</td>
                {live.phase !== 'idle' && <td className="r num">{f ? `${f.status} · ${msText(f.ms)}` : '…'}</td>}
                {live.phase !== 'idle' && (
                  <td>{f ? f.sameAsSnapshot === null ? '—' : f.sameAsSnapshot ? <span className="ok-t">same bytes</span> : <span className="chg-t">changed</span> : ''}</td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="detail-note">
        {live.phase === 'error'
          ? `Live pull failed (${live.message}). The page still shows ${showing}.`
          : live.phase === 'done'
            ? `Parsed and normalised in ${msText(live.parseMs)}. Everything below runs on this pull, except the recorded reader run.`
            : 'The API sends no CORS headers, so a live pull goes through this site’s proxy.'}
      </p>
    </div>
  )
}

function RescoreDetail({ model }: { model: Model }) {
  const rows = model.ds.agents.map((a) => ({ id: a, n: model.byAgent.get(a)?.length ?? 0 }))
  return (
    <div className="detail detail-cols">
      <div className="formula">
        <code>Brier = mean((p − won)²)</code>
        <code>p = confidence / 15</code>
        <span className="detail-note">
          {int(model.ds.picks.length)} picks → {int(model.run.rescore.scored)} settled with a stake (P&amp;L ≠ 0)
        </span>
      </div>
      <ul className="counts">
        {rows.map((r) => (
          <li key={r.id}>
            <span>{agentName(r.id)}</span>
            <b className="num">{r.n}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

function MatchDetail({ model }: { model: Model }) {
  return (
    <div className="detail">
      <table className="tbl">
        <thead>
          <tr>
            <th>Agent</th>
            <th className="r">Bets</th>
            <th className="r">Brier, published</th>
            <th className="r">Rebuilt</th>
            <th className="r">Trust, published</th>
            <th className="r">Rebuilt</th>
          </tr>
        </thead>
        <tbody>
          {model.run.match.rows.map((r) => (
            <tr key={r.id}>
              <td>{agentName(r.id)}</td>
              <td className="r num">{r.settled}</td>
              <td className="r num">{r.publishedBrier.toFixed(3)}</td>
              <td className={`r num ${r.brierOk ? 'ok-t' : 'warn-t'}`}>{r.rebuiltBrier.toFixed(3)}</td>
              <td className="r num">{r.publishedTrust}</td>
              <td className={`r num ${r.trustOk ? 'ok-t' : 'warn-t'}`}>{r.rebuiltTrust.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="detail-note">
        Published: <a href={`${STREET}/api/analytics/calibration`}>/api/analytics/calibration</a> and{' '}
        <a href={`${STREET}/api/trust-scores`}>/api/trust-scores</a>. Trust uses the formula on your methodology page.
      </p>
    </div>
  )
}

function KingDetail({ model }: { model: Model }) {
  const k = model.run.king
  return (
    <div className="detail detail-row">
      <dl className="facts">
        <div>
          <dt>Consensus rebuilt</dt>
          <dd className="num">
            {k.consensusOk}/{k.bets}
          </dd>
        </div>
        <div>
          <dt>EXECUTE / WAIT replayed</dt>
          <dd className="num">
            {k.ruleOk}/{k.bets}
          </dd>
        </div>
        <div>
          <dt>Log sentences confirmed</dt>
          <dd className="num">
            {k.claimsOk}/{k.claims}
          </dd>
        </div>
      </dl>
      <a className="btn ghost" href="#king">
        Replay a decision
      </a>
    </div>
  )
}

function ReadersDetail({ run, textsSame }: { run: ReaderRun | null; textsSame: { same: number; checked: number } | null }) {
  if (!run) return <div className="detail detail-note">Loading the recorded run…</div>
  const s = runStats(run)
  return (
    <div className="detail detail-row">
      <dl className="facts">
        <div>
          <dt>Recorded</dt>
          <dd>{longDate(run.ranAt)}</dd>
        </div>
        <div>
          <dt>Calls · workers</dt>
          <dd className="num">
            {s.calls} · {run.workers}
          </dd>
        </div>
        <div>
          <dt>Wall · total call time</dt>
          <dd className="num">
            {duration(s.wallMs)} · {duration(s.serialMs)}
          </dd>
        </div>
        <div>
          <dt>Answers re-asked</dt>
          <dd className="num">{s.rejectedAnswers}</dd>
        </div>
        {textsSame && (
          <div>
            <dt>Texts unchanged since</dt>
            <dd className="num">
              {textsSame.same}/{textsSame.checked}
            </dd>
          </div>
        )}
      </dl>
      <a className="btn ghost" href="#reader">
        Open the run
      </a>
    </div>
  )
}

function FindingDetail({ model }: { model: Model }) {
  const rows = Array.from({ length: model.run.finding.top }, (_, i) => i + 1).map((c) => {
    const xs = model.scored.filter((p) => p.confidence === c)
    const w = xs.filter((p) => (p.pnl ?? 0) > 0).length
    return { c, n: xs.length, won: xs.length ? w / xs.length : 0 }
  })
  return (
    <div className="detail">
      <table className="tbl">
        <thead>
          <tr>
            <th className="r">Rated</th>
            <th className="r">Bets</th>
            <th className="r">Won</th>
            <th className="r">Read as</th>
            <th className="r">A win scores</th>
            <th className="r">A loss scores</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.c}>
              <td className="r num">{r.c}</td>
              <td className="r num">{r.n}</td>
              <td className="r num">{pctText(r.won)}</td>
              <td className="r num">{pctText(pSide(r.c, AS_SCORED))}</td>
              <td className="r num warn-t">{f3(pickBrier(r.c, true, AS_SCORED))}</td>
              <td className="r num">{f3(pickBrier(r.c, false, AS_SCORED))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="detail-note">Lower Brier is better. A coin flip scores 0.250.</p>
    </div>
  )
}
