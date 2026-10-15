import { defineConfig, type Plugin } from 'vite'
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

export default defineConfig({
  plugins: [react(), absoluteOgImage()],
  server: { port: 5104, strictPort: true },
  preview: { port: 5104, strictPort: true },
})
