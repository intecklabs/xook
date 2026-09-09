import { useStore } from '../store'

export default function ImportOverlay(): React.JSX.Element | null {
  const p = useStore((s) => s.importProgress)
  const dismiss = useStore((s) => s.dismissImport)
  if (!p) return null
  const finished = p.phase === 'done' || p.phase === 'cancelled'
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0
  return (
    <div className="overlay" onMouseDown={finished ? dismiss : undefined}>
      <div className="overlay-card import-card" onMouseDown={(e) => e.stopPropagation()}>
        <h2>
          {p.phase === 'scanning'
            ? 'Buscando libros…'
            : p.phase === 'importing'
              ? 'Importando biblioteca…'
              : p.phase === 'cancelled'
                ? 'Importación cancelada'
                : 'Importación terminada'}
        </h2>
        {p.phase === 'scanning' ? (
          <div className="muted small">{p.scanned.toLocaleString('es')} archivos encontrados</div>
        ) : (
          <>
            <div className="bar">
              <div className="bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="muted small" style={{ marginTop: 6 }}>
              {p.done.toLocaleString('es')} / {p.total.toLocaleString('es')} ·{' '}
              {p.added.toLocaleString('es')} nuevos
              {p.skipped ? ` · ${p.skipped.toLocaleString('es')} ya estaban` : ''}
              {p.failed ? ` · ${p.failed.toLocaleString('es')} con error` : ''}
            </div>
            {p.current && <div className="muted small import-current">{p.current}</div>}
          </>
        )}
        <div className="row-end">
          {finished ? (
            <button className="primary" onClick={dismiss}>
              Cerrar
            </button>
          ) : (
            <button className="ghost" onClick={() => void window.api.cancelImport()}>
              Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
