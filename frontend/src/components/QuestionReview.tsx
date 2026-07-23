import type { Answer, QuestionResult } from '../lib/quiz'
import DifficultyBadge from './DifficultyBadge'

const OPTIONS: Answer[] = ['A', 'B', 'C', 'D']

// Each option is marked twice — a coloured edge and a written verdict — so the
// three answer states (Spec 06) survive without colour.
function optionMark(r: QuestionResult, opt: Answer) {
  if (opt === r.correct_answer)
    return { edge: 'border-easy bg-easy/10 text-ink', note: 'Correct answer', tone: 'text-easy' }
  if (opt === r.student_answer)
    return { edge: 'border-hard bg-hard/10 text-ink', note: 'You picked this', tone: 'text-hard' }
  return { edge: 'border-rule text-muted', note: '', tone: '' }
}

function verdictOf(r: QuestionResult) {
  if (r.student_answer === null) return { label: 'Skipped', tone: 'text-muted' }
  if (r.is_correct) return { label: 'Correct', tone: 'text-easy' }
  return { label: 'Wrong', tone: 'text-hard' }
}

export default function QuestionReview({ results }: { results: QuestionResult[] }) {
  return (
    <div className="mt-6 space-y-6">
      {results.map((r, i) => {
        const verdict = verdictOf(r)
        return (
          <article key={r.question_id} className="pane px-5 py-5 sm:px-6">
            {/* The number matches this question's tick on the score tape above. */}
            <div className="flex items-baseline justify-between gap-4">
              <span className={`font-util text-xs font-semibold tabular-nums ${verdict.tone}`}>
                {String(i + 1).padStart(2, '0')} · {verdict.label}
              </span>
              <DifficultyBadge label={r.difficulty_label} />
            </div>

            <p className="eyebrow mt-3">
              {r.chapter_name} · {r.topic_name}
            </p>
            <p className="mt-2 font-read text-[17px] leading-relaxed text-ink">
              {r.question_text}
            </p>

            <ul className="mt-4 space-y-1.5">
              {OPTIONS.map((opt) => {
                const mark = optionMark(r, opt)
                return (
                  <li
                    key={opt}
                    className={`flex items-baseline gap-3 rounded-md border-l-2 px-3 py-2 text-[15px] ${mark.edge}`}
                  >
                    <span className="font-util text-xs font-semibold">{opt}</span>
                    <span className="grow">
                      {
                        r[
                          `option_${opt.toLowerCase()}` as
                            | 'option_a'
                            | 'option_b'
                            | 'option_c'
                            | 'option_d'
                        ]
                      }
                    </span>
                    {mark.note && (
                      <span className={`eyebrow shrink-0 ${mark.tone}`}>{mark.note}</span>
                    )}
                  </li>
                )
              })}
            </ul>

            {r.explanation && (
              <div className="mt-5 border-l-2 border-signal pl-4">
                <p className="eyebrow">Why</p>
                <p className="mt-1.5 font-read text-[15px] leading-relaxed text-muted">
                  {r.explanation}
                </p>
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}
