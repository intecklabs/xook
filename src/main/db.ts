import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, renameSync } from 'fs'
import { dataDir } from './paths'

export interface BookRow {
  id: string
  title: string
  author: string | null
  format: 'pdf' | 'epub'
  path: string
  size: number
  totalWords: number
  position: number
  addedAt: string
  lastReadAt: string | null
  coverSource: string | null
  coverTriedAt: string | null
  universeId: string | null
  voice: string | null
  hasText: number
  indexed: number
  avgWpm: number | null
  annotationCount: number
}

export interface AnnotationRow {
  id: string
  bookId: string
  start: number
  end: number
  text: string
  color: string
  note: string | null
  createdAt: string
}

export interface UniverseRow {
  id: string
  name: string
  description: string | null
  authors: string
  theme: string
  createdAt: string
  bookCount: number
  sampleIds: string
}

export interface ListParams {
  q?: string
  sort?: 'recent' | 'added' | 'title' | 'author' | 'progress'
  offset?: number
  limit?: number
  universeId?: string | null
  unassigned?: boolean
  needsText?: boolean
}

let db: DatabaseSync | null = null

export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

export function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  format TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  size INTEGER DEFAULT 0,
  totalWords INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0,
  addedAt TEXT NOT NULL,
  lastReadAt TEXT,
  coverSource TEXT,
  coverTriedAt TEXT,
  universeId TEXT,
  voice TEXT,
  hasText INTEGER DEFAULT 0,
  indexed INTEGER DEFAULT 0,
  avgWpm INTEGER,
  annotationCount INTEGER DEFAULT 0,
  titleNorm TEXT,
  authorNorm TEXT
);
CREATE INDEX IF NOT EXISTS books_recent ON books(lastReadAt DESC, addedAt DESC);
CREATE INDEX IF NOT EXISTS books_added ON books(addedAt DESC);
CREATE INDEX IF NOT EXISTS books_title ON books(titleNorm);
CREATE INDEX IF NOT EXISTS books_author ON books(authorNorm);
CREATE INDEX IF NOT EXISTS books_universe ON books(universeId);
CREATE INDEX IF NOT EXISTS books_hasText ON books(hasText, indexed);
CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  bookId TEXT NOT NULL,
  start INTEGER NOT NULL,
  end INTEGER NOT NULL,
  text TEXT NOT NULL,
  color TEXT NOT NULL,
  note TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS annotations_book ON annotations(bookId, start);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bookId TEXT NOT NULL,
  date TEXT NOT NULL,
  mode TEXT NOT NULL,
  words INTEGER NOT NULL,
  seconds INTEGER NOT NULL,
  wpm INTEGER NOT NULL,
  quizScore INTEGER
);
CREATE INDEX IF NOT EXISTS sessions_book ON sessions(bookId, id DESC);
CREATE TABLE IF NOT EXISTS universes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  authors TEXT NOT NULL,
  theme TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  nameNorm TEXT
);
CREATE TABLE IF NOT EXISTS universe_authors (
  universeId TEXT NOT NULL,
  authorNorm TEXT NOT NULL,
  PRIMARY KEY (universeId, authorNorm)
);
CREATE INDEX IF NOT EXISTS universe_authors_author ON universe_authors(authorNorm);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE VIRTUAL TABLE IF NOT EXISTS paragraphs USING fts5(
  text, bookId UNINDEXED, chapter UNINDEXED, paragraph UNINDEXED, token UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);
