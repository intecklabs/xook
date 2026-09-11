import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { StatusBar } from '@capacitor/status-bar'
import { FilePicker } from '@capawesome/capacitor-file-picker'
import type {
  Api,
  AnnotationRow,
  BookRow,
  DictEntry,
  ImportProgress,
  IndexStatus,
  ListParams,
  SearchHit,
  UniverseRow
} from '../../../preload'
import { lookupWord } from '../../../shared/dictionary'
import { fetchImage, findCoverCandidates, rankCandidates } from '../../../shared/coverSearch'
import { parseEpub } from '../lib/parsers/epub'
import { parsePdf } from '../lib/parsers/pdf'
import { epubMeta, pdfMeta } from '../lib/parsers/meta'
import { displayAuthor, suggestPreset, themeFromPreset } from '../lib/universes'
import { setCoverUrlProvider, type CoverKind } from '../lib/platform'
import { MobileDb, type SqlValue } from './mobileDb'
import {
  IS_NATIVE,
  bytesToBase64,
  exists,
  extFromMime,
  importNativeFile,
  initDataUri,
  listDir,
  localUrl,
  mimeFromExt,
  readBytes,
  readText,
  remove,
  writeBytes,
  writeText
} from './files'

type BookText = { chapters: { title: string; paragraphs: string[] }[] }

declare const __APP_VERSION__: string

const db = new MobileDb()

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

const GENERIC_AUTHOR =
  /^(varios(\s+autores)?|vv\.?\s*aa\.?|aa\.?\s*vv\.?|an[oó]nimo|anonymous|unknown|desconocido|autor desconocido|sin autor|n\/a|none|null|-+)$/i

// ---------- covers / images: files named <id>.<ext>; ext cached so URLs can be built synchronously ----------
const coverExt = new Map<string, string>()
const blobUrls = new Map<string, string>()

async function loadImageIndex(): Promise<void> {
  for (const kind of ['covers', 'universes'] as const) {
    for (const name of await listDir(kind)) {
      const m = name.match(/^(.+)\.(jpg|png|webp|gif)$/i)
      if (m) coverExt.set(`${kind === 'covers' ? 'book' : 'universe'}/${m[1]}`, m[2].toLowerCase())
    }
  }
}

const imgDir = (kind: CoverKind): string => (kind === 'book' ? 'covers' : 'universes')

function forgetImage(kind: CoverKind, id: string): void {
  const key = `${kind}/${id}`
  coverExt.delete(key)
  const u = blobUrls.get(key)
  if (u) {
    URL.revokeObjectURL(u)
    blobUrls.delete(key)
  }
}

async function saveImage(
  kind: CoverKind,
  id: string,
  data: Uint8Array,
  mime: string
): Promise<void> {
  const old = coverExt.get(`${kind}/${id}`)
  if (old) await remove(`${imgDir(kind)}/${id}.${old}`)
  forgetImage(kind, id)
  const ext = extFromMime(mime)
  await writeBytes(`${imgDir(kind)}/${id}.${ext}`, data)
  coverExt.set(`${kind}/${id}`, ext)
}

async function deleteImage(kind: CoverKind, id: string): Promise<void> {
  const ext = coverExt.get(`${kind}/${id}`)
  if (ext) await remove(`${imgDir(kind)}/${id}.${ext}`)
  forgetImage(kind, id)
}

setCoverUrlProvider({
  sync: (kind, id, version) => {
    const ext = coverExt.get(`${kind}/${id}`)
    if (!ext) return null
    if (IS_NATIVE) {
      const u = localUrl(`${imgDir(kind)}/${id}.${ext}`)
      return u ? `${u}?v=${version}` : null
    }
    return blobUrls.get(`${kind}/${id}`) ?? null
  },
  load: async (kind, id) => {
    const key = `${kind}/${id}`
    const ext = coverExt.get(key)
    if (!ext) return null
    const cached = blobUrls.get(key)
    if (cached) return cached
    const bytes = await readBytes(`${imgDir(kind)}/${id}.${ext}`)
    if (!bytes) return null
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeFromExt(ext) }))
    blobUrls.set(key, url)
    return url
  }
})

