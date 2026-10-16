// The cached formatters must print exactly what toLocaleString / toLocaleDateString
// printed before, for every date and count the page shows.
import { describe, expect, it } from 'vitest'
import snapshotJson from '../../data/snapshot.json'
import type { Dataset } from '../engine/score'
import { int, shortDate } from './ui'

const ds = snapshotJson as unknown as Dataset
const old = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

describe('formatters', () => {
  it('shortDate matches toLocaleDateString on every snapshot date', () => {
    const dates = [...ds.picks.map((p) => p.createdAt), ...ds.kingBets.map((b) => b.createdAt), `${ds.pullDate}T12:00:00Z`]
    for (const iso of dates) expect(shortDate(iso)).toBe(old(iso))
  })

  it('shortDate reads a bad date as "Invalid Date" instead of throwing', () => {
    expect(shortDate('')).toBe(old(''))
    expect(shortDate('not a date')).toBe('Invalid Date')
  })

  it('int matches toLocaleString', () => {
    for (const x of [0, 7, 893, 2571, 1676545, -3]) expect(int(x)).toBe(x.toLocaleString('en-US'))
  })
})
