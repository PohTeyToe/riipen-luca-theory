// The committed inputs. data/snapshot.json is the subset of the Oct 15 pull the
// scoring needs; the page rescores it in the browser with src/engine. data/page.json
// is rescore.py's output: agent names, source hashes and the numbers the engine is
// tested against. data/reader-run.json is the recorded reader run (analysis/reader.py),
// loaded after first paint.
import snapshotJson from '../data/snapshot.json'
import { proof, sources } from '../data/page.json'
import type { ReaderRun } from './engine/reader'
import type { Dataset } from './engine/score'

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

export const loadReaderRun = () => import('../data/reader-run.json').then((m) => m.default as unknown as ReaderRun)

export const REPO = 'https://github.com/PohTeyToe/riipen-luca-theory'
export const EMAIL = 'abdalsf5@gmail.com'
export const STREET = 'https://street.lucatheory.com'

/** "Oct 15, 2026" from "2026-10-15" (UTC, so no timezone shifts the day). */
export function longDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export const pulled = longDate(snapshot.pullDate)
