import { useEffect, useState } from 'react'
import { useStore, type SettingsSection } from '../store'
import { voiceLabel } from '../lib/voices'
import {
  APP_NAME,
  AUTHOR,
  CREDITS,
  DONATE_URL,
  LICENSE,
  MEANING,
  REPO_URL,
  TAGLINE,
  WEBSITE_URL
} from '../lib/about'
import logo from '../assets/xook.svg'
import Icon from './Icon'
import ReadingSettings from './ReadingSettings'
import BookAppearance from './BookAppearance'
import MailForm from './MailForm'
import VoicePicker from './VoicePicker'
import { DataDirRow, DictLangRow, IndexRow, ThemeRow } from './SettingsRows'

const SECTIONS: { id: SettingsSection; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: 'sliders' },
  { id: 'reading', label: 'Lectura', icon: 'book-open' },
  { id: 'book', label: 'Modo libro', icon: 'book' },
  { id: 'narrator', label: 'Narrador', icon: 'headphones' },
  { id: 'mail', label: 'Correo y Kindle', icon: 'mail' },
  { id: 'about', label: 'Acerca de', icon: 'sparkles' }
]

const SPEEDS = [0.8, 0.9, 1, 1.1, 1.25, 1.5]
const SAMPLE =
  'Xook significa leer en maya. Esta es una muestra de la voz que narrará tus libros: ajusta el ritmo y el tono hasta que suene natural.'

function NarratorSection(): React.JSX.Element {
  const narrator = useStore((s) => s.settings.narrator)
  const speed = useStore((s) => s.settings.narratorSpeed)
  const engine = useStore((s) => s.settings.narratorEngine)
  const update = useStore((s) => s.updateSettings)
  const [picking, setPicking] = useState(false)
  return (
    <>
      <label>
        Motor de voz
        <div className="seg">
          {(
            [
              ['auto', 'Automático'],
              ['neural', 'Neuronal (internet)'],
              ['local', 'Local (Windows)']
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={engine === id ? 'active' : ''}
              onClick={() => update({ narratorEngine: id })}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="hint">
          Automático usa las voces neuronales y, si no hay internet o el servicio falla, cambia solo
          a las voces instaladas en Windows.
        </span>
      </label>
      <div className="ss-group">
        <strong>Voz predeterminada</strong>
        <div className="hint">
          {narrator
            ? voiceLabel(narrator.voice)
            : 'Automática: se elige según el idioma y el universo de cada libro.'}
        </div>
        <div className="row-end">
          {narrator && (
            <button className="ghost small-btn" onClick={() => update({ narrator: null })}>
              Volver a automática
            </button>
          )}
          <button className="primary small-btn" onClick={() => setPicking(true)}>
            <Icon name="mic" /> Elegir voz…
          </button>
        </div>
      </div>
      <label>
        Velocidad de narración
        <div className="seg">
          {SPEEDS.map((sp) => (
            <button
              key={sp}
              className={speed === sp ? 'active' : ''}
              onClick={() => update({ narratorSpeed: sp })}
            >
              {sp}×
            </button>
          ))}
        </div>
      </label>
      <div className="hint">
        Las voces neuronales necesitan internet y dependen de un servicio de terceros; el audio
        generado se guarda en caché. Las voces locales funcionan siempre, sin conexión.
      </div>
      {picking && (
        <VoicePicker
          bookId=""
          current={narrator ?? { voice: 'es-MX-DaliaNeural', rate: 0, pitch: 0 }}
          lang="es"
          sampleText={SAMPLE}
          onClose={() => setPicking(false)}
          globalOnly
        />
      )}
    </>
  )
}

function AboutSection(): React.JSX.Element {
  const [version, setVersion] = useState('')
  useEffect(() => {
    void window.api.appVersion().then(setVersion)
  }, [])
  const open = (url: string): void => void window.api.openExternal(url)
  return (
    <>
      <div className="about">
        <img src={logo} alt="" />
        <div>
          <h1>{APP_NAME}</h1>
          <div className="muted">{TAGLINE}</div>
          <div className="hint" style={{ marginTop: 4 }}>
            Versión {version || '…'} · {AUTHOR} · Licencia: {LICENSE}
          </div>
        </div>
      </div>
      <p className="small" style={{ margin: 0 }}>
        {MEANING}
      </p>
      <p className="small muted" style={{ margin: 0 }}>
        Xook es gratis y sin anuncios. Si te sirve, puedes apoyar su desarrollo con una donación.
      </p>
      <div className="about-actions">
        {DONATE_URL ? (
          <button className="primary" onClick={() => open(DONATE_URL)}>
            Apoyar el proyecto
          </button>
        ) : (
          <button className="primary" disabled title="Próximamente">
            Apoyar el proyecto
          </button>
        )}
        {REPO_URL && (
          <button className="ghost" onClick={() => open(REPO_URL)}>
            Código fuente
          </button>
        )}
        {WEBSITE_URL && (
          <button className="ghost" onClick={() => open(WEBSITE_URL)}>
            Sitio web
          </button>
        )}
      </div>
      <div className="ss-group">
        <strong>Privacidad</strong>
        <div className="hint">
          Tus libros, notas y progreso se quedan en tu computadora. Solo se consulta internet para
          portadas (Open Library), diccionario (Wikcionario/Wikipedia) y voces del narrador.
        </div>
      </div>
      <div className="ss-group">
        <strong>Hecho con</strong>
        <ul className="credits">
          {CREDITS.map((c) => (
            <li key={c.name}>
              <a
                href={c.url}
                onClick={(e) => {
                  e.preventDefault()
                  open(c.url)
                }}
              >
                {c.name}
              </a>{' '}
              <span>· {c.what}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

export default function SettingsScreen({
  section
}: {
  section: SettingsSection
}): React.JSX.Element {
  const close = useStore((s) => s.closeSettings)
  const go = useStore((s) => s.openSettings)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const title = SECTIONS.find((s) => s.id === section)?.label ?? 'Configuración'

  return (
    <div className="overlay" onMouseDown={close}>
      <div className="overlay-card ss" onMouseDown={(e) => e.stopPropagation()}>
        <nav className="ss-nav">
          <h2>Configuración</h2>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={section === s.id ? 'active' : ''}
              onClick={() => go(s.id)}
            >
              <Icon name={s.icon} /> {s.label}
            </button>
          ))}
          <div className="ss-version hint">{APP_NAME}</div>
        </nav>
        <div className="ss-main">
          <div className="ss-head">
            <h3>{title}</h3>
            <button className="icon" onClick={close} title="Cerrar (Esc)">
              <Icon name="x" size={18} />
            </button>
          </div>
          <div className="ss-body settings-form">
            {section === 'general' && (
              <>
                <ThemeRow />
                <DictLangRow />
                <DataDirRow />
                <IndexRow />
              </>
            )}
            {section === 'reading' && <ReadingSettings />}
            {section === 'book' && (
              <>
                <div className="hint">
                  Cómo se ve el texto en el modo Libro (paginado, tipo Kindle). También puedes
                  cambiarlo mientras lees con el botón «Aa».
                </div>
                <BookAppearance />
              </>
            )}
            {section === 'narrator' && <NarratorSection />}
            {section === 'mail' && (
              <>
                <div className="hint">
                  Cuenta de correo para enviar libros a tu Kindle o teléfono desde «Enviar a
                  dispositivo».
                </div>
                <MailForm />
              </>
            )}
            {section === 'about' && <AboutSection />}
          </div>
        </div>
      </div>
    </div>
  )
}
