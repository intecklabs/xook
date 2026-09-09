import { useStore } from '../store'
import { FONT_MAX, FONT_MIN } from '../hooks/usePinchZoom'

// Reading-technique settings shared by the quick panel in the reader and the full settings screen
export default function ReadingSettings(): React.JSX.Element {
  const settings = useStore((s) => s.settings)
  const update = useStore((s) => s.updateSettings)
  const mode = useStore((s) => s.mode)
  const chunkMax = mode === 'rsvp' ? 4 : 8

  return (
    <>
      <label>
        Velocidad objetivo: <strong>{settings.wpm} ppm</strong>
        <input
          type="range"
          min={100}
          max={1200}
          step={10}
          value={settings.wpm}
          style={{ ['--pct' as string]: `${((settings.wpm - 100) / 1100) * 100}%` }}
          onChange={(e) => update({ wpm: Number(e.target.value) })}
        />
        <span className="hint">
          Un lector promedio va a 200-250 ppm; por encima de 500-600 la comprensión baja.
        </span>
      </label>

      <label>
        Palabras por bloque: <strong>{settings.chunkSize}</strong>
        <input
          type="range"
          min={1}
          max={chunkMax}
          value={Math.min(settings.chunkSize, chunkMax)}
          style={{
            ['--pct' as string]: `${((Math.min(settings.chunkSize, chunkMax) - 1) / (chunkMax - 1)) * 100}%`
          }}
          onChange={(e) => update({ chunkSize: Number(e.target.value) })}
        />
        <span className="hint">
          Empieza en 1. Sube a 2-3 cuando te sientas cómodo: amplía tu campo visual.
        </span>
      </label>

      <label>
        Tamaño de letra: <strong>{settings.fontSize}px</strong>
        <input
          type="range"
          min={FONT_MIN}
          max={FONT_MAX}
          value={settings.fontSize}
          style={{
            ['--pct' as string]: `${((settings.fontSize - FONT_MIN) / (FONT_MAX - FONT_MIN)) * 100}%`
          }}
          onChange={(e) => update({ fontSize: Number(e.target.value) })}
        />
        <span className="hint">
          También con pellizco en el touchpad, Ctrl + rueda, o Ctrl + / Ctrl − (Ctrl 0 restablece).
        </span>
      </label>

      <label className="check">
        <input
          type="checkbox"
          checked={settings.punctuationPause}
          onChange={(e) => update({ punctuationPause: e.target.checked })}
        />
        Pausa en puntuación
        <span className="hint">
          Da un respiro al final de oraciones y párrafos (mejora la comprensión).
        </span>
      </label>

      <label className="check">
        <input
          type="checkbox"
          checked={settings.focusMode}
          onChange={(e) => update({ focusMode: e.target.checked })}
        />
        Modo foco (guiado)
        <span className="hint">Atenúa el texto ya leído para evitar regresiones.</span>
      </label>

      <label className="check">
        <input
          type="checkbox"
          checked={settings.bionic}
          onChange={(e) => update({ bionic: e.target.checked })}
        />
        Resaltar inicio de palabras (guiado)
      </label>

      <label className="check">
        <input
          type="checkbox"
          checked={settings.immersiveReader}
          onChange={(e) => update({ immersiveReader: e.target.checked })}
        />
        Atmósfera del universo al leer
        <span className="hint">Fondo animado sutil con el tema del universo del libro.</span>
      </label>

      <fieldset className="ramp">
        <label className="check">
          <input
            type="checkbox"
            checked={settings.ramp.enabled}
            onChange={(e) => update({ ramp: { ...settings.ramp, enabled: e.target.checked } })}
          />
          Entrenamiento progresivo
          <span className="hint">Sube la velocidad automáticamente durante la sesión.</span>
        </label>
        {settings.ramp.enabled && (
          <div className="ramp-grid">
            <label>
              +ppm
              <input
                type="number"
                min={5}
                max={100}
                value={settings.ramp.step}
                onChange={(e) =>
                  update({ ramp: { ...settings.ramp, step: Number(e.target.value) } })
                }
              />
            </label>
            <label>
              cada N palabras
              <input
                type="number"
                min={50}
                max={5000}
                step={50}
                value={settings.ramp.everyWords}
                onChange={(e) =>
                  update({ ramp: { ...settings.ramp, everyWords: Number(e.target.value) } })
                }
              />
            </label>
            <label>
              máximo
              <input
                type="number"
                min={200}
                max={1500}
                step={50}
                value={settings.ramp.max}
                onChange={(e) =>
                  update({ ramp: { ...settings.ramp, max: Number(e.target.value) } })
                }
              />
            </label>
          </div>
        )}
      </fieldset>
    </>
  )
}
