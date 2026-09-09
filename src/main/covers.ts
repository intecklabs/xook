import { join } from 'path'
import { promises as fs } from 'fs'
import { dataDir } from './paths'

const UA = 'Xook/1.0 (desktop reading app)'
const TIMEOUT = 8000

export interface CoverCandidate {
  url: string
  thumb: string
  source: string
  title?: string
  author?: string
}

const coversDir = (): string => join(dataDir(), 'covers')

function mimeToExt(mime: string): string {
  if (/png/i.test(mime)) return 'png'
  if (/webp/i.test(mime)) return 'webp'
  if (/gif/i.test(mime)) return 'gif'
  return 'jpg'
}

function extToMime(ext: string): string {
  return { png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[ext] ?? 'image/jpeg'
}

export async function findCoverFile(id: string): Promise<string | null> {
  for (const ext of ['jpg', 'png', 'webp', 'gif']) {
    const p = join(coversDir(), `${id}.${ext}`)
    try {
      await fs.access(p)
      return p
    } catch {
      /* try next */
    }
  }
  return null
}

export async function saveCover(id: string, data: Uint8Array, mime: string): Promise<string> {
  await fs.mkdir(coversDir(), { recursive: true })
  await deleteCover(id)
  const ext = mimeToExt(mime)
  await fs.writeFile(join(coversDir(), `${id}.${ext}`), data)
  return `data:${extToMime(ext)};base64,${Buffer.from(data).toString('base64')}`
}

export async function loadCover(id: string): Promise<string | null> {
  const p = await findCoverFile(id)
  if (!p) return null
  const ext = p.split('.').pop() ?? 'jpg'
  const data = await fs.readFile(p)
  return `data:${extToMime(ext)};base64,${data.toString('base64')}`
}

export async function loadAllCovers(ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  await Promise.all(
    ids.map(async (id) => {
      const c = await loadCover(id)
      if (c) out[id] = c
    })
  )
  return out
}

export async function deleteCover(id: string): Promise<void> {
  const p = await findCoverFile(id)
  if (p) await fs.rm(p, { force: true })
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT)
    })
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  }
}

async function fetchImage(url: string): Promise<{ data: Uint8Array; mime: string } | null> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(TIMEOUT)
    })
    if (!r.ok) return null
    const mime = r.headers.get('content-type') ?? 'image/jpeg'
    if (!mime.startsWith('image/')) return null
    const data = new Uint8Array(await r.arrayBuffer())
    // Open Library returns a 1x1 gif placeholder when a cover is missing
    if (data.length < 1500) return null
    return { data, mime }
  } catch {
    return null
  }
}

function cleanQuery(s: string): string {
  return s
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface OlDoc {
  title?: string
  author_name?: string[]
  cover_i?: number
}

async function openLibrary(title: string, author?: string): Promise<CoverCandidate[]> {
  const fields = 'title,author_name,cover_i'
  const fielded = new URLSearchParams({ title: cleanQuery(title), limit: '8', fields })
  if (author) fielded.set('author', cleanQuery(author))
  const general = new URLSearchParams({
    q: cleanQuery(`${title} ${author ?? ''}`),
    limit: '10',
    fields
  })
  const [a, b] = await Promise.all([
    fetchJson<{ docs?: OlDoc[] }>(`https://openlibrary.org/search.json?${fielded.toString()}`),
    fetchJson<{ docs?: OlDoc[] }>(`https://openlibrary.org/search.json?${general.toString()}`)
  ])
  const seen = new Set<number>()
  const out: CoverCandidate[] = []
  for (const d of [...(a?.docs ?? []), ...(b?.docs ?? [])]) {
    if (!d.cover_i || seen.has(d.cover_i)) continue
    seen.add(d.cover_i)
    out.push({
      url: `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`,
      thumb: `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`,
      source: 'Open Library',
      title: d.title,
      author: d.author_name?.[0]
    })
  }
  return out
}

async function googleBooks(title: string, author?: string): Promise<CoverCandidate[]> {
  const q = cleanQuery(`${title} ${author ?? ''}`)
  const data = await fetchJson<{
    items?: {
      volumeInfo?: {
        title?: string
        authors?: string[]
        imageLinks?: { thumbnail?: string; smallThumbnail?: string }
      }
    }[]
  }>(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=8`)
  return (data?.items ?? [])
    .filter((i) => i.volumeInfo?.imageLinks?.thumbnail)
    .map((i) => {
      const t = i.volumeInfo!.imageLinks!.thumbnail!.replace(/^http:/, 'https:')
      return {
        url: t.replace(/zoom=\d/, 'zoom=2').replace(/&edge=curl/, ''),
        thumb: t.replace(/&edge=curl/, ''),
        source: 'Google Books',
        title: i.volumeInfo?.title,
        author: i.volumeInfo?.authors?.[0]
      }
    })
}

export async function searchCovers(
  title: string,
  author?: string
): Promise<(CoverCandidate & { thumbData: string })[]> {
  const [ol, gb] = await Promise.all([openLibrary(title, author), googleBooks(title, author)])
  const candidates = [...ol, ...gb].slice(0, 10)
  const withThumbs = await Promise.all(
    candidates.map(async (c) => {
      const img = await fetchImage(c.thumb)
      if (!img) return null
      return {
        ...c,
        thumbData: `data:${img.mime};base64,${Buffer.from(img.data).toString('base64')}`
      }
    })
  )
  return withThumbs.filter((c): c is CoverCandidate & { thumbData: string } => c !== null)
}

export async function setCoverFromUrl(id: string, url: string): Promise<string | null> {
  const img = await fetchImage(url)
  if (!img) return null
  return saveCover(id, img.data, img.mime)
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !['the', 'and', 'los', 'las', 'del', 'una', 'por'].includes(t))
}

// How plausible it is that a search hit is the same book (0..1)
function similarity(title: string, author: string | undefined, c: CoverCandidate): number {
  const want = tokens(title)
  const got = new Set(tokens(c.title ?? ''))
  const overlap = want.length ? want.filter((t) => got.has(t)).length / want.length : 0
  const authorHit =
    !!author &&
    !!c.author &&
    tokens(author).some((t) => t.length > 3 && tokens(c.author!).includes(t))
  return authorHit ? Math.max(overlap, 0.4) + 0.3 : overlap
}

export async function autoCover(
  id: string,
  title: string,
  author?: string
): Promise<string | null> {
  const results = await searchCovers(title, author)
  const ranked = results
    .map((c) => ({ c, score: similarity(title, author, c) }))
    .filter((r) => r.score >= 0.5)
    .sort((x, y) => y.score - x.score)
  for (const { c } of ranked) {
    const saved = await setCoverFromUrl(id, c.url)
    if (saved) return saved
  }
  return null
}