// ---------- events ----------
const importListeners = new Set<(p: ImportProgress) => void>()
const indexListeners = new Set<(s: IndexStatus) => void>()

// ---------- books ----------
const SORTS: Record<NonNullable<ListParams['sort']>, string> = {
  recent: 'COALESCE(lastReadAt, addedAt) DESC',
  added: 'addedAt DESC',
  title: 'titleNorm ASC',
  author: 'authorNorm ASC, titleNorm ASC',
  progress: 'CASE WHEN totalWords > 0 THEN position * 1.0 / totalWords ELSE 0 END DESC'
}

function listBooks(p: ListParams): { rows: BookRow[]; total: number } {
  const where: string[] = []
  const args: SqlValue[] = []
  if (p.q && p.q.trim()) {
    const field = p.field ?? 'all'
    for (const term of normalize(p.q).split(' ').filter(Boolean)) {
      if (field === 'title') {
        where.push('titleNorm LIKE ?')
        args.push(`%${term}%`)
      } else if (field === 'author') {
        where.push('authorNorm LIKE ?')
        args.push(`%${term}%`)
      } else {
        where.push('(titleNorm LIKE ? OR authorNorm LIKE ?)')
        args.push(`%${term}%`, `%${term}%`)
      }
    }
  }
  if (p.universeId) {
    where.push('universeId = ?')
    args.push(p.universeId)
  }
  if (p.unassigned) where.push('universeId IS NULL')
  if (p.needsText) where.push('hasText = 0')
  const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = db.get<{ n: number }>(`SELECT count(*) AS n FROM books ${w}`, ...args)!.n
  const rows = db.all<BookRow>(
    `SELECT * FROM books ${w} ORDER BY ${SORTS[p.sort ?? 'recent']} LIMIT ? OFFSET ?`,
    ...args,
    p.limit ?? 50,
    p.offset ?? 0
  )
  return { rows, total }
}

const getBook = (id: string): BookRow | null =>
  db.get<BookRow>('SELECT * FROM books WHERE id = ?', id) ?? null

const UPDATABLE = new Set([
  'title',
  'author',
  'totalWords',
  'position',
  'lastReadAt',
  'coverSource',
  'coverTriedAt',
  'universeId',
  'voice',
  'hasText',
  'indexed',
  'avgWpm',
  'annotationCount',
  'size'
])

function updateBook(id: string, patch: Record<string, unknown>): void {
  const sets: string[] = []
  const args: SqlValue[] = []
  for (const [k, v] of Object.entries(patch)) {
    if (!UPDATABLE.has(k)) continue
    sets.push(`${k} = ?`)
    args.push(
      v === undefined || v === null
        ? null
        : typeof v === 'object'
          ? JSON.stringify(v)
          : typeof v === 'boolean'
            ? Number(v)
            : (v as SqlValue)
    )
    if (k === 'title') {
      sets.push('titleNorm = ?')
      args.push(normalize(String(v)))
    }
    if (k === 'author') {
      sets.push('authorNorm = ?')
      args.push(v ? normalize(String(v)) : null)
    }
  }
  if (!sets.length) return
  args.push(id)
  db.run(`UPDATE books SET ${sets.join(', ')} WHERE id = ?`, ...args)
}

function refreshAnnotationCount(bookId: string): void {
  db.run(
    'UPDATE books SET annotationCount = (SELECT count(*) FROM annotations WHERE bookId = ?) WHERE id = ?',
    bookId,
    bookId
  )
}

// ---------- universes ----------
function universeIdForAuthor(author: string): string | null {
  return (
    db.get<{ universeId: string }>(
      'SELECT universeId FROM universe_authors WHERE authorNorm = ? LIMIT 1',
      normalize(author)
    )?.universeId ?? null
  )
}