`

export function getDb(): DatabaseSync {
  if (db) return db
  mkdirSync(dataDir(), { recursive: true })
  db = new DatabaseSync(join(dataDir(), 'library.db'))
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec('PRAGMA temp_store = MEMORY')
  db.exec('PRAGMA cache_size = -65536')
  db.exec(SCHEMA)
  migrateFromJson(db)
  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}

// One-time import of the old library.json format
function migrateFromJson(d: DatabaseSync): void {
  const file = join(dataDir(), 'library.json')
  if (!existsSync(file)) return
  const count = (d.prepare('SELECT count(*) AS n FROM books').get() as { n: number }).n
  if (count === 0) {
    try {
      const data = JSON.parse(readFileSync(file, 'utf8')) as {
        books?: Record<string, unknown>[]
        universes?: Record<string, unknown>[]
        settings?: Record<string, unknown>
      }
      const insertBook = d.prepare(
        `INSERT OR IGNORE INTO books (id,title,author,format,path,size,totalWords,position,addedAt,lastReadAt,coverSource,coverTriedAt,universeId,voice,hasText,avgWpm,annotationCount,titleNorm,authorNorm)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      const insertAnn = d.prepare(
        'INSERT OR IGNORE INTO annotations (id,bookId,start,end,text,color,note,createdAt) VALUES (?,?,?,?,?,?,?,?)'
      )
      const insertSess = d.prepare(
        'INSERT INTO sessions (bookId,date,mode,words,seconds,wpm,quizScore) VALUES (?,?,?,?,?,?,?)'
      )
      const insertUni = d.prepare(
        'INSERT OR IGNORE INTO universes (id,name,description,authors,theme,createdAt,nameNorm) VALUES (?,?,?,?,?,?,?)'
      )
      const insertUA = d.prepare(
        'INSERT OR IGNORE INTO universe_authors (universeId, authorNorm) VALUES (?,?)'
      )
      d.exec('BEGIN')
      for (const b of data.books ?? []) {
        const sessions = (b.sessions as Record<string, number | string>[] | undefined) ?? []
        const anns = (b.annotations as Record<string, unknown>[] | undefined) ?? []
        const recent = sessions.slice(-5)
        const w = recent.reduce((n, s) => n + Number(s.words), 0)
        const sec = recent.reduce((n, s) => n + Number(s.seconds), 0)
        insertBook.run(
          String(b.id),
          String(b.title),
          (b.author as string) ?? null,
          String(b.format),
          String(b.path),
          0,
          Number(b.totalWords ?? 0),
          Number(b.position ?? 0),
          String(b.addedAt ?? new Date().toISOString()),
          (b.lastReadAt as string) ?? null,
          (b.coverSource as string) ?? null,
          (b.coverTriedAt as string) ?? null,
          (b.universeId as string) ?? null,
          b.voice ? JSON.stringify(b.voice) : null,
          1,
          sec ? Math.round((w / sec) * 60) : null,
          anns.length,
          normalize(String(b.title)),
          b.author ? normalize(String(b.author)) : null
        )
        for (const a of anns)
          insertAnn.run(
            String(a.id),
            String(b.id),
            Number(a.start),
            Number(a.end),
            String(a.text),
            String(a.color),
            (a.note as string) ?? null,
            String(a.createdAt)
          )
        for (const s of sessions)
          insertSess.run(
            String(b.id),
            String(s.date),
            String(s.mode),
            Number(s.words),
            Number(s.seconds),
            Number(s.wpm),
            s.quizScore === undefined ? null : Number(s.quizScore)
          )
      }
      for (const u of data.universes ?? []) {
        insertUni.run(
          String(u.id),
          String(u.name),
          (u.description as string) ?? null,
          JSON.stringify(u.authors ?? []),
          JSON.stringify(u.theme ?? {}),
          String(u.createdAt ?? new Date().toISOString()),
          normalize(String(u.name))
        )
        for (const a of (u.authors as string[]) ?? []) insertUA.run(String(u.id), normalize(a))
      }
      if (data.settings) setSetting(d, 'settings', data.settings)
      d.exec('COMMIT')
    } catch (e) {
      d.exec('ROLLBACK')
      throw e
    }
  }
  renameSync(file, `${file}.migrated`)
}

export function getSetting<T>(d: DatabaseSync, key: string): T | null {
  const row = d.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    { value: string } | undefined
  return row ? (JSON.parse(row.value) as T) : null
}

export function setSetting(d: DatabaseSync, key: string, value: unknown): void {
  d.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    key,
    JSON.stringify(value)
  )
}

const SORTS: Record<NonNullable<ListParams['sort']>, string> = {
  recent: 'COALESCE(lastReadAt, addedAt) DESC',
  added: 'addedAt DESC',
  title: 'titleNorm ASC',
  author: 'authorNorm ASC, titleNorm ASC',
  progress: 'CASE WHEN totalWords > 0 THEN position * 1.0 / totalWords ELSE 0 END DESC'
}

