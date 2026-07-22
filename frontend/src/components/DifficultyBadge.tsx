import type { Difficulty } from '../lib/quiz'

// Difficulty is an ordered 3-stop scale (Spec 06), so it is drawn as one:
// three rungs, filled to the level. Colour repeats the scale, the label states
// it, and the rung count carries the order — colour is never the only signal.
const LEVEL: Record<Difficulty, { rungs: number; bar: string; text: string }> = {
  Easy: { rungs: 1, bar: 'bg-easy', text: 'text-easy' },
  Medium: { rungs: 2, bar: 'bg-medium', text: 'text-medium' },
  Hard: { rungs: 3, bar: 'bg-hard', text: 'text-hard' },
}

const RUNG_HEIGHT = ['h-1.5', 'h-2.5', 'h-3.5']

export default function DifficultyBadge({ label }: { label: Difficulty }) {
  const { rungs, bar, text } = LEVEL[label]
  return (
    <span
      className={`flex shrink-0 items-center gap-1.5 font-util text-[10px] font-medium uppercase tracking-[0.14em] ${text}`}
    >
      <span aria-hidden className="flex items-end gap-[2px]">
        {RUNG_HEIGHT.map((h, i) => (
          <span key={h} className={`w-[3px] ${h} ${i < rungs ? bar : 'bg-rule'}`} />
        ))}
      </span>
      {label}
    </span>
  )
}
