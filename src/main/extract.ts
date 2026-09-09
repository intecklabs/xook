import { promises as fs } from 'fs'
import JSZip from 'jszip'
import { Parser } from 'htmlparser2'

export interface Chapter {
  title: string
  paragraphs: string[]
}

export interface Extracted {
  chapters: Chapter[]
  title?: string
  author?: string
  cover?: { data: Uint8Array; mime: string }
  pages?: number
}

const BLOCK = new Set([
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
  'pre',
  'br'
])
const SKIP = new Set(['script', 'style', 'nav', 'svg', 'head', 'title'])

function xmlText(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<(?:[a-zA-Z0-9]+:)?${tag}[^>]*>([^<]*)<`, 'i'))
  return (
    m?.[1]
      ?.trim()
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'") || undefined
  )
}

function attr(tag: string, name: string): string | undefined {
  const m =
    tag.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i')) ??
    tag.match(new RegExp(`\\s${name}\\s*=\\s*'([^']*)'`, 'i'))
  return m?.[1]
}

function resolvePath(base: string, rel: string): string {
  if (rel.startsWith('/')) return rel.slice(1)
  const parts = base.split('/').slice(0, -1)
  for (const seg of rel.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.' && seg !== '') parts.push(seg)
  }
  return parts.join('/')
}

export function htmlToParagraphs(html: string): { title?: string; paragraphs: string[] } {
  const paragraphs: string[] = []
  let buf = ''
  let skipDepth = 0
  let heading = ''
  let inHeading = false
  let title: string | undefined
  const flush = (): void => {
    const t = buf.replace(/\s+/g, ' ').trim()
    if (t) paragraphs.push(t)
    buf = ''
  }
  const parser = new Parser(
    {
      onopentag(name) {
        if (SKIP.has(name)) skipDepth++
        if (skipDepth) return
        if (BLOCK.has(name)) flush()
        if (!title && /^h[1-3]$/.test(name)) {
          inHeading = true
          heading = ''
        }
      },
      ontext(text) {
        if (skipDepth) return
        buf += text
        if (inHeading) heading += text
      },
      onclosetag(name) {
        if (SKIP.has(name)) {
          skipDepth = Math.max(0, skipDepth - 1)
          return
        }
        if (skipDepth) return
        if (inHeading && /^h[1-3]$/.test(name)) {
          inHeading = false
          title = heading.replace(/\s+/g, ' ').trim() || undefined
        }
        if (BLOCK.has(name)) flush()
      }
    },
    { decodeEntities: true }
  )
  parser.write(html)
  parser.end()
  flush()
  return { title, paragraphs }
}

export async function epubMetadata(data: Uint8Array): Promise<{
  title?: string
  author?: string
  cover?: { data: Uint8Array; mime: string }
  zip: JSZip
  opfPath: string
  opf: string
}> {
  const zip = await JSZip.loadAsync(data)
  const container = await zip.file('META-INF/container.xml')?.async('string')
  if (!container) throw new Error('EPUB inválido: falta container.xml')
  const opfPath = attr(container.match(/<rootfile(?=[\s/>])[^>]*>/i)?.[0] ?? '', 'full-path')
  if (!opfPath) throw new Error('EPUB inválido: falta rootfile')
  const opf = await zip.file(opfPath)?.async('string')
  if (!opf) throw new Error('EPUB inválido: falta OPF')
  const title = xmlText(opf, 'title')
  const author = xmlText(opf, 'creator')
  let cover: { data: Uint8Array; mime: string } | undefined
  const items = opf.match(/<item\b[^>]*>/gi) ?? []
  let coverTag =
    items.find((t) => /properties\s*=\s*"[^"]*cover-image/i.test(t)) ??
    (() => {
      const metaId =
        opf.match(/<meta[^>]*name\s*=\s*"cover"[^>]*content\s*=\s*"([^"]+)"/i)?.[1] ??
        opf.match(/<meta[^>]*content\s*=\s*"([^"]+)"[^>]*name\s*=\s*"cover"/i)?.[1]
      return metaId ? items.find((t) => attr(t, 'id') === metaId) : undefined
    })() ??
    items.find(
      (t) =>
        /media-type\s*=\s*"image\//i.test(t) && /cover/i.test(`${attr(t, 'id')} ${attr(t, 'href')}`)
    )
  if (coverTag && !/media-type\s*=\s*"image\//i.test(coverTag)) coverTag = undefined
  if (coverTag) {
    const href = attr(coverTag, 'href')
    if (href) {
      const file = zip.file(resolvePath(opfPath, decodeURIComponent(href)))
      if (file)
        cover = {
          data: await file.async('uint8array'),
          mime: attr(coverTag, 'media-type') ?? 'image/jpeg'
        }
    }
  }
  return { title, author, cover, zip, opfPath, opf }
}

