import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'

export const IS_NATIVE = Capacitor.isNativePlatform()
const DIR = Directory.Data

const CHUNK = 0x8000

export function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)))
  }
  return btoa(s)
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function ensureDir(path: string): Promise<void> {
  try {
    await Filesystem.mkdir({ path, directory: DIR, recursive: true })
  } catch {
    /* exists */
  }
}

export async function exists(path: string): Promise<boolean> {
  try {
    await Filesystem.stat({ path, directory: DIR })
    return true
  } catch {
    return false
  }
}

export async function writeBytes(path: string, bytes: Uint8Array): Promise<void> {
  const dir = path.split('/').slice(0, -1).join('/')
  if (dir) await ensureDir(dir)
  if (IS_NATIVE) {
    await Filesystem.writeFile({ path, directory: DIR, data: bytesToBase64(bytes) })
  } else {
    await Filesystem.writeFile({ path, directory: DIR, data: new Blob([bytes as BlobPart]) })
  }
}

export async function writeText(path: string, text: string): Promise<void> {
  const dir = path.split('/').slice(0, -1).join('/')
  if (dir) await ensureDir(dir)
  await Filesystem.writeFile({ path, directory: DIR, data: text, encoding: 'utf8' as never })
}

export async function readText(path: string): Promise<string | null> {
  try {
    const r = await Filesystem.readFile({ path, directory: DIR, encoding: 'utf8' as never })
    return typeof r.data === 'string' ? r.data : await (r.data as Blob).text()
  } catch {
    return null
  }
}

// Native: served by the Capacitor local server (fast, no base64). Web: read through the plugin.
export async function readBytes(path: string): Promise<Uint8Array | null> {
  try {
    if (IS_NATIVE) {
      const { uri } = await Filesystem.getUri({ path, directory: DIR })
      const r = await fetch(Capacitor.convertFileSrc(uri))
      if (!r.ok) return null
      return new Uint8Array(await r.arrayBuffer())
    }
    const r = await Filesystem.readFile({ path, directory: DIR })
    if (typeof r.data === 'string') return base64ToBytes(r.data)
    return new Uint8Array(await (r.data as Blob).arrayBuffer())
  } catch {
    return null
  }
}

export async function remove(path: string): Promise<void> {
  try {
    await Filesystem.deleteFile({ path, directory: DIR })
  } catch {
    /* missing */
  }
}

export async function listDir(path: string): Promise<string[]> {
  try {
    const r = await Filesystem.readdir({ path, directory: DIR })
    return r.files.map((f) => f.name)
  } catch {
    return []
  }
}

// Copy a file the user picked (absolute native path) into app storage
export async function importNativeFile(from: string, to: string): Promise<void> {
  const dir = to.split('/').slice(0, -1).join('/')
  if (dir) await ensureDir(dir)
  await Filesystem.copy({ from, to, toDirectory: DIR })
}

let dataUri: string | null = null
export async function initDataUri(): Promise<void> {
  if (!IS_NATIVE) return
  try {
    const { uri } = await Filesystem.getUri({ path: '', directory: DIR })
    dataUri = uri.replace(/\/$/, '')
  } catch {
    dataUri = null
  }
}

// http(s)://localhost/_capacitor_file_/… URL for a file in app storage (native only)
export function localUrl(path: string): string | null {
  if (!dataUri) return null
  return Capacitor.convertFileSrc(`${dataUri}/${path}`)
}

export function extFromMime(mime: string): string {
  if (/png/i.test(mime)) return 'png'
  if (/webp/i.test(mime)) return 'webp'
  if (/gif/i.test(mime)) return 'gif'
  return 'jpg'
}

export function mimeFromExt(ext: string): string {
  return { png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[ext] ?? 'image/jpeg'
}
