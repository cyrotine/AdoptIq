import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import type { SubmitResponse } from '../lib/quiz'
import QuestionReview from '../components/QuestionReview'

export default function QuizReview() {
  const { quizId } = useParams()
  const [result, setResult] = useState<SubmitResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!quizId) return
    api<SubmitResponse>(`/api/quiz/history/${quizId}`)
      .then(setResult)
      .catch((err: Error) => setError(err.message))
  }, [quizId])

  const minutes = result ? Math.floor(result.total_time_taken / 60) : 0
  const seconds = result ? result.total_time_taken % 60 : 0

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between bg-white px-6 py-4 shadow-sm">
        <span className="text-lg font-bold text-indigo-600">AdaptIQ</span>
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-900">
          Back to Dashboard
        </Link>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-10">
        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}

        {!result && !error && (
          <p className="text-sm text-gray-500">Loading…</p>
        )}

        {result && (
          <>
            <div className="rounded-lg bg-white p-6 text-center shadow">
              <p className="text-sm font-medium text-gray-500">Score</p>
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
              Back to Dashboard
            </Link>
          </>
        )}
      </main>
    </div>
  )
}
