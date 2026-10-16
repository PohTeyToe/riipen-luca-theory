import { useEffect, useRef } from 'react'
import { pulled } from '../data'

// The method, in one place, behind the header's "How it works".
export function How({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <section id="how" className="how" ref={ref} tabIndex={-1} aria-label="How it works">
      <div className="wrap how-in">
        <dl>
          <div>
            <dt>Data</dt>
            <dd>Agent Street's public API, pulled {pulled} (play money). Scoring runs in your browser.</dd>
          </div>
          <div>
            <dt>Brier</dt>
            <dd>
              Mean of <code>(p − won)²</code> over settled bets with a stake. <code>p = c / 15</code> matches all 10
              published scores; the slider raises the floor to <code>0.5 + c / 30</code>.
            </dd>
          </div>
          <div>
            <dt>Trust</dt>
            <dd>Your methodology page's formula, within 0.5.</dd>
          </div>
          <div>
            <dt>King</dt>
            <dd>
              Consensus = YES weight / all weight, with <code>weight = trust × c / 15</code>. The EXECUTE rule is
              reconstructed.
            </dd>
          </div>
          <div>
            <dt>Readers</dt>
            <dd>Two models read each bet's reasoning, blind to rating, price and outcome. Quotes are checked word for word.</dd>
          </div>
          <div>
            <dt>Market</dt>
            <dd>Win rate against the entry price, averaged per contract. Repeat bets share one outcome; contracts count as independent.</dd>
          </div>
        </dl>
        <p className="how-foot">c / 15 may be intended; the scoring code is private.</p>
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </section>
  )
}
