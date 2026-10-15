import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../motion'
import { agent, brier3, categoryLabel, categoryShort, page, record, type Category, type Cell, type MarketCell } from '../data'

const { domains } = page
const COIN = page.line.coinFlipBrier
const THIN = Number(page.method.thinBelow)

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

type Selection = { kind: 'agent'; id: string; cat: Category } | { kind: 'market'; cat: Category } | null

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

function MarketCellView({ m, cat, selected, onSelect }: { m: MarketCell; cat: Category; selected: boolean; onSelect: () => void }) {
  const { background, dark } = fillFor(m.brier)
  return (
    <td className={`cell${m.thin ? ' thin' : ''}${dark && !m.thin ? ' dark' : ''}`} style={{ ['--fill' as string]: background }}>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        aria-label={`Market price at entry, ${categoryLabel[cat]}: Brier ${brier3(m.brier)} over ${m.events} events${m.thin ? ', thin' : ''}`}
      >
        <span className="cell-v">{brier3(m.brier)}</span>
        <span className="cell-r">
          {m.events}
          <span className="wide-only"> events</span>
        </span>
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
  if (sel.kind === 'market') {
    const m = domains.market[sel.cat]
    return (
      <>
        <p className="detail-title">Market price at entry, {categoryLabel[sel.cat]}</p>
        <dl className="detail-stats">
          <div>
            <dt>Scored events</dt>
            <dd>{m.events}</dd>
          </div>
          <div>
            <dt>Brier</dt>
            <dd>{brier3(m.brier)}</dd>
          </div>
        </dl>
        <p className="detail-note">
          One forecast per scored event: the average market price at entry across the agents' picks, scored against how it
          resolved.{m.thin && ` Under ${THIN} events, so it's thin too.`}
        </p>
      </>
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
        Blended as if it had 10 more picks at this agent's overall score ({brier3(a.brierFixed)}).
        {cell.thin && ` Under ${THIN} picks, so the blend carries most of the weight.`}
      </p>
    </>
  )
}

/** Exhibit 2. Per-domain trust as the Proof of Trust essay describes it, with thin cells left visibly thin. */
export function DomainGrid() {
  const [sel, setSel] = useState<Selection>(null)
  const detail = useRef<HTMLDivElement>(null)
  const cats = domains.categories
  const isSel = (s: Selection) => JSON.stringify(s) === JSON.stringify(sel)

  // On phones the numbers sit under the grid, often below the fold. Bring them up after a tap.
  useEffect(() => {
    const el = detail.current
    if (!sel || !el || el.getBoundingClientRect().top < window.innerHeight - 96) return
    el.scrollIntoView({ block: 'end', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
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
                  const s: Selection = { kind: 'agent', id: row.id, cat: c }
                  return (
                    <AgentCell key={c} cell={row.cells[c]} id={row.id} cat={c} selected={isSel(s)} onSelect={() => setSel(isSel(s) ? null : s)} />
                  )
                })}
              </tr>
            ))}
          </tbody>
          <tbody className="market-row">
            <tr className="rule-row" aria-hidden="true">
              <td colSpan={cats.length + 1} />
            </tr>
            <tr>
              <th scope="row">
                <span className="agent-name">Market price at entry</span>
                <span className="beat">What Season 2 has to beat</span>
              </th>
              {cats.map((c) => {
                const s: Selection = { kind: 'market', cat: c }
                return <MarketCellView key={c} m={domains.market[c]} cat={c} selected={isSel(s)} onSelect={() => setSel(isSel(s) ? null : s)} />
              })}
            </tr>
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
            <span className="swatch thin" /> under {THIN} picks, blended
          </span>
        </div>
      </div>

      <div className="domain-detail" aria-live="polite" ref={detail}>
        <Detail sel={sel} />
      </div>
    </div>
  )
}
