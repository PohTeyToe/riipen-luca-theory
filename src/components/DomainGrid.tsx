import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../motion'
import { agent, brier3, categoryLabel, categoryShort, page, record, signed, type Category, type Cell } from '../data'

const { domains } = page
const COIN = page.line.coinFlipBrier
const THIN = Number(page.method.thinBelow)
const PRIOR = Number(page.method.prior)

// Diverging fill around the coin flip. Blue reaches full strength at 0.10, orange at 0.65:
// the observed spread is wider on the bad side, so each half gets its own range.
const BEST = 0.1
const WORST = 0.65
const BLUE = 'var(--fixed)'
const WARM = 'var(--warm)'
const NEUTRAL = 'var(--cell-neutral)'
const LEGEND_STEPS = [0.1, 0.15, 0.2, 0.25, 0.35, 0.45, 0.55, 0.65]

export function fillFor(brier: number) {
  const better = brier <= COIN
  const t = better ? (COIN - brier) / (COIN - BEST) : (brier - COIN) / (WORST - COIN)
  const amount = Math.round(Math.max(0, Math.min(1, t)) * (better ? 88 : 80))
  return {
    background: `color-mix(in oklch, ${better ? BLUE : WARM} ${amount}%, ${NEUTRAL})`,
    // Paper text only where it clears 4.5:1; the orange half stays light enough for ink throughout.
    dark: better && amount >= 72,
  }
}

type Selection = { id: string; cat: Category } | null

function AgentCell({ cell, id, cat, selected, onSelect }: { cell: Cell; id: string; cat: Category; selected: boolean; onSelect: () => void }) {
  const a = agent(id)
  if (cell.n === 0 || cell.blendedBrier === null) {
    return (
      <td className="cell none">
        <button type="button" aria-pressed={selected} onClick={onSelect} aria-label={`${a.name}, ${categoryLabel[cat]}: no picks`}>
          <span className="cell-v">no picks</span>
        </button>
      </td>
    )
  }
  const { background, dark } = fillFor(cell.blendedBrier)
  return (
    <td className={`cell${cell.thin ? ' thin' : ''}${dark && !cell.thin ? ' dark' : ''}`} style={{ ['--fill' as string]: background }}>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        aria-label={`${a.name}, ${categoryLabel[cat]}: blended Brier ${brier3(cell.blendedBrier)}, ${cell.wins} won ${cell.losses} lost${cell.thin ? ', thin' : ''}`}
      >
        <span className="cell-v">{brier3(cell.blendedBrier)}</span>
        <span className="cell-r">{record(cell.wins, cell.losses)}</span>
      </button>
    </td>
  )
}

function Detail({ sel }: { sel: Selection }) {
  if (!sel) {
    return (
      <p className="detail-empty">
        Tap a cell for its numbers. Try the SBF agent's geopolitics cell, then the Wood agent's crypto cell.
      </p>
    )
  }
  const row = domains.grid.find((g) => g.id === sel.id)!
  const cell = row.cells[sel.cat]
  const a = agent(sel.id)
  if (cell.n === 0 || cell.blendedBrier === null || cell.rawBrier === null) {
    return (
      <>
        <p className="detail-title">
          {a.name}, {categoryLabel[sel.cat]}
        </p>
        <p className="detail-note">No scored picks in this domain, so there's nothing to blend.</p>
      </>
    )
  }
  return (
    <>
      <p className="detail-title">
        {a.name}, {categoryLabel[sel.cat]}
      </p>
      <dl className="detail-stats">
        <div>
          <dt>Picks</dt>
          <dd>{cell.n}</dd>
        </div>
        <div>
          <dt>Won–lost</dt>
          <dd>{record(cell.wins, cell.losses)}</dd>
        </div>
        <div>
          <dt>Raw Brier</dt>
          <dd>{brier3(cell.rawBrier)}</dd>
        </div>
        <div>
          <dt>Blended Brier</dt>
          <dd>{brier3(cell.blendedBrier)}</dd>
        </div>
        <div>
          <dt>Cell trust</dt>
          <dd>{cell.trust}</dd>
        </div>
      </dl>
      <p className="detail-note">
        Blended as if it had {PRIOR} more picks at this agent's overall score ({brier3(a.brierFixed)}).
        {cell.thin && ` Under ${THIN} picks, so the blend carries most of the weight.`}
      </p>
      <p className="detail-note">
        Against the market: won {cell.wonPercent}% on sides priced at {cell.marketPercent}%.{' '}
        {cell.gapPoints === null || cell.luckPoints === null
          ? `Under ${THIN} picks, so no luck range.`
          : `${signed(cell.gapPoints)} points; luck alone covers ${cell.luckPoints.toFixed(1)} either way on these ${cell.n}.`}
      </p>
    </>
  )
}

/** Exhibit 4. Per-domain trust as the Proof of Trust essay describes it, with thin cells left visibly thin. */
export function DomainGrid() {
  const [sel, setSel] = useState<Selection>(null)
  const detail = useRef<HTMLDivElement>(null)
  const cats = domains.categories
  const isSel = (s: Selection) => JSON.stringify(s) === JSON.stringify(sel)

  // On phones the numbers sit under the grid, often past the fold. Bring all of them into view after a tap.
  useEffect(() => {
    const el = detail.current
    if (!sel || !el || el.getBoundingClientRect().bottom <= window.innerHeight) return
    el.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [sel])

  return (
    <div className="domain">
      <div className="domain-main">
        <table className="grid">
          <thead>
            <tr>
              <th scope="col" className="grid-corner">
                <span className="sr-only">Agent</span>
              </th>
              {cats.map((c) => (
                <th scope="col" key={c}>
                  <abbr title={categoryLabel[c]} className="narrow-only">
                    {categoryShort[c]}
                  </abbr>
                  <span className="wide-only">{categoryLabel[c]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {domains.grid.map((row) => (
              <tr key={row.id}>
                <th scope="row">
                  <span className="agent-name">{row.name}</span>
                </th>
                {cats.map((c) => {
                  const s: Selection = { id: row.id, cat: c }
                  return (
                    <AgentCell key={c} cell={row.cells[c]} id={row.id} cat={c} selected={isSel(s)} onSelect={() => setSel(isSel(s) ? null : s)} />
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="grid-legend" aria-hidden="true">
          <span
            className="ramp-wrap"
            style={{ ['--steps' as string]: LEGEND_STEPS.length, ['--coin-step' as string]: LEGEND_STEPS.indexOf(COIN) + 1 }}
          >
            <span className="ramp">
              {LEGEND_STEPS.map((b) => (
                <span key={b} style={{ background: fillFor(b).background }} />
              ))}
            </span>
            <span className="ramp-labels">
              <span>{BEST.toFixed(2)}, better</span>
              <span>coin flip, {COIN}</span>
              <span>worse, {WORST.toFixed(2)}</span>
            </span>
          </span>
          <span className="thin-key">
            <span className="swatch thin" /> under {THIN} picks
          </span>
        </div>
      </div>

      <div className="domain-detail" aria-live="polite" ref={detail}>
        <Detail sel={sel} />
      </div>
    </div>
  )
}
