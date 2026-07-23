import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Sparkles } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import Shell, { Notice, PageHead, Quiet, RailButton, SectionHead } from '../components/Shell'
import { CountUp, Item, Stagger } from '../components/Motion'
import { Skeleton, StatTile } from '../components/ui'

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
  const totalAsks = (topics ?? []).reduce((sum, t) => sum + t.ask_count, 0)

  return (
    <Shell wide context="Admin" right={<RailButton onClick={logout}>Log out</RailButton>}>
      <PageHead
        title="Topics by demand"
        note="How often each topic has been asked across all students, most asked first. Generate questions where the bank is thinnest."
      />

      {/* The bank at a glance — derived from the same fetch as the list. */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {topics === null ? (
          <>
            <Skeleton className="h-[86px]" />
            <Skeleton className="h-[86px]" />
            <Skeleton className="h-[86px]" />
          </>
        ) : (
          <>
            <StatTile label="Topics">
              <CountUp value={topics.length} />
            </StatTile>
            <StatTile label="Total asks">
              <CountUp value={totalAsks} />
            </StatTile>
            <div className="pane px-5 py-4">
              <p className="eyebrow">Most in demand</p>
              <p className="mt-2 truncate font-display expanded text-lg font-bold tracking-tight text-ink">
                {topics[0]?.topic_name ?? '—'}
              </p>
            </div>
          </>
        )}
      </div>

      <label className="well mt-8 flex items-center gap-3 px-3.5">
        <Search aria-hidden size={16} strokeWidth={1.75} className="shrink-0 text-muted" />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter topics…"
          aria-label="Filter topics"
          className="w-full bg-transparent py-2.5 text-[15px] text-ink outline-none"
        />
      </label>

      {error && (
        <div className="mt-6">
          <Notice>{error}</Notice>
        </div>
      )}
      {topics === null && !error && (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-[74px]" />
          <Skeleton className="h-[74px]" />
          <Skeleton className="h-[74px]" />
          <Skeleton className="h-[74px]" />
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
            <div className="mt-5 flex items-center gap-4">
              <Quiet>No topics match “{filter}”.</Quiet>
              <button
                onClick={() => setFilter('')}
                className="eyebrow cursor-pointer text-signal transition-colors hover:text-ink"
              >
                Clear filter
              </button>
            </div>
          ) : (
            <Stagger className="mt-4 space-y-2.5">
              {visible.map((t) => (
                <Item key={t.topic_id}>
                  <div className="pane flex flex-col gap-3 px-5 py-4 transition-colors duration-150 hover:!border-signal/40 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-[15px] text-ink">{t.topic_name}</p>
                      <p className="eyebrow mt-1">
                        {t.chapter_name} · {t.subject_name}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <span aria-hidden className="h-1.5 w-20 overflow-hidden rounded-full bg-rule">
                        <span
                          className="tick-lit block h-full bg-signal text-signal"
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
                        className="btn btn-quiet flex items-center gap-1.5 px-3 py-1.5"
                      >
                        <Sparkles aria-hidden size={13} strokeWidth={1.75} />
                        Generate
                      </button>
                    </div>
                  </div>
                </Item>
              ))}
            </Stagger>
          )}
        </div>
      )}
    </Shell>
  )
}
