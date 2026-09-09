import { app, BrowserWindow } from 'electron'
import { join, extname, basename } from 'path'
import { promises as fs } from 'fs'
import JSZip from 'jszip'
import { AlignmentType, Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } from 'docx'
import { dataDir } from './paths'

export type TargetFormat = 'epub' | 'pdf' | 'txt' | 'md' | 'html' | 'docx'

export interface ConvertRequest {
  bookId: string
  title: string
  author?: string
  sourcePath: string
  format: TargetFormat
  outPath: string
}

interface Chapter {
  title: string
  paragraphs: string[]
}

const booksDir = (): string => join(dataDir(), 'books')
const coversDir = (): string => join(dataDir(), 'covers')

async function loadText(bookId: string): Promise<Chapter[]> {
  const raw = await fs.readFile(join(booksDir(), `${bookId}.json`), 'utf8')
  return (JSON.parse(raw) as { chapters: Chapter[] }).chapters
}

async function findCover(bookId: string): Promise<{ data: Buffer; ext: string } | null> {
  for (const ext of ['jpg', 'png', 'webp']) {
    try {
      const data = await fs.readFile(join(coversDir(), `${bookId}.${ext}`))
      return { data, ext }
    } catch {
      /* next */
    }
  }
  return null
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildHtml(title: string, author: string | undefined, chapters: Chapter[]): string {
  const body = chapters
    .map(
      (c) =>
        `<section class="chapter"><h2>${esc(c.title)}</h2>${c.paragraphs
          .map((p) => `<p>${esc(p)}</p>`)
          .join('')}</section>`
    )
    .join('')
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
body{font-family:Georgia,'Times New Roman',serif;font-size:12pt;line-height:1.55;color:#111;margin:0;padding:0}
h1{font-size:2em;text-align:center;margin:3em 0 .3em}
.author{text-align:center;color:#555;margin-bottom:6em}
h2{font-size:1.4em;margin:2em 0 1em;page-break-before:always;break-before:page}
p{margin:0 0 .8em;text-align:justify;orphans:2;widows:2}
</style></head><body><h1>${esc(title)}</h1>${author ? `<div class="author">${esc(author)}</div>` : ''}${body}</body></html>`
}

export async function buildEpub(
  bookId: string,
  title: string,
  author: string | undefined,
  chapters: Chapter[]
): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
  )
  const cover = await findCover(bookId)
  const css = `body{font-family:serif;line-height:1.5}h1{font-size:1.5em;margin:1.5em 0 1em}p{margin:0 0 .8em;text-align:justify}`
  zip.file('OEBPS/style.css', css)
  const items: string[] = [`<item id="css" href="style.css" media-type="text/css"/>`]
  const spine: string[] = []
  if (cover) {
    const mime =
      cover.ext === 'png' ? 'image/png' : cover.ext === 'webp' ? 'image/webp' : 'image/jpeg'
    zip.file(`OEBPS/cover.${cover.ext}`, cover.data)
    items.push(
      `<item id="cover-image" href="cover.${cover.ext}" media-type="${mime}" properties="cover-image"/>`
    )
    zip.file(
      'OEBPS/cover.xhtml',
      `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Portada</title></head><body style="text-align:center;margin:0"><img src="cover.${cover.ext}" alt="Portada" style="max-height:100%;max-width:100%"/></body></html>`
    )
    items.push(`<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>`)
    spine.push(`<itemref idref="cover"/>`)
  }
  chapters.forEach((c, i) => {
    const id = `ch${i + 1}`
    zip.file(
      `OEBPS/${id}.xhtml`,
      `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${esc(c.title)}</title><link rel="stylesheet" href="style.css"/></head><body><h1>${esc(c.title)}</h1>${c.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}</body></html>`
    )
    items.push(`<item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`)
    spine.push(`<itemref idref="${id}"/>`)
  })
  const nav = `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Índice</title></head><body><nav epub:type="toc"><h1>Índice</h1><ol>${chapters.map((c, i) => `<li><a href="ch${i + 1}.xhtml">${esc(c.title)}</a></li>`).join('')}</ol></nav></body></html>`
  zip.file('OEBPS/nav.xhtml', nav)
  items.push(
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`
  )
  const uid = `xook-${bookId}`
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">${uid}</dc:identifier><dc:title>${esc(title)}</dc:title>${author ? `<dc:creator>${esc(author)}</dc:creator>` : ''}<dc:language>es</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>${cover ? '<meta name="cover" content="cover-image"/>' : ''}</metadata><manifest>${items.join('')}</manifest><spine>${spine.join('')}</spine></package>`
  )
  return zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' })
}

export async function buildDocx(
  bookId: string,
  title: string,
  author: string | undefined,
  chapters: Chapter[]
): Promise<Buffer> {
  const cover = await findCover(bookId)
  const front: Paragraph[] = []
  if (cover && (cover.ext === 'jpg' || cover.ext === 'png')) {
    front.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 2400 },
        children: [
          new ImageRun({
            type: cover.ext,
            data: cover.data,
            transformation: { width: 300, height: 450 },
            altText: { title: 'Portada', description: 'Portada', name: 'cover' }
          })
        ]
      })
    )
  }
  front.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { before: cover ? 600 : 4800, after: 300 },
      children: [new TextRun(title)]
    })
  )
  if (author) {
    front.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: author, italics: true, color: '555555' })]
      })
    )
  }
  const body: Paragraph[] = []
  for (const c of chapters) {
    body.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: true,
        children: [new TextRun(c.title)]
      })
    )
    for (const t of c.paragraphs) {
      body.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 160, line: 320 },
          children: [new TextRun(t)]
        })
      )
    }
  }
  const doc = new Document({
    creator: 'Xook',
    title,
    ...(author ? { description: author } : {}),
    styles: {
      default: {
        document: { run: { font: 'Georgia', size: 24 } },
        title: { run: { size: 56, bold: true, font: 'Georgia' } },
        heading1: { run: { size: 36, bold: true, font: 'Georgia', color: '000000' } }
      }
    },
    sections: [{ properties: {}, children: [...front, ...body] }]
  })
  return Packer.toBuffer(doc)
}

