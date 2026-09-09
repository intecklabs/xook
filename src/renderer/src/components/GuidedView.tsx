import { useEffect, useMemo, useRef } from 'react'
import { useStore } from '../store'
import Icon from './Icon'
import { bionicSplit, sentenceStart } from '../lib/text'
import { annotationAt, type TextSelection } from '../lib/selection'
import type { Token } from '../lib/types'

interface Props {
  tokens: Token[]
  pos: number
  end: number
  playing: boolean
  onSeek: (pos: number) => void
  onSelect: (sel: TextSelection | null) => void
}

export default function GuidedView({
  tokens,
  pos,
  end,
  playing,
  onSeek,
  onSelect
}: Props): React.JSX.Element {
  const settings = useStore((s) => s.settings)
  const chapters = useStore((s) => s.current?.text.chapters ?? [])
  const annotations = useStore((s) => s.current?.book.annotations ?? [])
  const containerRef = useRef<HTMLDivElement>(null)

  const chapterIdx = tokens[Math.min(pos, tokens.length - 1)]?.chapter ?? 0

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

  const sentStart = sentenceStart(tokens, pos)
  let sentEnd = pos
  while (sentEnd < tokens.length && !tokens[sentEnd].sentenceEnd) sentEnd++

  useEffect(() => {
    const el = containerRef.current?.querySelector<HTMLElement>('[data-current="true"]')
    if (el) el.scrollIntoView({ block: 'center', behavior: playing ? 'smooth' : 'auto' })
  }, [pos, playing])

  const goChapter = (delta: number): void => {
    const target = chapterIdx + delta
    if (target < 0 || target >= chapters.length) return
    let i = 0
    while (i < tokens.length && tokens[i].chapter < target) i++
    onSeek(i)
  }

  const relativePoint = (rect: DOMRect): { x: number; y: number; yTop: number } => {
    const main = containerRef.current?.parentElement?.getBoundingClientRect()
    return {
      x: rect.left + rect.width / 2 - (main?.left ?? 0),
      y: rect.bottom - (main?.top ?? 0),
      yTop: rect.top - (main?.top ?? 0)
    }
  }

  const handleMouseUp = (): void => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount) return
    const range = sel.getRangeAt(0)
    const root = containerRef.current
    if (!root || !root.contains(range.commonAncestorContainer)) return
    const spanOf = (node: Node): HTMLElement | null =>
      (node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement)?.closest(
        '.w'
      ) ?? null
    let a = spanOf(range.startContainer)
    let b = spanOf(range.endContainer)
    if (!a) a = root.querySelector('.w')
    if (!b) b = a
    if (!a || !b) return
    const ia = Number(a.dataset.i)
    const ib = Number(b.dataset.i)
    const s = Math.min(ia, ib)
    const e = Math.max(ia, ib) + 1
    const text = tokens
      .slice(s, e)
      .map((t) => t.text)
      .join(' ')
    onSelect({ start: s, end: e, text, ...relativePoint(range.getBoundingClientRect()) })
  }

  const handleWordClick = (i: number, el: HTMLElement): void => {
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed) return
    const existing = annotationAt(annotations, i)
    if (existing) {
      onSelect({
        start: existing.start,
        end: existing.end,
        text: existing.text,
        ...relativePoint(el.getBoundingClientRect()),
        existing
      })
    } else {
      onSelect(null)
      onSeek(i)
    }
  }

  return (
    <div
      className="guided"
      ref={containerRef}
      style={{ fontSize: settings.fontSize }}
      onMouseUp={handleMouseUp}
    >
      <div className="guided-nav">
        <button className="ghost" onClick={() => goChapter(-1)} disabled={chapterIdx === 0}>
          <Icon name="chevron-left" /> Anterior
        </button>
        <span className="muted small">{chapters[chapterIdx]?.title}</span>
        <button
          className="ghost"
          onClick={() => goChapter(1)}
          disabled={chapterIdx >= chapters.length - 1}
        >
          Siguiente <Icon name="chevron-right" />
        </button>
      </div>
      <div className={`guided-text ${settings.focusMode ? 'focus' : ''}`}>
        {paragraphs.map((p) => (
          <p key={p.index}>
            {p.tokens.map(({ t, i }) => {
              const inChunk = i >= pos && i < end
              const inSentence = i >= sentStart && i <= sentEnd
              const read = i < pos
              const hl = annotationAt(annotations, i)
              let cls = inChunk ? 'w cur' : inSentence ? 'w sent' : read ? 'w read' : 'w'
              if (hl) cls += ` hl ${hl.color}${hl.note ? ' has-note' : ''}`
              const [b, rest] = settings.bionic ? bionicSplit(t.text) : ['', t.text]
              return (
                <span
                  key={i}
                  className={cls}
                  data-i={i}
                  data-current={i === pos ? 'true' : undefined}
                  title={hl?.note}
                  onClick={(e) => handleWordClick(i, e.currentTarget)}
                >
                  {settings.bionic ? (
                    <>
                      <b>{b}</b>
                      {rest}
                    </>
                  ) : (
                    t.text
                  )}{' '}
                </span>
              )
            })}
          </p>
        ))}
      </div>
      <div className="muted small center" style={{ padding: 24 }}>
        {start + paragraphs.reduce((n, p) => n + p.tokens.length, 0) >= tokens.length
          ? 'Fin del libro'
          : 'Fin de la sección'}
      </div>
    </div>
  )
}
