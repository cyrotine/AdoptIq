import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { seedBaseline, type BaselinePayload } from '../lib/api'
import { Notice, PageHead, SectionHead, Wordmark } from '../components/Shell'
import { Gauge } from '../components/Tape'

// Hardcoded probe (spec 08). Keys MUST match the backend AREA_CHAPTERS / marks
// bands. Answers live in React state and are POSTed once on finish.
const SUBJECTS = ['Maths', 'Science'] as const
type Subject = (typeof SUBJECTS)[number]

const MARKS = [
  { key: 'below40', label: 'Below 40%' },
  { key: 'mid4060', label: '40–60%' },
  { key: 'mid6080', label: '60–80%' },
  { key: 'top80', label: 'Above 80%' },
]

const AREAS: Record<Subject, [string, string][]> = {
  Maths: [
    ['Algebra', 'equations, polynomials, number systems'],
    ['Geometry', 'lines, angles, triangles, circles'],
    ['Coordinate & Trigonometry', 'graphs, trig ratios & heights'],
    ['Mensuration', 'areas, surface areas & volumes'],
    ['Statistics & Probability', 'data handling & chance'],
  ],
  Science: [
    ['Chemistry', 'matter, atoms, reactions, acids & bases'],
    ['Mechanics & Electricity', 'motion, force, current'],
    ['Waves, Light & Sound', 'optics, the eye & waves'],
    ['Biology', 'cells, life processes, heredity'],
    ['Environment & Energy', 'resources & ecosystems'],
  ],
}

// stars default to 3 (neutral) so the student only nudges what differs.
const initialStars = () =>
  Object.fromEntries(
    SUBJECTS.map((s) => [s, Object.fromEntries(AREAS[s].map(([a]) => [a, 3]))]),
  ) as Record<Subject, Record<string, number>>

// A five-position detent rather than five stars: this is a reading on a scale,
// not a rating out of five, and the rising rungs say which way is "better".
const RUNG = ['h-2', 'h-3', 'h-4', 'h-5', 'h-6']
const CONFIDENCE = ['Shaky', 'Weak', 'Okay', 'Good', 'Solid']

function Detent({
  value,
  onChange,
  name,
}: {
  value: number
  onChange: (n: number) => void
  name: string
}) {
  return (
    <div className="flex shrink-0 items-end gap-1" role="group" aria-label={`${name} confidence`}>
      {RUNG.map((h, i) => (
        <button
          key={h}
          type="button"
          aria-label={CONFIDENCE[i]}
          aria-pressed={i + 1 === value}
          onClick={() => onChange(i + 1)}
          className="group flex w-5 cursor-pointer items-end justify-center py-1"
        >
          <span
            className={`block w-[3px] ${h} transition-colors ${
              i < value ? 'bg-signal' : 'bg-rule group-hover:bg-muted'
            }`}
          />
        </button>
      ))}
    </div>
  )
}

export default function Onboarding() {
  const navigate = useNavigate()
  const [marks, setMarks] = useState<Partial<Record<Subject, string>>>({})
  const [stars, setStars] = useState(initialStars)
  const [manual, setManual] = useState(false)
  const [manualElo, setManualElo] = useState(50)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (payload: BaselinePayload) => {
    setError(null)
    setSubmitting(true)
    try {
      await seedBaseline(payload)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not save your answers')
      setSubmitting(false)
    }
  }

  const finishProbe = () =>
    submit({
      mode: 'probe',
      subjects: Object.fromEntries(
        SUBJECTS.map((s) => [s, { marks: marks[s], areas: stars[s] }]),
      ),
    })

  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl px-6 py-14">
      <Wordmark context="Setup" />
      <div className="mt-8">
        <PageHead
          title="Where should we start you?"
          note="A minute here and your first test lands at the right level instead of guessing. You can skip it."
        />
      </div>

      {error && (
        <div className="mt-8">
          <Notice>{error}</Notice>
        </div>
      )}

      {manual ? (
        <section className="mt-12">
          <SectionHead label="Starting level" />
          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            One level from 0 to 100, applied to every topic. 50 is average for your class.
          </p>
          <div className="mt-8">
            <Gauge value={manualElo} caption="Starting level" />
          </div>
          <input
            type="range"
            aria-label="Starting level"
            min={0}
            max={100}
            value={manualElo}
            onChange={(e) => setManualElo(Number(e.target.value))}
            className="mt-4 w-full cursor-pointer accent-signal"
          />
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={() => submit({ mode: 'manual', elo: manualElo })}
              className="btn btn-solid px-5 py-2.5"
            >
              {submitting ? 'Saving…' : 'Save and continue'}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setManual(false)}
              className="btn btn-quiet px-4 py-2.5"
            >
              Back to questions
            </button>
          </div>
        </section>
      ) : (
        <>
          {SUBJECTS.map((subject) => (
            <section key={subject} className="mt-14">
              <SectionHead label={subject} />

              <p className="mt-6 text-[15px] text-ink">
                How were your {subject} marks last year?
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {MARKS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={marks[subject] === key}
                    onClick={() => setMarks((m) => ({ ...m, [subject]: key }))}
                    className={`rounded-md border px-3 py-2.5 font-util text-xs tabular-nums transition ${
                      marks[subject] === key
                        ? 'border-signal bg-signal-soft font-semibold text-signal'
                        : 'border-rule bg-raise text-muted hover:border-signal hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <p className="mt-9 text-[15px] text-ink">How solid does each area feel?</p>
              <p className="eyebrow mt-1.5">Left is shaky, right is solid</p>
              <ul className="mt-3">
                {AREAS[subject].map(([area, hint]) => (
                  <li
                    key={area}
                    className="flex items-center justify-between gap-6 border-b border-rule py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="text-[15px] text-ink">{area}</p>
                      <p className="mt-0.5 text-sm text-muted">{hint}</p>
                    </div>
                    <Detent
                      name={area}
                      value={stars[subject][area]}
                      onChange={(n) =>
                        setStars((s) => ({ ...s, [subject]: { ...s[subject], [area]: n } }))
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <div className="mt-12 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={finishProbe}
              className="btn btn-solid px-6 py-2.5"
            >
              {submitting ? 'Saving…' : 'Finish setup'}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setManual(true)}
              className="btn btn-quiet px-4 py-2.5"
            >
              Set level myself
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => submit({ mode: 'skip' })}
              className="eyebrow ml-auto hover:text-signal"
            >
              Skip for now
            </button>
          </div>
        </>
      )}
    </div>
  )
}
