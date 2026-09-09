import { useEffect, useState } from 'react'
import type { BookRow, TargetFormat } from '../../../preload'
import { FORMATS } from '../lib/formats'
import Icon from './Icon'

interface Props {
  book: BookRow
  onClose: () => void
}

export default function ConvertDialog({ book, onClose }: Props): React.JSX.Element {
  const [format, setFormat] = useState<TargetFormat>(book.format === 'epub' ? 'pdf' : 'epub')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const run = async (): Promise<void> => {
    setError(null)
    const outPath = await window.api.pickSavePath(book.title, format)
    if (!outPath) return
    setBusy(true)
    try {
      const p = await window.api.convertBook({
        bookId: book.id,
        title: book.title,
        author: book.author ?? undefined,
        sourcePath: book.path,
        format,
        outPath
      })
      setDone(p)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="overlay-card dlg" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <h2>Convertir «{book.title}»</h2>
          <button className="icon" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <p className="muted small">
          Origen: {book.format.toUpperCase()}. Los formatos nativos usan el texto extraído; si el
          origen ya es del formato elegido se copia el archivo original.
        </p>
        <div className="format-grid">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              className={`format-card ${format === f.id ? 'active' : ''}`}
              onClick={() => setFormat(f.id)}
            >
              <span className="format-id">{f.label}</span>
              <span className="format-desc">{f.description}</span>
            </button>
          ))}
        </div>
        {error && <div className="danger-text small">{error}</div>}
        {done ? (
          <div className="row-end">
            <span className="muted small" style={{ marginRight: 'auto' }}>
              Guardado en {done}
            </span>
            <button className="ghost" onClick={() => void window.api.showInFolder(done)}>
              Mostrar en carpeta
            </button>
            <button className="primary" onClick={onClose}>
              Listo
            </button>
          </div>
        ) : (
          <div className="row-end">
            <button className="ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="primary" onClick={() => void run()} disabled={busy}>
              {busy ? 'Convirtiendo…' : 'Guardar como…'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
