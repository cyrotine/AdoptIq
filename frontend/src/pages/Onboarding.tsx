import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { seedBaseline, type BaselinePayload } from '../lib/api'

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

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onClick={() => onChange(n)}
          className={`text-2xl leading-none transition hover:scale-125 ${
            n <= value ? 'text-amber-400' : 'text-gray-300'
          }`}
        >
          ★
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
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">Let’s calibrate your quizzes</h1>
          <p className="text-sm text-gray-500">
            A quick minute now tailors your first quizzes to your level. You can skip anytime.
          </p>
        </header>

        {error && (
          <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {manual ? (
          <section className="rounded-xl bg-white p-6 shadow transition hover:-translate-y-0.5 hover:shadow-lg">
            <h2 className="text-lg font-semibold text-gray-900">Set your starting level</h2>
            <p className="mt-1 text-sm text-gray-500">
              One level (0–100) applied across every topic. 50 is average.
            </p>
            <div className="mt-4 flex items-center gap-4">
              <input
                type="range"
                min={0}
                max={100}
                value={manualElo}
                onChange={(e) => setManualElo(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
              <span className="w-12 text-right text-lg font-semibold text-indigo-600">{manualElo}</span>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => submit({ mode: 'manual', elo: manualElo })}
                className="rounded-lg bg-indigo-600 px-5 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? 'Saving…' : 'Save & continue'}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setManual(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Back to questions
              </button>
            </div>
          </section>
        ) : (
          <>
            {SUBJECTS.map((subject) => (
              <section
                key={subject}
                className="rounded-xl bg-white p-6 shadow transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <h2 className="text-lg font-semibold text-gray-900">{subject}</h2>

                <p className="mt-4 text-sm font-medium text-gray-700">
                  How were your {subject} marks last year?
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {MARKS.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setMarks((m) => ({ ...m, [subject]: key }))}
                      className={`rounded-lg border px-3 py-2 text-sm transition hover:-translate-y-0.5 hover:shadow ${
                        marks[subject] === key
                          ? 'border-indigo-600 bg-indigo-50 font-semibold text-indigo-700'
                          : 'border-gray-300 text-gray-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <p className="mt-6 text-sm font-medium text-gray-700">
                  How confident do you feel in each area?
                </p>
                <ul className="mt-2 divide-y divide-gray-100">
                  {AREAS[subject].map(([area, hint]) => (
                    <li key={area} className="flex items-center justify-between gap-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{area}</p>
                        <p className="text-xs text-gray-400">{hint}</p>
                      </div>
                      <Stars
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

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={finishProbe}
                className="rounded-lg bg-indigo-600 px-5 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? 'Saving…' : 'Finish'}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setManual(true)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Set level manually
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => submit({ mode: 'skip' })}
                className="ml-auto rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-800"
              >
                Skip for now
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
