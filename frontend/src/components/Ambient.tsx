// Fixed ambient backdrop behind every page: two drifting glow orbs, a faint
// grid fading below the fold, and film grain. Pure CSS — no canvas, no
// listeners; the reduced-motion clamp in index.css freezes the drift.

// 128px tile of SVG turbulence, ~300 bytes — cheaper than shipping a PNG.
const NOISE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2'/%3E%3C/filter%3E%3Crect width='128' height='128' filter='url(%23n)'/%3E%3C/svg%3E"

export default function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="orb orb-iris" />
      <div className="orb orb-ember" />
      <div className="gridlines absolute inset-0" />
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{ backgroundImage: `url("${NOISE}")` }}
      />
    </div>
  )
}
