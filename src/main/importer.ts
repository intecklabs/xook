import { BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import { join, basename, extname } from 'path'
import { epubMetadata, pdfMetadata } from './extract'
import { getBookByPath, insertBook, universeIdForAuthor, upsertUniverse, makeId } from './db'
import { saveCover } from './covers'

export interface ImportProgress {
  phase: 'scanning' | 'importing' | 'done' | 'cancelled'
  scanned: number
  total: number
  done: number
  added: number
  skipped: number
  failed: number
  current: string
}

let cancelled = false
let running = false

export function cancelImport(): void {
  cancelled = true
}

export function isImporting(): boolean {
  return running
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (cancelled) return
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '$RECYCLE.BIN') continue
    const full = join(dir, e.name)
    if (e.isDirectory()) yield* walk(full)
    else if (e.isFile()) {
      const ext = extname(e.name).toLowerCase()
      if (ext === '.epub' || ext === '.pdf') yield full
    }
  }
}

function titleFromName(path: string): string {
  return basename(path)
    .replace(/\.(pdf|epub)$/i, '')
    .replace(/[_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// "Apellido, Nombre" → "Nombre Apellido"
function displayAuthor(a: string): string {
  const t = a.trim()
  if (t.includes(',')) {
    const [last, first] = t.split(',').map((s) => s.trim())
    return `${first} ${last}`.trim()
  }
  return t
}

const AUTHOR_PRESETS: [RegExp, string][] = [
  [/lovecraft|ligotti|barker|chambers|machen|blackwood/i, 'eldritch'],
  [/tolkien|rowling|martin|sanderson|jordan|le guin|pratchett|lewis|gaiman|rothfuss/i, 'fantasy'],
  [/asimov|clarke|herbert|dick|gibson|heinlein|bradbury|verne|wells|banks|simmons/i, 'scifi'],
  [/poe|stoker|shelley|rice|king|becquer|le fanu|walpole/i, 'gothic'],
  [/christie|doyle|hammett|chandler|highsmith|larsson|nesbo|simenon/i, 'mystery'],
  [/melville|conrad|hemingway|london|stevenson/i, 'ocean'],
  [/coelho|rulfo|mccarthy|borges/i, 'desert']
]
const PRESET_COLORS: Record<string, { bg1: string; bg2: string; accent: string }> = {
  eldritch: { bg1: '#0b1a1c', bg2: '#1f0f2e', accent: '#5fd3b5' },
  fantasy: { bg1: '#0f2a1c', bg2: '#2b1d0a', accent: '#e0b64a' },
  scifi: { bg1: '#03071a', bg2: '#0a2145', accent: '#5ab0ff' },
  gothic: { bg1: '#160608', bg2: '#2a0d14', accent: '#d63a4a' },
  mystery: { bg1: '#0f141c', bg2: '#1f2a3a', accent: '#8fb3d9' },
  ocean: { bg1: '#03202e', bg2: '#05506b', accent: '#4fd1e0' },
  desert: { bg1: '#3a2410', bg2: '#7a4a1e', accent: '#f2b25c' },
  library: { bg1: '#1c1410', bg2: '#3a2a1e', accent: '#d9a066' }
}

// "Varios autores", "Anónimo", etc. are not a universe
const GENERIC_AUTHOR =
  /^(varios(\s+autores)?|vv\.?\s*aa\.?|aa\.?\s*vv\.?|an[oó]nimo|anonymous|unknown|desconocido|autor desconocido|sin autor|n\/a|none|null|-+)$/i

export function isGenericAuthor(author: string): boolean {
  const a = author.trim()
  return a.length < 2 || GENERIC_AUTHOR.test(a)
}

export function ensureUniverseForAuthor(author: string): string | null {
  if (isGenericAuthor(author)) return null
  const existing = universeIdForAuthor(author)
  if (existing) return existing
  const name = displayAuthor(author)
  const preset = AUTHOR_PRESETS.find(([re]) => re.test(name))?.[1] ?? 'library'
  const id = makeId()
  upsertUniverse({
    id,
    name,
    authors: [name],
    theme: { preset, ...PRESET_COLORS[preset] },
    createdAt: new Date().toISOString()
  })
  return id
}

async function importOne(path: string): Promise<'added' | 'skipped'> {
  if (getBookByPath(path)) return 'skipped'
  const stat = await fs.stat(path)
  const format = extname(path).toLowerCase() === '.epub' ? 'epub' : 'pdf'
  const id = makeId()
  let title = titleFromName(path)
  let author: string | undefined
  let coverSource: string | null = null
  let totalWords = 0
  if (format === 'epub') {
    const data = new Uint8Array(await fs.readFile(path))
    const meta = await epubMetadata(data)
    title = meta.title || title
    author = meta.author
    if (meta.cover) {
      await saveCover(id, meta.cover.data, meta.cover.mime)
      coverSource = 'file'
    }
    // rough estimate until the text is extracted: ~ 1 word per 6 bytes of xhtml
    totalWords = Math.max(500, Math.round(stat.size / 12))
  } else {
    const data = new Uint8Array(await fs.readFile(path))
    const meta = await pdfMetadata(data)
    title = meta.title || title
    author = meta.author
    totalWords = meta.pages * 280
  }
  const universeId = author ? ensureUniverseForAuthor(author) : null
  insertBook({
    id,
    title,
    author: author ?? null,
    format,
    path,
    size: stat.size,
    totalWords,
    coverSource,
    universeId
  })
  return 'added'
}

export async function importPaths(
  roots: string[],
  win: BrowserWindow | null
): Promise<ImportProgress> {
  if (running) throw new Error('Ya hay una importación en curso')
  running = true
  cancelled = false
  const progress: ImportProgress = {
    phase: 'scanning',
    scanned: 0,
    total: 0,
    done: 0,
    added: 0,
    skipped: 0,
    failed: 0,
    current: ''
  }
  let lastSent = 0
  const send = (force = false): void => {
    const now = Date.now()
    if (!force && now - lastSent < 120) return
    lastSent = now
    win?.webContents.send('import:progress', { ...progress })
  }
  try {
    const files: string[] = []
    for (const root of roots) {
      let st
      try {
        st = await fs.stat(root)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        for await (const f of walk(root)) {
          files.push(f)
          progress.scanned = files.length
          send()
          if (cancelled) break
        }
      } else if (/\.(epub|pdf)$/i.test(root)) files.push(root)
      if (cancelled) break
    }
    progress.total = files.length
    progress.phase = cancelled ? 'cancelled' : 'importing'
    send(true)

    const CONCURRENCY = 4
    let next = 0
    const worker = async (): Promise<void> => {
      while (!cancelled && next < files.length) {
        const file = files[next++]
        progress.current = basename(file)
        try {
          const r = await importOne(file)
          if (r === 'added') progress.added++
          else progress.skipped++
        } catch {
          progress.failed++
        }
        progress.done++
        send()
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))
    progress.phase = cancelled ? 'cancelled' : 'done'
    progress.current = ''
    send(true)
    return progress
  } finally {
    running = false
  }
}
