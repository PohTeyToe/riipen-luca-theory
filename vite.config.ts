import { defineConfig, type Plugin, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

// Link previews (LinkedIn, email clients) need an absolute og:image URL.
// Vercel sets VERCEL_PROJECT_PRODUCTION_URL at build time; SITE_URL overrides it.
// Locally the tag stays relative, which is fine for a preview server.
function absoluteOgImage(): Plugin {
  const host = process.env.SITE_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL
  const origin = host ? (host.startsWith('http') ? host : `https://${host}`).replace(/\/$/, '') : ''
  return {
    name: 'absolute-og-image',
    transformIndexHtml: (html) => html.replaceAll('%SITE_ORIGIN%', origin),
  }
}

// Agent Street's API sends no CORS headers, so "Rerun live" calls this site's own
// origin under /luca/ and the server forwards GET and HEAD for exactly these five paths
// (in production, vercel.json sends them to api/luca.js, which does the same).
const luca: Record<string, ProxyOptions> = {
  '^/luca/api/(predictions|events|king/bets|trust-scores|analytics/calibration)$': {
    target: 'https://street.lucatheory.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/luca/, ''),
    bypass: (req) => (req.method === 'GET' || req.method === 'HEAD' ? undefined : false),
  },
}

export default defineConfig({
  plugins: [react(), absoluteOgImage()],
  // The main chunk carries data/snapshot.json (every pick the page rescores), about 150 kB gzipped.
  build: { chunkSizeWarningLimit: 1100 },
  server: { port: 5104, strictPort: true, proxy: luca },
  preview: { port: 5104, strictPort: true, proxy: luca },
})
