// Public showcase page (spec 16). Pure marketing surface: no API calls, no
// auth — the interactive Elo demo below runs entirely in local state.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowRight,
  BookOpenCheck,
  Check,
  LineChart,
  SlidersHorizontal,
  Target,
  X,
} from 'lucide-react'
import Ambient from '../components/Ambient'
import { Wordmark } from '../components/Shell'
import { DriftingGauge, Gauge, Tape, type Tone } from '../components/Tape'

// Section reveal on scroll — once, gently.
function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.section
      className={`mx-auto w-full max-w-4xl px-6 ${className}`}
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      {children}
    </motion.section>
  )
}

// Interactive Elo demo: answer for a fictional student and watch the scale
// react. The maths mirrors the platform's idea — right answers on questions
// above your level move you most — without touching any real logic.
function EloDemo() {
  const [elo, setElo] = useState(50)
  const [tones, setTones] = useState<Tone[]>([])

  const question = Math.round(Math.min(95, elo + 8)) // slightly above your level
  const expected = 1 / (1 + 10 ** ((question - elo) / 20))

  const answer = (correct: boolean) => {
    setElo((e) =>
      Math.max(5, Math.min(95, e + (correct ? 9 * (1 - expected) : -9 * expected))),
    )
    setTones((t) => [...t.slice(-19), correct ? 'easy' : 'hard'])
  }

  return (
    <div className="pane px-6 py-8 sm:px-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="eyebrow">Try it — answer for this student</p>
        <p className="font-util text-[11px] uppercase tracking-[0.1em] text-muted">
          Next question difficulty:{' '}
          <span className="font-semibold text-ink tabular-nums">{question}</span>
        </p>
      </div>

      <div className="mt-8">
        <Gauge value={elo} caption="Demo student mastery" />
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => answer(true)}
          className="btn btn-quiet flex items-center gap-2 px-4 py-2.5 !text-easy"
        >
          <Check aria-hidden size={16} strokeWidth={1.75} /> Answer correctly
        </button>
        <button
          type="button"
          onClick={() => answer(false)}
          className="btn btn-quiet flex items-center gap-2 px-4 py-2.5 !text-hard"
        >
          <X aria-hidden size={16} strokeWidth={1.75} /> Answer wrong
        </button>
      </div>

      {tones.length > 0 && (
        <div className="mt-8">
          <Tape tones={tones} label="Demo answers so far" />
          <p className="eyebrow mt-3">
            Notice: the harder the question relative to the level, the bigger a correct answer
            moves the needle.
          </p>
        </div>
      )}
    </div>
  )
}

const STEPS: [string, string][] = [
  [
    'Get placed on the scale',
    'A two-minute setup reads how last year went and how solid each area feels, then places you at a starting level from 0 to 100 — no cold start.',
  ],
  [
    'Take tests built for your level',
    'Every test is 30 questions drawn from your chapters at your chosen easy–medium–hard mix, pitched where you actually are.',
  ],
  [
    'Every answer recalibrates',
    'Each finished test updates your mastery topic by topic. Beating a hard question moves you further than an easy one — and your next test already knows.',
  ],
]

const FEATURES: [typeof Target, string, string][] = [
  [Target, 'Placed, not guessed', 'Your starting level comes from you, not a default.'],
  [SlidersHorizontal, 'Your mix', 'Slide easy, medium and hard until the 30 marks feel right.'],
  [BookOpenCheck, 'Every answer explained', 'Each question carries its why — read it on the spot.'],
  [LineChart, 'Mastery that moves', 'A 0–100 reading per topic, recalculated after every test.'],
]

