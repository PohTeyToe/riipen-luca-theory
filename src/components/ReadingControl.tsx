import { AS_SCORED, FIXED, lossBetterBelow, pSide } from '../engine/score'
import { int } from '../lib/ui'

// The one global control: how a 1-15 confidence rating is read as the chance the
// agent's pick is right. Left end is the published reading (c / 15). Moving right
// raises the floor, the chance a rating of 0 would stand for, up to 50%
// (0.5 + c / 30), where a win always scores better than a loss.
export function ReadingControl({
  floor,
  setFloor,
  glide,
  scored,
}: {
  floor: number
  setFloor: (v: number) => void
  glide: (v: number) => void
  scored: number
}) {
  const at = (c: number) => Math.round(100 * pSide(c, floor))
  const lastLossBetter = Math.ceil(lossBetterBelow(floor)) - 1
  const isAs = floor === AS_SCORED
  const isFixed = floor === FIXED

  return (
    <div className="reading-band">
      <div className="wrap reading" role="group" aria-labelledby="reading-lab">
        <span className="lab" id="reading-lab">
          Rating → chance
        </span>
        <button type="button" className={`end ${isAs ? 'on' : ''}`} aria-pressed={isAs} onClick={() => glide(AS_SCORED)}>
          <span>Published</span>
          <code>c / 15</code>
        </button>
        <div className="slider">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(floor * 200)}
            aria-labelledby="reading-lab"
            aria-valuetext={`Floor ${Math.round(floor * 100)}%, rating 2 reads as ${at(2)}%`}
            onChange={(e) => setFloor(Number(e.target.value) / 200)}
            style={{ ['--fill' as string]: `${floor * 200}%` }}
          />
          <span className="hint">Drag to rescore all {int(scored)} bets · floor {Math.round(floor * 100)}%</span>
        </div>
        <button type="button" className={`end ${isFixed ? 'on fix' : ''}`} aria-pressed={isFixed} onClick={() => glide(FIXED)}>
          <span>50% floor</span>
          <code>0.5 + c / 30</code>
        </button>
        <output className="readout">
          <span className="ro-main">
            <span className="ro-k">Rated 2 →</span> <b className="num">{at(2)}%</b>
          </span>
          <span className={`zone ${lastLossBetter >= 1 ? 'bad' : 'good'}`}>
            {lastLossBetter >= 1 ? `A loss scores better at ${lastLossBetter === 1 ? '1' : `1–${lastLossBetter}`}` : 'A win always scores better'}
          </span>
        </output>
      </div>
    </div>
  )
}
