import { Link, Navigate, useLocation } from 'react-router-dom'
import type { Answer, QuestionResult, SubmitResponse } from '../lib/quiz'

const OPTIONS: Answer[] = ['A', 'B', 'C', 'D']

function optionClasses(r: QuestionResult, opt: Answer) {
  if (opt === r.correct_answer) return 'border-green-500 bg-green-50 text-green-800'
  if (opt === r.student_answer) return 'border-red-400 bg-red-50 text-red-700'
  return 'border-gray-200 text-gray-600'
}

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
        <div className="mt-4 space-y-4">
          {result.results.map((r, i) => (
            <div key={r.question_id} className="rounded-lg bg-white p-5 shadow">
              <div className="flex items-start justify-between gap-4">
                <p className="font-medium text-gray-900">
                  {i + 1}. {r.question_text}
                </p>
                {r.student_answer === null ? (
                  <span className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                    Not answered
                  </span>
                ) : (
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs ${
                      r.is_correct ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {r.is_correct ? 'Correct' : 'Wrong'}
                  </span>
                )}
              </div>
              <div className="mt-4 space-y-2">
                {OPTIONS.map((opt) => (
                  <div
                    key={opt}
                    className={`rounded-lg border p-2.5 text-sm ${optionClasses(r, opt)}`}
                  >
                    <span className="mr-2 font-semibold">{opt}.</span>
                    {r[`option_${opt.toLowerCase()}` as 'option_a' | 'option_b' | 'option_c' | 'option_d']}
                  </div>
                ))}
              </div>
              {r.explanation && (
                <p className="mt-4 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-900">
                  <span className="font-semibold">Explanation: </span>
                  {r.explanation}
                </p>
              )}
            </div>
          ))}
        </div>

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
