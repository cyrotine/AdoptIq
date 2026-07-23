import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Flame, Telescope } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import type { Chapter, GenerateResponse, HistoryItem, Subject } from '../lib/quiz'
import Shell, { Notice, PageHead, Quiet, RailButton, SectionHead } from '../components/Shell'
import { Gauge, Tape, type Tone } from '../components/Tape'
import { CountUp, Item, Stagger } from '../components/Motion'
import { Skeleton, StatTile, EmptyState } from '../components/ui'

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}m ${seconds % 60}s`

const QUESTIONS_PER_QUIZ = 30
const DEFAULT_SPLIT = { easy: 12, medium: 12, hard: 6 }

// Difficulty sliders, sharing the scale colours with DifficultyBadge.
const SLIDERS = [
  { key: 'easy', label: 'Easy', tone: 'easy', bar: 'bg-easy' },
  { key: 'medium', label: 'Medium', tone: 'medium', bar: 'bg-medium' },
  { key: 'hard', label: 'Hard', tone: 'hard', bar: 'bg-hard' },
] as const

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

// Consecutive days of practice ending today (or yesterday, so a streak
// isn't dead before tonight's test). Derived from history — never stored.
const streakOf = (history: HistoryItem[]) => {
  const days = new Set(history.map((h) => new Date(h.completed_on).toDateString()))
  let n = 0
  const d = new Date()
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1)
  while (days.has(d.toDateString())) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

// Accuracy of the last few tests, oldest to newest, as one luminous line.
function Sparkline({ history }: { history: HistoryItem[] }) {
  const recent = history.slice(0, 10).reverse()
  if (recent.length < 2) return <Quiet>Two tests in and a trend line appears here.</Quiet>
  const points = recent
    .map(
      (h, i) =>
        `${(i / (recent.length - 1)) * 100},${(1 - h.accuracy) * 20 + 2}`,
    )
    .join(' ')
  return (
    <svg
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      className="h-10 w-full"
      role="img"
      aria-label={`Accuracy across your last ${recent.length} tests`}
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-signal)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export default function Dashboard() {
  const { student, logout } = useAuth()
  const navigate = useNavigate()

  const [subjects, setSubjects] = useState<Subject[] | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)

  const [chapters, setChapters] = useState<Chapter[] | null>(null)
  const [chaptersError, setChaptersError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [split, setSplit] = useState(DEFAULT_SPLIT)

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

  const selectSubject = (subjectId: number) => {
    setSelected(subjectId)
    setChapters(null)
    setChaptersError('')
    setChecked(new Set())
    setSplit(DEFAULT_SPLIT)
    api<{ chapters: Chapter[] }>(`/api/subjects/${subjectId}/chapters`)
      .then(({ chapters }) => {
        setChapters(chapters)
        setChecked(new Set(chapters.map((c) => c.chapter_id))) // default: all ticked
      })
      .catch((err: Error) => setChaptersError(err.message))
  }

  const toggleChapter = (chapterId: number) => {
    setChecked((prev) => {
      const next = new Set(prev)
      next.has(chapterId) ? next.delete(chapterId) : next.add(chapterId)
      return next
    })
  }

  const setCount = (key: 'easy' | 'medium' | 'hard', value: number) => {
    setSplit((prev) => {
      const others = 30 - (prev.easy + prev.medium + prev.hard) + prev[key]
      // Cap so easy + medium + hard can never exceed 30; user fills up to 30.
      const clamped = Number.isFinite(value) ? Math.max(0, Math.min(others, Math.round(value))) : 0
      return { ...prev, [key]: clamped }
    })
  }

  const total = split.easy + split.medium + split.hard
  const remaining = QUESTIONS_PER_QUIZ - total

  // The mix drawn as the 30 questions it actually is — one tick each, coloured
  // by the band it is assigned to, grey while still unassigned.
  const mixTones: Tone[] = SLIDERS.flatMap(({ key, tone }) =>
    Array<Tone>(split[key]).fill(tone),
  ).concat(Array<Tone>(Math.max(0, remaining)).fill('idle'))
  const canGenerate = selected !== null && checked.size > 0 && total === 30 && !generating

  const generate = async () => {
    if (!canGenerate || selected === null) return
    setGenerating(true)
    setError('')
    try {
      const quiz = await api<GenerateResponse>('/api/quiz/generate', {
        method: 'POST',
        body: JSON.stringify({
          subject_id: selected,
          chapter_ids: [...checked],
          easy: split.easy,
          medium: split.medium,
          hard: split.hard,
        }),
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

  const streak = history ? streakOf(history) : 0

  return (
    <Shell wide right={<RailButton onClick={logout}>Log out</RailButton>}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">
            {greeting()} · Class {student.class} · @{student.username}
          </p>
          <div className="mt-3">
            <PageHead title={student.name} />
          </div>
        </div>
        {streak > 0 && (
          <span className="pane flex items-center gap-2 px-4 py-2.5 font-util text-xs font-semibold uppercase tracking-[0.1em] text-ember">
            <Flame aria-hidden size={16} strokeWidth={1.75} />
            {streak}-day streak
          </span>
        )}
      </div>

      {/* Where the student sits on the 0–100 scale the platform rates on. */}
      <div className="mt-10">
        <SectionHead label="Your reading" />
        <div className="pane mt-5 px-6 py-7 sm:px-8">
          <Gauge value={overallAccuracy * 100} caption="Overall accuracy" />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <StatTile label="Tests taken">
            <CountUp value={student.total_quizzes} />
          </StatTile>
          <StatTile label="Correct answers">
            <CountUp value={student.correct_answers} />
          </StatTile>
          <div className="pane px-5 py-4">
            <p className="eyebrow">Recent trend</p>
            <div className="mt-2">
              {history === null ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Sparkline history={history} />
              )}
            </div>
          </div>
        </div>
      </div>

      <section className="mt-14">
        <SectionHead label="New test" />

        {error && (
          <div className="mt-5">
            <Notice>{error}</Notice>
          </div>
        )}
        {subjects === null && !error && (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        )}
        {subjects?.length === 0 && (
          <div className="mt-5">
            <Quiet>No subjects available yet.</Quiet>
          </div>
        )}

        {subjects && subjects.length > 0 && (
          <>
            <Stagger className="mt-5 grid grid-cols-2 gap-3">
              {subjects.map((s) => (
                <Item key={s.subject_id}>
                  <button
                    onClick={() => selectSubject(s.subject_id)}
                    aria-pressed={selected === s.subject_id}
                    className={`pane w-full cursor-pointer px-4 py-5 text-left font-display expanded text-lg font-bold tracking-tight transition-all duration-150 ${
                      selected === s.subject_id
                        ? '!border-signal bg-signal-soft text-signal'
                        : 'text-muted hover:-translate-y-0.5 hover:!border-signal/50 hover:text-ink'
                    }`}
                  >
                    {s.subject_name}
                  </button>
                </Item>
              ))}
            </Stagger>

            {selected !== null && (
              <div className="mt-10">
                <SectionHead
                  label="Chapters"
                  aside={
                    chapters &&
                    chapters.length > 0 && (
                      <button
                        onClick={() =>
                          setChecked(
                            checked.size > 0
                              ? new Set()
                              : new Set(chapters.map((c) => c.chapter_id)),
                          )
                        }
                        className="eyebrow shrink-0 cursor-pointer transition-colors hover:text-signal"
                      >
                        {checked.size > 0 ? 'Clear all' : 'Select all'}
                      </button>
                    )
                  }
                />

                {chaptersError && (
                  <div className="mt-4">
                    <Notice>{chaptersError}</Notice>
                  </div>
                )}
                {chapters === null && !chaptersError && (
                  <div className="mt-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    <Skeleton className="h-11" />
                    <Skeleton className="h-11" />
                    <Skeleton className="h-11" />
                    <Skeleton className="h-11" />
                  </div>
                )}
                {chapters?.length === 0 && (
                  <div className="mt-4">
                    <Quiet>No chapters for this subject yet.</Quiet>
                  </div>
                )}

                {chapters && chapters.length > 0 && (
                  <>
                    <Stagger className="mt-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {chapters.map((c) => (
                        <Item key={c.chapter_id}>
                          <label className="pane flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] text-ink transition-colors duration-150 hover:!border-signal/50">
                            <input
                              type="checkbox"
                              checked={checked.has(c.chapter_id)}
                              onChange={() => toggleChapter(c.chapter_id)}
                              className="h-4 w-4 accent-signal"
                            />
                            {c.chapter_name}
                          </label>
                        </Item>
                      ))}
                    </Stagger>
                    {checked.size === 0 && (
                      <p className="eyebrow mt-3 text-hard">Pick at least one chapter</p>
                    )}

                    {/* The mix, drawn as the 30 questions it will produce. */}
                    <div className="mt-10">
                      <SectionHead
                        label="Mix"
                        aside={
                          <span
                            className={`shrink-0 font-util text-[11px] uppercase tracking-[0.1em] tabular-nums ${
                              total === QUESTIONS_PER_QUIZ ? 'text-muted' : 'text-ember'
                            }`}
                          >
                            {total === QUESTIONS_PER_QUIZ
                              ? '30 of 30 assigned'
                              : `${remaining} still to assign`}
                          </span>
                        }
                      />
                      <div className="pane mt-5 px-6 py-6 sm:px-8">
                        <Tape tones={mixTones} label="Difficulty mix across the 30 questions" />

                        <div className="mt-7 space-y-5">
                          {SLIDERS.map(({ key, label, bar }) => (
                            <div key={key}>
                              <div className="flex items-center justify-between">
                                <span className="eyebrow flex items-center gap-2 text-ink">
                                  <span aria-hidden className={`h-3 w-[3px] rounded-full ${bar}`} />
                                  {label}
                                </span>
                                <span className="font-util text-xs font-semibold tabular-nums text-ink">
                                  {split[key]}
                                </span>
                              </div>
                              <input
                                type="range"
                                aria-label={`${label} questions`}
                                min={0}
                                max={QUESTIONS_PER_QUIZ}
                                value={split[key]}
                                onChange={(e) => setCount(key, e.target.valueAsNumber)}
                                className="mt-2.5 w-full cursor-pointer accent-signal"
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={generate}
                        disabled={!canGenerate}
                        className="btn btn-solid mt-6 w-full py-3.5"
                      >
                        {generating ? 'Building your test…' : 'Start test · 30 questions'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <section className="mt-16">
        <SectionHead label="Past tests" />

        {historyError && (
          <div className="mt-5">
            <Notice>{historyError}</Notice>
          </div>
        )}
        {history === null && !historyError && (
          <div className="mt-5 space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        )}
        {history?.length === 0 && (
          <div className="mt-5">
            <EmptyState icon={Telescope}>
              Nothing observed yet. Your first test will show up here once you finish it —
              build one above.
            </EmptyState>
          </div>
        )}

        {history && history.length > 0 && (
          <Stagger className="mt-5 space-y-3">
            {history.map((item) => (
              <Item key={item.quiz_id}>
                <div className="pane flex flex-col gap-3 px-5 py-4 transition-colors duration-150 hover:!border-signal/40 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-display expanded font-bold tracking-tight text-ink">
                      {item.subject}
                    </p>
                    {/* Aggregate, not per-question — so a solid proportion bar
                        rather than the ordered tape used on a result. */}
                    <div className="mt-2 flex items-center gap-3">
                      <span
                        aria-hidden
                        className="h-1.5 w-24 overflow-hidden rounded-full bg-rule"
                      >
                        <span
                          className="tick-lit block h-full bg-signal text-signal"
                          style={{ width: `${item.accuracy * 100}%` }}
                        />
                      </span>
                      <span className="font-util text-xs tabular-nums text-ink">
                        {item.correct_answers}/{item.total_questions}
                      </span>
                      <span className="font-util text-[11px] uppercase tracking-[0.1em] text-muted">
                        {new Date(item.completed_on).toLocaleDateString()} ·{' '}
                        {formatTime(item.total_time_taken)}
                      </span>
                    </div>
                  </div>
                  <Link
                    to={`/quiz/${item.quiz_id}/review`}
                    className="btn btn-quiet shrink-0 px-4 py-2 text-center"
                  >
                    Review
                  </Link>
                </div>
              </Item>
            ))}
          </Stagger>
        )}
      </section>
    </Shell>
  )
}
