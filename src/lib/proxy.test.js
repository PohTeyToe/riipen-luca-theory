// The "Rerun live" proxy (api/luca.js): a stalled Agent Street must end in a 504
// the page can show, not a request that hangs until the platform kills it.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from '../../api/luca.js'

const ask = (path) => GET(new Request(`https://example.test/api/luca?path=${encodeURIComponent(path)}`))

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('api/luca.js', () => {
  it('forwards an allowed path', async () => {
    const fetch = vi.fn(async () => new Response('[1]', { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)
    const res = await ask('king/bets')
    expect(fetch.mock.calls[0][0]).toBe('https://street.lucatheory.com/api/king/bets')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.text()).toBe('[1]')
  })

  it('refuses any other path', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect((await ask('batches/all')).status).toBe(404)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('gives up on a stalled upstream with a 504', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))),
    )
    const pending = ask('predictions')
    await vi.advanceTimersByTimeAsync(20000)
    const res = await pending
    expect(res.status).toBe(504)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('turns an unreachable upstream into a 504', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed')
    })
    expect((await ask('events')).status).toBe(504)
  })
})
