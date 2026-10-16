import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { halfUp } from '../engine/score'

export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** A number state that can glide to a target (ease-out-quart) or jump. */
export function useTween(initial: number) {
  const [value, setValue] = useState(initial)
  const frame = useRef(0)
  const current = useRef(initial)
  current.current = value
  const stop = () => cancelAnimationFrame(frame.current)
  const set = useCallback((v: number) => {
    stop()
    setValue(v)
  }, [])
  const glide = useCallback((target: number, ms = 650) => {
    stop()
    const from = current.current
    if (reducedMotion() || from === target) {
      setValue(target)
      return
    }
    const t0 = performance.now()
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      const e = 1 - (1 - k) ** 4
      // Land exactly on the target so the ends use their exact formulas.
      setValue(k === 1 ? target : from + (target - from) * e)
      if (k < 1) frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
  }, [])
  useEffect(() => stop, [])
  return [value, set, glide] as const
}

/** Width of an element, kept current with a ResizeObserver. */
export function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

export const f3 = (x: number) => halfUp(x, 3).toFixed(3)
export const f1 = (x: number) => halfUp(x, 1).toFixed(1)
export const pctText = (x: number) => `${halfUp(100 * x)}%`
// Formatters are built once: toLocaleString with a locale builds a new one on every
// call, which costs about 0.1 ms each, and the King's grid alone makes 89 per render.
const INT = new Intl.NumberFormat('en-US')
const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export const int = (x: number) => INT.format(x)
export const signed = (x: number, digits = 1) => {
  const v = halfUp(x, digits)
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`
}

/** Agent Street colours a Brier score green under 0.2, amber under 0.3, red from 0.3. */
export const brierTone = (b: number) => (b < 0.2 ? 'good' : b < 0.3 ? 'mid' : 'bad')

export const pickKey = (p: { agentId: string; eventId: string; createdAt: string }) =>
  `${p.agentId}|${p.eventId}|${p.createdAt}`

/** "Oct 15, 2026" (UTC). A bad date reads "Invalid Date", as toLocaleDateString did,
 *  instead of throwing. */
export function shortDate(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'Invalid Date' : DAY.format(d)
}

/** A measured time: "<0.1 ms", "2.4 ms", "312 ms", "1.24 s". */
export function msText(ms: number) {
  if (ms < 0.1) return '<0.1 ms'
  if (ms < 10) return `${ms.toFixed(1)} ms`
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

/** A run length: "48 s", "5 m 06 s". */
export function duration(ms: number) {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  return `${Math.floor(s / 60)} m ${String(s % 60).padStart(2, '0')} s`
}

/** "06:31 UTC" from an ISO time. */
export function clock(iso: string) {
  return `${new Date(iso).toISOString().slice(11, 16)} UTC`
}
