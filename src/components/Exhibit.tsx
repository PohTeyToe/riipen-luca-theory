import type { ReactNode } from 'react'

interface Props {
  n: number
  title: string
  source: ReactNode
  children: ReactNode
  className?: string
}

/** A numbered exhibit with its source line. The source line is also the honesty label. */
export function Exhibit({ n, title, source, children, className }: Props) {
  return (
    <figure className={`exhibit${className ? ` ${className}` : ''}`}>
      <figcaption className="exhibit-head">
        <span className="exhibit-num">Exhibit {n}</span>
        <span className="exhibit-title">{title}</span>
      </figcaption>
      {children}
      <p className="source">{source}</p>
    </figure>
  )
}

interface SectionProps {
  id: string
  n: number
  title: string
  kicker?: string
  children: ReactNode
}

export function Section({ id, n, title, kicker, children }: SectionProps) {
  return (
    <section id={id} className="section" aria-labelledby={`${id}-h`}>
      {kicker && <p className="kicker">{kicker}</p>}
      <h2 id={`${id}-h`}>
        <a className="secnum" href={`#${id}`} aria-label={`Section ${n}, link`}>
          {n}
        </a>
        {title}
      </h2>
      {children}
    </section>
  )
}
