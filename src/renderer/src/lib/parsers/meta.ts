import JSZip from 'jszip'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { extractCover, resolvePath, type CoverImage } from './epub'

export interface BookMeta {
  title?: string
  author?: string
  cover?: CoverImage
  pages?: number
}

// Title/author/cover from the OPF only (no chapter parsing): quick enough for bulk import on a phone
export async function epubMeta(data: Uint8Array): Promise<BookMeta> {
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
  const manifest = new Map<string, string>()
  for (const item of Array.from(opf.getElementsByTagNameNS('*', 'item'))) {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (id && href) manifest.set(id, resolvePath(opfPath, decodeURIComponent(href)))
  }
  const cover = await extractCover(zip, opf, opfPath, manifest).catch(() => undefined)
  return { title: getMeta('title'), author: getMeta('creator'), cover }
}

export async function pdfMeta(data: Uint8Array): Promise<BookMeta> {
  const task = pdfjsLib.getDocument({ data })
  try {
    const doc = await task.promise
    const meta = (await doc.getMetadata().catch(() => null)) as {
      info?: { Title?: string; Author?: string }
    } | null
    return {
      title: meta?.info?.Title?.trim() || undefined,
      author: meta?.info?.Author?.trim() || undefined,
      pages: doc.numPages
    }
  } finally {
    await task.destroy().catch(() => undefined)
  }
}