export async function renderPdf(html: string, outPath: string): Promise<void> {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  const tmpHtml = join(app.getPath('temp'), `xook-print-${Date.now()}.html`)
  await fs.writeFile(tmpHtml, html, 'utf8')
  try {
    await win.loadFile(tmpHtml)
    const pdf = await win.webContents.printToPDF({
      pageSize: 'A5',
      margins: { top: 0.6, bottom: 0.6, left: 0.55, right: 0.55 },
      printBackground: false
    })
    await fs.writeFile(outPath, pdf)
  } finally {
    win.destroy()
    await fs.rm(tmpHtml, { force: true })
  }
}

// Produce an EPUB file for a book (original file if it already is one)
export async function ensureEpub(
  bookId: string,
  title: string,
  author: string | undefined,
  sourcePath: string
): Promise<string> {
  if (extname(sourcePath).toLowerCase() === '.epub') return sourcePath
  const tmp = join(app.getPath('temp'), `xook-${bookId}.epub`)
  const chapters = await loadText(bookId)
  await fs.writeFile(tmp, await buildEpub(bookId, title, author, chapters))
  return tmp
}

export async function convertBook(req: ConvertRequest): Promise<string> {
  const { format, outPath } = req
  const sourceExt = extname(req.sourcePath).toLowerCase().slice(1)
  if (format === sourceExt) {
    await fs.copyFile(req.sourcePath, outPath)
    return outPath
  }
  const chapters = await loadText(req.bookId)
  if (format === 'epub') {
    await fs.writeFile(outPath, await buildEpub(req.bookId, req.title, req.author, chapters))
  } else if (format === 'docx') {
    await fs.writeFile(outPath, await buildDocx(req.bookId, req.title, req.author, chapters))
  } else if (format === 'pdf') {
    await renderPdf(buildHtml(req.title, req.author, chapters), outPath)
  } else if (format === 'html') {
    await fs.writeFile(outPath, buildHtml(req.title, req.author, chapters), 'utf8')
  } else if (format === 'md') {
    const md = [`# ${req.title}`, req.author ? `*${req.author}*` : '', '']
    for (const c of chapters) md.push(`## ${c.title}`, '', ...c.paragraphs.flatMap((p) => [p, '']))
    await fs.writeFile(outPath, md.join('\n'), 'utf8')
  } else {
    const txt = [req.title, req.author ?? '', '']
    for (const c of chapters)
      txt.push(c.title.toUpperCase(), '', ...c.paragraphs.flatMap((p) => [p, '']))
    await fs.writeFile(outPath, txt.join('\n'), 'utf8')
  }
  return outPath
}

export function suggestedFileName(title: string, format: TargetFormat): string {
  const safe = Array.from(title)
    .filter((c) => c.charCodeAt(0) >= 32 && !'<>:"/\\|?*'.includes(c))
    .join('')
    .trim()
    .slice(0, 80)
  return `${safe || 'libro'}.${format}`
}

export function fileLabel(p: string): string {
  return basename(p)
}
