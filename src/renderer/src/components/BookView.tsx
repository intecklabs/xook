import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { annotationAt, type TextSelection } from '../lib/selection'
import type { Token } from '../lib/types'
import { BOOK_FONTS } from '../lib/bookFonts'

const MARGINS = { narrow: 32, normal: 64, wide: 110 }
const GAP = 48

interface Props {
  tokens: Token[]
  pos: number
  onPosition: (token: number) => void
  onSelect: (sel: TextSelection | null) => void
  onToggleChrome: () => void
  onProgress: (info: { page: number; pages: number; chapter: number }) => void
}

export default function BookView({
  tokens,
  pos,
  onPosition,
  onSelect,
  onToggleChrome,
  onProgress
}: Props): React.JSX.Element {
  const settings = useStore((s) => s.settings)
  const chapters = useStore((s) => s.current?.text.chapters ?? [])
  const annotations = useStore((s) => s.current?.book.annotations ?? [])
  const viewportRef = useRef<HTMLDivElement>(null)
  const columnsRef = useRef<HTMLDivElement>(null)
  const [chapterIdx, setChapterIdx] = useState(
    tokens[Math.min(pos, tokens.length - 1)]?.chapter ?? 0
  )
  const [page, setPage] = useState(0)
  const [pages, setPages] = useState(1)
  const [layout, setLayout] = useState({ colW: 600, cols: 1 })
  const pendingToken = useRef<number | null>(pos)
  const appearance = settings.book

  const { start, paragraphs } = useMemo(() => {
    let s = 0
    while (s < tokens.length && tokens[s].chapter < chapterIdx) s++
    let e = s
    while (e < tokens.length && tokens[e].chapter === chapterIdx) e++
    const paras: { index: number; tokens: { t: Token; i: number }[] }[] = []
    for (let i = s; i < e; i++) {
      const t = tokens[i]
      const last = paras[paras.length - 1]
      if (!last || last.index !== t.paragraph) paras.push({ index: t.paragraph, tokens: [] })
      paras[paras.length - 1].tokens.push({ t, i })
    }
    return { start: s, paragraphs: paras }
  }, [tokens, chapterIdx])

  const stride = layout.cols * (layout.colW + GAP)

  const measure = useCallback(() => {
    const vp = viewportRef.current
    const col = columnsRef.current
    if (!vp || !col) return
    const margin = MARGINS[appearance.margin]
    const inner = vp.clientWidth - margin * 2
    const cols =
      appearance.columns === 'auto' ? (inner > 1100 ? 2 : 1) : (appearance.columns as number)
    const colW = Math.floor((inner - GAP * (cols - 1)) / cols)
    setLayout({ colW, cols })
    requestAnimationFrame(() => {
      const c = columnsRef.current
      if (!c) return
      const total = Math.max(1, Math.ceil((c.scrollWidth + GAP) / (cols * (colW + GAP))))
      setPages(total)
    })
  }, [appearance.margin, appearance.columns])

  useLayoutEffect(() => {
    measure()
    const vp = viewportRef.current
    if (!vp) return
    const ro = new ResizeObserver(measure)
    ro.observe(vp)
    return () => ro.disconnect()
  }, [
    measure,
    appearance.font,
    appearance.lineHeight,
    appearance.justify,
    settings.fontSize,
    chapterIdx
  ])

  const pageOfToken = useCallback(
    (token: number): number => {
      const c = columnsRef.current
      if (!c) return 0
      const el = c.querySelector<HTMLElement>(`[data-i="${token}"]`)
      if (!el) return 0
      return Math.max(0, Math.floor(el.offsetLeft / stride))
    },
    [stride]
  )

  const firstTokenOfPage = useCallback(
    (p: number): number => {
      const c = columnsRef.current
      if (!c) return start
      const left = p * stride - 1
      const spans = c.querySelectorAll<HTMLElement>('.w')
      for (const s of spans) {
        if (s.offsetLeft >= left) return Number(s.dataset.i)
      }
      return start
    },
    [stride, start]
  )

  // After layout, land on the page that holds the requested token
  useLayoutEffect(() => {
    if (pendingToken.current === null) return
    const target = pendingToken.current
    const id = requestAnimationFrame(() => {
      if (pendingToken.current !== target) return
      const p = Math.min(pageOfToken(target), pages - 1)
      setPage(p)
      pendingToken.current = null
    })
    return () => cancelAnimationFrame(id)
  }, [pages, pageOfToken, layout])

  useEffect(() => {
    onProgress({ page, pages, chapter: chapterIdx })
  }, [page, pages, chapterIdx, onProgress])

  const goToToken = useCallback(
    (token: number) => {
      const ch = tokens[Math.min(token, tokens.length - 1)]?.chapter ?? 0
      pendingToken.current = token
      if (ch !== chapterIdx) setChapterIdx(ch)
      else {
        const p = Math.min(pageOfToken(token), pages - 1)
        setPage(p)
        pendingToken.current = null
      }
      onPosition(token)
    },
    [tokens, chapterIdx, pageOfToken, pages, onPosition]
  )

  const turn = useCallback(
    (dir: 1 | -1) => {
      if (dir > 0) {
        if (page + 1 < pages) {
          const next = page + 1
          setPage(next)
          onPosition(firstTokenOfPage(next))
        } else if (chapterIdx + 1 < chapters.length) {
          let i = 0
          while (i < tokens.length && tokens[i].chapter <= chapterIdx) i++
          goToToken(i)
        }
      } else if (page > 0) {
        const prev = page - 1
        setPage(prev)
        onPosition(firstTokenOfPage(prev))
      } else if (chapterIdx > 0) {
        // Land on the last page of the previous chapter
        let i = start - 1
        while (i > 0 && tokens[i - 1].chapter === chapterIdx - 1) i--
        pendingToken.current = start - 1
        setChapterIdx(chapterIdx - 1)
        onPosition(i)
      }
    },
    [
      page,
      pages,
      chapterIdx,
      chapters.length,
      tokens,
      start,
      firstTokenOfPage,
      goToToken,
      onPosition
    ]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (['ArrowRight', 'PageDown', ' ', 'Space'].includes(e.key) || e.code === 'Space') {
        e.preventDefault()
        turn(1)
      } else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) {
        e.preventDefault()
        turn(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [turn])

  const wheelAccum = useRef(0)
  const onWheel = (e: React.WheelEvent): void => {
    if (e.ctrlKey) return
    wheelAccum.current += e.deltaY
    if (Math.abs(wheelAccum.current) >= 60) {
      turn(wheelAccum.current > 0 ? 1 : -1)
      wheelAccum.current = 0
    }
  }

  // Phones: swipe horizontally to turn the page
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent): void => {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY, t: Date.now() }
  }
  const onTouchEnd = (e: React.TouchEvent): void => {
    const s0 = touchStart.current
    touchStart.current = null
    if (!s0) return
    const t = e.changedTouches[0]
    const dx = t.clientX - s0.x
    const dy = t.clientY - s0.y
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - s0.t < 700) {
      if (window.getSelection()?.isCollapsed !== false) turn(dx < 0 ? 1 : -1)
    }
  }

  const relativePoint = (rect: DOMRect): { x: number; y: number; yTop: number } => {
    const main = viewportRef.current?.parentElement?.getBoundingClientRect()
    return {
      x: rect.left + rect.width / 2 - (main?.left ?? 0),
      y: rect.bottom - (main?.top ?? 0),
      yTop: rect.top - (main?.top ?? 0)
    }
  }

  const handleMouseUp = (e: React.MouseEvent): void => {
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed && sel.rangeCount) {
      const range = sel.getRangeAt(0)
      const root = columnsRef.current
      if (root && root.contains(range.commonAncestorContainer)) {
        const spanOf = (node: Node): HTMLElement | null =>
          (node.nodeType === Node.ELEMENT_NODE
            ? (node as HTMLElement)
            : node.parentElement
          )?.closest('.w') ?? null
        const a = spanOf(range.startContainer) ?? root.querySelector('.w')
        const b = spanOf(range.endContainer) ?? a
        if (a && b) {
          const ia = Number(a.dataset.i)
          const ib = Number(b.dataset.i)
          const s = Math.min(ia, ib)
          const en = Math.max(ia, ib) + 1
          onSelect({
            start: s,
            end: en,
            text: tokens
              .slice(s, en)
              .map((t) => t.text)
              .join(' '),
            ...relativePoint(range.getBoundingClientRect())
          })
        }
      }
      return
    }
    const target = e.target as HTMLElement
    const word = target.closest<HTMLElement>('.w')
    if (word) {
      const i = Number(word.dataset.i)
      const existing = annotationAt(annotations, i)
      if (existing) {
        onSelect({
          start: existing.start,
          end: existing.end,
          text: existing.text,
          ...relativePoint(word.getBoundingClientRect()),
          existing
        })
        return
      }
    }
    const vp = viewportRef.current
    if (!vp) return
    const rect = vp.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    onSelect(null)
    if (x < 0.22) turn(-1)
    else if (x > 0.78) turn(1)
    else onToggleChrome()
  }

  const margin = MARGINS[appearance.margin]
  const chapterTitle = chapters[chapterIdx]?.title ?? ''
  const firstParaText = paragraphs[0]?.tokens.map((x) => x.t.text).join(' ') ?? ''
  const showHeading = chapterTitle && !firstParaText.startsWith(chapterTitle.slice(0, 20))

  return (
    <div
      className={`book-viewport theme-${appearance.pageTheme}`}
      ref={viewportRef}
      onMouseUp={handleMouseUp}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        padding: `${Math.max(64, Math.round(margin * 0.8))}px ${margin}px ${Math.max(40, Math.round(margin * 0.6))}px`,
        fontFamily: BOOK_FONTS[appearance.font].css,
        fontSize: settings.fontSize,
        lineHeight: appearance.lineHeight
      }}
    >
      <div className="book-clip">
        <div
          className={`book-columns ${appearance.justify ? 'justify' : ''}`}
          ref={columnsRef}
          style={{
            columnWidth: layout.colW,
            columnGap: GAP,
            transform: `translateX(${-page * stride}px)`
          }}
        >
          {showHeading && <h2 className="book-chapter-title">{chapterTitle}</h2>}
          {paragraphs.map((p) => (
            <p key={p.index}>
              {p.tokens.map(({ t, i }) => {
                const hl = annotationAt(annotations, i)
                const cls = hl ? `w hl ${hl.color}${hl.note ? ' has-note' : ''}` : 'w'
                return (
                  <span key={i} className={cls} data-i={i} title={hl?.note}>
                    {t.text}{' '}
                  </span>
                )
              })}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}
