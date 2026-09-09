import { useState } from 'react'
import { useStore } from '../store'
import { annotationsToMarkdown } from '../lib/selection'
import Icon from './Icon'

interface Props {
  onClose: () => void
  onSeek: (pos: number) => void
}

export default function AnnotationsPanel({ onClose, onSeek }: Props): React.JSX.Element {
  const book = useStore((s) => s.current?.book)
  const updateAnnotation = useStore((s) => s.updateAnnotation)
  const removeAnnotation = useStore((s) => s.removeAnnotation)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)

  const annotations = book?.annotations ?? []

  const copy = (): void => {
    if (!book) return
    void navigator.clipboard.writeText(annotationsToMarkdown(book.title, annotations)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <aside className="settings notes-panel">
      <div className="settings-head">
        <strong>Anotaciones ({annotations.length})</strong>
        <div>
          <button className="ghost small-btn" onClick={copy} disabled={!annotations.length}>
            {copied ? 'Copiado' : 'Copiar como texto'}
          </button>
          <button className="icon" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>
      </div>

      {annotations.length === 0 && (
        <p className="muted small">
          Selecciona texto en el modo Guiado para subrayarlo o agregar una nota. Selecciona una sola
          palabra para ver su definición.
        </p>
      )}

      {annotations.map((a) => (
        <div key={a.id} className={`note-card ${a.color}`}>
          <div className="note-text" onClick={() => onSeek(a.start)} title="Ir a este fragmento">
            {a.text.length > 220 ? a.text.slice(0, 220) + '…' : a.text}
          </div>
          {editing === a.id ? (
            <>
              <textarea
                value={draft}
                rows={3}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className="row-end">
                <button className="ghost small-btn" onClick={() => setEditing(null)}>
                  Cancelar
                </button>
                <button
                  className="primary small-btn"
                  onClick={() => {
                    updateAnnotation(a.id, { note: draft.trim() || undefined })
                    setEditing(null)
                  }}
                >
                  Guardar
                </button>
              </div>
            </>
          ) : (
            <>
              {a.note && <div className="note-body">{a.note}</div>}
              <div className="note-actions">
                <button
                  className="ghost small-btn"
                  onClick={() => {
                    setEditing(a.id)
                    setDraft(a.note ?? '')
                  }}
                >
                  {a.note ? 'Editar nota' : '+ Nota'}
                </button>
                <button className="ghost small-btn" onClick={() => onSeek(a.start)}>
                  Ir
                </button>
                <button className="ghost small-btn danger" onClick={() => removeAnnotation(a.id)}>
                  Borrar
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </aside>
  )
}
