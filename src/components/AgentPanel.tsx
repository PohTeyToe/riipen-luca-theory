import { useEffect, useLayoutEffect, useRef, type MouseEvent } from 'react'
import { agent, brier3, categoryLabel, longDate, ordinal, page, type SampleBet } from '../data'

const low = page.line.lowThreshold

function marketYes(p: number) {
  if (p < 0.005) return 'under 1%'
  if (p > 0.995) return 'over 99%'
  return `${Math.round(p * 100)}%`
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function Bet({ b }: { b: SampleBet }) {
  return (
    <article className="bet">
      <p className="bet-slot">{capitalise(b.slot)}</p>
      <p className="bet-q">{b.question}</p>
      <dl className="bet-meta">
        <div>
          <dt>Pick</dt>
          <dd>
            {b.side}, rated {b.confidence} of 15
          </dd>
        </div>
        <div>
          <dt>Market at entry</dt>
          <dd>YES {marketYes(b.marketProbAtEntry)}</dd>
        </div>
        <div>
          <dt>Outcome</dt>
          <dd>
            Resolved {b.resolution}, {b.won ? 'won' : 'lost'}
          </dd>
        </div>
        <div>
          <dt>Domain</dt>
          <dd>{categoryLabel[b.category]}</dd>
        </div>
      </dl>
      <div className="bet-scores">
        <span className="score as">
          As scored <b>{brier3(b.scoreAsScored)}</b>
        </span>
        <span className="score fixed">
          Fixed <b>{brier3(b.scoreFixed)}</b>
        </span>
      </div>
      <blockquote className="bet-why">
        <p className="why-label">Its reasoning, as published, {longDate(b.createdAt)}</p>
        <p>{b.reasoning}</p>
      </blockquote>
    </article>
  )
}

interface Props {
  id: string
  onClose: () => void
}

/** Clicks on the backdrop land on the dialog element itself, outside its box. */
function outside(e: MouseEvent<HTMLDialogElement>) {
  const r = e.currentTarget.getBoundingClientRect()
  return e.target === e.currentTarget && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
}

/**
 * Flow step 5. A modal dialog: side panel on wide screens, bottom sheet on phones.
 * showModal() gives the focus trap, the inert page behind it and Esc; the stylesheet
 * locks page scroll while it's open.
 */
export function AgentPanel({ id, onClose }: Props) {
  const a = agent(id)
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const body = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const d = dialog.current
    if (d && !d.open) d.showModal()
  }, [])

  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    body.current?.scrollTo({ top: 0 })
  }, [id])

  // Close the dialog first: while it's modal the page behind is inert, so focus can't go back to the row.
  const close = () => {
    dialog.current?.close()
    onClose()
  }

  const lowLine = a.lowCount === 0 ? 'none' : `${a.lowCount}`

  return (
    <dialog
      ref={dialog}
      className="panel"
      aria-labelledby="panel-h"
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      onClick={(e) => outside(e) && close()}
    >
      <div className="panel-head">
        <div>
          <p className="panel-role">{a.role}</p>
          <h3 id="panel-h" ref={heading} tabIndex={-1}>
            {a.name}
          </h3>
        </div>
        <button type="button" className="close" onClick={close}>
          Close
        </button>
      </div>
      <div className="panel-body" ref={body}>
        <p className="panel-summary">
          Rates {lowLine} of its {a.n} bets at {low} or lower. Wins {a.winPercent}%, on sides the market priced at{' '}
          {a.marketPercent}% on average.
        </p>
        <table className="data panel-stats">
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col" className="num">
                As scored
              </th>
              <th scope="col" className="num">
                Fixed
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Brier score</th>
              <td className="num">{brier3(a.brierAsScored)}</td>
              <td className="num fixed">{brier3(a.brierFixed)}</td>
            </tr>
            <tr>
              <th scope="row">Trust</th>
              <td className="num">{a.trustAsScored}</td>
              <td className="num fixed">{a.trustFixed}</td>
            </tr>
            <tr>
              <th scope="row">Rank</th>
              <td className="num">{ordinal(a.rankAsScored)}</td>
              <td className="num fixed">{ordinal(a.rankFixed)}</td>
            </tr>
          </tbody>
        </table>

        <h4 className="panel-sub">Its bets, both scores (lower is better)</h4>
        {a.sampleBets.map((b) => (
          <Bet key={b.createdAt + b.slot} b={b} />
        ))}
        <p className="panel-note">
          Chosen by rule, not by hand: its most recent bet rated {low} or lower that won, the most recent that lost, and
          the most recent rated 12 or higher.
          {a.sampleBets.length < 3 && ' Slots with no match are left out.'}
        </p>
      </div>
    </dialog>
  )
}
