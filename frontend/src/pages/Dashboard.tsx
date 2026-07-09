import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import type { GenerateResponse, HistoryItem, Subject } from '../lib/quiz'

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}m ${seconds % 60}s`

export default function Dashboard() {
  const { student, logout } = useAuth()
  const navigate = useNavigate()

  const [subjects, setSubjects] = useState<Subject[] | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)

  const [history, setHistory] = useState<HistoryItem[] | null>(null)
  const [historyError, setHistoryError] = useState('')

  useEffect(() => {
    api<{ subjects: Subject[] }>('/api/subjects')
      .then(({ subjects }) => setSubjects(subjects))
      .catch((err: Error) => setError(err.message))
  }, [])

  useEffect(() => {
    api<{ history: HistoryItem[] }>('/api/quiz/history')
      .then(({ history }) => setHistory(history))
      .catch((err: Error) => setHistoryError(err.message))
  }, [])

  const generate = async () => {
    if (selected === null) return
    setGenerating(true)
    setError('')
    try {
      const quiz = await api<GenerateResponse>('/api/quiz/generate', {
        method: 'POST',
        body: JSON.stringify({ subject_id: selected }),
      })
      navigate('/quiz', { state: { quiz, subjectId: selected } })
    } catch (err) {
      setError((err as Error).message)
      setGenerating(false)
    }
  }

  if (!student) return null // ProtectedRoute guarantees student; satisfy TS

  // CLAUDE.md formula: correct_answers / (total_quizzes * 30). Guarded for 0 quizzes.
  const overallAccuracy = student.total_quizzes
    ? student.correct_answers / (student.total_quizzes * 30)
    : 0

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between bg-white px-6 py-4 shadow-sm">
        <span className="text-lg font-bold text-indigo-600">AdaptIQ</span>
        <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-900">
          Log out
        </button>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold text-gray-900">Welcome, {student.name}</h1>
        <p className="mt-2 text-gray-600">
          Class {student.class} · @{student.username}
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">Quizzes taken</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{student.total_quizzes}</p>
          </div>
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">Correct answers</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{student.correct_answers}</p>
          </div>
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">Overall accuracy</p>
            <p className="mt-1 text-2xl font-bold text-indigo-600">
              {Math.round(overallAccuracy * 100)}%
            </p>
          </div>
        </div>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">Start a new test</h2>

          {error && (
            <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
          )}

          {subjects === null && !error && (
            <p className="mt-3 text-sm text-gray-500">Loading subjects…</p>
          )}

          {subjects?.length === 0 && (
            <p className="mt-3 text-sm text-gray-500">No subjects available yet.</p>
          )}

          {subjects && subjects.length > 0 && (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {subjects.map((s) => (
                  <button
                    key={s.subject_id}
                    onClick={() => setSelected(s.subject_id)}
                    className={`rounded-lg border p-4 text-left font-medium shadow-sm transition ${
                      selected === s.subject_id
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300'
                    }`}
                  >
                    {s.subject_name}
                  </button>
                ))}
              </div>
              <button
                onClick={generate}
                disabled={selected === null || generating}
                className="mt-6 w-full rounded-lg bg-indigo-600 py-3 font-semibold text-white shadow hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generating ? 'Generating…' : 'Generate Test'}
              </button>
            </>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-gray-900">Past quizzes</h2>

          {historyError && (
            <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{historyError}</p>
          )}

          {history === null && !historyError && (
            <p className="mt-3 text-sm text-gray-500">Loading history…</p>
          )}

          {history?.length === 0 && (
            <p className="mt-3 text-sm text-gray-500">No quizzes yet — take your first quiz.</p>
          )}

          {history && history.length > 0 && (
            <div className="mt-4 space-y-3">
              {history.map((item) => (
                <div
                  key={item.quiz_id}
                  className="flex flex-col gap-3 rounded-lg bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-gray-900">{item.subject}</p>
                    <p className="mt-1 text-sm text-gray-500">
                      {new Date(item.completed_on).toLocaleDateString()} · Score{' '}
                      {item.correct_answers}/{item.total_questions} ({Math.round(item.accuracy * 100)}%)
                      · Easy {item.easy_questions} · Medium {item.medium_questions} · Hard{' '}
                      {item.hard_questions} · {formatTime(item.total_time_taken)}
                    </p>
                  </div>
                  <Link
                    to={`/quiz/${item.quiz_id}/review`}
                    className="shrink-0 rounded-lg border border-indigo-200 px-4 py-2 text-center text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                  >
                    View
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
