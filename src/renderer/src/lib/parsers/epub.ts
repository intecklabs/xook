import JSZip from 'jszip'
import type { BookText } from '../types'

const BLOCK_TAGS = new Set([
  'p',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'blockquote',
  'section',
  'article',
  'tr',
  'dd',
  'dt',
  'pre'
])

export function resolvePath(base: string, rel: string): string {
  if (rel.startsWith('/')) return rel.slice(1)
  const parts = base.split('/').slice(0, -1)
  for (const seg of rel.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.' && seg !== '') parts.push(seg)
  }
  return parts.join('/')
}

function extractParagraphs(html: string): { title?: string; paragraphs: string[] } {
  const doc = new DOMParser().parseFromString(html, 'application/xhtml+xml')
  const parseErr = doc.querySelector('parsererror')
  const root = parseErr ? new DOMParser().parseFromString(html, 'text/html') : doc
  root
    .querySelectorAll('script, style, nav, svg, img, sup.noteref, [epub\\:type="pagebreak"]')
    .forEach((n) => n.remove())
  const heading = root.querySelector('h1, h2, h3')
  const title = heading?.textContent?.replace(/\s+/g, ' ').trim() || undefined

  const paragraphs: string[] = []
  let buffer = ''
  const flush = (): void => {
    const t = buffer.replace(/\s+/g, ' ').trim()
    if (t) paragraphs.push(t)
    buffer = ''
  }
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      buffer += node.textContent ?? ''
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as Element
    const tag = el.tagName.toLowerCase()
    const isBlock = BLOCK_TAGS.has(tag) || tag === 'br'
    if (isBlock) flush()
    for (const child of Array.from(el.childNodes)) walk(child)
    if (isBlock) flush()
  }
  walk(root.body ?? root.documentElement)
  flush()
  return { title, paragraphs }
}

export interface CoverImage {
  data: Uint8Array
  mime: string
}

export async function extractCover(
  zip: JSZip,
  opf: Document,
  opfPath: string,
  manifest: Map<string, string>
): Promise<CoverImage | undefined> {
  const items = Array.from(opf.getElementsByTagNameNS('*', 'item'))
  const isImage = (el: Element): boolean => /^image\//i.test(el.getAttribute('media-type') ?? '')
  let coverItem =
    items.find((i) => /\bcover-image\b/i.test(i.getAttribute('properties') ?? '')) ?? null
  if (!coverItem) {
    const metaId = Array.from(opf.getElementsByTagNameNS('*', 'meta'))
      .find((m) => (m.getAttribute('name') ?? '').toLowerCase() === 'cover')
      ?.getAttribute('content')
    if (metaId) coverItem = items.find((i) => i.getAttribute('id') === metaId && isImage(i)) ?? null
  }
  if (!coverItem) {
    coverItem =
      items.find(
        (i) => isImage(i) && /cover/i.test(`${i.getAttribute('id')} ${i.getAttribute('href')}`)
      ) ?? null
  }
  if (!coverItem) return undefined
  const id = coverItem.getAttribute('id')
  const path = id ? manifest.get(id) : undefined
  const href = coverItem.getAttribute('href')
  const file = zip.file(path ?? resolvePath(opfPath, decodeURIComponent(href ?? '')))
  if (!file) return undefined
  const data = await file.async('uint8array')
  return { data, mime: coverItem.getAttribute('media-type') ?? 'image/jpeg' }
}

export async function parseEpub(
  data: Uint8Array,
  onProgress?: (done: number, total: number) => void
): Promise<{ book: BookText; title?: string; author?: string; cover?: CoverImage }> {
  const zip = await JSZip.loadAsync(data)
  const containerXml = await zip.file('META-INF/container.xml')?.async('string')
  if (!containerXml) throw new Error('EPUB inválido: falta container.xml')
  const container = new DOMParser().parseFromString(containerXml, 'application/xml')
  const opfPath = container.querySelector('rootfile')?.getAttribute('full-path')
  if (!opfPath) throw new Error('EPUB inválido: falta rootfile')

  const opfXml = await zip.file(opfPath)?.async('string')
  if (!opfXml) throw new Error('EPUB inválido: falta OPF')
  const opf = new DOMParser().parseFromString(opfXml, 'application/xml')

  const getMeta = (name: string): string | undefined =>
    opf.getElementsByTagNameNS('*', name)[0]?.textContent?.trim() || undefined
  const title = getMeta('title')
  const author = getMeta('creator')

  const manifest = new Map<string, string>()
  for (const item of Array.from(opf.getElementsByTagNameNS('*', 'item'))) {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (id && href) manifest.set(id, resolvePath(opfPath, decodeURIComponent(href)))
  }

  const cover = await extractCover(zip, opf, opfPath, manifest).catch(() => undefined)

  const spine = Array.from(opf.getElementsByTagNameNS('*', 'itemref'))
    .map((r) => r.getAttribute('idref'))
    .filter((id): id is string => !!id && manifest.has(id))

  const chapters: BookText['chapters'] = []
  let i = 0
  for (const idref of spine) {
    const path = manifest.get(idref)!
    const html = await zip.file(path)?.async('string')
    i++
    onProgress?.(i, spine.length)
    if (!html) continue
    const { title: chTitle, paragraphs } = extractParagraphs(html)
    const words = paragraphs.reduce((n, p) => n + p.split(/\s+/).length, 0)
    if (words < 15) continue
    chapters.push({ title: chTitle ?? `Sección ${chapters.length + 1}`, paragraphs })
  }
  return { book: { chapters }, title, author, cover }
}
