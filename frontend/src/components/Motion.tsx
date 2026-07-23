// Shared motion vocabulary. Everything here is presentation-only and
// respects prefers-reduced-motion; durations never exceed 400ms.
import { useEffect, useRef, type ReactNode } from 'react'
import { animate, motion, useReducedMotion, type Variants } from 'framer-motion'

// Page entrance: fade + 12px rise. New routes mount fresh, so an
// enter-only transition reads as a page transition without wrapping the
// router. Used by Shell and the full-screen pages.
export function Enter({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut', delay }}
    >
      {children}
    </motion.div>
  )
}

// Stagger container + item, for lists (subjects, chapters, history…).
// Cap: pass at most ~20 animated children; render longer lists plain.
const item: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
}

export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : 'hidden'}
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.03 } } }}
    >
      {children}
    </motion.div>
  )
}

export function Item({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={item}>
      {children}
    </motion.div>
  )
}

// Animated counter. The real value is in the DOM from the first render
// (screen readers and reduced motion see it immediately); the animation
// only rewrites textContent on the way up.
export function CountUp({ value, duration = 0.8 }: { value: number; duration?: number }) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (reduce || !ref.current) return
    const controls = animate(0, value, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = String(Math.round(v))
      },
    })
    return () => controls.stop()
  }, [value, duration, reduce])

  return (
    <span ref={ref} className="tabular-nums">
      {value}
    </span>
  )
}
