import { useEffect, useState } from 'react'
import type { ExportProgress } from '../../../preload'
import { useStore } from '../store'
import type { Narrator } from '../hooks/useNarrator'
import type { VoiceSettings } from '../lib/types'
import { voiceLabel } from '../lib/voices'
import Icon from './Icon'
import { IS_MOBILE } from '../lib/platform'

const SPEEDS = [0.8, 0.9, 1, 1.1, 1.25, 1.5]

interface Props {
  narrator: Narrator
  voice: VoiceSettings
  onOpenVoices: () => void
}

export default function NarratorControls({
  narrator,
  voice,
  onOpenVoices
}: Props): React.JSX.Element {
  const speed = useStore((s) => s.settings.narratorSpeed)
  const updateSettings = useStore((s) => s.updateSettings)
  const current = useStore((s) => s.current)
  const [exporting, setExporting] = useState<ExportProgress | null>(null)
  const [exportDone, setExportDone] = useState<{ dir: string; files: number } | null>(null)

  useEffect(() => window.api.onTtsProgress((p) => setExporting(p)), [])

  const exportAudiobook = async (): Promise<void> => {
    if (!current) return
    const dir = await window.api.ttsPickExportDir()
    if (!dir) return
    narrator.pause()
    const chapters = current.text.chapters.map((c, i) => ({
      title: c.title,
      segments: narrator.segments
        .filter((s) => s.chapter === i)
        .map((s) => ({ index: s.index, text: s.text }))
    }))
    const total = narrator.segments.length
    setExporting({ done: 0, total, chapter: chapters[0]?.title ?? '' })
    setExportDone(null)
    try {
      const r = await window.api.ttsExport({
        bookId: current.book.id,
        voice: voice.voice,
        rate: Math.round(voice.rate + (speed - 1) * 100),
        pitch: voice.pitch,
        outDir: dir,
        chapters
      })
      if (!r.cancelled) setExportDone({ dir, files: r.files.length })
    } finally {
      setExporting(null)
    }
  }

  const { state } = narrator
  const seg = narrator.segments[state.segIndex]

  return (
    <div
      className="controls narrator-controls"
      onMouseUp={(e) => (e.target as HTMLElement).closest('button')?.blur()}
    >
      <div className="controls-row">
        <button onClick={() => narrator.skipSegment(-1)} title="Párrafo anterior (←)">
          <Icon name="skip-back" />
        </button>
        <button
          className="primary play"
          onClick={narrator.toggle}
          title="Reproducir / pausar (espacio)"
          disabled={!seg}
        >
          {state.loading ? (
            '…'
          ) : state.playing ? (
            <Icon name="pause" size={18} />
          ) : (
            <Icon name="play" size={18} />
          )}
        </button>
        <button onClick={() => narrator.skipSegment(1)} title="Siguiente párrafo (→)">
          <Icon name="skip-forward" />
        </button>

        {!IS_MOBILE && (
          <button className="ghost voice-btn" onClick={onOpenVoices} title="Elegir narrador">
            <Icon name="mic" /> {voiceLabel(voice.voice)}
          </button>
        )}

        <div className="seg tiny speed-seg" title="Velocidad">
          {SPEEDS.map((sp) => (
            <button
              key={sp}
              className={speed === sp ? 'active' : ''}
              onClick={() => updateSettings({ narratorSpeed: sp })}
            >
              {sp}×
            </button>
          ))}
        </div>

        {!IS_MOBILE && (
          <button className="ghost" onClick={() => void exportAudiobook()} disabled={!!exporting}>
            <Icon name="download" /> Audiolibro
          </button>
        )}
      </div>
      {state.error && <div className="small danger-text center">{state.error}</div>}
      {state.local && !state.error && (
        <div className="hint center">
          {IS_MOBILE ? 'Voz del teléfono (sin conexión)' : 'Voz local de Windows (sin conexión)'}
        </div>
      )}

      {exporting && (
        <div className="overlay">
          <div className="overlay-card">
            <h2>Creando audiolibro…</h2>
            <div className="muted small">{exporting.chapter}</div>
            <div className="bar">
              <div
                className="bar-fill"
                style={{
                  width: `${Math.round((exporting.done / Math.max(exporting.total, 1)) * 100)}%`
                }}
              />
            </div>
            <div className="muted small" style={{ marginTop: 6 }}>
              {exporting.done} / {exporting.total} fragmentos · un MP3 por capítulo
            </div>
            <div className="row-end">
              <button className="ghost" onClick={() => void window.api.ttsCancelExport()}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {exportDone && (
        <div className="overlay" onMouseDown={() => setExportDone(null)}>
          <div className="overlay-card" onMouseDown={(e) => e.stopPropagation()}>
            <h2>Audiolibro listo</h2>
            <p className="muted small">
              {exportDone.files} archivos MP3 en {exportDone.dir}
            </p>
            <div className="row-end">
              <button className="ghost" onClick={() => setExportDone(null)}>
                Cerrar
              </button>
              <button className="primary" onClick={() => void window.api.openPath(exportDone.dir)}>
                Abrir carpeta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
