import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import type { GenerateResponse, Subject } from '../lib/quiz'

export default function Home() {
  const { student, logout } = useAuth()
  const navigate = useNavigate()

  const [subjects, setSubjects] = useState<Subject[] | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    api<{ subjects: Subject[] }>('/api/subjects')
      .then(({ subjects }) => setSubjects(subjects))
      .catch((err: Error) => setError(err.message))
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between bg-white px-6 py-4 shadow-sm">
        <span className="text-lg font-bold text-indigo-600">AdaptIQ</span>
        <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-900">
          Log out
        </button>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-bold text-gray-900">Welcome, {student.name}</h1>
        <p className="mt-2 text-gray-600">
          Class {student.class} · @{student.username}
        </p>
        <p className="mt-6 rounded-lg bg-white p-4 text-sm text-gray-500 shadow">
          Quizzes taken: {student.total_quizzes} · Correct answers: {student.correct_answers}
        </p>

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
      </main>
    </div>
  )
}
