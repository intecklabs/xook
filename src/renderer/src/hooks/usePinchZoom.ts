import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { defaultSettings } from '../lib/types'

export const FONT_MIN = 12
export const FONT_MAX = 80

export function usePinchZoom(): number | null {
  const updateSettings = useStore((s) => s.updateSettings)
  const [indicator, setIndicator] = useState<number | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sizeF = useRef<number | null>(null)

  useEffect(() => {
    const apply = (next: number): void => {
      const size = Math.round(Math.max(FONT_MIN, Math.min(FONT_MAX, next)))
      updateSettings({ fontSize: size })
      setIndicator(size)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => setIndicator(null), 900)
    }

    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const current = useStore.getState().settings.fontSize
      if (sizeF.current === null || Math.abs(sizeF.current - current) >= 1) sizeF.current = current
      // A mouse notch arrives as exactly ±100; a touchpad pinch streams fractional deltas
      const isMouseNotch = Math.abs(e.deltaY) >= 100 && Math.abs(e.deltaY) % 100 === 0
      let next: number
      if (isMouseNotch) {
        next = sizeF.current + (e.deltaY < 0 ? 2 : -2)
      } else {
        const factor = Math.exp(-e.deltaY * 0.006)
        const delta = Math.max(-4, Math.min(4, sizeF.current * (factor - 1)))
        next = sizeF.current + delta
      }
      sizeF.current = Math.max(FONT_MIN, Math.min(FONT_MAX, next))
      if (Math.round(sizeF.current) !== current) apply(sizeF.current)
    }

    const onKey = (e: KeyboardEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return
      const current = useStore.getState().settings.fontSize
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        apply(current + 2)
      } else if (e.key === '-') {
        e.preventDefault()
        apply(current - 2)
      } else if (e.key === '0') {
        e.preventDefault()
        apply(defaultSettings.fontSize)
      }
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [updateSettings])

  return indicator
}
