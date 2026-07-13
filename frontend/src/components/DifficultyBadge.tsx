import type { Difficulty } from '../lib/quiz'

// Single source of truth for difficulty colors (Spec 06): green / yellow / red.
// Label text always shown so color is never the only signal.
const COLORS: Record<Difficulty, string> = {
  Easy: 'bg-green-100 text-green-700',
  Medium: 'bg-amber-100 text-amber-700',
  Hard: 'bg-red-100 text-red-700',
}

export default function DifficultyBadge({ label }: { label: Difficulty }) {
  return (
    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${COLORS[label]}`}>
      {label}
    </span>
  )
}
