import { useState } from 'react'
import { REPO, int, page, pulled, shortDate, type Batch } from '../data'

const plan: [string, string][] = [
  [
    'Oct 26 to 30 (check-in Oct 30)',
    'Repo access. Run this rescore against your database instead of the public API. Agree with you on how confidence should be read.',
  ],
  [
    'Nov 2 to 13',
    'A stated probability on every pick, scored with Brier and against the market price, behind a flag with these tests in your repo. Rescore Season 1 with the stopgap so Season 2 starts from corrected trust.',
  ],
  ['Nov 16 to 27', 'Per-domain trust in /api/trust-scores, used by the King behind a flag, with the thin-cell rule.'],
  ['Nov 30 to Dec 11 (spotlight Dec 11)', 'Weekly batch running again for Season 2, then a play-money dry run.'],
  ['Dec 14 to 18 (submit Dec 18)', 'Handover notes and docs.'],
]

export function PlanTable() {
  return (
    <table className="data plan-table">
      <thead>
        <tr>
          <th scope="col">Weeks</th>
          <th scope="col">What I'd do</th>
        </tr>
      </thead>
      <tbody>
        {plan.map(([when, what]) => (
          <tr key={when}>
            <th scope="row">{when}</th>
            <td>{what}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const stateLabel: Record<Batch['state'], string> = {
  full: '15 events selected',
  partial: 'Fewer than 15 selected',
  curating: 'Created, still curating',
  none: 'No batch',
}

const range = (b: Batch) => `${shortDate(b.start)} to ${shortDate(b.end)}`

function describe(b: Batch) {
  const head = `Week ${b.week}, ${range(b)}`
  if (b.state === 'none') return `${head}: no batch.`
  return `${head}: ${b.status}, ${b.selected} selected. The API reports ${int(b.eventCount ?? 0)} events and ${int(b.predictionCount ?? 0)} predictions.`
}

/** Exhibit 5. One cell per ISO week of Season 1 and after. */
export function BatchStrip() {
  const [sel, setSel] = useState<number | null>(null)
  const batches = page.batches
  const counts = batches.reduce<Record<string, number>>((acc, b) => ({ ...acc, [b.state]: (acc[b.state] ?? 0) + 1 }), {})
  const chosen = batches.find((b) => b.week === sel)

  return (
    <div className="batches">
      <div className="strip" role="group" aria-label="Weekly batches, ISO weeks 13 to 41 of 2026">
        {batches.map((b) => (
          <button
            key={b.week}
            type="button"
            className={`wk ${b.state}`}
            title={describe(b)}
            aria-label={describe(b)}
            aria-pressed={sel === b.week}
            onClick={() => setSel(sel === b.week ? null : b.week)}
          >
            {b.week}
          </button>
        ))}
      </div>
      <div className="strip-ends" aria-hidden="true">
        <span>Week {batches[0].week}, {shortDate(batches[0].start)}</span>
        <span>
          Week {batches[batches.length - 1].week}, {shortDate(batches[batches.length - 1].end)}
        </span>
      </div>
      <p className="strip-detail" aria-live="polite">
        {chosen ? describe(chosen) : 'Tap a week for its batch.'}
      </p>
      <ul className="strip-legend">
        {(['full', 'partial', 'curating', 'none'] as const).map((s) => (
          <li key={s}>
            <span className={`wk swatch ${s}`} aria-hidden="true" />
            {stateLabel[s]} <span className="muted">({counts[s] ?? 0})</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Shown only when the pull has a Gamma file that was shown to be complete (see data/SOURCES.md). */
export function SupplyLine() {
  const supply = page.supply
  if (!supply?.complete) return null
  return (
    <p className="supply">
      As of {pulled}, about {int(supply.markets)} open Polymarket markets in {int(supply.events)} events pass your
      published filters, as I read them. <a href={`${REPO}/blob/main/data/SOURCES.md#polymarket-supply-count`}>How I counted</a>.
    </p>
  )
}
