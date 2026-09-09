import { useStore } from '../store'
import { orpIndex } from '../lib/text'
import type { TextSelection } from '../lib/selection'
import type { Token } from '../lib/types'

interface Props {
  tokens: Token[]
  pos: number
  end: number
  onSelect: (sel: TextSelection) => void
}

export default function RsvpView({ tokens, pos, end, onSelect }: Props): React.JSX.Element {
  const fontSize = useStore((s) => s.settings.fontSize)
  const chunk = tokens.slice(pos, Math.max(end, pos + 1))
  const text = chunk.map((t) => t.text).join(' ')
  const chapter = tokens[pos]?.chapter ?? 0
  const chapterTitle = useStore((s) => s.current?.text.chapters[chapter]?.title)

  if (!text) {
    return (
      <div className="rsvp">
        <div className="rsvp-word" style={{ fontSize: fontSize * 1.6 }}>
          <span className="muted">Fin del libro</span>
        </div>
      </div>
    )
  }

  const orp = chunk.length === 1 ? orpIndex(text) : Math.floor(text.length / 2)
  const before = text.slice(0, orp)
  const focus = text[orp]
  const after = text.slice(orp + 1)

  const define = (e: React.MouseEvent<HTMLDivElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect()
    const main = e.currentTarget.parentElement?.parentElement?.getBoundingClientRect()
    onSelect({
      start: pos,
      end: Math.max(end, pos + 1),
      text,
      x: rect.left + rect.width / 2 - (main?.left ?? 0),
      y: rect.bottom - (main?.top ?? 0),
      yTop: rect.top - (main?.top ?? 0)
    })
  }

  return (
    <div className="rsvp">
      <div className="rsvp-chapter muted small">{chapterTitle}</div>
      <div className="rsvp-guide top" />
      <div
        className="rsvp-word"
        style={{ fontSize: fontSize * 1.6 }}
        onClick={define}
        title="Clic para ver la definición"
      >
        <span className="rsvp-before">{before}</span>
        <span className="rsvp-focus">{focus}</span>
        <span className="rsvp-after">{after}</span>
      </div>
      <div className="rsvp-guide bottom" />
    </div>
  )
}
