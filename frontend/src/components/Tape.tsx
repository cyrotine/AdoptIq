// The graduated tape — this app's one recurring instrument.
//
// A tape is always a real count, never decoration. On the dashboard its ticks
// are the 30 questions you are allocating across difficulties; during a quiz
// they are those same 30 questions filling in as you answer; on the result
// page they are the 30 verdicts. Same marks, same order, three readings.

export type Tone = 'idle' | 'signal' | 'easy' | 'medium' | 'hard'

const TONE_BG: Record<Tone, string> = {
  idle: 'bg-rule',
  signal: 'bg-signal',
  easy: 'bg-easy',
  medium: 'bg-medium',
  hard: 'bg-hard',
}

export function Tape({
  tones,
  current,
  onSelect,
  reveal = false,
  label,
}: {
  tones: Tone[]
  /** Index drawn taller with a signal cap — the question in view. */
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
    <div
      role="group"
      aria-label={label}
      className="flex h-7 items-end justify-between border-b border-rule"
    >
      {tones.map((tone, i) => {
        const isCurrent = i === current
        const bar = (
          <span className={`block w-1 ${TONE_BG[tone]} ${isCurrent ? 'h-7' : 'h-5'}`} />
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
            // Padding widens the hit area without widening the mark.
            className="flex origin-bottom cursor-pointer items-end px-1 pt-3 hover:opacity-55"
          >
            {bar}
          </button>
        )
      })}
    </div>
  )
}

// The 0–100 scale the whole platform rates on, drawn as a ruler with a needle.
// Minor graduation every 2, major every 10 — both painted as one gradient
// rather than a hundred elements.
export function Gauge({ value, caption }: { value: number; caption: string }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div>
      <div
        className="relative h-8"
        role="img"
        aria-label={`${caption}: ${Math.round(clamped)} out of 100`}
      >
        {/* Minor graduation every 2, major every 10 — one gradient each. */}
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
          className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center"
          style={{ left: `${clamped}%` }}
        >
          <span className="font-util text-xs font-semibold text-signal tabular-nums">
            {Math.round(clamped)}
          </span>
          <span className="mt-0.5 h-5 w-0.5 bg-signal" />
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
