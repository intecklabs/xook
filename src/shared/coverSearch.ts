// Cover lookup on public catalogues. Pure fetch: shared by the Electron main process and
// the mobile WebView; saving the image is left to the caller.
const TIMEOUT = 8000

export interface CoverCandidate {
  url: string
  thumb: string
  source: string
  title?: string
  author?: string
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT)
    })
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  }
}

export async function fetchImage(url: string): Promise<{ data: Uint8Array; mime: string } | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) })
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

export async function findCoverCandidates(
  title: string,
  author?: string
): Promise<CoverCandidate[]> {
  const [ol, gb] = await Promise.all([openLibrary(title, author), googleBooks(title, author)])
  return [...ol, ...gb].slice(0, 10)
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
export function similarity(title: string, author: string | undefined, c: CoverCandidate): number {
  const want = tokens(title)
  const got = new Set(tokens(c.title ?? ''))
  const overlap = want.length ? want.filter((t) => got.has(t)).length / want.length : 0
  const authorHit =
    !!author &&
    !!c.author &&
    tokens(author).some((t) => t.length > 3 && tokens(c.author!).includes(t))
  return authorHit ? Math.max(overlap, 0.4) + 0.3 : overlap
}

// Candidates that are plausibly the same book, best first
export function rankCandidates(
  title: string,
  author: string | undefined,
  candidates: CoverCandidate[]
): CoverCandidate[] {
  return candidates
    .map((c) => ({ c, score: similarity(title, author, c) }))
    .filter((r) => r.score >= 0.5)
    .sort((x, y) => y.score - x.score)
    .map((r) => r.c)
}
