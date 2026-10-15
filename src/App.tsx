import { useEffect } from 'react'
import { Season } from './pages/Season'
import { Walkthrough } from './pages/Walkthrough'

// Two routes, plain links between them. vercel.json rewrites /season-1 to index.html.
const isSeason = () => window.location.pathname.replace(/\/+$/, '') === '/season-1'

export function App() {
  const season = isSeason()

  useEffect(() => {
    // Content renders after the browser's own anchor jump, so redo it once it exists.
    // A malformed fragment (say #%) makes decodeURIComponent throw; ignore it and show the page.
    let id = ''
    try {
      id = decodeURIComponent(window.location.hash.slice(1))
    } catch {
      return
    }
    if (id) document.getElementById(id)?.scrollIntoView()
  }, [season])

  return season ? <Season /> : <Walkthrough />
}