function upsertUniverse(u: {
  id: string
  name: string
  description?: string | null
  authors: string[]
  theme: unknown
  createdAt: string
}): void {
  db.transaction(() => {
    db.run(
      `INSERT INTO universes (id,name,description,authors,theme,createdAt,nameNorm) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, authors=excluded.authors, theme=excluded.theme, nameNorm=excluded.nameNorm`,
      u.id,
      u.name,
      u.description ?? null,
      JSON.stringify(u.authors),
      JSON.stringify(u.theme),
      u.createdAt,
      normalize(u.name)
    )
    db.run('DELETE FROM universe_authors WHERE universeId = ?', u.id)
    for (const a of u.authors)
      db.run(
        'INSERT OR IGNORE INTO universe_authors (universeId, authorNorm) VALUES (?,?)',
        u.id,
        normalize(a)
      )
  })
}

function ensureUniverse(author: string): string | null {
  const a = author.trim()
  if (a.length < 2 || GENERIC_AUTHOR.test(a)) return null
  const existing = universeIdForAuthor(a)
  if (existing) return existing
  const name = displayAuthor(a)
  const id = makeId()
  upsertUniverse({
    id,
    name,
    authors: [name],
    theme: themeFromPreset(suggestPreset(name)),
    createdAt: new Date().toISOString()
  })
  return id
}

// ---------- text / search ----------
function indexParagraphs(bookId: string, chapters: BookText['chapters']): number {
  let token = 0
  db.transaction(() => {
    db.run('DELETE FROM paragraphs WHERE bookId = ?', bookId)
    chapters.forEach((ch, ci) => {
      ch.paragraphs.forEach((p, pi) => {
        db.run(
          'INSERT INTO paragraphs (text, bookId, chapter, paragraph, token) VALUES (?,?,?,?,?)',
          p,
          bookId,
          ci,
          pi,
          token
        )
        token += p.split(/\s+/).filter(Boolean).length
      })
    })
    db.run('UPDATE books SET hasText = 1, indexed = 1, totalWords = ? WHERE id = ?', token, bookId)
  })
  return token
}

function searchText(q: string, universeId: string | null, limit = 60): SearchHit[] {
  const terms = normalize(q)
    .split(' ')
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '')}"*`)
  if (!terms.length) return []
  const match = terms.join(' ')
  const where = universeId ? 'AND b.universeId = ?' : ''
  const args: SqlValue[] = universeId ? [match, universeId, limit] : [match, limit]
  return db.all<SearchHit>(
    `SELECT p.bookId, b.title, p.chapter, p.paragraph, p.token,
            snippet(paragraphs, 0, '', '', '…', 22) AS snippet
     FROM paragraphs p JOIN books b ON b.id = p.bookId
     WHERE paragraphs MATCH ? ${where}
     ORDER BY bm25(paragraphs) LIMIT ?`,
    ...args
  )
}

async function saveText(id: string, data: BookText): Promise<number> {
  await writeText(`texts/${id}.json`, JSON.stringify(data))
  return indexParagraphs(id, data.chapters)
}

// ---------- import ----------
// A picked file: native gives a path in the cache dir, web gives a Blob
const picked = new Map<string, { name: string; path?: string; blob?: Blob; size: number }>()

