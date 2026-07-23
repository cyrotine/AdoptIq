import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import type { Answer, Difficulty, QuizState, SubmitResponse } from '../lib/quiz'
import DifficultyBadge from '../components/DifficultyBadge'
import Shell, { Notice } from '../components/Shell'
import { Tape, type Tone } from '../components/Tape'
import { Kbd } from '../components/ui'

const OPTIONS: Answer[] = ['A', 'B', 'C', 'D']

const TONE_OF: Record<Difficulty, Tone> = { Easy: 'easy', Medium: 'medium', Hard: 'hard' }

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function Quiz() {
  const state = useLocation().state as QuizState | null
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const reduce = useReducedMotion()

  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Per-question elapsed ms, accumulated whenever the student leaves a question.
  const times = useRef<Record<string, number>>({})
  const enteredAt = useRef(Date.now())
  // Per-question option switches before submit (spec 09 churn signal).
  const changes = useRef<Record<string, number>>({})

  // Display-only wall clock for the rail; the recorded per-question times
  // above are the payload and are untouched by this ticker.
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const started = Date.now()
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(t)
  }, [])

  // Direction of travel, for the slide transition only.
  const dir = useRef(1)

  // Keyboard map: 1–4 / A–D select, ←/→ navigate, Enter next (submit on the
  // last question). Same handlers the buttons call — nothing new happens.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!state || submitting || e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key
      if (k >= '1' && k <= '4') selectOption(OPTIONS[Number(k) - 1])
      else if (/^[a-d]$/i.test(k)) selectOption(k.toUpperCase() as Answer)
      else if (k === 'ArrowLeft' && index > 0) nav(index - 1)
      else if (k === 'ArrowRight' && index < questions.length - 1) nav(index + 1)
      else if (k === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
        if (last) submit()
        else nav(index + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

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

  // Presentational wrapper: remembers the slide direction, then goTo as-is.
  const nav = (i: number) => {
    dir.current = i > index ? 1 : -1
    goTo(i)
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
          {answered} answered · {clock(elapsed)}
        </span>
      }
      rail={<Tape tones={tones} current={index} onSelect={nav} label="Jump to a question" />}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={index}
          initial={reduce ? false : { opacity: 0, x: 24 * dir.current }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? undefined : { opacity: 0, x: -16 * dir.current }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <p className="eyebrow">
            {question.chapter_name} · {question.topic_name}
          </p>
          <div className="mt-4 flex items-start justify-between gap-6">
            <p className="font-read text-[22px] leading-snug text-ink">{question.question_text}</p>
            <span className="pt-1.5">
              <DifficultyBadge label={question.difficulty_label} />
            </span>
          </div>

          <div className="mt-8 space-y-2.5">
            {OPTIONS.map((opt) => {
              const picked = answers[question.question_id] === opt
              return (
                <motion.button
                  key={opt}
                  onClick={() => selectOption(opt)}
                  aria-pressed={picked}
                  whileTap={reduce ? undefined : { scale: 0.99 }}
                  className={`pane flex w-full cursor-pointer items-baseline gap-3.5 px-4 py-3.5 text-left text-[16px] transition-colors duration-150 ${
                    picked
                      ? '!border-signal bg-signal-soft text-ink'
                      : 'text-muted hover:!border-signal/50 hover:text-ink'
                  }`}
                >
                  <motion.span
                    key={picked ? 'on' : 'off'}
                    initial={picked && !reduce ? { scale: 0.6 } : false}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-util text-xs font-semibold ${
                      picked ? 'tick-lit bg-signal text-face' : 'bg-raise text-muted'
                    }`}
                  >
                    {opt}
                  </motion.span>
                  <span>{optionText(opt)}</span>
                </motion.button>
              )
            })}
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="mt-6 hidden flex-wrap items-center gap-x-4 gap-y-2 sm:flex">
        <span className="flex items-center gap-1.5">
          <Kbd>1</Kbd>
          <Kbd>4</Kbd>
          <span className="eyebrow">select</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>←</Kbd>
          <Kbd>→</Kbd>
          <span className="eyebrow">navigate</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd>
          <span className="eyebrow">{last ? 'submit' : 'next'}</span>
        </span>
      </div>

      {error && (
        <div className="mt-5">
          <Notice>{error}</Notice>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between gap-4">
        <button
          onClick={() => nav(index - 1)}
          disabled={index === 0 || submitting}
          className="btn btn-quiet px-5 py-2.5"
        >
          Previous
        </button>
        {last ? (
          <span className="flex items-center gap-4">
            <span className="font-util text-[11px] uppercase tracking-[0.1em] tabular-nums text-muted">
              {answered} of {questions.length} answered
            </span>
            <button onClick={submit} disabled={submitting} className="btn btn-solid px-6 py-2.5">
              {submitting ? 'Submitting…' : 'Submit test'}
            </button>
          </span>
        ) : (
          <button
            onClick={() => nav(index + 1)}
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
