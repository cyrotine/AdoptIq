import { useAuth } from '../context/AuthContext'

// Placeholder landing page for authenticated students.
// Replaced by the real dashboard in a later spec.
export default function Home() {
  const { student, logout } = useAuth()
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
      </main>
    </div>
  )
}
