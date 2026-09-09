import { useEffect, useState } from 'react'
import type { BookRow, DeviceDrive, MailSettings, TargetFormat } from '../../../preload'
import Icon from './Icon'
import MailForm from './MailForm'

interface Props {
  book: BookRow
  onClose: () => void
}

const SEND_FORMATS: { id: TargetFormat | 'original'; label: string }[] = [
  { id: 'original', label: 'Archivo original' },
  { id: 'epub', label: 'EPUB' },
  { id: 'pdf', label: 'PDF' }
]

export default function SendDialog({ book, onClose }: Props): React.JSX.Element {
  const [tab, setTab] = useState<'mail' | 'usb'>('mail')
  const [mail, setMail] = useState<(MailSettings & { hasPassword: boolean }) | null | undefined>(
    undefined
  )
  const [editing, setEditing] = useState(false)
  const [to, setTo] = useState('')
  const [format, setFormat] = useState<TargetFormat | 'original'>('original')
  const [devices, setDevices] = useState<DeviceDrive[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    void window.api.mailLoad().then((m) => {
      setMail(m)
      if (m) setTo(m.to)
      else setEditing(true)
    })
    void window.api.listDevices().then(setDevices)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const prepareFile = async (): Promise<string> => {
    if (format === 'original') return book.path
    return window.api.convertToTemp({
      bookId: book.id,
      title: book.title,
      author: book.author ?? undefined,
      sourcePath: book.path,
      format
    })
  }

  const send = async (): Promise<void> => {
    setBusy('send')
    setMsg(null)
    try {
      const file = await prepareFile()
      await window.api.mailSend(file, book.title, to || undefined)
      setMsg({
        ok: true,
        text: `Enviado a ${to || mail?.to}. En Kindle suele aparecer en unos minutos.`
      })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }

  const copy = async (dir: string): Promise<void> => {
    setBusy(dir)
    setMsg(null)
    try {
      const file = await prepareFile()
      const dest = await window.api.copyToDevice(file, dir)
      setMsg({ ok: true, text: `Copiado a ${dest}` })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="overlay-card dlg" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <h2>Enviar «{book.title}»</h2>
          <button className="icon" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="pill-tabs" style={{ alignSelf: 'flex-start' }}>
          <button className={tab === 'mail' ? 'active' : ''} onClick={() => setTab('mail')}>
            <Icon name="mail" /> Correo (Kindle, móvil)
          </button>
          <button className={tab === 'usb' ? 'active' : ''} onClick={() => setTab('usb')}>
            <Icon name="drive" /> Dispositivo USB
          </button>
        </div>

        <div className="dlg-row">
          <span className="aa-label">Formato</span>
          <div className="pill-tabs">
            {SEND_FORMATS.filter((f) => (f.id as string) !== book.format).map((f) => (
              <button
                key={f.id}
                className={format === f.id ? 'active' : ''}
                onClick={() => setFormat(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'mail' ? (
          <>
            {mail === undefined ? (
              <div className="muted small">Cargando…</div>
            ) : editing ? (
              <MailForm
                onCancel={mail ? () => setEditing(false) : undefined}
                onSaved={(f) => {
                  setMail({ ...f, hasPassword: true })
                  setTo((t) => t || f.to)
                  setEditing(false)
                }}
              />
            ) : (
              <>
                <div className="dlg-row">
                  <span className="aa-label">Desde</span>
                  <span>{mail?.user}</span>
                  <button className="ghost small-btn" onClick={() => setEditing(true)}>
                    Configurar
                  </button>
                </div>
                <label>
                  Enviar a
                  <input
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="correo del dispositivo"
                  />
                </label>
                <div className="row-end">
                  <button
                    className="primary"
                    onClick={() => void send()}
                    disabled={busy !== null || !to}
                  >
                    {busy === 'send' ? 'Enviando…' : 'Enviar por correo'}
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="dlg-row">
              <span className="aa-label">Detectados</span>
              <div className="device-list">
                {devices.length === 0 && (
                  <span className="muted small">Ningún Kindle/Kobo conectado por USB.</span>
                )}
                {devices.map((d) => (
                  <button
                    key={d.path}
                    className="device"
                    onClick={() => void copy(d.path)}
                    disabled={busy !== null}
                  >
                    <Icon name="book" /> {d.label}
                  </button>
                ))}
                <button
                  className="ghost small-btn"
                  onClick={() => void window.api.listDevices().then(setDevices)}
                >
                  <Icon name="refresh" /> Actualizar
                </button>
              </div>
            </div>
            <div className="row-end">
              <button
                className="primary"
                disabled={busy !== null}
                onClick={() =>
                  void window.api.pickDeviceFolder().then((d) => {
                    if (d) void copy(d)
                  })
                }
              >
                Elegir carpeta y copiar…
              </button>
            </div>
          </>
        )}

        {msg && <div className={`small ${msg.ok ? 'ok-text' : 'danger-text'}`}>{msg.text}</div>}
      </div>
    </div>
  )
}
