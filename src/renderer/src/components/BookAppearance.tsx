import { useStore } from '../store'
import { FONT_MAX, FONT_MIN } from '../hooks/usePinchZoom'
import { BOOK_FONTS } from '../lib/bookFonts'
import type { BookAppearance as Appearance } from '../lib/types'
import Icon from './Icon'

interface Props {
  onClose?: () => void
}

export default function BookAppearance({ onClose }: Props): React.JSX.Element {
  const settings = useStore((s) => s.settings)
  const update = useStore((s) => s.updateSettings)
  const a = settings.book
  const set = (patch: Partial<Appearance>): void => update({ book: { ...a, ...patch } })

  return (
    <div
      className={`book-aa ${onClose ? '' : 'embedded'}`}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {onClose && (
        <div className="settings-head">
          <strong>Apariencia</strong>
          <button className="icon" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>
      )}

      <div className="aa-row">
        <span className="aa-label">Tamaño</span>
        <div className="aa-stepper">
          <button
            onClick={() => update({ fontSize: Math.max(FONT_MIN, settings.fontSize - 2) })}
            style={{ fontSize: 13 }}
          >
            A
          </button>
          <span>{settings.fontSize}px</span>
          <button
            onClick={() => update({ fontSize: Math.min(FONT_MAX, settings.fontSize + 2) })}
            style={{ fontSize: 19 }}
          >
            A
          </button>
        </div>
      </div>

      <div className="aa-row">
        <span className="aa-label">Tipografía</span>
        <div className="aa-fonts">
          {(Object.keys(BOOK_FONTS) as Appearance['font'][]).map((f) => (
            <button
              key={f}
              className={`aa-font ${a.font === f ? 'active' : ''}`}
              style={{ fontFamily: BOOK_FONTS[f].css }}
              onClick={() => set({ font: f })}
            >
              Aa <span>{BOOK_FONTS[f].label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="aa-row">
        <span className="aa-label">Interlineado</span>
        <div className="pill-tabs">
          {[1.4, 1.6, 1.85].map((lh) => (
            <button
              key={lh}
              className={a.lineHeight === lh ? 'active' : ''}
              onClick={() => set({ lineHeight: lh })}
            >
              {lh === 1.4 ? 'Compacto' : lh === 1.6 ? 'Normal' : 'Amplio'}
            </button>
          ))}
        </div>
      </div>

      <div className="aa-row">
        <span className="aa-label">Márgenes</span>
        <div className="pill-tabs">
          {(['narrow', 'normal', 'wide'] as const).map((m) => (
            <button
              key={m}
              className={a.margin === m ? 'active' : ''}
              onClick={() => set({ margin: m })}
            >
              {m === 'narrow' ? 'Estrechos' : m === 'normal' ? 'Normales' : 'Amplios'}
            </button>
          ))}
        </div>
      </div>

      <div className="aa-row">
        <span className="aa-label">Columnas</span>
        <div className="pill-tabs">
          {(['auto', 1, 2] as const).map((c) => (
            <button
              key={c}
              className={a.columns === c ? 'active' : ''}
              onClick={() => set({ columns: c })}
            >
              {c === 'auto' ? 'Auto' : c}
            </button>
          ))}
        </div>
      </div>

      <div className="aa-row">
        <span className="aa-label">Página</span>
        <div className="aa-themes">
          {(['app', 'light', 'sepia', 'dark'] as const).map((t) => (
            <button
              key={t}
              className={`aa-theme t-${t} ${a.pageTheme === t ? 'active' : ''}`}
              onClick={() => set({ pageTheme: t })}
              title={t === 'app' ? 'Según el tema de la app' : t}
            >
              Aa
            </button>
          ))}
        </div>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={a.justify}
          onChange={(e) => set({ justify: e.target.checked })}
        />
        Texto justificado
      </label>
    </div>
  )
}
