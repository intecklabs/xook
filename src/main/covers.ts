import { join } from 'path'
import { promises as fs } from 'fs'
import { dataDir } from './paths'
import {
  fetchImage,
  findCoverCandidates,
  rankCandidates,
  type CoverCandidate
} from '../shared/coverSearch'

export type { CoverCandidate }

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

export async function searchCovers(
  title: string,
  author?: string
): Promise<(CoverCandidate & { thumbData: string })[]> {
  const candidates = await findCoverCandidates(title, author)
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

export async function autoCover(
  id: string,
  title: string,
  author?: string
): Promise<string | null> {
  const ranked = rankCandidates(title, author, await findCoverCandidates(title, author))
  for (const c of ranked) {
    const saved = await setCoverFromUrl(id, c.url)
    if (saved) return saved
  }
  return null
}
