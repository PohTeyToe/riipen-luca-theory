// "Rerun live": pulls the five endpoints the rescore reads from Agent Street's
// public API and checks each response against the Oct 15 pull's SHA-256.
// The API sends no CORS headers, so the page calls its own origin under /luca/,
// and vercel.json (vite.config.ts locally) forwards exactly these five paths.
import { fromApi, type RawApi, type RawPrediction } from '../engine/dataset'
import type { Dataset } from '../engine/score'
import { page } from '../data'

export const ENDPOINTS = [
  { key: 'predictions', file: 'predictions.json', path: '/api/predictions' },
  { key: 'events', file: 'events.json', path: '/api/events' },
  { key: 'kingBets', file: 'king_bets.json', path: '/api/king/bets' },
  { key: 'trustScores', file: 'trust_scores.json', path: '/api/trust-scores' },
  { key: 'calibration', file: 'calibration.json', path: '/api/analytics/calibration' },
] as const

export interface Fetched {
  path: string
  status: number
  bytes: number
  ms: number
  sameAsSnapshot: boolean | null
}

export const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

export async function sha256(text: string): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

class FetchError extends Error {
  constructor(
    message: string,
    readonly meta: Fetched,
  ) {
    super(message)
  }
}

async function fetchOne(ep: (typeof ENDPOINTS)[number], signal: AbortSignal): Promise<{ meta: Fetched; body: unknown }> {
  const t0 = performance.now()
  const res = await fetch(`/luca${ep.path}`, { signal, cache: 'no-store', headers: { Accept: 'application/json' } })
  const buf = await res.arrayBuffer()
  const ms = performance.now() - t0
  const base = { path: ep.path, status: res.status, bytes: buf.byteLength, ms, sameAsSnapshot: null }
  if (!res.ok) throw new FetchError(`HTTP ${res.status}`, base)
  let body: unknown
  try {
    body = JSON.parse(new TextDecoder().decode(buf))
  } catch {
    throw new FetchError('not JSON', base)
  }
  const known = page.sources.find((s) => s.file === ep.file)
  const sha = globalThis.crypto?.subtle ? hex(await crypto.subtle.digest('SHA-256', buf)) : null
  return { meta: { ...base, sameAsSnapshot: known && sha ? sha === known.sha256 : null }, body }
}

export interface LivePull {
  ds: Dataset
  at: string
  fetched: Fetched[]
  fetchMs: number
  parseMs: number
  /** Full prediction records, with each agent's reasoning. */
  records: RawPrediction[]
}

/** Pulls all five endpoints in parallel, reporting each as it lands, then normalises them. */
export async function pullLive(onFetched: (f: Fetched) => void, signal: AbortSignal): Promise<LivePull> {
  const t0 = performance.now()
  const results = await Promise.all(
    ENDPOINTS.map(async (ep) => {
      try {
        const r = await fetchOne(ep, signal)
        onFetched(r.meta)
        return [ep.key, r] as const
      } catch (e) {
        if (e instanceof FetchError) onFetched(e.meta)
        throw e
      }
    }),
  )
  const fetchMs = performance.now() - t0
  const bodies = Object.fromEntries(results.map(([k, r]) => [k, r.body]))
  const raw: RawApi = {
    predictions: bodies.predictions as RawPrediction[],
    events: bodies.events as RawApi['events'],
    kingBets: bodies.kingBets as RawApi['kingBets'],
    trustScores: bodies.trustScores as RawApi['trustScores'],
    calibration: bodies.calibration as RawApi['calibration'],
  }
  const at = new Date().toISOString()
  const t1 = performance.now()
  const ds = fromApi(raw, at.slice(0, 10))
  const parseMs = performance.now() - t1
  return { ds, at, fetched: results.map(([, r]) => r.meta), fetchMs, parseMs, records: raw.predictions }
}

/** Just the prediction records (for reading an agent's full reasoning). */
export async function pullPredictions(signal?: AbortSignal): Promise<RawPrediction[]> {
  const r = await fetchOne(ENDPOINTS[0], signal ?? new AbortController().signal)
  return r.body as RawPrediction[]
}
