import { useLayoutEffect, useRef, useState } from 'react'
import { brier3, page, record, type Agent } from '../data'
import { prefersReducedMotion } from '../motion'

export type RankMode = 'asScored' | 'fixed'

const AXIS_MAX = 0.7
const x = (brier: number) => `${(Math.min(brier, AXIS_MAX) / AXIS_MAX) * 100}%`
const coin = x(page.line.coinFlipBrier)

function Dumbbell({ a }: { a: Agent }) {
  const lo = Math.min(a.brierAsScored, a.brierFixed)
  const hi = Math.max(a.brierAsScored, a.brierFixed)
  return (
    <span className="dumbbell" aria-hidden="true">
      <span className="coin-line" style={{ left: coin }} />
      <span className="db-link" style={{ left: x(lo), width: `calc(${x(hi)} - ${x(lo)})` }} />
      <span className="dot as" style={{ left: x(a.brierAsScored) }} />
      <span className="dot fixed" style={{ left: x(a.brierFixed) }} />
    </span>
  )
}

interface Props {
  selected: string | null
  onOpen: (id: string, from: HTMLElement) => void
}

/** Exhibit 1. Ranked by trust; the toggle reorders rows with a FLIP move so each agent's shift is visible. */
export function Scorecard({ selected, onOpen }: Props) {
  const [mode, setMode] = useState<RankMode>('asScored')
  const rowRefs = useRef(new Map<string, HTMLLIElement>())
  const before = useRef<Map<string, number> | null>(null)

  const rankOf = (a: Agent) => (mode === 'fixed' ? a.rankFixed : a.rankAsScored)
  const rows = [...page.scorecard].sort((p, q) => rankOf(p) - rankOf(q))

  const switchTo = (next: RankMode) => {
    if (next === mode) return
    before.current = new Map([...rowRefs.current].map(([id, el]) => [id, el.getBoundingClientRect().top]))
    setMode(next)
  }

  useLayoutEffect(() => {
    const first = before.current
    before.current = null
    if (!first || prefersReducedMotion()) return
    for (const [id, el] of rowRefs.current) {
      const dy = (first.get(id) ?? 0) - el.getBoundingClientRect().top
      if (Math.abs(dy) < 1) continue
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], {
        duration: 240,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      })
    }
  }, [mode])

  return (
    <div className="scorecard">
      <div className="toggle-row">
        <span className="toggle-label" id="rank-by">
          Rank by trust:
        </span>
        <div className="segmented" role="group" aria-labelledby="rank-by">
          <button type="button" aria-pressed={mode === 'asScored'} onClick={() => switchTo('asScored')}>
            As scored
          </button>
          <button type="button" aria-pressed={mode === 'fixed'} onClick={() => switchTo('fixed')}>
            Fixed
          </button>
        </div>
        <span className="legend" aria-hidden="true">
          <span className="key">
            <span className="dot as" /> as scored
          </span>
          <span className="key">
            <span className="dot fixed" /> fixed
          </span>
        </span>
      </div>

      <div className="sc-head" aria-hidden="true">
        <span className="sc-rank">#</span>
        <span className="sc-agent">Agent</span>
        <span className="sc-win">Won</span>
        <span className="sc-brier">Brier score</span>
        <span className="sc-axis">
          <span style={{ left: '0%' }}>0</span>
          <span className="coin" style={{ left: coin }}>
            <span className="wide-only">coin flip, </span>
            {page.line.coinFlipBrier}
          </span>
          <span style={{ left: x(0.5) }}>0.5</span>
          <span style={{ left: '100%' }}>0.7</span>
        </span>
        <span className="sc-trust">Trust</span>
      </div>

      <ol className="sc-rows">
        {rows.map((a) => {
          const rank = rankOf(a)
          const moved = mode === 'fixed' && a.rankFixed !== a.rankAsScored
          return (
            <li
              key={a.id}
              ref={(el) => {
                if (el) rowRefs.current.set(a.id, el)
                else rowRefs.current.delete(a.id)
              }}
            >
              <button
                type="button"
                className={`sc-row${selected === a.id ? ' is-open' : ''}`}
                onClick={(e) => onOpen(a.id, e.currentTarget)}
                aria-label={`${rank}. ${a.name}, ${a.role}. Wins ${a.winPercent}%, ${a.wins} won ${a.losses} lost. Brier ${brier3(a.brierAsScored)} as scored, ${brier3(a.brierFixed)} fixed. Trust ${a.trustAsScored} as scored, ${a.trustFixed} fixed. Show its bets.`}
              >
                <span className="sc-rank">
                  <span className="rank-now">{rank}</span>
                  {moved && <span className="rank-was">was {a.rankAsScored}</span>}
                </span>
                <span className="sc-agent">
                  <span className="agent-name">{a.name}</span>
                  <span className="agent-role">{a.role}</span>
                </span>
                <span className="sc-win">
                  <span className="win-pct">{a.winPercent}%</span>
                  <span className="win-rec">{record(a.wins, a.losses)}</span>
                </span>
                <span className="sc-brier">
                  <span className="v-as">{brier3(a.brierAsScored)}</span>
                  <span className="arrow">→</span>
                  <span className="v-fixed">{brier3(a.brierFixed)}</span>
                </span>
                <span className="sc-axis">
                  <Dumbbell a={a} />
                </span>
                <span className="sc-trust">
                  <span className="v-as">{a.trustAsScored}</span>
                  <span className="arrow">→</span>
                  <span className="v-fixed">{a.trustFixed}</span>
                </span>
                <svg className="chevron right" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M4.5 3 7.5 6 4.5 9" />
                </svg>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
