import { useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import type { Answer, QuizState, SubmitResponse } from '../lib/quiz'
import DifficultyBadge from '../components/DifficultyBadge'

const OPTIONS: Answer[] = ['A', 'B', 'C', 'D']

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

  const submit = async () => {
    recordTime()
    setSubmitting(true)
    setError('')
    const responses = questions.map((q) => ({
      question_id: q.question_id,
      student_answer: answers[q.question_id] ?? null,
      time_taken: Math.round((times.current[q.question_id] ?? 0) / 1000),
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between bg-white px-6 py-4 shadow-sm">
        <span className="text-lg font-bold text-indigo-600">AdaptIQ · {quiz.subject}</span>
        <span className="text-sm text-gray-500">
          Question {index + 1}/{questions.length} · {answered} answered
        </span>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-gray-500">
                {question.chapter_name} · {question.topic_name}
              </p>
              <p className="mt-1 font-medium text-gray-900">{question.question_text}</p>
            </div>
            <DifficultyBadge label={question.difficulty_label} />
          </div>
          <div className="mt-5 space-y-3">
            {OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() =>
                  setAnswers((a) => ({ ...a, [question.question_id]: opt }))
                }
                className={`block w-full rounded-lg border p-3 text-left text-sm transition ${
                  answers[question.question_id] === opt
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 text-gray-700 hover:border-indigo-300'
                }`}
              >
                <span className="mr-2 font-semibold">{opt}.</span>
                {optionText(opt)}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}

        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => goTo(index - 1)}
            disabled={index === 0 || submitting}
            className="rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 disabled:opacity-40"
          >
            Previous
          </button>
          {last ? (
            <button
              onClick={submit}
              disabled={submitting}
              className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit Test'}
            </button>
          ) : (
            <button
              onClick={() => goTo(index + 1)}
              disabled={submitting}
              className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Next
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
