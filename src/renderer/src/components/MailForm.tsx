import { useEffect, useState } from 'react'
import type { MailSettings } from '../../../preload'

const PRESETS: Record<string, Partial<MailSettings>> = {
  gmail: { host: 'smtp.gmail.com', port: 465, secure: true },
  outlook: { host: 'smtp-mail.outlook.com', port: 587, secure: false },
  icloud: { host: 'smtp.mail.me.com', port: 587, secure: false },
  yahoo: { host: 'smtp.mail.yahoo.com', port: 465, secure: true }
}

const EMPTY: MailSettings = {
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  user: '',
  from: '',
  to: ''
}

interface Props {
  onSaved?: (m: MailSettings) => void
  onCancel?: () => void
}

// SMTP account used to send books to a Kindle or phone; shared by SendDialog and the settings screen
export default function MailForm({ onSaved, onCancel }: Props): React.JSX.Element {
  const [form, setForm] = useState<MailSettings>(EMPTY)
  const [hasPassword, setHasPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    void window.api.mailLoad().then((m) => {
      if (m) {
        setForm(m)
        setHasPassword(m.hasPassword)
      }
    })
  }, [])

  const applyPreset = (k: string): void => setForm((f) => ({ ...f, ...PRESETS[k] }))

  const save = async (): Promise<void> => {
    setBusy('save')
    setMsg(null)
    try {
      await window.api.mailSave(form, password || undefined)
      setPassword('')
      setHasPassword(hasPassword || !!password)
      setMsg({ ok: true, text: 'Configuración guardada.' })
      onSaved?.(form)
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }

  const test = async (): Promise<void> => {
    setBusy('test')
    setMsg(null)
    try {
      await window.api.mailSave(form, password || undefined)
      await window.api.mailTest()
      setMsg({ ok: true, text: 'Conexión correcta con el servidor de correo.' })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mail-form">
      <div className="dlg-row">
        <span className="aa-label">Proveedor</span>
        <div className="pill-tabs">
          {Object.keys(PRESETS).map((k) => (
            <button key={k} onClick={() => applyPreset(k)}>
              {k[0].toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <label>
        Tu correo (usuario SMTP)
        <input
          value={form.user}
          onChange={(e) =>
            setForm({ ...form, user: e.target.value, from: form.from || e.target.value })
          }
          placeholder="tu@gmail.com"
        />
      </label>
      <label>
        Contraseña {hasPassword ? '(dejar vacío para conservar la guardada)' : ''}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña de aplicación"
        />
        <span className="hint">
          Gmail y Outlook requieren una «contraseña de aplicación» (no la normal). Se guarda cifrada
          con Windows.
        </span>
      </label>
      <div className="mail-grid">
        <label>
          Servidor SMTP
          <input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
        </label>
        <label>
          Puerto
          <input
            type="number"
            value={form.port}
            onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
          />
        </label>
        <label className="check" style={{ alignSelf: 'end' }}>
          <input
            type="checkbox"
            checked={form.secure}
            onChange={(e) => setForm({ ...form, secure: e.target.checked })}
          />
          SSL
        </label>
      </div>
      <label>
        Correo del dispositivo (destino por defecto)
        <input
          value={form.to}
          onChange={(e) => setForm({ ...form, to: e.target.value })}
          placeholder="nombre_xxxx@kindle.com"
        />
        <span className="hint">
          Para Kindle: en amazon.com → Contenido y dispositivos → Preferencias → Send-to-Kindle,
          agrega tu correo a la lista aprobada.
        </span>
      </label>
      {msg && <div className={`small ${msg.ok ? 'ok-text' : 'danger-text'}`}>{msg.text}</div>}
      <div className="row-end">
        {onCancel && (
          <button className="ghost" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button className="ghost" onClick={() => void test()} disabled={busy !== null}>
          {busy === 'test' ? 'Probando…' : 'Probar conexión'}
        </button>
        <button className="primary" onClick={() => void save()} disabled={busy !== null}>
          {busy === 'save' ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
