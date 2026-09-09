import { useEffect, useRef, useState } from 'react'
import type { BookRow } from '../../../preload'
import Book3D from './Book3D'

interface Props {
  total: number
  get: (index: number) => BookRow | undefined
  ensure: (index: number) => void
  reset: number
  onOpen: (b: BookRow) => void
}

const BOOK_W = 124
const BOOK_H = 180
const GAP = 30
const ROW_H = 248
const PAD = 28
const PAGE = 60

// Virtual bookshelf: only the visible rows are rendered, so it scales to any library size
export default function ShelfView({ total, get, ensure, reset, onOpen }: Props): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 900, h: 560 })
  const [scrollTop, setScrollTop] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const inner = size.w - PAD * 2
  const cols = Math.max(1, Math.floor((inner + GAP) / (BOOK_W + GAP)))
  // spread the columns so a full row always spans the shelf
  const gap = cols > 1 ? Math.max(GAP, (inner - cols * BOOK_W) / (cols - 1)) : GAP
  const rows = Math.ceil(total / cols)
  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - 1)
  const last = Math.min(rows - 1, Math.ceil((scrollTop + size.h) / ROW_H) + 1)

  useEffect(() => {
    if (!total) return
    const from = first * cols
    const to = Math.min(total - 1, (last + 1) * cols)
    for (let i = from; i <= to; i += PAGE) ensure(i)
    ensure(to)
  }, [first, last, cols, total, ensure, reset])

  const rowEls: React.JSX.Element[] = []
  for (let r = first; r <= last; r++) {
    const books: React.JSX.Element[] = []
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      if (i >= total) break
      const b = get(i)
      books.push(
        <button
          key={i}
          className={`shelf-book ${b ? '' : 'skeleton'}`}
          style={{ width: BOOK_W, height: BOOK_H }}
          title={b ? `${b.title}${b.author ? ` · ${b.author}` : ''}` : ''}
          onClick={() => b && onOpen(b)}
        >
          {b && <Book3D book={b} />}
        </button>
      )
    }
    rowEls.push(
      <div key={r} className="shelf-row" style={{ top: r * ROW_H, height: ROW_H }}>
        <div className="shelf-books" style={{ gap, padding: `0 ${PAD}px` }}>
          {books}
        </div>
        <div className="shelf-board" />
      </div>
    )
  }

  return (
    <div className="shelf" ref={ref} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
      <div style={{ height: rows * ROW_H, position: 'relative' }}>{rowEls}</div>
    </div>
  )
}
