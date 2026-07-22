import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import type { Chapter, GenerateResponse, HistoryItem, Subject } from '../lib/quiz'
import Shell, { Notice, PageHead, Quiet, RailButton, SectionHead } from '../components/Shell'
import { Gauge, Tape, type Tone } from '../components/Tape'

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}m ${seconds % 60}s`

const QUESTIONS_PER_QUIZ = 30
const DEFAULT_SPLIT = { easy: 12, medium: 12, hard: 6 }

// Difficulty sliders, sharing the scale colours with DifficultyBadge.
const SLIDERS = [
  { key: 'easy', label: 'Easy', tone: 'easy', bar: 'bg-easy' },
  { key: 'medium', label: 'Medium', tone: 'medium', bar: 'bg-medium' },
  { key: 'hard', label: 'Hard', tone: 'hard', bar: 'bg-hard' },
] as const

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

  return (
    <Shell wide right={<RailButton onClick={logout}>Log out</RailButton>}>
      <p className="eyebrow">
        Class {student.class} · @{student.username}
      </p>
      <div className="mt-3">
        <PageHead title={student.name} />
      </div>

      {/* Where the student sits on the 0–100 scale the platform rates on. */}
      <div className="mt-10">
        <SectionHead label="Overall accuracy" />
        <div className="mt-5">
          <Gauge value={overallAccuracy * 100} caption="Overall accuracy" />
        </div>
        <p className="mt-4 font-util text-[11px] uppercase tracking-[0.1em] text-muted">
          <span className="font-semibold tabular-nums text-ink">{student.total_quizzes}</span> tests
          taken ·{' '}
          <span className="font-semibold tabular-nums text-ink">{student.correct_answers}</span>{' '}
          correct answers
        </p>
      </div>

      <section className="mt-14">
        <SectionHead label="New test" />

        {error && (
          <div className="mt-5">
            <Notice>{error}</Notice>
          </div>
        )}
        {subjects === null && !error && (
          <div className="mt-5">
            <Quiet>Loading subjects…</Quiet>
          </div>
        )}
        {subjects?.length === 0 && (
          <div className="mt-5">
            <Quiet>No subjects available yet.</Quiet>
          </div>
        )}

        {subjects && subjects.length > 0 && (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {subjects.map((s) => (
                <button
                  key={s.subject_id}
                  onClick={() => selectSubject(s.subject_id)}
                  aria-pressed={selected === s.subject_id}
                  className={`rounded-lg border px-4 py-4 text-left font-display expanded text-lg font-bold tracking-tight transition ${
                    selected === s.subject_id
                      ? 'border-signal bg-signal-soft text-signal'
                      : 'border-rule bg-raise text-muted hover:border-signal hover:text-ink'
                  }`}
                >
                  {s.subject_name}
                </button>
              ))}
            </div>

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
                        className="eyebrow shrink-0 hover:text-signal"
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
                  <div className="mt-4">
                    <Quiet>Loading chapters…</Quiet>
                  </div>
                )}
                {chapters?.length === 0 && (
                  <div className="mt-4">
                    <Quiet>No chapters for this subject yet.</Quiet>
                  </div>
                )}

                {chapters && chapters.length > 0 && (
                  <>
                    <div className="mt-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {chapters.map((c) => (
                        <label
                          key={c.chapter_id}
                          className="flex cursor-pointer items-center gap-3 rounded-md border border-rule bg-raise px-3 py-2.5 text-[15px] text-ink hover:border-signal"
                        >
                          <input
                            type="checkbox"
                            checked={checked.has(c.chapter_id)}
                            onChange={() => toggleChapter(c.chapter_id)}
                            className="h-4 w-4 accent-signal"
                          />
                          {c.chapter_name}
                        </label>
                      ))}
                    </div>
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
                              total === QUESTIONS_PER_QUIZ ? 'text-muted' : 'text-hard'
                            }`}
                          >
                            {total === QUESTIONS_PER_QUIZ
                              ? '30 of 30 assigned'
                              : `${remaining} still to assign`}
                          </span>
                        }
                      />
                      <div className="mt-5">
                        <Tape tones={mixTones} label="Difficulty mix across the 30 questions" />
                      </div>

                      <div className="mt-6 space-y-5">
                        {SLIDERS.map(({ key, label, bar }) => (
                          <div key={key}>
                            <div className="flex items-center justify-between">
                              <span className="eyebrow flex items-center gap-2 text-ink">
                                <span aria-hidden className={`h-3 w-[3px] ${bar}`} />
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

                      <button
                        onClick={generate}
                        disabled={!canGenerate}
                        className="btn btn-solid mt-8 w-full py-3.5"
                      >
                        {generating ? 'Building your test…' : 'Start test'}
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
          <div className="mt-5">
            <Quiet>Loading past tests…</Quiet>
          </div>
        )}
        {history?.length === 0 && (
          <div className="mt-5">
            <Quiet>Nothing here yet. Your first test will show up once you finish it.</Quiet>
          </div>
        )}

        {history && history.length > 0 && (
          <ul className="mt-5">
            {history.map((item) => (
              <li
                key={item.quiz_id}
                className="flex flex-col gap-3 border-b border-rule py-4 sm:flex-row sm:items-center sm:justify-between"
              >
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
                        className="block h-full bg-signal"
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
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  )
}
