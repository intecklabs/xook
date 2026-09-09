import { join } from 'path'
import { promises as fs } from 'fs'
import { dataDir } from './paths'

interface Chapter {
  title: string
  paragraphs: string[]
}

interface CachedBook {
  mtime: number
  chapters: Chapter[]
  // normalized paragraph text + token offset of each paragraph
  paras: { norm: string; raw: string; chapter: number; paragraph: number; token: number }[]
}

export interface SearchHit {
  bookId: string
  chapter: number
  chapterTitle: string
  paragraph: number
  token: number
  snippet: string
  count: number
}

const booksDir = (): string => join(dataDir(), 'books')
const cache = new Map<string, CachedBook>()

export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

async function load(id: string): Promise<CachedBook | null> {
  const file = join(booksDir(), `${id}.json`)
  let stat
  try {
    stat = await fs.stat(file)
  } catch {
    return null
  }
  const hit = cache.get(id)
  if (hit && hit.mtime === stat.mtimeMs) return hit
  const data = JSON.parse(await fs.readFile(file, 'utf8')) as { chapters: Chapter[] }
  const paras: CachedBook['paras'] = []
  let token = 0
  data.chapters.forEach((ch, ci) => {
    ch.paragraphs.forEach((p, pi) => {
      paras.push({ norm: normalize(p), raw: p, chapter: ci, paragraph: pi, token })
      token += p.split(/\s+/).filter(Boolean).length
    })
  })
  const entry = { mtime: stat.mtimeMs, chapters: data.chapters, paras }
  cache.set(id, entry)
  return entry
}

function snippetAround(raw: string, norm: string, q: string, width = 160): string {
  const idx = norm.indexOf(q)
  if (idx < 0) return raw.slice(0, width) + (raw.length > width ? '…' : '')
  // norm and raw have the same length except for removed combining marks; approximate
  const start = Math.max(0, idx - Math.floor(width / 2))
  const end = Math.min(raw.length, idx + q.length + Math.floor(width / 2))
  return (start > 0 ? '…' : '') + raw.slice(start, end) + (end < raw.length ? '…' : '')
}

export async function searchBooks(
  ids: string[],
  query: string,
  perBook = 5,
  maxBooks = 30
): Promise<SearchHit[]> {
  const q = normalize(query.trim())
  if (q.length < 2) return []
  const terms = q.split(/\s+/).filter(Boolean)
  const hits: SearchHit[] = []
  let booksWithHits = 0
  for (const id of ids) {
    const book = await load(id)
    if (!book) continue
    let found = 0
    for (const p of book.paras) {
      if (!terms.every((t) => p.norm.includes(t))) continue
      const count = p.norm.split(terms[0]).length - 1
      hits.push({
        bookId: id,
        chapter: p.chapter,
        chapterTitle: book.chapters[p.chapter]?.title ?? '',
        paragraph: p.paragraph,
        token: p.token,
        snippet: snippetAround(p.raw, p.norm, terms[0]),
        count
      })
      if (++found >= perBook) break
    }
    if (found && ++booksWithHits >= maxBooks) break
  }
  return hits
}

export function forgetBook(id: string): void {
  cache.delete(id)
}