export function listBooks(p: ListParams): { rows: BookRow[]; total: number } {
  const d = getDb()
  const where: string[] = []
  const args: SQLInputValue[] = []
  if (p.q && p.q.trim()) {
    for (const term of normalize(p.q).split(' ').filter(Boolean)) {
      where.push('(titleNorm LIKE ? OR authorNorm LIKE ?)')
      args.push(`%${term}%`, `%${term}%`)
    }
  }
  if (p.universeId) {
    where.push('universeId = ?')
    args.push(p.universeId)
  }
  if (p.unassigned) where.push('universeId IS NULL')
  if (p.needsText) where.push('hasText = 0')
  const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = (d.prepare(`SELECT count(*) AS n FROM books ${w}`).get(...args) as { n: number }).n
  const rows = d
    .prepare(`SELECT * FROM books ${w} ORDER BY ${SORTS[p.sort ?? 'recent']} LIMIT ? OFFSET ?`)
    .all(...args, p.limit ?? 50, p.offset ?? 0) as unknown as BookRow[]
  return { rows, total }
}

export function getBook(id: string): BookRow | null {
  return (
    (getDb().prepare('SELECT * FROM books WHERE id = ?').get(id) as BookRow | undefined) ?? null
  )
}

export function getBookByPath(path: string): BookRow | null {
  return (
    (getDb().prepare('SELECT * FROM books WHERE path = ?').get(path) as BookRow | undefined) ?? null
  )
}

export interface NewBook {
  id?: string
  title: string
  author?: string | null
  format: 'pdf' | 'epub'
  path: string
  size?: number
  totalWords?: number
  coverSource?: string | null
  hasText?: number
  universeId?: string | null
}

export function insertBook(b: NewBook): BookRow {
  const d = getDb()
  const id = b.id ?? makeId()
  d.prepare(
    `INSERT INTO books (id,title,author,format,path,size,totalWords,position,addedAt,coverSource,universeId,hasText,titleNorm,authorNorm)
     VALUES (?,?,?,?,?,?,?,0,?,?,?,?,?,?)`
  ).run(
    id,
    b.title,
    b.author ?? null,
    b.format,
    b.path,
    b.size ?? 0,
    b.totalWords ?? 0,
    new Date().toISOString(),
    b.coverSource ?? null,
    b.universeId ?? null,
    b.hasText ?? 0,
    normalize(b.title),
    b.author ? normalize(b.author) : null
  )
  return getBook(id)!
}

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

