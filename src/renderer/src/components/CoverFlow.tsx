import { useCallback, useEffect, useRef } from 'react'
import type { BookRow } from '../../../preload'
import Book3D from './Book3D'
import Icon from './Icon'

interface Props {
  total: number
  get: (index: number) => BookRow | undefined
  ensure: (index: number) => void
  index: number
  onIndexChange: (i: number) => void
  onOpen: (book: BookRow) => void
}

const SPACING = 150
const SIDE_ANGLE = 58
const VISIBLE = 6

export default function CoverFlow({
  total,
  get,
  ensure,
  index,
  onIndexChange,
  onOpen
}: Props): React.JSX.Element {
  const wheelAccum = useRef(0)
  const lastWheel = useRef(0)

  const clamp = useCallback((i: number) => Math.max(0, Math.min(total - 1, i)), [total])

  useEffect(() => {
    ensure(index)
  }, [index, ensure])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        onIndexChange(clamp(index - 1))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        onIndexChange(clamp(index + 1))
      } else if (e.key === 'Enter') {
        const b = get(index)
        if (b) onOpen(b)
      } else if (e.key === 'Home') onIndexChange(0)
      else if (e.key === 'End') onIndexChange(total - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, total, clamp, get, onIndexChange, onOpen])

  const touchX = useRef<number | null>(null)
  const onTouchStart = (e: React.TouchEvent): void => {
    touchX.current = e.touches[0].clientX
  }
  const onTouchEnd = (e: React.TouchEvent): void => {
    if (touchX.current === null) return
    const dx = e.changedTouches[0].clientX - touchX.current
    touchX.current = null
    if (Math.abs(dx) > 40) onIndexChange(clamp(index + (dx < 0 ? 1 : -1)))
  }

  const onWheel = (e: React.WheelEvent): void => {
    if (e.ctrlKey) return
    const now = Date.now()
    if (now - lastWheel.current > 250) wheelAccum.current = 0
    lastWheel.current = now
    wheelAccum.current += e.deltaY || e.deltaX
    if (Math.abs(wheelAccum.current) >= 60) {
      onIndexChange(clamp(index + Math.sign(wheelAccum.current)))
      wheelAccum.current = 0
    }
  }

  const items: React.JSX.Element[] = []
  for (let i = Math.max(0, index - VISIBLE); i <= Math.min(total - 1, index + VISIBLE); i++) {
    const b = get(i)
    const offset = i - index
    const abs = Math.abs(offset)
    const x = offset === 0 ? 0 : Math.sign(offset) * (SPACING * 0.9 + abs * SPACING * 0.55)
    const rot = offset === 0 ? 0 : -Math.sign(offset) * SIDE_ANGLE
    const z = offset === 0 ? 120 : -abs * 60
    items.push(
      <div
        key={b?.id ?? `slot-${i}`}
        className={`coverflow-item ${offset === 0 ? 'center' : ''} ${b ? '' : 'skeleton'}`}
        style={{
          transform: `translate3d(${x}px, 0, ${z}px) rotateY(${rot}deg)`,
          zIndex: 100 - abs,
          opacity: abs > VISIBLE - 1 ? 0 : 1
        }}
        onClick={() => {
          if (!b) return
          if (offset === 0) onOpen(b)
          else onIndexChange(i)
        }}
        title={b ? (offset === 0 ? 'Abrir' : b.title) : ''}
      >
        {b && <Book3D book={b} lazy={false} />}
      </div>
    )
  }

  return (
    <div
      className="coverflow"
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      tabIndex={0}
    >
      <div className="coverflow-stage">{items}</div>
      {total > 1 && (
        <>
          <button
            className="coverflow-arrow left"
            onClick={() => onIndexChange(clamp(index - 1))}
            disabled={index === 0}
            aria-label="Anterior"
          >
            <Icon name="chevron-left" size={22} />
          </button>
          <button
            className="coverflow-arrow right"
            onClick={() => onIndexChange(clamp(index + 1))}
            disabled={index >= total - 1}
            aria-label="Siguiente"
          >
            <Icon name="chevron-right" size={22} />
          </button>
          <div className="coverflow-counter">
            {index + 1} / {total}
          </div>
        </>
      )}
    </div>
  )
}
