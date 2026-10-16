import { useLayoutEffect, useRef } from 'react'
import { agentName, agentRole } from '../data'
import { AS_SCORED, type AgentScore, halfUp } from '../engine/score'
import { brierTone, f3, reducedMotion } from '../lib/ui'

// LUCA's trust ranking, recomputed for the current reading. Rows re-sort with a
// FLIP animation (transform only); DOM order always matches the visible order.
export function Ranking({
  scores,
  floor,
  selected,
  onSelect,
}: {
  scores: AgentScore[]
  floor: number
  selected: string
  onSelect: (id: string) => void
}) {
  const list = useRef<HTMLOListElement>(null)
  const order = useRef<string[]>([])

  // Rows are a fixed height, so a row that moved from index `was` to `i` moved
  // (was - i) rows. Layout is read only when the order changes, not on every step of a drag.
  useLayoutEffect(() => {
    const ids = scores.map((s) => s.id)
    const prev = order.current
    order.current = ids
    const el = list.current
    if (!el || !prev.length || ids.join() === prev.join() || reducedMotion()) return
    const rows = [...el.querySelectorAll<HTMLElement>('[data-id]')]
    if (rows.length < 2) return
    const pitch = rows[1].offsetTop - rows[0].offsetTop
    const moves: [HTMLElement, number][] = []
    rows.forEach((r, i) => {
      const was = prev.indexOf(r.dataset.id!)
      if (was >= 0 && was !== i) moves.push([r, (was - i) * pitch])
    })
    for (const [r, dy] of moves) {
      r.style.transition = 'none'
      r.style.transform = `translateY(${dy}px)`
    }
    void el.offsetHeight
    for (const [r] of moves) {
      r.style.transition = ''
      r.style.transform = ''
    }
  }, [scores])

  const moved = scores.filter((s) => s.rank !== s.rankAsScored).length
  return (
    <section id="scorecard" className="panel ranking" aria-labelledby="ranking-h">
      <div className="panel-head">
        <h2 id="ranking-h">Trust ranking</h2>
        <span className="panel-meta">{floor === AS_SCORED ? 'Matches Agent Street' : `${moved} of 10 agents move`}</span>
      </div>
      <div className="rank-cols" aria-hidden="true">
        <span>#</span>
        <span>Agent</span>
        <span className="r wl">W–L</span>
        <span className="r">Brier</span>
        <span className="r tr">Trust</span>
        <span className="r">Move</span>
      </div>
      <ol className="rank-list" ref={list}>
        {scores.map((s) => {
          const move = s.rankAsScored - s.rank
          const t = halfUp(s.trust)
          return (
            <li key={s.id} data-id={s.id} className={s.id === selected ? 'sel' : ''}>
              <button
                type="button"
                aria-pressed={s.id === selected}
                aria-label={`${s.rank}. ${agentName(s.id)}, Brier ${f3(s.brier)}, trust ${t}${move ? `, ${move > 0 ? 'up' : 'down'} ${Math.abs(move)}` : ''}`}
                onClick={() => onSelect(s.id)}
              >
                <span className="rk num">{s.rank}</span>
                <span className="who">
                  <span className="nm">{agentName(s.id)}</span>
                  <span className="rl">{agentRole(s.id)}</span>
                </span>
                <span className="num r wl">
                  {s.wins}–{s.n - s.wins}
                </span>
                <span className={`num r br ${brierTone(s.brier)}`}>{f3(s.brier)}</span>
                <span className="trust">
                  <span className="bar" aria-hidden="true">
                    <span style={{ transform: `scaleX(${Math.max(0, Math.min(1, s.trust / 100))})` }} />
                  </span>
                  <span className="num tv">{t}</span>
                </span>
                <span className={`num r mv ${move > 0 ? 'up' : move < 0 ? 'down' : ''}`}>
                  {move > 0 ? `▲ ${move}` : move < 0 ? `▼ ${-move}` : '–'}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