export async function extractEpub(data: Uint8Array): Promise<Extracted> {
  const meta = await epubMetadata(data)
  const manifest = new Map<string, string>()
  for (const t of meta.opf.match(/<item\b[^>]*>/gi) ?? []) {
    const id = attr(t, 'id')
    const href = attr(t, 'href')
    if (id && href) manifest.set(id, resolvePath(meta.opfPath, decodeURIComponent(href)))
  }
  const spine = (meta.opf.match(/<itemref\b[^>]*>/gi) ?? [])
    .map((t) => attr(t, 'idref'))
    .filter((id): id is string => !!id && manifest.has(id))
  const chapters: Chapter[] = []
  for (const idref of spine) {
    const html = await meta.zip.file(manifest.get(idref)!)?.async('string')
    if (!html) continue
    const { title, paragraphs } = htmlToParagraphs(html)
    const words = paragraphs.reduce((n, p) => n + p.split(/\s+/).length, 0)
    if (words < 15) continue
    chapters.push({ title: title ?? `Sección ${chapters.length + 1}`, paragraphs })
  }
  return { chapters, title: meta.title, author: meta.author, cover: meta.cover }
}

interface TextItemLike {
  str: string
  transform: number[]
  width: number
  height: number
}

function itemsToParagraphs(items: TextItemLike[]): string[] {
  const lines: { y: number; text: string; x: number; h: number }[] = []
  for (const it of items) {
    if (!it.str) continue
    const y = Math.round(it.transform[5])
    const x = it.transform[4]
    const h = it.height || Math.abs(it.transform[3]) || 10
    const last = lines[lines.length - 1]
    if (last && Math.abs(last.y - y) < h * 0.5) {
      const needsSpace = last.text.length > 0 && !last.text.endsWith(' ') && !it.str.startsWith(' ')
      last.text += (needsSpace ? ' ' : '') + it.str
    } else lines.push({ y, text: it.str, x, h })
  }
  const paragraphs: string[] = []
  let current = ''
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].text.replace(/\s+/g, ' ').trim()
    if (!line) continue
    const prev = lines[i - 1]
    const gap = prev ? Math.abs(prev.y - lines[i].y) : 0
    const bigGap = prev && gap > lines[i].h * 1.8
    const endsSentence = /[.!?…:]["»”')\]]*$/.test(current)
    const startsIndented = prev && lines[i].x - prev.x > lines[i].h * 1.2
    const short = prev && prev.text.length < 45 && endsSentence
    if (current && (bigGap || (startsIndented && endsSentence) || short)) {
      paragraphs.push(current)
      current = line
    } else if (current.endsWith('-') && /^[a-záéíóúñü]/i.test(line))
      current = current.slice(0, -1) + line
    else current = current ? current + ' ' + line : line
  }
  if (current) paragraphs.push(current)
  return paragraphs.filter((p) => p.split(/\s+/).length > 1 || p.length > 20)
}

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let pdfjsPromise: Promise<PdfJs> | null = null
function pdfjs(): Promise<PdfJs> {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs')
  return pdfjsPromise
}

export async function pdfMetadata(
  data: Uint8Array
): Promise<{ title?: string; author?: string; pages: number }> {
  const lib = await pdfjs()
  const task = lib.getDocument({ data, disableFontFace: true })
  const doc = await task.promise
  try {
    const meta = (await doc.getMetadata().catch(() => null)) as {
      info?: { Title?: string; Author?: string }
    } | null
    return {
      title: meta?.info?.Title?.trim() || undefined,
      author: meta?.info?.Author?.trim() || undefined,
      pages: doc.numPages
    }
  } finally {
    await task.destroy()
  }
}

export async function extractPdf(data: Uint8Array): Promise<Extracted> {
  const lib = await pdfjs()
  const task = lib.getDocument({ data, disableFontFace: true })
  const doc = await task.promise
  try {
    const meta = (await doc.getMetadata().catch(() => null)) as {
      info?: { Title?: string; Author?: string }
    } | null
    const chapters: Chapter[] = []
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      const paragraphs = itemsToParagraphs(content.items as TextItemLike[])
      if (paragraphs.length) chapters.push({ title: `Página ${p}`, paragraphs })
      page.cleanup()
      if (p % 50 === 0) await new Promise((r) => setImmediate(r))
    }
    return {
      chapters,
      title: meta?.info?.Title?.trim() || undefined,
      author: meta?.info?.Author?.trim() || undefined,
      pages: doc.numPages
    }
  } finally {
    await task.destroy()
  }
}

export async function extractFile(path: string): Promise<Extracted> {
  const data = new Uint8Array(await fs.readFile(path))
  return path.toLowerCase().endsWith('.epub') ? extractEpub(data) : extractPdf(data)
}
