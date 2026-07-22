import type { FormEvent, ReactNode } from 'react'
import { Notice, Wordmark } from './Shell'

// Shared layout + submit/error handling for Login and Register.
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
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <Wordmark />
        <h1 className="mt-8 font-display expanded text-3xl font-extrabold leading-[1.05] tracking-tight text-ink">
          {title}
        </h1>
        <p className="mt-3 text-[17px] leading-relaxed text-muted">{standfirst}</p>

        <form onSubmit={onSubmit} className="mt-9 space-y-5">
          {error && <Notice>{error}</Notice>}
          {children}
          <button type="submit" disabled={submitting} className="btn btn-solid w-full py-3">
            {submitting ? 'Working…' : submitLabel}
          </button>
        </form>

        <p className="mt-6 text-sm text-muted">{footer}</p>
      </div>
    </div>
  )
}

export function Field({
  label,
  ...inputProps
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="eyebrow mb-2 block">{label}</span>
      <input {...inputProps} className="well w-full px-3 py-2.5 text-[15px] text-ink" />
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
      <select {...selectProps} className="well w-full px-3 py-2.5 text-[15px] text-ink" />
    </label>
  )
}
