import { safeStorage } from 'electron'
import { join, basename } from 'path'
import { promises as fs } from 'fs'
import nodemailer from 'nodemailer'
import { dataDir } from './paths'

export interface MailSettings {
  host: string
  port: number
  secure: boolean
  user: string
  from: string
  to: string
}

const mailFile = (): string => join(dataDir(), 'mail.json')

interface StoredMail extends MailSettings {
  pass: string // base64 of safeStorage-encrypted password
}

export async function loadMailSettings(): Promise<
  (MailSettings & { hasPassword: boolean }) | null
> {
  try {
    const raw = JSON.parse(await fs.readFile(mailFile(), 'utf8')) as StoredMail
    const { pass, ...rest } = raw
    return { ...rest, hasPassword: !!pass }
  } catch {
    return null
  }
}

export async function saveMailSettings(settings: MailSettings, password?: string): Promise<void> {
  let pass = ''
  if (password) {
    pass = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(password).toString('base64')
      : Buffer.from(password, 'utf8').toString('base64')
  } else {
    try {
      pass = (JSON.parse(await fs.readFile(mailFile(), 'utf8')) as StoredMail).pass ?? ''
    } catch {
      pass = ''
    }
  }
  await fs.mkdir(dataDir(), { recursive: true })
  await fs.writeFile(mailFile(), JSON.stringify({ ...settings, pass } satisfies StoredMail), 'utf8')
}

async function readPassword(): Promise<string> {
  const raw = JSON.parse(await fs.readFile(mailFile(), 'utf8')) as StoredMail
  if (!raw.pass) return ''
  const buf = Buffer.from(raw.pass, 'base64')
  try {
    return safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : buf.toString('utf8')
  } catch {
    return buf.toString('utf8')
  }
}

export async function sendFile(
  filePath: string,
  subject: string,
  to?: string
): Promise<{ messageId: string }> {
  const settings = await loadMailSettings()
  if (!settings) throw new Error('Configura primero el correo en Ajustes → Envío a dispositivos.')
  const pass = await readPassword()
  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: { user: settings.user, pass }
  })
  const info = await transporter.sendMail({
    from: settings.from || settings.user,
    to: to || settings.to,
    subject,
    text: `Enviado desde Xook: ${basename(filePath)}`,
    attachments: [{ filename: basename(filePath), path: filePath }]
  })
  return { messageId: info.messageId }
}

export async function testMail(): Promise<void> {
  const settings = await loadMailSettings()
  if (!settings) throw new Error('Sin configuración de correo')
  const pass = await readPassword()
  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: { user: settings.user, pass }
  })
  await transporter.verify()
}

export interface DeviceDrive {
  path: string
  label: string
  kind: 'kindle' | 'kobo' | 'drive'
}

// Removable readers show up as drive letters with well-known folders
export async function listDevices(): Promise<DeviceDrive[]> {
  if (process.platform !== 'win32') return []
  const out: DeviceDrive[] = []
  for (const letter of 'DEFGHIJKLMNOPQRSTUVWXYZ') {
    const root = `${letter}:\\`
    try {
      await fs.access(root)
    } catch {
      continue
    }
    try {
      await fs.access(join(root, 'system', 'version.txt'))
      await fs.access(join(root, 'documents'))
      out.push({ path: join(root, 'documents'), label: `Kindle (${letter}:)`, kind: 'kindle' })
      continue
    } catch {
      /* not a kindle */
    }
    try {
      await fs.access(join(root, '.kobo'))
      out.push({ path: root, label: `Kobo (${letter}:)`, kind: 'kobo' })
      continue
    } catch {
      /* not a kobo */
    }
  }
  return out
}

export async function copyToDevice(filePath: string, dir: string): Promise<string> {
  const dest = join(dir, basename(filePath))
  await fs.copyFile(filePath, dest)
  return dest
}