function titleFromName(name: string): string {
  return name
    .replace(/\.(pdf|epub)$/i, '')
    .replace(/[_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function importOne(handle: string): Promise<'added' | 'skipped'> {
  const f = picked.get(handle)
  if (!f) throw new Error('archivo no disponible')
  const ext = f.name.toLowerCase().endsWith('.epub') ? 'epub' : 'pdf'
  const id = makeId()
  const path = `books/${id}.${ext}`
  if (f.path) await importNativeFile(f.path, path)
  else if (f.blob) await writeBytes(path, new Uint8Array(await f.blob.arrayBuffer()))
  const data = await readBytes(path)
  if (!data) throw new Error('no se pudo leer el archivo')
  let title = titleFromName(f.name)
  let author: string | undefined
  let coverSource: string | null = null
  let totalWords = 0
  if (ext === 'epub') {
    const meta = await epubMeta(data)
    title = meta.title || title
    author = meta.author
    if (meta.cover) {
      await saveImage('book', id, meta.cover.data, meta.cover.mime)
      coverSource = 'file'
    }
    totalWords = Math.max(500, Math.round(data.length / 12))
  } else {
    const meta = await pdfMeta(data)
    title = meta.title || title
    author = meta.author
    totalWords = (meta.pages ?? 0) * 280
  }
  const universeId = author ? ensureUniverse(author) : null
  db.run(
    `INSERT INTO books (id,title,author,format,path,size,totalWords,position,addedAt,coverSource,universeId,hasText,titleNorm,authorNorm)
     VALUES (?,?,?,?,?,?,?,0,?,?,?,0,?,?)`,
    id,
    title,
    author ?? null,
    ext,
    path,
    f.size,
    totalWords,
    new Date().toISOString(),
    coverSource,
    universeId,
    normalize(title),
    author ? normalize(author) : null
  )
  return 'added'
}

let importing = false
let importCancelled = false

async function startImport(handles: string[]): Promise<ImportProgress> {
  if (importing) throw new Error('Ya hay una importación en curso')
  importing = true
  importCancelled = false
  const progress: ImportProgress = {
    phase: 'importing',
    scanned: handles.length,
    total: handles.length,
    done: 0,
    added: 0,
    skipped: 0,
    failed: 0,
    current: ''
  }
  const send = (): void => importListeners.forEach((cb) => cb({ ...progress }))
  try {
    send()
    for (const h of handles) {
      if (importCancelled) break
      progress.current = picked.get(h)?.name ?? ''
      try {
        const r = await importOne(h)
        if (r === 'added') progress.added++
        else progress.skipped++
      } catch (e) {
        console.error('[import]', e)
        progress.failed++
      }
      progress.done++
      send()
    }
    progress.phase = importCancelled ? 'cancelled' : 'done'
    progress.current = ''
    send()
    await db.flush()
    return progress
  } finally {
    importing = false
    for (const h of handles) picked.delete(h)
  }
}

// ---------- background text extraction (search index) ----------
let indexing = false
let indexBusy = false
let indexCurrent: string | null = null

function indexStatus(): IndexStatus {
  const pending = db.get<{ n: number }>('SELECT count(*) AS n FROM books WHERE hasText = 0')!.n
  return { enabled: indexing, busy: indexBusy, pending, current: indexCurrent }
}

const emitIndex = (): void => indexListeners.forEach((cb) => cb(indexStatus()))

async function extractBook(b: BookRow): Promise<void> {
  const data = await readBytes(b.path)
  if (!data) throw new Error('archivo no disponible')
  const parsed = b.format === 'epub' ? await parseEpub(data) : await parsePdf(data)
  await saveText(b.id, parsed.book)
  if (parsed.cover && (!b.coverSource || b.coverSource === 'none')) {
    await saveImage('book', b.id, parsed.cover.data, parsed.cover.mime)
    updateBook(b.id, { coverSource: 'file' })
  }
  if (!b.author && parsed.author) {
    updateBook(b.id, {
      author: parsed.author,
      universeId: b.universeId ?? ensureUniverse(parsed.author)
    })
  }
}

async function indexLoop(): Promise<void> {
  if (indexBusy) return
  indexBusy = true
  try {
    while (indexing) {
      const b = db.get<BookRow>('SELECT * FROM books WHERE hasText = 0 ORDER BY addedAt LIMIT 1')
      if (!b) break
      indexCurrent = b.title
      emitIndex()
      try {
        await extractBook(b)
      } catch (e) {
        console.error('[index]', e)
        // never retry a broken file in a loop
        updateBook(b.id, { hasText: 1, indexed: 0 })
      }
      await new Promise((r) => setTimeout(r, 50))
    }
  } finally {
    indexBusy = false
    indexCurrent = null
    emitIndex()
  }
}

// ---------- the API ----------
const notMobile = (what: string) => (): never => {
  throw new Error(`${what} no está disponible en la versión móvil`)
}

const api: Api = {
  listBooks: async (p) => listBooks(p),
  getBook: async (id) => getBook(id),
  getBookByPath: async (p) => db.get<BookRow>('SELECT * FROM books WHERE path = ?', p) ?? null,
  updateBook: async (id, patch) => updateBook(id, patch),
  removeBook: async (id) => {
    const b = getBook(id)
    db.transaction(() => {
      db.run('DELETE FROM annotations WHERE bookId = ?', id)
      db.run('DELETE FROM sessions WHERE bookId = ?', id)
      db.run('DELETE FROM paragraphs WHERE bookId = ?', id)
      db.run('DELETE FROM books WHERE id = ?', id)
    })
    if (b) await remove(b.path)
    await remove(`texts/${id}.json`)
    await deleteImage('book', id)
  },
  stats: async () => {
    const b = db.get<{ n: number }>('SELECT count(*) AS n FROM books')!
    const s = db.get<{ n: number; w: number; sec: number }>(
      'SELECT count(*) AS n, COALESCE(sum(words),0) AS w, COALESCE(sum(seconds),0) AS sec FROM sessions'
    )!
    const a = db.get<{ n: number }>('SELECT count(*) AS n FROM annotations')!
    return {
      books: b.n,
      words: s.w,
      sessions: s.n,
      notes: a.n,
      wpm: s.sec ? Math.round((s.w / s.sec) * 60) : null
    }
  },
  annotations: async (bookId) =>
    db.all<AnnotationRow>('SELECT * FROM annotations WHERE bookId = ? ORDER BY start', bookId),
  addAnnotation: async (a) => {
    const row: AnnotationRow = { ...a, id: makeId(), createdAt: new Date().toISOString() }
    db.run(
      'INSERT INTO annotations (id,bookId,start,end,text,color,note,createdAt) VALUES (?,?,?,?,?,?,?,?)',
      row.id,
      row.bookId,
      row.start,
      row.end,
      row.text,
      row.color,
      row.note ?? null,
      row.createdAt
    )
    refreshAnnotationCount(a.bookId)
    return row
  },
  updateAnnotation: async (id, patch) => {
    const sets: string[] = []
    const args: SqlValue[] = []
    if (patch.color !== undefined) {
      sets.push('color = ?')
      args.push(patch.color)
    }
    if ('note' in patch) {
      sets.push('note = ?')
      args.push(patch.note ?? null)
    }
    if (!sets.length) return
    args.push(id)
    db.run(`UPDATE annotations SET ${sets.join(', ')} WHERE id = ?`, ...args)
  },
  removeAnnotation: async (id) => {
    const row = db.get<{ bookId: string }>('SELECT bookId FROM annotations WHERE id = ?', id)
    db.run('DELETE FROM annotations WHERE id = ?', id)
    if (row) refreshAnnotationCount(row.bookId)
  },
  allAnnotations: async (offset, limit) => {
    const total = db.get<{ n: number }>('SELECT count(*) AS n FROM annotations')!.n
    const rows = db.all<AnnotationRow & { title: string }>(
      `SELECT a.*, b.title FROM annotations a JOIN books b ON b.id = a.bookId
       ORDER BY b.titleNorm, a.start LIMIT ? OFFSET ?`,
      limit,
      offset
    )
    return { rows, total }
  },
  addSession: async (bookId, s) => {
    db.run(
      'INSERT INTO sessions (bookId,date,mode,words,seconds,wpm) VALUES (?,?,?,?,?,?)',
      bookId,
      s.date,
      s.mode,
      s.words,
      s.seconds,
      s.wpm
    )
    const id = db.lastInsertRowid()
    const recent = db.all<{ words: number; seconds: number }>(
      'SELECT words, seconds FROM sessions WHERE bookId = ? ORDER BY id DESC LIMIT 5',
      bookId
    )
    const w = recent.reduce((n, x) => n + x.words, 0)
    const sec = recent.reduce((n, x) => n + x.seconds, 0)
    db.run(
      'UPDATE books SET avgWpm = ? WHERE id = ?',
      sec ? Math.round((w / sec) * 60) : null,
      bookId
    )
    return id
  },
  setQuizScore: async (sessionId, score) =>
    db.run('UPDATE sessions SET quizScore = ? WHERE id = ?', score, sessionId),
  listUniverses: async (q, offset, limit) => {
    const where = q && q.trim() ? 'WHERE u.nameNorm LIKE ?' : ''
    const args: SqlValue[] = q && q.trim() ? [`%${normalize(q)}%`] : []
    const total = db.get<{ n: number }>(
      `SELECT count(*) AS n FROM universes u ${where}`,
      ...args
    )!.n
    const rows = db.all<UniverseRow>(
      `SELECT u.*,
        (SELECT count(*) FROM books b WHERE b.universeId = u.id) AS bookCount,
        (SELECT group_concat(id) FROM (SELECT id FROM books b WHERE b.universeId = u.id AND coverSource IS NOT NULL AND coverSource != 'none' LIMIT 4)) AS sampleIds
       FROM universes u ${where} ORDER BY bookCount DESC, u.nameNorm LIMIT ? OFFSET ?`,
      ...args,
      limit,
      offset
    )
    return { rows: rows.map((r) => ({ ...r, sampleIds: r.sampleIds ?? '' })), total }
  },
  getUniverse: async (id) =>
    db.get<UniverseRow>(
      `SELECT u.*, (SELECT count(*) FROM books b WHERE b.universeId = u.id) AS bookCount, '' AS sampleIds FROM universes u WHERE id = ?`,
      id
    ) ?? null,
  upsertUniverse: async (u) => upsertUniverse(u),
  deleteUniverse: async (id) => {
    db.transaction(() => {
      db.run('UPDATE books SET universeId = NULL WHERE universeId = ?', id)
      db.run('DELETE FROM universe_authors WHERE universeId = ?', id)
      db.run('DELETE FROM universes WHERE id = ?', id)
    })
    await deleteImage('universe', id)
  },
  assignBook: async (bookId, universeId) => updateBook(bookId, { universeId }),
  ensureUniverse: async (author) => ensureUniverse(author),
  getSettings: async () => {
    const row = db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'settings'")
    return row ? JSON.parse(row.value) : null
  },
  setSettings: async (value) =>
    db.run(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('settings', ?)",
      JSON.stringify(value)
    ),
  loadText: async (id) => {
    const t = await readText(`texts/${id}.json`)
    return t ? (JSON.parse(t) as BookText) : null
  },
  saveText,
  searchText: async (q, universeId) => searchText(q, universeId),

  pickImport: async (kind) => {
    if (kind === 'folder') throw new Error('En el móvil elige los archivos uno a uno')
    const r = await FilePicker.pickFiles({
      types: ['application/pdf', 'application/epub+zip'],
      limit: 0,
      readData: false
    })
    const handles: string[] = []
    for (const f of r.files) {
      if (!/\.(pdf|epub)$/i.test(f.name)) continue
      const h = `picked:${makeId()}`
      picked.set(h, { name: f.name, path: f.path, blob: f.blob, size: f.size })
      handles.push(h)
    }
    return handles
  },
  startImport,
  cancelImport: async () => {
    importCancelled = true
  },
  importRunning: async () => importing,
  onImportProgress: (cb) => {
    importListeners.add(cb)
    return () => importListeners.delete(cb)
  },
  indexStatus: async () => indexStatus(),
  setIndexing: async (on) => {
    indexing = on
    if (on) void indexLoop()
    return indexStatus()
  },
  onIndexStatus: (cb) => {
    indexListeners.add(cb)
    return () => indexListeners.delete(cb)
  },
  initialBook: async () => null,
  readBook: async (path) => {
    const data = await readBytes(path)
    if (!data) throw new Error('No se encontró el archivo del libro')
    return data
  },
  fileStat: async (p) => ((await exists(p)) ? { size: 0 } : null),

  saveCover: async (id, data, mime) => {
    await saveImage('book', id, data, mime)
  },
  deleteCover: async (id) => deleteImage('book', id),
  searchCovers: async (title, author) => {
    const candidates = await findCoverCandidates(title, author)
    const withThumbs = await Promise.all(
      candidates.map(async (c) => {
        const img = await fetchImage(c.thumb)
        return img
          ? { ...c, thumbData: `data:${img.mime};base64,${bytesToBase64(img.data)}` }
          : null
      })
    )
    return withThumbs.filter((c): c is NonNullable<typeof c> => c !== null)
  },
  setCoverFromUrl: async (id, url) => {
    const img = await fetchImage(url)
    if (!img) return false
    await saveImage('book', id, img.data, img.mime)
    updateBook(id, { coverSource: 'web' })
    return true
  },
  autoCover: async (id) => {
    const b = getBook(id)
    if (!b) return false
    const ranked = rankCandidates(
      b.title,
      b.author ?? undefined,
      await findCoverCandidates(b.title, b.author ?? undefined)
    )
    for (const c of ranked) {
      const img = await fetchImage(c.url)
      if (img) {
        await saveImage('book', id, img.data, img.mime)
        updateBook(id, { coverSource: 'web' })
        return true
      }
    }
    updateBook(id, { coverSource: 'none', coverTriedAt: new Date().toISOString() })
    return false
  },

  pickUniverseImage: async (id) => {
    const r = await FilePicker.pickImages({ limit: 1, readData: false })
    const f = r.files[0]
    if (!f) return false
    const mime = f.mimeType || 'image/jpeg'
    if (f.path) {
      const old = coverExt.get(`universe/${id}`)
      if (old) await remove(`universes/${id}.${old}`)
      forgetImage('universe', id)
      const ext = extFromMime(mime)
      await importNativeFile(f.path, `universes/${id}.${ext}`)
      coverExt.set(`universe/${id}`, ext)
    } else if (f.blob) {
      await saveImage('universe', id, new Uint8Array(await f.blob.arrayBuffer()), mime)
    } else return false
    return true
  },
  deleteUniverseImage: async (id) => deleteImage('universe', id),
  universeHasImage: async (id) => coverExt.has(`universe/${id}`),

  getDataDir: async () => ({
    current: 'Almacenamiento privado de la app',
    default: 'Almacenamiento privado de la app'
  }),
  moveDataDir: async () => null,

  pickSavePath: async () => null,
  convertBook: notMobile('Convertir formato'),
  convertToTemp: notMobile('Convertir formato'),
  showInFolder: async () => undefined,
  openPath: async () => '',
  openExternal: async (url) => {
    if (/^https?:\/\//i.test(url)) await Browser.open({ url })
  },
  appVersion: async () => {
    if (IS_NATIVE) {
      try {
        return (await App.getInfo()).version
      } catch {
        /* fall through */
      }
    }
    return __APP_VERSION__
  },
  mailLoad: async () => null,
  mailSave: notMobile('El envío por correo'),
  mailTest: notMobile('El envío por correo'),
  mailSend: notMobile('El envío por correo'),
  listDevices: async () => [],
  pickDeviceFolder: async () => null,
  copyToDevice: notMobile('Copiar a dispositivo'),

  // Neural voices are a desktop feature; the narrator falls back to the phone's own voices
  ttsVoices: async () => [],
  ttsSynth: async () => {
    throw new Error('Las voces neuronales no están disponibles en el móvil')
  },
  ttsClearCache: async () => undefined,
  ttsPickExportDir: async () => null,
  ttsExport: async () => ({ files: [], cancelled: true }),
  ttsCancelExport: async () => undefined,
  onTtsProgress: () => () => undefined,

  lookupWord: async (word, lang): Promise<DictEntry | null> => lookupWord(word, lang),
  setFullScreen: async (flag) => {
    if (!IS_NATIVE) return
    try {
      if (flag) await StatusBar.hide()
      else await StatusBar.show()
    } catch {
      /* not supported */
    }
  },
  isFullScreen: async () => false
}

export async function installMobileApi(): Promise<void> {
  await initDataUri()
  await db.open()
  await loadImageIndex()
  window.api = api
  document.documentElement.classList.add('mobile')
  if (IS_NATIVE) {
    void App.addListener('pause', () => void db.flush())
    void App.addListener('backButton', ({ canGoBack }) => {
      // Let the UI close overlays first; if nothing consumed it, minimise like a native app
      const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      const consumed = !window.dispatchEvent(ev)
      if (!consumed && !canGoBack) void App.minimizeApp()
    })
  }
  window.addEventListener('beforeunload', () => void db.flush())
  if (import.meta.env.DEV) {
    // Browser testing: window.__xookImport('libro.epub', blob) bypasses the native file picker
    ;(window as unknown as { __xookImport: unknown }).__xookImport = async (
      name: string,
      blob: Blob
    ): Promise<ImportProgress> => {
      const h = `picked:${makeId()}`
      picked.set(h, { name, blob, size: blob.size })
      return startImport([h])
    }
  }
}
