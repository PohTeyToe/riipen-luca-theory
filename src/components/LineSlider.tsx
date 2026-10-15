import { useState } from 'react'
import { confidenceRow, int, page, score2, type Reading } from '../data'

const { line } = page
const MAX = 15
const START = 3
// The shaded part of the track covers 1..lowThreshold, where a loss scores better.
// It ends halfway between lowThreshold and the next step, as a share of the track.
const lowEnd = (line.lowThreshold + 0.5 - 1) / (MAX - 1)

function Bars({ reading, kind }: { reading: Reading; kind: 'as' | 'fixed' }) {
  return (
    <div className={`bars ${kind}`}>
      {(
        [
          ['Wins', reading.win],
          ['Loses', reading.loss],
        ] as const
      ).map(([label, value]) => (
        <div className="bar-row" key={label}>
          <span className="bar-label">{label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${value * 100}%` }} />
            <span className="coin-mark" aria-hidden="true" />
          </span>
          <span className="bar-value">{score2(value)}</span>
        </div>
      ))}
    </div>
  )
}

/** Flow step 3. The whole bug in one control: drag to 3, a win scores 0.64 and a loss 0.04. */
export function LineSlider() {
  const [c, setC] = useState(START)
  const row = confidenceRow(c)

  return (
    <div className="slider-block">
      <div className="slider-head">
        <label htmlFor="confidence">Confidence rating</label>
        <output htmlFor="confidence" className="slider-value">
          {c}
          <span> of {MAX}</span>
        </output>
      </div>
      <div className="track" style={{ ['--low' as string]: lowEnd }}>
        <span className="low-zone" aria-hidden="true" />
        <input
          id="confidence"
          type="range"
          min={1}
          max={MAX}
          step={1}
          value={c}
          onChange={(e) => setC(Number(e.target.value))}
          aria-valuetext={`${c} of ${MAX}`}
        />
      </div>
      <div className="track-scale" aria-hidden="true">
        <span>1</span>
        <span className="low-label">1 to {line.lowThreshold}: a loss scores better as scored</span>
        <span>{MAX}</span>
      </div>

      <div className="readings" aria-live="polite">
        <div className="reading">
          <p className="reading-text">
            <b className="as-label">As scored:</b> read as {row.asScored.percent}% that the pick is right.
            {row.lossScoresBetter && <span className="flag">Losing scores better</span>}
          </p>
          <Bars reading={row.asScored} kind="as" />
        </div>
        <div className="reading">
          <p className="reading-text">
            <b className="fixed-label">Fixed:</b> read as {row.fixed.percent}%.
          </p>
          <Bars reading={row.fixed} kind="fixed" />
        </div>
        <div className="bar-axis" aria-hidden="true">
          <span className="bar-label" />
          <span className="axis-track">
            <span style={{ left: '0%' }}>0</span>
            <span className="coin" style={{ left: '25%' }}>
              coin flip, 0.25
            </span>
            <span style={{ left: '100%' }}>1</span>
          </span>
          <span className="bar-value" />
        </div>
      </div>

      <p className="slider-note">
        Lower is better. Your methodology page: "Random guessing scores 0.25."
      </p>
      <p className="slider-count">
        {int(line.ratedLowOrBelow)} of the {int(line.scoredPicks)} scored bets are rated {line.lowThreshold} or lower.{' '}
        <span className="muted">
          {int(row.scoredPicks)} {row.scoredPicks === 1 ? 'was' : 'were'} rated {c}.
        </span>
      </p>
    </div>
  )
}
