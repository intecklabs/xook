import { useEffect, useState } from 'react'
import { useStore } from '../store'

export function IndexRow(): React.JSX.Element {
  const status = useStore((s) => s.indexStatus)
  const enabled = useStore((s) => s.settings.backgroundIndex)
  const setIndexing = useStore((s) => s.setIndexing)
  return (
    <fieldset className="ramp">
      <label className="check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => void setIndexing(e.target.checked)}
        />
        Indexar texto en segundo plano
        <span className="hint">
          Extrae el texto de los libros importados sin abrirlos para que la búsqueda los incluya. Un
          libro a la vez, cuando la app está abierta.
        </span>
      </label>
      {status && (
        <div className="hint" style={{ marginTop: 6 }}>
          {status.pending.toLocaleString('es')} pendientes
          {status.busy && status.current ? ` · procesando: ${status.current}` : ''}
        </div>
      )}
    </fieldset>
  )
}

export function DataDirRow(): React.JSX.Element {
  const [dir, setDir] = useState<{ current: string; default: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void window.api.getDataDir().then(setDir)
  }, [])
  return (
    <fieldset className="ramp">
      <strong className="small">Carpeta de datos</strong>
      <div className="hint" style={{ wordBreak: 'break-all', margin: '4px 0 8px' }}>
        {dir?.current ?? '…'}
      </div>
      <span className="hint">
        Biblioteca, texto extraído, portadas y caché de audio. Cámbiala a otro disco si C: se llena;
        la app se reinicia sola tras mover los datos.
      </span>
      <div className="row-end" style={{ marginTop: 8 }}>
        {dir && (
          <button className="ghost small-btn" onClick={() => void window.api.openPath(dir.current)}>
            Abrir carpeta
          </button>
        )}
        <button
          className="ghost small-btn"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            void window.api.moveDataDir().finally(() => setBusy(false))
          }}
        >
          {busy ? 'Moviendo…' : 'Mover a otra carpeta…'}
        </button>
      </div>
    </fieldset>
  )
}

export function ThemeRow(): React.JSX.Element {
  const theme = useStore((s) => s.settings.theme)
  const update = useStore((s) => s.updateSettings)
  return (
    <label>
      Tema
      <div className="seg">
        {(['dark', 'light', 'sepia'] as const).map((t) => (
          <button
            key={t}
            className={theme === t ? 'active' : ''}
            onClick={() => update({ theme: t })}
          >
            {t === 'dark' ? 'Oscuro' : t === 'light' ? 'Claro' : 'Sepia'}
          </button>
        ))}
      </div>
    </label>
  )
}

export function DictLangRow(): React.JSX.Element {
  const lang = useStore((s) => s.settings.dictLang)
  const update = useStore((s) => s.updateSettings)
  return (
    <label>
      Idioma del diccionario
      <div className="seg">
        {(['es', 'en'] as const).map((l) => (
          <button
            key={l}
            className={lang === l ? 'active' : ''}
            onClick={() => update({ dictLang: l })}
          >
            {l === 'es' ? 'Español' : 'English'}
          </button>
        ))}
      </div>
      <span className="hint">
        Al seleccionar una palabra se busca en Wikcionario/Wiktionary y Wikipedia.
      </span>
    </label>
  )
}
