import { useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import type { Answer, Difficulty, QuizState, SubmitResponse } from '../lib/quiz'
import DifficultyBadge from '../components/DifficultyBadge'
import Shell, { Notice } from '../components/Shell'
import { Tape, type Tone } from '../components/Tape'

const OPTIONS: Answer[] = ['A', 'B', 'C', 'D']

const TONE_OF: Record<Difficulty, Tone> = { Easy: 'easy', Medium: 'medium', Hard: 'hard' }

export default function Quiz() {
  const state = useLocation().state as QuizState | null
  const navigate = useNavigate()
  const { refresh } = useAuth()

  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Per-question elapsed ms, accumulated whenever the student leaves a question.
  const times = useRef<Record<string, number>>({})
  const enteredAt = useRef(Date.now())
  // Per-question option switches before submit (spec 09 churn signal).
  const changes = useRef<Record<string, number>>({})

  if (!state) return <Navigate to="/" replace />
  const { quiz, subjectId } = state
  const questions = quiz.questions
  const question = questions[index]

  const recordTime = () => {
    times.current[question.question_id] =
      (times.current[question.question_id] ?? 0) + (Date.now() - enteredAt.current)
    enteredAt.current = Date.now()
  }

  const goTo = (i: number) => {
    recordTime()
    setIndex(i)
  }

  const selectOption = (opt: Answer) => {
    const prev = answers[question.question_id]
    if (prev !== undefined && prev !== opt)
      changes.current[question.question_id] = (changes.current[question.question_id] ?? 0) + 1
    setAnswers((a) => ({ ...a, [question.question_id]: opt }))
  }

  const submit = async () => {
    recordTime()
    setSubmitting(true)
    setError('')
    const responses = questions.map((q, i) => ({
      question_id: q.question_id,
      student_answer: answers[q.question_id] ?? null,
      time_taken: Math.round((times.current[q.question_id] ?? 0) / 1000),
      answer_changes: changes.current[q.question_id] ?? 0,
      position: i + 1,
    }))
    const total_time_taken = responses.reduce((sum, r) => sum + r.time_taken, 0)
    try {
      const result = await api<SubmitResponse>('/api/quiz/submit', {
        method: 'POST',
        body: JSON.stringify({ subject_id: subjectId, total_time_taken, responses }),
      })
      refresh().catch(() => {}) // best-effort counter refresh for Home
      navigate('/result', { state: result, replace: true })
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  const optionText = (opt: Answer) =>
    question[`option_${opt.toLowerCase()}` as 'option_a' | 'option_b' | 'option_c' | 'option_d']
  const answered = Object.keys(answers).length
  const last = index === questions.length - 1

  // One tick per question: filled in its difficulty colour once answered.
  const tones: Tone[] = questions.map((q) =>
    answers[q.question_id] ? TONE_OF[q.difficulty_label] : 'idle',
  )

  return (
    <Shell
      context={quiz.subject}
      right={
        <span className="font-util text-xs tabular-nums text-muted">
          <span className="font-semibold text-ink">{index + 1}</span>/{questions.length} ·{' '}
          {answered} answered
        </span>
      }
      rail={<Tape tones={tones} current={index} onSelect={goTo} label="Jump to a question" />}
    >
      <p className="eyebrow">
        {question.chapter_name} · {question.topic_name}
      </p>
      <div className="mt-3 flex items-start justify-between gap-6">
        <p className="text-xl leading-snug text-ink">{question.question_text}</p>
        <span className="pt-1">
          <DifficultyBadge label={question.difficulty_label} />
        </span>
      </div>

      <div className="mt-7 space-y-2">
        {OPTIONS.map((opt) => {
          const picked = answers[question.question_id] === opt
          return (
            <button
              key={opt}
              onClick={() => selectOption(opt)}
              aria-pressed={picked}
              className={`flex w-full items-baseline gap-3.5 rounded-lg border px-4 py-3.5 text-left text-[16px] transition ${
                picked
                  ? 'border-signal bg-signal-soft text-ink'
                  : 'border-rule bg-raise text-muted hover:border-signal hover:text-ink'
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded font-util text-xs font-semibold ${
                  picked ? 'bg-signal text-white' : 'bg-face text-muted'
                }`}
              >
                {opt}
              </span>
              <span>{optionText(opt)}</span>
            </button>
          )
        })}
      </div>

      {error && <div className="mt-5">
        <Notice>{error}</Notice>
      </div>}

      <div className="mt-8 flex items-center justify-between">
        <button
          onClick={() => goTo(index - 1)}
          disabled={index === 0 || submitting}
          className="btn btn-quiet px-5 py-2.5"
        >
          Previous
        </button>
        {last ? (
          <button onClick={submit} disabled={submitting} className="btn btn-solid px-6 py-2.5">
            {submitting ? 'Submitting…' : 'Submit test'}
          </button>
        ) : (
          <button
            onClick={() => goTo(index + 1)}
            disabled={submitting}
            className="btn btn-solid px-6 py-2.5"
          >
            Next
          </button>
        )}
      </div>
    </Shell>
  )
}
