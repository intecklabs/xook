import { BrowserWindow } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import { createHash } from 'crypto'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import { dataDir } from './paths'

export interface VoiceInfo {
  shortName: string
  friendlyName: string
  gender: string
  locale: string
}

export interface WordMark {
  offset: number
  duration: number
  text: string
}

export interface SynthRequest {
  text: string
  voice: string
  rate: number
  pitch: number
  bookId?: string
  segment?: number
}

export interface SynthResult {
  audio: Uint8Array
  words: WordMark[]
}

export interface ExportRequest {
  bookId: string
  voice: string
  rate: number
  pitch: number
  outDir: string
  chapters: { title: string; segments: { index: number; text: string }[] }[]
}

const audioDir = (): string => join(dataDir(), 'audio')

let voicesCache: VoiceInfo[] | null = null
const engines = new Map<string, { tts: MsEdgeTTS; queue: Promise<unknown> }>()
let exportCancelled = false

export async function listVoices(): Promise<VoiceInfo[]> {
  if (voicesCache) return voicesCache
  const tts = new MsEdgeTTS()
  const voices = await tts.getVoices()
  voicesCache = voices.map((v) => ({
    shortName: v.ShortName,
    friendlyName: v.FriendlyName.replace(/^Microsoft\s+/, '').replace(/\s+Online.*$/, ''),
    gender: v.Gender,
    locale: v.Locale
  }))
  return voicesCache
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function signed(n: number, unit: string): string {
  const v = Math.round(n)
  return `${v >= 0 ? '+' : ''}${v}${unit}`
}

async function getEngine(voice: string): Promise<{ tts: MsEdgeTTS; queue: Promise<unknown> }> {
  let e = engines.get(voice)
  if (!e) {
    const tts = new MsEdgeTTS()
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, {
      wordBoundaryEnabled: true
    })
    e = { tts, queue: Promise.resolve() }
    engines.set(voice, e)
  }
  return e
}

async function synthOnce(req: SynthRequest): Promise<SynthResult> {
  const e = await getEngine(req.voice)
  const run = async (): Promise<SynthResult> => {
    const { audioStream, metadataStream } = e.tts.toStream(escapeXml(req.text), {
      rate: signed(req.rate, '%'),
      pitch: signed(req.pitch, 'Hz')
    })
    const chunks: Buffer[] = []
    const words: WordMark[] = []
    metadataStream?.on('data', (m: Buffer) => {
      try {
        const parsed = JSON.parse(m.toString()) as {
          Metadata?: {
            Type: string
            Data: { Offset: number; Duration: number; text: { Text: string } }
          }[]
        }
        for (const md of parsed.Metadata ?? []) {
          if (md.Type === 'WordBoundary') {
            words.push({
              offset: md.Data.Offset / 10000,
              duration: md.Data.Duration / 10000,
              text: md.Data.text.Text
            })
          }
        }
      } catch {
        /* ignore malformed metadata */
      }
    })
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('TTS timeout')), 60000)
      audioStream.on('data', (c: Buffer) => chunks.push(c))
      audioStream.on('end', () => {
        clearTimeout(timer)
        resolve()
      })
      audioStream.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })
    const audio = Buffer.concat(chunks)
    if (audio.length === 0) throw new Error('TTS returned no audio')
    return { audio: new Uint8Array(audio), words }
  }
  const p = e.queue.then(run, run)
  e.queue = p.catch(() => undefined)
  return p
}

function cacheKey(req: SynthRequest): string {
  return createHash('md5')
    .update(`${req.voice}|${req.rate}|${req.pitch}`)
    .digest('hex')
    .slice(0, 10)
}

async function cachePaths(req: SynthRequest): Promise<{ mp3: string; json: string } | null> {
  if (!req.bookId || req.segment === undefined) return null
  const dir = join(audioDir(), req.bookId, cacheKey(req))
  await fs.mkdir(dir, { recursive: true })
  return { mp3: join(dir, `${req.segment}.mp3`), json: join(dir, `${req.segment}.json`) }
}

export async function synthesize(req: SynthRequest): Promise<SynthResult> {
  const paths = await cachePaths(req)
  if (paths) {
    try {
      const [audio, json] = await Promise.all([
        fs.readFile(paths.mp3),
        fs.readFile(paths.json, 'utf8')
      ])
      return { audio: new Uint8Array(audio), words: JSON.parse(json) as WordMark[] }
    } catch {
      /* not cached */
    }
  }
  let result: SynthResult
  try {
    result = await synthOnce(req)
  } catch {
    // The websocket may have gone stale; rebuild the engine and retry once
    engines.get(req.voice)?.tts.close()
    engines.delete(req.voice)
    result = await synthOnce(req)
  }
  if (paths) {
    await fs.writeFile(paths.mp3, result.audio)
    await fs.writeFile(paths.json, JSON.stringify(result.words))
  }
  return result
}

export async function clearAudioCache(bookId?: string): Promise<void> {
  await fs.rm(bookId ? join(audioDir(), bookId) : audioDir(), { recursive: true, force: true })
}

function safeName(s: string): string {
  return Array.from(s)
    .filter((c) => c.charCodeAt(0) >= 32 && !'<>:"/\\|?*'.includes(c))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

export function cancelExport(): void {
  exportCancelled = true
}

export async function exportAudiobook(
  req: ExportRequest,
  win: BrowserWindow | null
): Promise<{ files: string[]; cancelled: boolean }> {
  exportCancelled = false
  const total = req.chapters.reduce((n, c) => n + c.segments.length, 0)
  let done = 0
  const files: string[] = []
  const send = (chapter: string): void =>
    win?.webContents.send('tts:progress', { done, total, chapter })
  for (let i = 0; i < req.chapters.length; i++) {
    const ch = req.chapters[i]
    const parts: Uint8Array[] = []
    for (const seg of ch.segments) {
      if (exportCancelled) return { files, cancelled: true }
      const r = await synthesize({
        text: seg.text,
        voice: req.voice,
        rate: req.rate,
        pitch: req.pitch,
        bookId: req.bookId,
        segment: seg.index
      })
      parts.push(r.audio)
      done++
      send(ch.title)
    }
    const file = join(
      req.outDir,
      `${String(i + 1).padStart(2, '0')} - ${safeName(ch.title) || 'Capítulo'}.mp3`
    )
    await fs.writeFile(file, Buffer.concat(parts.map((p) => Buffer.from(p))))
    files.push(file)
  }
  return { files, cancelled: false }
}
