import { useEffect, useRef, useState } from 'react'
import type { DictEntry } from '../../../preload'
import { useStore } from '../store'
import Icon from './Icon'
import { cleanWord, isSingleWord, type TextSelection } from '../lib/selection'
import type { HighlightColor } from '../lib/types'

const COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink']

interface Props {
  selection: TextSelection
  containerWidth: number
  containerHeight: number
  onClose: () => void
}

interface Result {
  term: string
  lang: string
  entry: DictEntry | null
}

export default function SelectionPopover({
  selection,
  containerWidth,
  containerHeight,
  onClose
}: Props): React.JSX.Element {
  const dictLang = useStore((s) => s.settings.dictLang)
  const updateSettings = useStore((s) => s.updateSettings)
  const addAnnotation = useStore((s) => s.addAnnotation)
  const updateAnnotation = useStore((s) => s.updateAnnotation)
  const removeAnnotation = useStore((s) => s.removeAnnotation)

  const single = isSingleWord(selection.text)
  const firstWord = cleanWord(selection.text.split(/\s+/)[0] ?? '')
  const [term, setTerm] = useState(single ? firstWord : '')
  const [query, setQuery] = useState(single ? firstWord : '')
  const [showDict, setShowDict] = useState(single)
  const [result, setResult] = useState<Result | null>(null)
  const [note, setNote] = useState(selection.existing?.note ?? '')
  const [editingNote, setEditingNote] = useState(!!selection.existing?.note)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!showDict || !term) return
    let cancelled = false
    void window.api.lookupWord(term, dictLang).then((entry) => {
      if (!cancelled) setResult({ term, lang: dictLang, entry })
    })
    return () => {
      cancelled = true
    }
  }, [showDict, term, dictLang])

  useEffect(() => {
    if (editingNote) noteRef.current?.focus()
  }, [editingNote])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const loading =
    showDict && !!term && (!result || result.term !== term || result.lang !== dictLang)
  const entry = loading ? null : result?.entry

  const highlight = (color: HighlightColor): void => {
    if (selection.existing) {
      updateAnnotation(selection.existing.id, { color })
    } else {
      addAnnotation({
        start: selection.start,
        end: selection.end,
        text: selection.text,
        color,
        note: note.trim() || undefined
      })
      onClose()
    }
  }

  const saveNote = (): void => {
    const trimmed = note.trim()
    if (selection.existing) {
      updateAnnotation(selection.existing.id, { note: trimmed || undefined })
    } else {
      addAnnotation({
        start: selection.start,
        end: selection.end,
        text: selection.text,
        color: 'yellow',
        note: trimmed || undefined
      })
    }
    onClose()
  }

  const width = Math.min(340, Math.max(240, containerWidth - 16))
  const left = Math.max(8, Math.min(selection.x - width / 2, containerWidth - width - 8))
  const spaceBelow = containerHeight - selection.y
  const flip = spaceBelow < 300 && selection.yTop > spaceBelow
  const style: React.CSSProperties = flip
    ? {
        left,
        bottom: Math.max(8, containerHeight - selection.yTop + 8),
        maxHeight: Math.max(160, selection.yTop - 16),
        width
      }
    : { left, top: selection.y + 8, maxHeight: Math.max(160, spaceBelow - 16), width }

  return (
    <div className="popover" style={style} onMouseDown={(e) => e.stopPropagation()}>
      <div className="popover-bar">
        <div className="colors">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`color-dot ${c} ${selection.existing?.color === c ? 'active' : ''}`}
              title="Subrayar"
              onClick={() => highlight(c)}
            />
          ))}
        </div>
        <button className="ghost small-btn" onClick={() => setEditingNote((v) => !v)}>
          <Icon name="pen" /> Nota
        </button>
        <button
          className="ghost small-btn"
          onClick={() => {
            if (showDict) {
              setShowDict(false)
            } else {
              setShowDict(true)
              if (!term) {
                setTerm(firstWord)
                setQuery(firstWord)
              }
            }
          }}
        >
          <Icon name="book-open" /> Definir
        </button>
        {selection.existing && (
          <button
            className="ghost small-btn danger"
            title="Quitar subrayado"
            onClick={() => {
              removeAnnotation(selection.existing!.id)
              onClose()
            }}
          >
            <Icon name="trash" />
          </button>
        )}
        <button className="icon" onClick={onClose} title="Cerrar (Esc)">
          <Icon name="x" size={18} />
        </button>
      </div>

      {editingNote && (
        <div className="popover-note">
          <textarea
            ref={noteRef}
            value={note}
            rows={3}
            placeholder="Escribe una nota…"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveNote()
            }}
          />
          <div className="row-end">
            <button className="primary small-btn" onClick={saveNote}>
              Guardar nota
            </button>
          </div>
        </div>
      )}

      {showDict && (
        <div className="popover-dict">
          <div className="dict-search">
            <input
              value={query}
              placeholder="Buscar palabra…"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setTerm(cleanWord(query))
              }}
            />
            <div className="seg tiny">
              {(['es', 'en'] as const).map((l) => (
                <button
                  key={l}
                  className={dictLang === l ? 'active' : ''}
                  onClick={() => updateSettings({ dictLang: l })}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          {!term ? (
            <div className="muted small">Escribe una palabra y presiona Enter.</div>
          ) : loading ? (
            <div className="muted small">Buscando «{term}»…</div>
          ) : !entry ? (
            <div className="muted small">
              Sin resultados para «{term}». Prueba otra forma de la palabra o cambia el idioma.
            </div>
          ) : (
            <div className="dict-entry">
              <div className="dict-word">
                {entry.word} {entry.phonetic && <span className="muted">{entry.phonetic}</span>}
              </div>
              {entry.meanings.map((m, i) => (
                <div key={i} className="dict-meaning">
                  <div className="dict-pos">{m.partOfSpeech}</div>
                  <ol>
                    {m.definitions.map((d, j) => (
                      <li key={j}>
                        {d.definition}
                        {d.example && <div className="muted small">«{d.example}»</div>}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
              <div className="muted small">Fuente: {entry.source}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
