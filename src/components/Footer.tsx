import type { ReactNode } from 'react'
import { OWNER, pulled } from '../data'

/** Shared footer. A page can pass its own small print instead of the default line. */
export function Footer({ children }: { children?: ReactNode }) {
  return (
    <footer className="footer">
      <div className="wrap">
        <p>
          {children ?? (
            <>
              Built by {OWNER.name} from Agent Street's public API, pulled {pulled}. Play money. Not affiliated with or
              endorsed by LUCA Theory. Happy to take it down: <a href={`mailto:${OWNER.email}`}>{OWNER.email}</a>.
            </>
          )}
        </p>
      </div>
    </footer>
  )
}
