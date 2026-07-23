import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Ambient from './Ambient'
import { Enter } from './Motion'

// The wordmark carries the same graduation motif as every tape in the app —
// the centre tick is the lit one.
export function Wordmark({ context }: { context?: string }) {
  return (
    <span className="flex items-baseline gap-2.5">
      <span className="font-display expanded text-[15px] font-extrabold tracking-tight text-ink">
        AdaptIQ
      </span>
      <span aria-hidden className="flex items-end gap-[3px] pb-px">
        <span className="h-1.5 w-0.5 bg-rule" />
        <span className="h-2.5 w-0.5 bg-rule" />
        <span className="tick-lit h-4 w-0.5 bg-signal text-signal" />
        <span className="h-2.5 w-0.5 bg-rule" />
        <span className="h-1.5 w-0.5 bg-rule" />
      </span>
      {context && <span className="eyebrow">{context}</span>}
    </span>
  )
}

// Shared page frame: a glass instrument rail floating over the void.
// The rail is blur budget surface #1 of 2.
export default function Shell({
  context,
  right,
  rail,
  wide = false,
  children,
}: {
  context?: string
  /** Trailing control in the rail — a log-out button or a back link. */
  right?: ReactNode
  /** Optional second row of the rail, e.g. the quiz progress tape. */
  rail?: ReactNode
  wide?: boolean
  children: ReactNode
}) {
  return (
    <div className="min-h-screen">
      <Ambient />
      <header className="glass sticky top-0 z-10 border-b border-rule">
        <div
          className={`mx-auto flex ${wide ? 'max-w-3xl' : 'max-w-2xl'} items-center justify-between gap-4 px-6 py-3.5`}
        >
          <Wordmark context={context} />
          {right}
        </div>
        {rail && (
          <div className={`mx-auto ${wide ? 'max-w-3xl' : 'max-w-2xl'} px-6 pb-3`}>{rail}</div>
        )}
      </header>
      <Enter>
        <main className={`mx-auto ${wide ? 'max-w-3xl' : 'max-w-2xl'} px-6 pb-20 pt-10`}>
          {children}
        </main>
      </Enter>
    </div>
  )
}

export function RailLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="eyebrow transition-colors hover:text-signal">
      {children}
    </Link>
  )
}

export function RailButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="eyebrow cursor-pointer transition-colors hover:text-signal">
      {children}
    </button>
  )
}

// Page title + optional standfirst. One place so the type scale stays honest.
export function PageHead({ title, note }: { title: string; note?: ReactNode }) {
  return (
    <>
      <h1 className="font-display expanded text-3xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-4xl">
        {title}
      </h1>
      {note && <p className="mt-3 max-w-prose text-[16px] leading-relaxed text-muted">{note}</p>}
    </>
  )
}

// Section heading: label, hairline, optional control.
export function SectionHead({ label, aside }: { label: string; aside?: ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <span className="eyebrow shrink-0">{label}</span>
      <span className="rule grow" />
      {aside}
    </div>
  )
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-r-lg border-l-2 border-hard bg-hard/10 px-4 py-3 font-util text-xs leading-relaxed text-hard"
    >
      {children}
    </p>
  )
}

// Quiet one-liner for inline empty notes (fetch loading uses Skeleton now).
export function Quiet({ children }: { children: ReactNode }) {
  return <p className="font-util text-xs text-muted">{children}</p>
}
