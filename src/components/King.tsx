import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Model } from '../App'
import { agentName } from '../data'
import { logChecks, replay, voteWeight } from '../engine/king'
import { EDGE, type KingBet, halfUp } from '../engine/score'
import { reducedMotion, shortDate } from '../lib/ui'

// One decimal, like the King's own log.
const p1 = (x: number) => `${halfUp(100 * x, 1).toFixed(1)}%`

const STEP_MS = 260

// LUCA's Street King: ten agents vote, the King weighs each vote by the voter's
// trust and confidence, compares the consensus with the market, and calls EXECUTE
// or WAIT. This replays one recorded decision vote by vote and checks every
// number and every sentence of the King's own log against the replay.
export function King({ model }: { model: Model }) {
  const bets = useMemo(() => [...model.ds.kingBets].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [model])
  const summary = model.run.king
  const defaultIndex = useMemo(() => {
    let best = -1
    bets.forEach((b, i) => {
      if (b.signal === 'STREET_KING_EXECUTE' && b.breakdown.length === 10) best = i
    })
    return Math.max(0, best)
  }, [bets])
  const [pick, setI] = useState(defaultIndex)
  // A live pull can return fewer decisions; keep the selection in range.
  const i = Math.max(0, Math.min(pick, bets.length - 1))
  const bet: KingBet | undefined = bets[i]
  const executes = bets.filter((b) => b.signal === 'STREET_KING_EXECUTE').length
  const [shown, setShown] = useState(bet?.breakdown.length ?? 0)
  const [playing, setPlaying] = useState(false)
  const timer = useRef<number>(0)

  const stop = () => {
    window.clearInterval(timer.current)
    setPlaying(false)
  }
  const play = useCallback(() => {
    window.clearInterval(timer.current)
    if (!bet) return
    if (reducedMotion()) {
      setShown(bet.breakdown.length)
      return
    }
    setShown(0)
    setPlaying(true)
    let k = 0
    timer.current = window.setInterval(() => {
      k += 1
      setShown(k)
      if (k >= bet.breakdown.length) {
        window.clearInterval(timer.current)
        setPlaying(false)
      }
    }, STEP_MS)
  }, [bet])
  useEffect(() => () => window.clearInterval(timer.current), [])

  const go = (j: number) => {
    stop()
    setI(j)
    setShown(bets[j].breakdown.length)
  }

  if (!bet) return null

  return (
    <section id="king" className="sect" aria-labelledby="king-h">
      <div className="wrap">
        <div className="sect-head">
          <h2 id="king-h">The Street King, replayed</h2>
          <span className="sect-meta num">
            {summary.bets} of {model.ds.kingBetsTotal} King bets list every vote · {summary.ruleOk}/{summary.bets} calls replayed ·{' '}
            {summary.claimsOk}/{summary.claims} log claims
          </span>
        </div>
        <div className="king">
          <div className="panel king-pick">
            <div className="panel-head">
              <h3>{bets.length} recorded decisions</h3>
            </div>
            <div className="kcells" role="group" aria-label="Recorded decisions, oldest first">
              {bets.map((b, j) => (
                <button
                  key={b.id}
                  type="button"
                  aria-pressed={j === i}
                  className={`kcell ${b.signal === 'STREET_KING_EXECUTE' ? 'ex' : 'wt'} ${j === i ? 'on' : ''}`}
                  aria-label={`${shortDate(b.createdAt)}, ${b.signal === 'STREET_KING_EXECUTE' ? 'EXECUTE' : 'WAIT'}`}
                  onClick={() => go(j)}
                />
              ))}
            </div>
            <div className="kkey" aria-hidden="true">
              <span>
                <i className="ex" /> EXECUTE {executes}
              </span>
              <span>
                <i className="wt" /> WAIT {bets.length - executes}
              </span>
            </div>
            <div className="pager">
              <button type="button" className="icon-btn" aria-label="Previous decision" onClick={() => go((i - 1 + bets.length) % bets.length)}>
                ‹
              </button>
              <span className="num">
                {i + 1}/{bets.length}
              </span>
              <button type="button" className="icon-btn" aria-label="Next decision" onClick={() => go((i + 1) % bets.length)}>
                ›
              </button>
            </div>
          </div>
          <Stage model={model} bet={bet} shown={shown} playing={playing} onPlay={play} />
        </div>
      </div>
    </section>
  )
}

