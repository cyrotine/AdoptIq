import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

interface TopicStat {
  topic_id: number
  topic_name: string
  chapter_name: string
  subject_name: string
  ask_count: number
}

export default function AdminPanel() {
  const { admin, logout } = useAuth()

  const [topics, setTopics] = useState<TopicStat[] | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')

  useEffect(() => {
    api<{ topics: TopicStat[] }>('/api/admin/topic-stats')
      .then(({ topics }) => setTopics(topics))
      .catch((err: Error) => setError(err.message))
  }, [])

  // Client-side substring match on topic name — no re-query.
  const visible = useMemo(() => {
    if (!topics) return []
    const q = filter.trim().toLowerCase()
    return q ? topics.filter((t) => t.topic_name.toLowerCase().includes(q)) : topics
  }, [topics, filter])

  if (!admin) return null // AdminRoute guarantees admin; satisfy TS

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between bg-white px-6 py-4 shadow-sm">
        <span className="text-lg font-bold text-indigo-600">AdaptIQ · Admin</span>
        <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-900">
          Log out
        </button>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold text-gray-900">Topics by demand</h1>
        <p className="mt-2 text-gray-600">
          How often each topic has been asked, across all students — most asked first.
        </p>

        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter topics…"
          className="mt-6 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}

        {topics === null && !error && (
          <p className="mt-4 text-sm text-gray-500">Loading topics…</p>
        )}

        {topics?.length === 0 && (
          <p className="mt-4 text-sm text-gray-500">No topics yet.</p>
        )}

        {topics && topics.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-lg bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Topic</th>
                  <th className="px-4 py-3 font-medium">Chapter · Subject</th>
                  <th className="px-4 py-3 text-right font-medium">Times asked</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <tr key={t.topic_id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-gray-900">{t.topic_name}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {t.chapter_name} · {t.subject_name}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {t.ask_count}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {/* spec 11: wired to spec-10 generator (per topic) in a follow-up. No-op. */}
                      <button
                        onClick={() => {}}
                        className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow hover:bg-indigo-700"
                      >
                        Generate
                      </button>
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-sm text-gray-500">
                      No topics match “{filter}”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
