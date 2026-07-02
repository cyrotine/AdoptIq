import type { FormEvent, ReactNode } from 'react'

// Shared card layout + submit/error handling for Login and Register.
export function AuthCard({
  title,
  error,
  submitting,
  submitLabel,
  onSubmit,
  footer,
  children,
}: {
  title: string
  error: string | null
  submitting: boolean
  submitLabel: string
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  footer: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 shadow">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {error && (
          <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {children}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-indigo-600 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitting ? 'Please wait…' : submitLabel}
        </button>
        <p className="text-center text-sm text-gray-500">{footer}</p>
      </form>
    </div>
  )
}

export function Field({
  label,
  ...inputProps
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <input
        {...inputProps}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
      />
    </label>
  )
}
