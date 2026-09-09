import { useCallback, useEffect, useRef, useState } from 'react'

// Detects "fast browsing" (many navigation events in a short window) so the UI can offer a
// quicker way to jump (the A–Z index). `pinned` keeps it open regardless of activity.
export function useFastNav(
  windowMs = 1200,
  threshold = 6,
  holdMs = 3500
): { active: boolean; pinned: boolean; bump: () => void; togglePin: () => void } {
  const times = useRef<number[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [active, setActive] = useState(false)
  const [pinned, setPinned] = useState(false)

  const bump = useCallback(() => {
    const now = Date.now()
    const t = times.current.filter((x) => now - x < windowMs)
    t.push(now)
    times.current = t
    if (t.length >= threshold) {
      setActive(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setActive(false), holdMs)
    }
  }, [windowMs, threshold, holdMs])

  const togglePin = useCallback(() => setPinned((p) => !p), [])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  return { active, pinned, bump, togglePin }
}
