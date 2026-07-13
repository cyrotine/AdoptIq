import type { Answer, QuestionResult } from '../lib/quiz'
import DifficultyBadge from './DifficultyBadge'

const OPTIONS: Answer[] = ['A', 'B', 'C', 'D']

function optionClasses(r: QuestionResult, opt: Answer) {
  if (opt === r.correct_answer) return 'border-green-500 bg-green-50 text-green-800'
  if (opt === r.student_answer) return 'border-red-400 bg-red-50 text-red-700'
  return 'border-gray-200 text-gray-600'
}

// Three answer states (Spec 06): correct (green) / incorrect (red) / unanswered (grey).
function statusOf(r: QuestionResult) {
  if (r.student_answer === null)
    return { label: 'Unanswered', pill: 'bg-gray-100 text-gray-600', accent: 'border-l-gray-400' }
  if (r.is_correct)
    return { label: 'Correct', pill: 'bg-green-100 text-green-700', accent: 'border-l-green-500' }
  return { label: 'Incorrect', pill: 'bg-red-100 text-red-700', accent: 'border-l-red-500' }
}

export default function QuestionReview({ results }: { results: QuestionResult[] }) {
  return (
    <div className="mt-4 space-y-4">
      {results.map((r, i) => {
        const status = statusOf(r)
        return (
          <div key={r.question_id} className={`rounded-lg border-l-4 bg-white p-5 shadow ${status.accent}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-gray-500">
                  {r.chapter_name} · {r.topic_name}
                </p>
                <p className="mt-1 font-medium text-gray-900">
                  {i + 1}. {r.question_text}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${status.pill}`}>
                  {status.label}
                </span>
                <DifficultyBadge label={r.difficulty_label} />
              </div>
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
        )
      })}
    </div>
  )
}
