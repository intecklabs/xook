import { BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { getDb, indexParagraphs, updateBook, type BookRow } from './db'
import { extractFile } from './extract'
import { dataDir } from './paths'

const booksDir = (): string => join(dataDir(), 'books')

let enabled = false
let busy = false
let timer: ReturnType<typeof setTimeout> | null = null

export interface IndexStatus {
  enabled: boolean
  busy: boolean
  pending: number
  current: string | null
}

let current: string | null = null

export function indexStatus(): IndexStatus {
  const pending = (
    getDb().prepare('SELECT count(*) AS n FROM books WHERE hasText = 0 AND indexed = 0').get() as {
      n: number
    }
  ).n
  return { enabled, busy, pending, current }
}

// Extract text + build the FTS index for a book and cache it for the reader
export async function extractAndIndex(book: BookRow): Promise<void> {
  const ex = await extractFile(book.path)
  await fs.mkdir(booksDir(), { recursive: true })
  await fs.writeFile(
    join(booksDir(), `${book.id}.json`),
    JSON.stringify({ chapters: ex.chapters }),
    'utf8'
  )
  indexParagraphs(book.id, ex.chapters)
  const patch: Record<string, unknown> = {}
  if (ex.title && book.title !== ex.title && /^[^\s]+$/.test(book.title) === false)
    patch.title = book.title
  if (!book.author && ex.author) patch.author = ex.author
  if (Object.keys(patch).length) updateBook(book.id, patch)
}

async function tick(win: BrowserWindow | null): Promise<void> {
  if (!enabled || busy) return
  const next = getDb()
    .prepare(
      'SELECT * FROM books WHERE hasText = 0 AND indexed = 0 ORDER BY lastReadAt DESC, addedAt DESC LIMIT 1'
    )
    .get() as BookRow | undefined
  if (!next) {
    win?.webContents.send('index:status', indexStatus())
    return
  }
  busy = true
  current = next.title
  win?.webContents.send('index:status', indexStatus())
  try {
    await extractAndIndex(next)
  } catch {
    // Unreadable file: mark so we don't retry forever
    updateBook(next.id, { indexed: -1 })
  } finally {
    busy = false
    current = null
  }
  win?.webContents.send('index:status', indexStatus())
  schedule(win, 800)
}

function schedule(win: BrowserWindow | null, ms: number): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void tick(win), ms)
}

// Books whose text was cached before the FTS index existed: index them from the cache
export async function reindexCached(): Promise<void> {
  const rows = getDb()
    .prepare('SELECT id FROM books WHERE hasText = 1 AND indexed = 0 LIMIT 500')
    .all() as { id: string }[]
  for (const { id } of rows) {
    try {
      const raw = await fs.readFile(join(booksDir(), `${id}.json`), 'utf8')
      const data = JSON.parse(raw) as { chapters: { title: string; paragraphs: string[] }[] }
      indexParagraphs(id, data.chapters)
    } catch {
      updateBook(id, { hasText: 0 })
    }
    await new Promise((r) => setImmediate(r))
  }
}

export function setIndexing(on: boolean, win: BrowserWindow | null): IndexStatus {
  enabled = on
  if (on) schedule(win, 500)
  else if (timer) clearTimeout(timer)
  return indexStatus()
}
