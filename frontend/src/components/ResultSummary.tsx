import type { Difficulty, SubmitResponse } from '../lib/quiz'
import { SectionHead } from './Shell'
import { CountUp } from './Motion'
import QuestionReview from './QuestionReview'
import { Tape, type Tone } from './Tape'

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}m ${seconds % 60}s`

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard']
const DIFF_BAR: Record<Difficulty, string> = {
  Easy: 'bg-easy text-easy',
  Medium: 'bg-medium text-medium',
  Hard: 'bg-hard text-hard',
}

// One burst of luminous ticks rising off the score — earned at 80%+, never
// decorative confetti. Pure CSS; the reduced-motion clamp collapses it.
function Burst() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-x-0 -top-2 bottom-0">
      {Array.from({ length: 24 }).map((_, i) => (
        <span
          key={i}
          className={`tick-lit absolute bottom-0 w-0.5 rounded-full ${
            i % 3 === 0 ? 'bg-ember text-ember' : 'bg-signal text-signal'
          }`}
          style={{
            left: `${(i * 41) % 100}%`,
            height: `${6 + ((i * 7) % 12)}px`,
            animation: `burst 0.9s ease-out ${i * 35}ms both`,
          }}
        />
      ))}
    </span>
  )
}

// The score tape: the same 30 marks the student watched fill during the quiz,
// now carrying the verdict for each. It reveals left to right — the one place
// in the app where motion is doing work.
export default function ResultSummary({
  result,
  celebrate = false,
}: {
  result: SubmitResponse
  celebrate?: boolean
}) {
  const tones: Tone[] = result.results.map((r) =>
    r.student_answer === null ? 'idle' : r.is_correct ? 'easy' : 'hard',
  )
  const wrong = result.results.filter((r) => r.student_answer !== null && !r.is_correct).length
  const skipped = result.results.filter((r) => r.student_answer === null).length
  const accuracy = result.total ? result.score / result.total : 0

  // Per-difficulty verdicts, derived from the results already in hand.
  const byDifficulty = DIFFICULTIES.map((d) => {
    const of = result.results.filter((r) => r.difficulty_label === d)
    return { d, total: of.length, correct: of.filter((r) => r.is_correct).length }
  }).filter(({ total }) => total > 0)

  // Topic grouping — strengths and review candidates, derived client-side.
  const byTopic = new Map<string, { correct: number; total: number }>()
  for (const r of result.results) {
    const t = byTopic.get(r.topic_name) ?? { correct: 0, total: 0 }
    t.total++
    if (r.is_correct) t.correct++
    byTopic.set(r.topic_name, t)
  }
  const topics = [...byTopic.entries()]
  const strong = topics.filter(([, t]) => t.correct / t.total >= 0.75)
  const weak = topics.filter(([, t]) => t.correct / t.total < 0.5)

  return (
    <>
      <div className="relative">
        {celebrate && accuracy >= 0.8 && <Burst />}
        <p className="eyebrow">Score</p>
        <p className="mt-1 font-display expanded text-6xl font-extrabold leading-none tracking-tight tabular-nums text-ink">
          <CountUp value={result.score} />
          <span className="text-3xl text-muted">/{result.total}</span>
        </p>
      </div>

      <div className="mt-8">
        <Tape tones={tones} reveal label="Verdict for each question, in order" />
      </div>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 font-util text-[11px] uppercase tracking-[0.1em] text-muted">
        <Legend bar="bg-easy" count={result.score} label="Correct" />
        <Legend bar="bg-hard" count={wrong} label="Wrong" />
        <Legend bar="bg-rule" count={skipped} label="Skipped" />
      </div>

      {/* The reading, broken down — all derived from the payload. */}
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <div className="pane px-5 py-4">
          <p className="eyebrow">Accuracy</p>
          <p className="mt-2 font-util text-2xl font-semibold tabular-nums text-ink">
            <CountUp value={Math.round(accuracy * 100)} />%
          </p>
        </div>
        <div className="pane px-5 py-4">
          <p className="eyebrow">Time</p>
          <p className="mt-2 font-util text-2xl font-semibold tabular-nums text-ink">
            {formatTime(result.total_time_taken)}
          </p>
        </div>
        <div className="pane px-5 py-4">
          <p className="eyebrow">By difficulty</p>
          <div className="mt-3 space-y-2">
            {byDifficulty.map(({ d, correct, total }) => (
              <div key={d} className="flex items-center gap-2">
                <span aria-hidden className={`h-3 w-[3px] rounded-full ${DIFF_BAR[d]}`} />
                <span className="w-14 font-util text-[10px] uppercase tracking-[0.1em] text-muted">
                  {d}
                </span>
                <span
                  aria-hidden
                  className="h-1 grow overflow-hidden rounded-full bg-rule"
                >
                  <span
                    className={`block h-full rounded-full ${DIFF_BAR[d]}`}
                    style={{ width: `${(correct / total) * 100}%` }}
                  />
                </span>
                <span className="font-util text-xs tabular-nums text-ink">
                  {correct}/{total}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {(strong.length > 0 || weak.length > 0) && (
        <div className="mt-6 space-y-3">
          {strong.length > 0 && (
            <p className="flex flex-wrap items-center gap-2">
              <span className="eyebrow">Strong</span>
              {strong.map(([name, t]) => (
                <span
                  key={name}
                  className="rounded-full border border-easy/30 bg-easy/10 px-3 py-1 font-util text-[11px] tabular-nums text-easy"
                >
                  {name} {t.correct}/{t.total}
                </span>
              ))}
            </p>
          )}
          {weak.length > 0 && (
            <p className="flex flex-wrap items-center gap-2">
              <span className="eyebrow">Review</span>
              {weak.map(([name, t]) => (
                <span
                  key={name}
                  className="rounded-full border border-hard/30 bg-hard/10 px-3 py-1 font-util text-[11px] tabular-nums text-hard"
                >
                  {name} {t.correct}/{t.total}
                </span>
              ))}
            </p>
          )}
        </div>
      )}

      <p className="mt-6 font-util text-[11px] uppercase tracking-[0.1em] text-muted">
        Mix · Easy {result.composition.easy} · Medium {result.composition.medium} · Hard{' '}
        {result.composition.hard}
      </p>

      <div className="mt-12">
        <SectionHead label="Every question" />
      </div>
      <QuestionReview results={result.results} />
    </>
  )
}

function Legend({ bar, count, label }: { bar: string; count: number; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className={`h-3 w-[3px] rounded-full ${bar}`} />
      <span className="font-semibold tabular-nums text-ink">{count}</span> {label}
    </span>
  )
}
