// Shared layout + submit/error handling for Login and Register: a split
// shell — brand panel with a small live instrument on the left (lg+), a
// glass auth pane on the right. Component APIs (AuthCard/Field/Choice) are
// unchanged so the pages keep their exact handlers and payloads.
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, Sparkles, Target, TrendingUp } from 'lucide-react'
import Ambient from './Ambient'
import { Enter } from './Motion'
import { Notice, Wordmark } from './Shell'
import { DriftingGauge } from './Tape'

const BULLETS: [typeof Target, string][] = [
  [Target, 'Placed on a 0–100 scale, not guessed at'],
  [Sparkles, 'Every test built for your level'],
  [TrendingUp, 'Mastery that moves as you do'],
]

export function AuthCard({
  title,
  standfirst,
  error,
  submitting,
  submitLabel,
  onSubmit,
  footer,
  children,
}: {
  title: string
  standfirst: string
  error: string | null
  submitting: boolean
  submitLabel: string
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  footer: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      <Ambient />

      {/* Brand panel — just enough of the instrument to feel premium. */}
      <div className="hidden w-1/2 flex-col justify-between border-r border-rule p-12 lg:flex">
        <Wordmark />
        <div>
          <div className="max-w-xs">
            <DriftingGauge caption="A student's live mastery level" />
          </div>
          <ul className="mt-12 space-y-5">
            {BULLETS.map(([Icon, text]) => (
              <li key={text} className="flex items-center gap-3 text-[15px] text-muted">
                <Icon aria-hidden size={16} strokeWidth={1.75} className="shrink-0 text-signal" />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <Link to="/welcome" className="eyebrow transition-colors hover:text-signal">
          See how AdaptIQ works →
        </Link>
      </div>

      {/* Auth pane. */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <Enter className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Wordmark />
          </div>
          <div className="pane px-7 py-9 sm:px-9">
            <h1 className="font-display expanded text-3xl font-extrabold leading-[1.05] tracking-tight text-ink">
              {title}
            </h1>
            <p className="mt-3 text-[16px] leading-relaxed text-muted">{standfirst}</p>

            <form onSubmit={onSubmit} className="mt-8 space-y-4">
              {error && <Notice>{error}</Notice>}
              {children}
              <button type="submit" disabled={submitting} className="btn btn-solid w-full py-3">
                {submitting ? 'Working…' : submitLabel}
              </button>
            </form>
          </div>
          <p className="mt-6 text-center text-sm text-muted">{footer}</p>
          <p className="mt-3 text-center lg:hidden">
            <Link to="/welcome" className="eyebrow transition-colors hover:text-signal">
              See how AdaptIQ works →
            </Link>
          </p>
        </Enter>
      </div>
    </div>
  )
}

// Floating-label input. Password fields get a visibility toggle — pure
// presentation, the submitted value is untouched.
export function Field({
  label,
  hint,
  type,
  ...inputProps
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'
  const Toggle = show ? EyeOff : Eye

  return (
    <label className="relative block">
      <input
        {...inputProps}
        type={isPassword && show ? 'text' : type}
        placeholder=" "
        className={`peer well w-full px-3.5 pb-2 pt-6 text-[15px] text-ink outline-none ${
          isPassword ? 'pr-11' : ''
        }`}
      />
      <span className="pointer-events-none absolute left-3.5 top-[17px] font-util text-[11px] uppercase tracking-[0.14em] text-muted transition-all duration-150 peer-focus:top-[7px] peer-focus:text-[9px] peer-focus:text-signal peer-[:not(:placeholder-shown)]:top-[7px] peer-[:not(:placeholder-shown)]:text-[9px]">
        {label}
      </span>
      {isPassword && (
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted transition-colors hover:text-ink"
        >
          <Toggle aria-hidden size={16} strokeWidth={1.75} />
        </button>
      )}
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-muted">{hint}</span>}
    </label>
  )
}

export function Choice({
  label,
  ...selectProps
}: { label: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block">
      <span className="eyebrow mb-2 block">{label}</span>
      <select {...selectProps} className="well w-full px-3 py-2.5 text-[15px] text-ink outline-none" />
    </label>
  )
}

// Post-login moment: the instrument warms up before the dashboard fades in.
// Shown for ~800ms by Login (skipped under reduced motion) — same auth call,
// same destination, a delayed navigate only.
export function CalibrationOverlay({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-face"
    >
      <Wordmark />
      <p className="font-util text-xs uppercase tracking-[0.14em] text-muted">{message}</p>
      <span className="h-1 w-56 overflow-hidden rounded-full bg-rule" aria-hidden>
        <span
          className="tick-lit block h-full rounded-full bg-signal text-signal"
          style={{ animation: 'calibrate .8s ease-out forwards' }}
        />
      </span>
    </div>
  )
}