export default function Welcome() {
  return (
    <div className="min-h-screen">
      <Ambient />

      <header className="glass sticky top-0 z-10 border-b border-rule">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-3.5">
          <Wordmark />
          <nav className="flex items-center gap-3">
            <Link to="/login" className="eyebrow transition-colors hover:text-signal">
              Sign in
            </Link>
            <Link to="/register" className="btn btn-solid px-4 py-2">
              Start learning
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero — the measurement thesis, with the instrument beside it. */}
      <Section className="pb-20 pt-16 sm:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="eyebrow">Adaptive practice · Class 9 &amp; 10</p>
            <h1 className="mt-5 font-display expanded text-5xl font-extrabold leading-[1.02] tracking-tight text-ink sm:text-6xl">
              Learning,{' '}
              <span className="bg-gradient-to-br from-signal to-signal-deep bg-clip-text text-transparent">
                Measured.
              </span>
            </h1>
            <p className="mt-6 max-w-md text-[17px] leading-relaxed text-muted">
              Every quiz adapts to your understanding. Every answer recalibrates your mastery.
              Practice that grows with you.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link to="/register" className="btn btn-solid flex items-center gap-2 px-6 py-3">
                Start learning <ArrowRight aria-hidden size={16} strokeWidth={2} />
              </Link>
              <Link to="/login" className="btn btn-quiet px-5 py-3">
                Sign in
              </Link>
            </div>
          </div>
          <div className="pane px-6 py-10 sm:px-8">
            <p className="eyebrow mb-8">Live reading</p>
            <DriftingGauge caption="A student's live mastery level" />
            <p className="eyebrow mt-8">Your level, recalculated after every test</p>
          </div>
        </div>
      </Section>

      {/* How it works — a real sequence, so it earns its numbers. */}
      <Section className="py-16">
        <div className="flex items-center gap-4">
          <span className="eyebrow shrink-0">How it works</span>
          <span className="rule grow" />
        </div>
        <ol className="mt-10 grid gap-10 sm:grid-cols-3">
          {STEPS.map(([title, body], i) => (
            <li key={title}>
              <span className="font-util text-xs font-semibold tabular-nums text-signal">
                0{i + 1}
              </span>
              <h2 className="mt-3 font-display expanded text-lg font-bold tracking-tight text-ink">
                {title}
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* The rating, explained by letting the visitor move it. */}
      <Section className="py-16">
        <div className="flex items-center gap-4">
          <span className="eyebrow shrink-0">How the rating works</span>
          <span className="rule grow" />
        </div>
        <p className="mt-8 max-w-2xl text-[17px] leading-relaxed text-muted">
          AdaptIQ rates every student and every question on the same 0–100 scale — the same idea
          chess uses to rate players. When you beat a question pitched above your level, your
          rating climbs sharply; slip on an easy one and it eases back. The scale is honest by
          design: it only ever moves on evidence.
        </p>
        <div className="mt-10">
          <EloDemo />
        </div>
      </Section>

      {/* Features. */}
      <Section className="py-16">
        <div className="flex items-center gap-4">
          <span className="eyebrow shrink-0">Built in</span>
          <span className="rule grow" />
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {FEATURES.map(([Icon, title, body]) => (
            <div
              key={title}
              className="pane px-6 py-6 transition-colors duration-150 hover:border-signal/40"
            >
              <Icon aria-hidden size={20} strokeWidth={1.75} className="text-signal" />
              <h2 className="mt-4 font-display expanded text-base font-bold tracking-tight text-ink">
                {title}
              </h2>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Honest numbers only. */}
      <Section className="py-16">
        <div className="grid gap-4 text-center sm:grid-cols-3">
          {(
            [
              ['30', 'questions per test'],
              ['0–100', 'mastery scale, per topic'],
              ['2', 'subjects · Maths & Science'],
            ] as const
          ).map(([n, label]) => (
            <div key={label} className="pane px-6 py-8">
              <p className="font-display expanded text-4xl font-extrabold tracking-tight text-ink tabular-nums">
                {n}
              </p>
              <p className="eyebrow mt-3">{label}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Closing CTA. */}
      <Section className="pb-24 pt-8 text-center">
        <h2 className="font-display expanded text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          Find out where you stand.
        </h2>
        <p className="mx-auto mt-4 max-w-md text-[16px] leading-relaxed text-muted">
          Two minutes to get placed on the scale. Your first test is built around where you
          actually are.
        </p>
        <Link
          to="/register"
          className="btn btn-solid mt-8 inline-flex items-center gap-2 px-8 py-3.5"
        >
          Start learning <ArrowRight aria-hidden size={16} strokeWidth={2} />
        </Link>
      </Section>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-6 py-8">
          <Wordmark />
          <p className="eyebrow">Adaptive practice for Class 9 &amp; 10</p>
        </div>
      </footer>
    </div>
  )
}
