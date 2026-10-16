// The committed inputs. data/snapshot.json is the subset of the Oct 15 pull the
// scoring needs; the page rescores it in the browser with src/engine. data/page.json
// is rescore.py's output: agent names, source hashes and the numbers the engine is
// tested against. data/reader-run.json is the recorded reader run (analysis/reader.py),
// loaded after first paint.
import snapshotJson from '../data/snapshot.json'
import { proof, sources } from '../data/page.json'
import readerRunUrl from '../data/reader-run.json?url'
import type { ReaderRun } from './engine/reader'
import type { Dataset } from './engine/score'
import { shortDate } from './lib/ui'

export const snapshot = snapshotJson as unknown as Dataset

export interface Source {
  file: string
  url: string
  retrievedAt: string
  bytes: number
  sha256: string
}

interface PageData {
  sources: Source[]
  proof: { rows: { id: string; name: string; role: string }[] }
}

export const page = { proof, sources } as unknown as PageData

export const AGENT_META = new Map(page.proof.rows.map((r) => [r.id, { name: r.name, role: r.role }]))
export const agentName = (id: string) => AGENT_META.get(id)?.name ?? id
export const agentRole = (id: string) => AGENT_META.get(id)?.role ?? ''

/** Fetched as plain JSON, which parses faster than the same data as a script chunk.
 *  A failed or stalled load is retried twice before the page says so. */
export async function loadReaderRun(): Promise<ReaderRun> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(readerRunUrl, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as ReaderRun
    } catch (e) {
      if (attempt === 3) throw e
      await new Promise((r) => setTimeout(r, 1000 * attempt))
    }
  }
}

export const RUN_FAILED = 'Couldn’t load the recorded run. Reload the page to try again.'

export const REPO = 'https://github.com/PohTeyToe/riipen-luca-theory'
export const EMAIL = 'abdalsf5@gmail.com'
export const STREET = 'https://street.lucatheory.com'

/** "Oct 15, 2026" from "2026-10-15" (UTC, so no timezone shifts the day). */
export const longDate = (iso: string) => shortDate(iso.length === 10 ? `${iso}T12:00:00Z` : iso)

export const pulled = longDate(snapshot.pullDate)
