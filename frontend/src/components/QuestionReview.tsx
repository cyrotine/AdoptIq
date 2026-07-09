import type { Answer, QuestionResult } from '../lib/quiz'

const OPTIONS: Answer[] = ['A', 'B', 'C', 'D']

function optionClasses(r: QuestionResult, opt: Answer) {
  if (opt === r.correct_answer) return 'border-green-500 bg-green-50 text-green-800'
  if (opt === r.student_answer) return 'border-red-400 bg-red-50 text-red-700'
  return 'border-gray-200 text-gray-600'
}

export default function QuestionReview({ results }: { results: QuestionResult[] }) {
  return (
    <div className="mt-4 space-y-4">
      {results.map((r, i) => (
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
  )
}
