import { Link, Navigate, useLocation } from 'react-router-dom'
import type { SubmitResponse } from '../lib/quiz'
import QuestionReview from '../components/QuestionReview'

export default function Result() {
  const result = useLocation().state as SubmitResponse | null
  if (!result) return <Navigate to="/" replace />

  const minutes = Math.floor(result.total_time_taken / 60)
  const seconds = result.total_time_taken % 60

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between bg-white px-6 py-4 shadow-sm">
        <span className="text-lg font-bold text-indigo-600">AdaptIQ</span>
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-900">
          Back to Home
        </Link>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="rounded-lg bg-white p-6 text-center shadow">
          <p className="text-sm font-medium text-gray-500">Your score</p>
          <p className="mt-1 text-4xl font-bold text-indigo-600">
            {result.score} / {result.total}
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Time taken: {minutes}m {seconds}s · Easy {result.composition.easy} · Medium{' '}
            {result.composition.medium} · Hard {result.composition.hard}
          </p>
        </div>

        <h2 className="mt-8 text-lg font-semibold text-gray-900">Review</h2>
        <QuestionReview results={result.results} />

        <Link
          to="/"
          className="mt-8 block w-full rounded-lg bg-indigo-600 py-3 text-center font-semibold text-white shadow hover:bg-indigo-700"
        >
          Back to Home
        </Link>
      </main>
    </div>
  )
}
