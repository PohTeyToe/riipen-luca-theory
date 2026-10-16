// "Rerun live" proxy. Agent Street's API sends no CORS headers, so the page asks
// its own origin. This forwards GET requests for exactly the five endpoints the
// rescore reads, and nothing else: only GET is exported, so other methods get 405.
const ALLOWED = new Set(['predictions', 'events', 'king/bets', 'trust-scores', 'analytics/calibration'])
const UPSTREAM = 'https://street.lucatheory.com/api/'

export async function GET(request) {
  const path = new URL(request.url).searchParams.get('path') ?? ''
  if (!ALLOWED.has(path)) return new Response('Not found', { status: 404 })
  const upstream = await fetch(UPSTREAM + path, {
    headers: { Accept: 'application/json', 'User-Agent': 'riipen-luca-theory-rescore/1.0 (read-only; github.com/PohTeyToe)' },
  })
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}