function Stage({
  model,
  bet,
  shown,
  playing,
  onPlay,
}: {
  model: Model
  bet: KingBet
  shown: number
  playing: boolean
  onPlay: () => void
}) {
  const r = replay(bet)
  const votes = bet.breakdown.slice(0, shown)
  const total = votes.reduce((s, v) => s + voteWeight(v), 0)
  const yes = votes.filter((v) => v.prediction === 'YES').reduce((s, v) => s + voteWeight(v), 0)
  const running = total ? yes / total : null
  const done = shown >= bet.breakdown.length
  const maxW = Math.max(...bet.breakdown.map(voteWeight))
  const checks = logChecks(bet, r)
  const ev = model.events.get(bet.eventId)
  const anchors = bet.anchors

  return (
    <div className="panel stage" aria-live="polite">
      <div className="stage-head">
        <div>
          <p className="q">{ev?.question ?? bet.eventId}</p>
          <span className="panel-meta num">
            {shortDate(bet.createdAt)} · market {p1(bet.marketProb)} YES
          </span>
        </div>
        <button type="button" className="btn primary" onClick={onPlay} disabled={playing}>
          {playing ? 'Replaying…' : 'Replay'}
        </button>
      </div>
      <div className="votes">
        <div className="vote vote-h" aria-hidden="true">
          <span>Agent</span>
          <span>Vote</span>
          <span className="r">c</span>
          <span className="r">Trust then</span>
          <span className="r">Weight</span>
          <span className="vbar-h">NO · YES</span>
        </div>
        {bet.breakdown.map((v, k) => {
          const w = voteWeight(v)
          const on = k < shown
          const anchor = anchors?.includes(v.agentId)
          return (
            <div key={v.agentId + k} className={`vote ${on ? 'in' : 'out'}`}>
              <span className="who">
                {agentName(v.agentId)}
                {anchor && <em className="anchor">anchor</em>}
              </span>
              <span className={`chip ${v.prediction === 'YES' ? 'yes' : 'no'}`}>{v.prediction}</span>
              <span className="r num">{v.confidence}</span>
              <span className="r num">{v.trustScore}</span>
              <span className="r num">{w.toFixed(1)}</span>
              <span className="vbar" aria-hidden="true">
                <span className={v.prediction === 'YES' ? 'y' : 'n'} style={{ transform: `scaleX(${on ? w / maxW : 0})` }} />
              </span>
            </div>
          )
        })}
      </div>
      <Meter running={running} market={bet.marketProb} done={done} />
      <ol className={`checks ${done ? 'in' : 'out'}`}>
        <Check ok={r.consensusMatches}>
          Consensus {p1(r.consensus)} YES = recorded {p1(bet.consensusProb)}
        </Check>
        {anchors ? (
          <Check ok={r.anchorsAgree} neutral>
            Anchors {agentName(anchors[0])} and {agentName(anchors[1])} {r.anchorsAgree ? 'both' : 'not both'} on {r.side}
          </Check>
        ) : (
          <Check ok={false} neutral>
            No anchor pair in the log
          </Check>
        )}
        <Check ok={r.gapClears} neutral>
          Gap to market {r.gapPercent.toFixed(1)} points {r.gapClears ? '≥' : '<'} {EDGE * 100}
        </Check>
        <Check ok={r.matches}>
          Call {r.decision}
          {r.decision === 'EXECUTE' ? ` ${r.side}` : ''} = recorded {r.recorded.decision}
          {r.recorded.decision === 'EXECUTE' ? ` ${r.recorded.side}` : ''}
        </Check>
      </ol>
      <div className={`klog ${done ? 'in' : 'out'}`}>
        <span className="lab">The King's log, checked against the votes</span>
        <ul>
          {checks.map((c, k) => (
            <li key={k} className={c.ok ? 'ok' : c.ok === false ? 'bad' : ''}>
              <span className="tick" aria-label={c.ok ? 'confirmed' : c.ok === false ? 'contradicted' : 'not checked'}>
                {c.ok ? '✓' : c.ok === false ? '✗' : '·'}
              </span>
              <span>
                {c.parts.map((part, j) =>
                  part.checked ? (
                    <span key={j}>{part.text}</span>
                  ) : (
                    <span key={j} className="unchecked" title="Not checked">
                      {part.text}
                    </span>
                  ),
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="klog-note">Grey text isn't checked. The EXECUTE rule is reconstructed.</p>
      </div>
    </div>
  )
}

function Check({ ok, neutral, children }: { ok: boolean; neutral?: boolean; children: React.ReactNode }) {
  return (
    <li className={ok ? 'ok' : neutral ? 'no' : 'bad'}>
      <span className="tick" aria-hidden="true">
        {ok ? '✓' : neutral ? '–' : '✗'}
      </span>
      {children}
    </li>
  )
}

function Meter({ running, market, done }: { running: number | null; market: number; done: boolean }) {
  const lo = running === null ? null : Math.min(running, market)
  const hi = running === null ? null : Math.max(running, market)
  return (
    <div className="meter" aria-hidden="true">
      <div className="meter-track">
        {lo !== null && hi !== null && done && (
          <span className="meter-gap" style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }} />
        )}
        <span className="meter-mkt" style={{ left: `${market * 100}%` }}>
          <i>market {p1(market)}</i>
        </span>
        {running !== null && (
          <span className="meter-con" style={{ left: `${running * 100}%` }}>
            <i>consensus {p1(running)}</i>
          </span>
        )}
      </div>
      <div className="meter-ax num">
        <span>0% YES</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  )
}
