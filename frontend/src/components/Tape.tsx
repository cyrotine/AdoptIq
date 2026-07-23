// The graduated tape — this app's one recurring instrument, now luminous.
//
// A tape is always a real count, never decoration. On the dashboard its ticks
// are the 30 questions you are allocating across difficulties; during a quiz
// they are those same 30 questions filling in as you answer; on the result
// page they are the 30 verdicts. Same marks, same order, three readings.
// Lit marks glow with their own colour; the mark in view breathes.

import { useEffect, useState } from 'react'
import { animate, useReducedMotion } from 'framer-motion'

export type Tone = 'idle' | 'signal' | 'easy' | 'medium' | 'hard'

// text-* carries the glow colour (tick-lit / breathe use currentColor).
const TONE_BG: Record<Tone, string> = {
  idle: 'bg-rule',
  signal: 'bg-signal text-signal tick-lit',
  easy: 'bg-easy text-easy tick-lit',
  medium: 'bg-medium text-medium tick-lit',
  hard: 'bg-hard text-hard tick-lit',
}

export function Tape({
  tones,
  current,
  onSelect,
  reveal = false,
  label,
}: {
  tones: Tone[]
  /** Index drawn taller with a breathing glow — the question in view. */
  current?: number
  /** When given, ticks become buttons that jump to that question. */
  onSelect?: (index: number) => void
  /** Stagger the ticks in on mount. Used once, on the result. */
  reveal?: boolean
  /** Accessible name for the whole tape. */
  label: string
}) {
  return (
    // The baseline is the edge of the rule the marks are struck against.
    // Interactive tapes keep 24px hit targets and scroll instead of shrinking.
    <div
      role="group"
      aria-label={label}
      className={`flex h-7 items-end justify-between border-b border-rule ${
        onSelect ? 'overflow-x-auto' : ''
      }`}
    >
      {tones.map((tone, i) => {
        const isCurrent = i === current
        // The tick in view always reads as live — signal-lit even before an
        // answer lands (never stack two bg-* classes; order isn't guaranteed).
        const toneClass =
          isCurrent && tone === 'idle' ? 'bg-signal text-signal' : TONE_BG[tone]
        const bar = (
          <span
            className={`block w-1 rounded-full ${toneClass} ${isCurrent ? 'h-7 breathe' : 'h-5'}`}
          />
        )
        const style = reveal
          ? { animation: 'tick-in .3s ease-out backwards', animationDelay: `${i * 14}ms` }
          : undefined

        if (!onSelect) {
          return (
            <span key={i} style={style} className="flex origin-bottom items-end">
              {bar}
            </span>
          )
        }
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            aria-label={`Question ${i + 1}`}
            aria-current={isCurrent || undefined}
            style={style}
            // 24px-wide hit area without widening the mark.
            className="flex w-6 shrink-0 origin-bottom cursor-pointer items-end justify-center pt-3 hover:opacity-55"
          >
            {bar}
          </button>
        )
      })}
    </div>
  )
}

// Demo variant: a gauge whose needle drifts and settles on its own —
// forever measuring. Marketing surfaces only (welcome hero, login panel);
// real gauges always show a real value.
export function DriftingGauge({ caption }: { caption: string }) {
  const reduce = useReducedMotion()
  const [value, setValue] = useState(61)
  useEffect(() => {
    if (reduce) return
    const controls = animate(42, 68, {
      duration: 9,
      repeat: Infinity,
      repeatType: 'mirror',
      ease: 'easeInOut',
      onUpdate: setValue,
    })
    return () => controls.stop()
  }, [reduce])
  return <Gauge value={value} caption={caption} />
}

// The 0–100 scale the whole platform rates on, drawn as a ruler with a
// luminous needle. Minor graduation every 2, major every 10 — both painted
// as one gradient rather than a hundred elements.
export function Gauge({ value, caption }: { value: number; caption: string }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div>
      <div
        className="relative h-8"
        role="img"
        aria-label={`${caption}: ${Math.round(clamped)} out of 100`}
      >
        <div
          className="absolute inset-x-0 bottom-0 h-2"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to right, color-mix(in srgb, var(--color-rule) 70%, transparent) 0 1px, transparent 1px 2%)',
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-4"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to right, var(--color-muted) 0 1px, transparent 1px 10%)',
          }}
        />
        <div
          className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center transition-[left] duration-300 ease-out"
          style={{ left: `${clamped}%` }}
        >
          <span className="font-util text-xs font-semibold text-signal tabular-nums">
            {Math.round(clamped)}
          </span>
          <span className="tick-lit mt-0.5 h-5 w-0.5 bg-signal text-signal" />
        </div>
      </div>
      <div className="mt-1 flex justify-between font-util text-[10px] text-muted tabular-nums">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  )
}
