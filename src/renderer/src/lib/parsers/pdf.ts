import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import type { BookText } from '../types'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

interface TextItemLike {
  str: string
  transform: number[]
  width: number
  height: number
  hasEOL?: boolean
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
    } else {
      lines.push({ y, text: it.str, x, h })
    }
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
    } else if (current.endsWith('-') && /^[a-záéíóúñü]/i.test(line)) {
      current = current.slice(0, -1) + line
    } else {
      current = current ? current + ' ' + line : line
    }
  }
  if (current) paragraphs.push(current)
  return paragraphs.filter((p) => p.split(/\s+/).length > 1 || p.length > 20)
}

export async function renderPdfCover(
  data: Uint8Array
): Promise<{ data: Uint8Array; mime: string } | undefined> {
  const task = pdfjsLib.getDocument({ data })
  const doc = await task.promise
  try {
    return await renderCover(doc)
  } finally {
    await task.destroy()
  }
}

async function renderCover(
  doc: pdfjsLib.PDFDocumentProxy
): Promise<{ data: Uint8Array; mime: string } | undefined> {
  try {
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const scale = 600 / base.width
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    await page.render({ canvasContext: ctx, viewport, canvas }).promise
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85))
    if (!blob) return undefined
    return { data: new Uint8Array(await blob.arrayBuffer()), mime: 'image/jpeg' }
  } catch {
    return undefined
  }
}

export async function parsePdf(
  data: Uint8Array,
  onProgress?: (done: number, total: number) => void
): Promise<{
  book: BookText
  title?: string
  author?: string
  cover?: { data: Uint8Array; mime: string }
}> {
  const doc = await pdfjsLib.getDocument({ data }).promise
  const cover = await renderCover(doc)
  const meta = (await doc.getMetadata().catch(() => null)) as {
    info?: { Title?: string; Author?: string }
  } | null
  const chapters: BookText['chapters'] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const paragraphs = itemsToParagraphs(content.items as TextItemLike[])
    if (paragraphs.length) chapters.push({ title: `Página ${p}`, paragraphs })
    onProgress?.(p, doc.numPages)
  }
  return {
    book: { chapters },
    title: meta?.info?.Title?.trim() || undefined,
    author: meta?.info?.Author?.trim() || undefined,
    cover
  }
}
