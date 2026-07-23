// Small shared presentational primitives. Buttons and inputs stay CSS
// classes (.btn, .well) — these are the pieces that need markup.
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

// Shaped loading placeholder; pass height/width via className.
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />
}

// Beautiful nothing: an icon, one honest line, an optional way forward.
export function EmptyState({
  icon: Icon,
  children,
  action,
}: {
  icon: LucideIcon
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="pane flex flex-col items-center gap-4 px-6 py-12 text-center">
      <Icon aria-hidden size={28} strokeWidth={1.5} className="text-muted" />
      <p className="max-w-sm text-[15px] leading-relaxed text-muted">{children}</p>
      {action}
    </div>
  )
}

// One measured number with its label.
export function StatTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="pane px-5 py-4">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 font-util text-2xl font-semibold tabular-nums text-ink">{children}</p>
    </div>
  )
}

// Keyboard hint chip.
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="key">{children}</kbd>
}
