import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import Shell, { Notice, PageHead, Quiet, RailButton, SectionHead } from '../components/Shell'

interface TopicStat {
  topic_id: number
  topic_name: string
  chapter_name: string
  subject_name: string
  ask_count: number
}

export default function AdminPanel() {
  const { admin, logout } = useAuth()
  const navigate = useNavigate()

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

  // Demand bars are drawn relative to the busiest topic, so the column reads
  // as a ranking at a glance rather than a list of numbers.
  const busiest = Math.max(1, ...(topics ?? []).map((t) => t.ask_count))

  return (
    <Shell wide context="Admin" right={<RailButton onClick={logout}>Log out</RailButton>}>
      <PageHead
        title="Topics by demand"
        note="How often each topic has been asked across all students, most asked first. Generate questions where the bank is thinnest."
      />

      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter topics…"
        aria-label="Filter topics"
        className="well mt-8 w-full px-3 py-2.5 text-[15px] text-ink"
      />

      {error && (
        <div className="mt-6">
          <Notice>{error}</Notice>
        </div>
      )}
      {topics === null && !error && (
        <div className="mt-6">
          <Quiet>Loading topics…</Quiet>
        </div>
      )}
      {topics?.length === 0 && (
        <div className="mt-6">
          <Quiet>No topics yet.</Quiet>
        </div>
      )}

      {topics && topics.length > 0 && (
        <div className="mt-8">
          <SectionHead label={`${visible.length} topics`} />
          {visible.length === 0 ? (
            <div className="mt-5">
              <Quiet>No topics match “{filter}”.</Quiet>
            </div>
          ) : (
            <ul className="mt-2">
              {visible.map((t) => (
                <li
                  key={t.topic_id}
                  className="flex flex-col gap-3 border-b border-rule py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-[15px] text-ink">{t.topic_name}</p>
                    <p className="eyebrow mt-1">
                      {t.chapter_name} · {t.subject_name}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span aria-hidden className="h-1.5 w-20 overflow-hidden rounded-full bg-rule">
                      <span
                        className="block h-full bg-signal"
                        style={{ width: `${(t.ask_count / busiest) * 100}%` }}
                      />
                    </span>
                    <span className="w-14 text-right font-util text-xs tabular-nums text-ink">
                      {t.ask_count}
                      <span className="text-muted"> asks</span>
                    </span>
                    {/* spec 14: opens the Generation Workspace for this topic. */}
                    <button
                      onClick={() =>
                        navigate(`/admin/generate/${t.topic_id}`, {
                          state: { topicName: t.topic_name },
                        })
                      }
                      className="btn btn-quiet px-3 py-1.5"
                    >
                      Generate
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Shell>
  )
}
