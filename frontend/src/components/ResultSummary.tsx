import type { SubmitResponse } from '../lib/quiz'
import { SectionHead } from './Shell'
import QuestionReview from './QuestionReview'
import { Tape, type Tone } from './Tape'

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}m ${seconds % 60}s`

// The score tape: the same 30 marks the student watched fill during the quiz,
// now carrying the verdict for each. It reveals left to right — the one place
// in the app where motion is doing work.
export default function ResultSummary({ result }: { result: SubmitResponse }) {
  const tones: Tone[] = result.results.map((r) =>
    r.student_answer === null ? 'idle' : r.is_correct ? 'easy' : 'hard',
  )
  const wrong = result.results.filter((r) => r.student_answer !== null && !r.is_correct).length
  const skipped = result.results.filter((r) => r.student_answer === null).length

  return (
    <>
      <p className="eyebrow">Score</p>
      <p className="mt-1 font-display expanded text-6xl font-extrabold leading-none tracking-tight tabular-nums text-ink">
        {result.score}
        <span className="text-3xl text-muted">/{result.total}</span>
      </p>

      <div className="mt-8">
        <Tape tones={tones} reveal label="Verdict for each question, in order" />
      </div>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 font-util text-[11px] uppercase tracking-[0.1em] text-muted">
        <Legend bar="bg-easy" count={result.score} label="Correct" />
        <Legend bar="bg-hard" count={wrong} label="Wrong" />
        <Legend bar="bg-rule" count={skipped} label="Skipped" />
      </div>

      <p className="mt-6 font-util text-[11px] uppercase tracking-[0.1em] text-muted">
        {formatTime(result.total_time_taken)} · Easy {result.composition.easy} · Medium{' '}
        {result.composition.medium} · Hard {result.composition.hard}
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
      <span aria-hidden className={`h-3 w-[3px] ${bar}`} />
      <span className="font-semibold tabular-nums text-ink">{count}</span> {label}
    </span>
  )
}
