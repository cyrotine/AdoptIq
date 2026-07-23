// Hardcoded probe (spec 08). Keys MUST match the backend AREA_CHAPTERS / marks
// bands. Answers live in React state and are POSTed once on finish.
//
// Spec 16 re-skin: the same probe, delivered as four stepped screens with a
// progress constellation — "configuring your tutor" rather than a form. The
// step index is presentation-only; marks/stars/manual/skip state and the
// single seedBaseline payload are unchanged.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { seedBaseline, type BaselinePayload } from '../lib/api'
import Ambient from '../components/Ambient'
import { CalibrationOverlay } from '../components/AuthForm'
import { Stagger, Item } from '../components/Motion'
import { Notice, PageHead, SectionHead, Wordmark } from '../components/Shell'
import { Gauge } from '../components/Tape'

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
            className={`block w-[3px] rounded-full ${h} transition-colors ${
              i < value ? 'tick-lit bg-signal text-signal' : 'bg-rule group-hover:bg-muted'
            }`}
          />
        </button>
      ))}
    </div>
  )
}

// The four probe screens: marks then areas, per subject.
const STEPS: { subject: Subject; part: 'marks' | 'areas'; label: string }[] = SUBJECTS.flatMap(
  (subject) => [
    { subject, part: 'marks' as const, label: `${subject} marks` },
    { subject, part: 'areas' as const, label: `${subject} areas` },
  ],
)

// Progress constellation: one lit dot per screen, the current one breathing.
function Constellation({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
      {STEPS.map(({ label }, i) => (
        <span key={label} className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              i < step
                ? 'bg-signal'
                : i === step
                  ? 'breathe bg-signal text-signal'
                  : 'bg-rule'
            }`}
          />
          {i < STEPS.length - 1 && <span className="h-px w-6 bg-rule sm:w-10" />}
        </span>
      ))}
      <span className="eyebrow ml-3">{STEPS[step].label}</span>
    </div>
  )
}

export default function Onboarding() {
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [step, setStep] = useState(0)
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

  const { subject, part } = STEPS[step]
  const last = step === STEPS.length - 1
  const next = () => (last ? finishProbe() : setStep((s) => s + 1))

  const pickMarks = (key: string) => {
    setMarks((m) => ({ ...m, [subject]: key }))
    // A choice advances the screen — one tap, no Continue on marks steps.
    setTimeout(() => setStep((s) => s + 1), reduce ? 0 : 200)
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl px-6 py-14">
      <Ambient />
      {/* The instrument warming up while the probe saves. */}
      {submitting && !manual && <CalibrationOverlay message="Setting up your practice…" />}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Wordmark context="Setup" />
        {!manual && <Constellation step={step} />}
      </div>

      <div className="mt-8">
        <PageHead
          title={manual ? 'Set your own starting level' : 'Where should we start you?'}
          note={
            manual
              ? 'One level from 0 to 100, applied to every topic. 50 is average for your class.'
              : 'A minute here and your first test lands at the right level instead of guessing. You can skip it.'
          }
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
          <div className="pane mt-8 px-6 py-10 sm:px-10">
            <Gauge value={manualElo} caption="Starting level" />
            <input
              type="range"
              aria-label="Starting level"
              min={0}
              max={100}
              value={manualElo}
              onChange={(e) => setManualElo(Number(e.target.value))}
              className="mt-6 w-full cursor-pointer accent-signal"
            />
          </div>
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
          <AnimatePresence mode="wait" initial={false}>
            <motion.section
              key={step}
              initial={reduce ? false : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? undefined : { opacity: 0, x: -16 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="mt-12"
            >
              <SectionHead label={subject} />

              {part === 'marks' ? (
                <>
                  <p className="mt-8 text-[17px] text-ink">
                    How were your {subject} marks last year?
                  </p>
                  <Stagger className="mt-5 grid grid-cols-2 gap-3">
                    {MARKS.map(({ key, label }) => (
                      <Item key={key}>
                        <button
                          type="button"
                          aria-pressed={marks[subject] === key}
                          onClick={() => pickMarks(key)}
                          className={`pane w-full cursor-pointer px-4 py-7 text-center font-util text-sm font-semibold tabular-nums transition-colors duration-150 ${
                            marks[subject] === key
                              ? '!border-signal bg-signal-soft text-signal'
                              : 'text-muted hover:!border-signal/50 hover:text-ink'
                          }`}
                        >
                          {label}
                        </button>
                      </Item>
                    ))}
                  </Stagger>
                  <button
                    type="button"
                    onClick={next}
                    className="eyebrow mt-6 cursor-pointer transition-colors hover:text-signal"
                  >
                    Not sure — skip this question
                  </button>
                </>
              ) : (
                <>
                  <p className="mt-8 text-[17px] text-ink">How solid does each area feel?</p>
                  <p className="eyebrow mt-1.5">Left is shaky, right is solid</p>
                  <Stagger className="mt-4">
                    {AREAS[subject].map(([area, hint]) => (
                      <Item key={area}>
                        <div className="flex items-center justify-between gap-6 border-b border-rule py-3.5">
                          <div className="min-w-0">
                            <p className="text-[15px] text-ink">{area}</p>
                            <p className="mt-0.5 text-sm text-muted">{hint}</p>
                          </div>
                          <Detent
                            name={area}
                            value={stars[subject][area]}
                            onChange={(n) =>
                              setStars((s) => ({
                                ...s,
                                [subject]: { ...s[subject], [area]: n },
                              }))
                            }
                          />
                        </div>
                      </Item>
                    ))}
                  </Stagger>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={next}
                    className="btn btn-solid mt-8 px-6 py-2.5"
                  >
                    {last ? 'Finish setup' : 'Continue'}
                  </button>
                </>
              )}
            </motion.section>
          </AnimatePresence>

          <div className="mt-12 flex flex-wrap items-center gap-3 border-t border-rule pt-6">
            {step > 0 && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => setStep((s) => s - 1)}
                className="btn btn-quiet px-4 py-2"
              >
                Back
              </button>
            )}
            <button
              type="button"
              disabled={submitting}
              onClick={() => setManual(true)}
              className="btn btn-quiet px-4 py-2"
            >
              Set level myself
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => submit({ mode: 'skip' })}
              className="eyebrow ml-auto cursor-pointer transition-colors hover:text-signal"
            >
              Skip for now
            </button>
          </div>
        </>
      )}
    </div>
  )
}