export function updateBook(id: string, patch: Record<string, unknown>): void {
  const sets: string[] = []
  const args: SQLInputValue[] = []
  for (const [k, v] of Object.entries(patch)) {
    if (!UPDATABLE.has(k)) continue
    sets.push(`${k} = ?`)
    args.push(
      v === undefined
        ? null
        : typeof v === 'object' && v !== null
          ? JSON.stringify(v)
          : (v as SQLInputValue)
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
  getDb()
    .prepare(`UPDATE books SET ${sets.join(', ')} WHERE id = ?`)
    .run(...args)
}

export function removeBook(id: string): void {
  const d = getDb()
  d.exec('BEGIN')
  d.prepare('DELETE FROM annotations WHERE bookId = ?').run(id)
  d.prepare('DELETE FROM sessions WHERE bookId = ?').run(id)
  d.prepare('DELETE FROM paragraphs WHERE bookId = ?').run(id)
  d.prepare('DELETE FROM books WHERE id = ?').run(id)
  d.exec('COMMIT')
}

export function stats(): {
  books: number
  words: number
  sessions: number
  notes: number
  wpm: number | null
} {
  const d = getDb()
  const b = d.prepare('SELECT count(*) AS n FROM books').get() as { n: number }
  const s = d
    .prepare(
      'SELECT count(*) AS n, COALESCE(sum(words),0) AS w, COALESCE(sum(seconds),0) AS sec FROM sessions'
    )
    .get() as { n: number; w: number; sec: number }
  const a = d.prepare('SELECT count(*) AS n FROM annotations').get() as { n: number }
  return {
    books: b.n,
    words: s.w,
    sessions: s.n,
    notes: a.n,
    wpm: s.sec ? Math.round((s.w / s.sec) * 60) : null
  }
}

export function listAnnotations(bookId: string): AnnotationRow[] {
  return getDb()
    .prepare('SELECT * FROM annotations WHERE bookId = ? ORDER BY start')
    .all(bookId) as unknown as AnnotationRow[]
}

function refreshAnnotationCount(bookId: string): void {
  getDb()
    .prepare(
      'UPDATE books SET annotationCount = (SELECT count(*) FROM annotations WHERE bookId = ?) WHERE id = ?'
    )
    .run(bookId, bookId)
}

export function addAnnotation(a: Omit<AnnotationRow, 'id' | 'createdAt'>): AnnotationRow {
  const row: AnnotationRow = { ...a, id: makeId(), createdAt: new Date().toISOString() }
  getDb()
    .prepare(
      'INSERT INTO annotations (id,bookId,start,end,text,color,note,createdAt) VALUES (?,?,?,?,?,?,?,?)'
    )
    .run(
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
}

export function updateAnnotation(
  id: string,
  patch: { color?: string; note?: string | null }
): void {
  const sets: string[] = []
  const args: SQLInputValue[] = []
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
  getDb()
    .prepare(`UPDATE annotations SET ${sets.join(', ')} WHERE id = ?`)
    .run(...args)
}

export function removeAnnotation(id: string): void {
  const d = getDb()
  const row = d.prepare('SELECT bookId FROM annotations WHERE id = ?').get(id) as
    { bookId: string } | undefined
  d.prepare('DELETE FROM annotations WHERE id = ?').run(id)
  if (row) refreshAnnotationCount(row.bookId)
}

export function allAnnotations(
  offset: number,
  limit: number
): { rows: (AnnotationRow & { title: string })[]; total: number } {
  const d = getDb()
  const total = (d.prepare('SELECT count(*) AS n FROM annotations').get() as { n: number }).n
  const rows = d
    .prepare(
      `SELECT a.*, b.title FROM annotations a JOIN books b ON b.id = a.bookId
       ORDER BY b.titleNorm, a.start LIMIT ? OFFSET ?`
    )
    .all(limit, offset) as unknown as (AnnotationRow & { title: string })[]
  return { rows, total }
}

export function addSession(
  bookId: string,
  s: { date: string; mode: string; words: number; seconds: number; wpm: number }
): number {
  const d = getDb()
  const r = d
    .prepare('INSERT INTO sessions (bookId,date,mode,words,seconds,wpm) VALUES (?,?,?,?,?,?)')
    .run(bookId, s.date, s.mode, s.words, s.seconds, s.wpm)
  const recent = d
    .prepare('SELECT words, seconds FROM sessions WHERE bookId = ? ORDER BY id DESC LIMIT 5')
    .all(bookId) as { words: number; seconds: number }[]
  const w = recent.reduce((n, x) => n + x.words, 0)
  const sec = recent.reduce((n, x) => n + x.seconds, 0)
  d.prepare('UPDATE books SET avgWpm = ? WHERE id = ?').run(
    sec ? Math.round((w / sec) * 60) : null,
    bookId
  )
  return Number(r.lastInsertRowid)
}

export function setQuizScore(sessionId: number, score: number): void {
  getDb().prepare('UPDATE sessions SET quizScore = ? WHERE id = ?').run(score, sessionId)
}

// ---- universes ----

export function listUniverses(
  q: string | undefined,
  offset: number,
  limit: number
): { rows: UniverseRow[]; total: number } {
  const d = getDb()
  const where = q && q.trim() ? 'WHERE u.nameNorm LIKE ?' : ''
  const args: SQLInputValue[] = q && q.trim() ? [`%${normalize(q)}%`] : []
  const total = (
    d.prepare(`SELECT count(*) AS n FROM universes u ${where}`).get(...args) as { n: number }
  ).n
  const rows = d
    .prepare(
      `SELECT u.*,
        (SELECT count(*) FROM books b WHERE b.universeId = u.id) AS bookCount,
        (SELECT group_concat(id) FROM (SELECT id FROM books b WHERE b.universeId = u.id AND coverSource IS NOT NULL AND coverSource != 'none' LIMIT 4)) AS sampleIds
       FROM universes u ${where} ORDER BY bookCount DESC, u.nameNorm LIMIT ? OFFSET ?`
    )
    .all(...args, limit, offset) as unknown as UniverseRow[]
  return { rows: rows.map((r) => ({ ...r, sampleIds: r.sampleIds ?? '' })), total }
}

export function getUniverse(id: string): UniverseRow | null {
  const r = getDb()
    .prepare(
      `SELECT u.*, (SELECT count(*) FROM books b WHERE b.universeId = u.id) AS bookCount, '' AS sampleIds FROM universes u WHERE id = ?`
    )
    .get(id) as UniverseRow | undefined
  return r ?? null
}

export function upsertUniverse(u: {
  id: string
  name: string
  description?: string | null
  authors: string[]
  theme: unknown
  createdAt: string
}): void {
  const d = getDb()
  d.exec('BEGIN')
  d.prepare(
    `INSERT INTO universes (id,name,description,authors,theme,createdAt,nameNorm) VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, authors=excluded.authors, theme=excluded.theme, nameNorm=excluded.nameNorm`
  ).run(
    u.id,
    u.name,
    u.description ?? null,
    JSON.stringify(u.authors),
    JSON.stringify(u.theme),
    u.createdAt,
    normalize(u.name)
  )
  d.prepare('DELETE FROM universe_authors WHERE universeId = ?').run(u.id)
  const ins = d.prepare(
    'INSERT OR IGNORE INTO universe_authors (universeId, authorNorm) VALUES (?,?)'
  )
  for (const a of u.authors) ins.run(u.id, normalize(a))
  d.exec('COMMIT')
}

export function deleteUniverse(id: string): void {
  const d = getDb()
  d.exec('BEGIN')
  d.prepare('UPDATE books SET universeId = NULL WHERE universeId = ?').run(id)
  d.prepare('DELETE FROM universe_authors WHERE universeId = ?').run(id)
  d.prepare('DELETE FROM universes WHERE id = ?').run(id)
  d.exec('COMMIT')
}

export function universeIdForAuthor(author: string): string | null {
  const r = getDb()
    .prepare('SELECT universeId FROM universe_authors WHERE authorNorm = ? LIMIT 1')
    .get(normalize(author)) as { universeId: string } | undefined
  return r?.universeId ?? null
}

// ---- full text ----

export function indexParagraphs(
  bookId: string,
  chapters: { title: string; paragraphs: string[] }[]
): number {
  const d = getDb()
  d.exec('BEGIN')
  d.prepare('DELETE FROM paragraphs WHERE bookId = ?').run(bookId)
  const ins = d.prepare(
    'INSERT INTO paragraphs (text, bookId, chapter, paragraph, token) VALUES (?,?,?,?,?)'
  )
  let token = 0
  chapters.forEach((ch, ci) => {
    ch.paragraphs.forEach((p, pi) => {
      ins.run(p, bookId, ci, pi, token)
      token += p.split(/\s+/).filter(Boolean).length
    })
  })
  d.prepare('UPDATE books SET hasText = 1, indexed = 1, totalWords = ? WHERE id = ?').run(
    token,
    bookId
  )
  d.exec('COMMIT')
  return token
}

export interface FtsHit {
  bookId: string
  title: string
  chapter: number
  paragraph: number
  token: number
  snippet: string
}

export function searchText(q: string, universeId: string | null, limit = 60): FtsHit[] {
  const terms = normalize(q)
    .split(' ')
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '')}"*`)
  if (!terms.length) return []
  const match = terms.join(' ')
  const d = getDb()
  const where = universeId ? 'AND b.universeId = ?' : ''
  const args: SQLInputValue[] = universeId ? [match, universeId, limit] : [match, limit]
  return d
    .prepare(
      `SELECT p.bookId, b.title, p.chapter, p.paragraph, p.token,
              snippet(paragraphs, 0, '', '', '…', 22) AS snippet
       FROM paragraphs p JOIN books b ON b.id = p.bookId
       WHERE paragraphs MATCH ? ${where}
       ORDER BY bm25(paragraphs) LIMIT ?`
    )
    .all(...args) as unknown as FtsHit[]
}
