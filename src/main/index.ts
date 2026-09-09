import { app, shell, BrowserWindow, ipcMain, dialog, Menu, protocol, net } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import { pathToFileURL } from 'url'
import { promises as fs } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { lookupWord } from './dictionary'
import {
  cancelExport,
  clearAudioCache,
  exportAudiobook,
  listVoices,
  synthesize,
  type ExportRequest,
  type SynthRequest
} from './tts'
import {
  autoCover,
  deleteCover,
  findCoverFile,
  saveCover,
  searchCovers,
  setCoverFromUrl
} from './covers'
import { dataDir, dataDirFor, defaultDataDir, setDataDir } from './paths'
import {
  convertBook,
  ensureEpub,
  renderPdf,
  buildHtml,
  suggestedFileName,
  type ConvertRequest,
  type TargetFormat
} from './convert'
import {
  copyToDevice,
  listDevices,
  loadMailSettings,
  saveMailSettings,
  sendFile,
  testMail,
  type MailSettings
} from './send'
import * as db from './db'
import { cancelImport, ensureUniverseForAuthor, importPaths, isImporting } from './importer'
import { indexStatus, reindexCached, setIndexing } from './indexer'

const booksDir = (): string => join(dataDir(), 'books')
const universesDir = (): string => join(dataDir(), 'universes')

async function ensureDirs(): Promise<void> {
  await fs.mkdir(booksDir(), { recursive: true })
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'cover',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 360,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#111318',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  // Surface renderer errors in the main log (dev console / support)
  mainWindow.webContents.on('console-message', (e) => {
    if (e.level === 'error')
      console.error(`[renderer] ${e.message} (${e.sourceId}:${e.lineNumber})`)
  })

  // Pinch/ctrl+wheel is handled by the renderer to resize text, not the page
  mainWindow.webContents.setVisualZoomLevelLimits(1, 1)
  mainWindow.webContents.on('zoom-changed', (e) => e.preventDefault())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return mainWindow
}

function initialFilePath(): string | null {
  const fromArgs = process.argv.slice(1).find((a) => /\.(pdf|epub)$/i.test(a))
  return fromArgs ?? process.env['LECTOR_OPEN'] ?? null
}

async function findUniverseImage(id: string): Promise<string | null> {
  for (const ext of ['jpg', 'png', 'webp']) {
    const p = join(universesDir(), `${id}.${ext}`)
    try {
      await fs.access(p)
      return p
    } catch {
      /* next */
    }
  }
  return null
}

function registerProtocol(): void {
  protocol.handle('cover', async (req) => {
    const url = new URL(req.url)
    const kind = url.hostname
    const id = url.pathname.replace(/^\/+/, '').split('/')[0]
    if (!/^[a-z0-9-]+$/i.test(id)) return new Response('bad id', { status: 400 })
    const file = kind === 'universe' ? await findUniverseImage(id) : await findCoverFile(id)
    if (!file) return new Response('', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
}

function registerIpc(): void {
  const win = (e: Electron.IpcMainInvokeEvent): BrowserWindow | null =>
    BrowserWindow.fromWebContents(e.sender)

  // ---- library (SQLite) ----
  ipcMain.handle('db:listBooks', (_e, p: db.ListParams) => db.listBooks(p))
  ipcMain.handle('db:getBook', (_e, id: string) => db.getBook(id))
  ipcMain.handle('db:getBookByPath', (_e, p: string) => db.getBookByPath(p))
  ipcMain.handle('db:updateBook', (_e, id: string, patch: Record<string, unknown>) =>
    db.updateBook(id, patch)
  )
  ipcMain.handle('db:removeBook', async (_e, id: string) => {
    db.removeBook(id)
    await fs.rm(join(booksDir(), `${id}.json`), { force: true })
    await deleteCover(id)
    await clearAudioCache(id)
  })
  ipcMain.handle('db:stats', () => db.stats())
  ipcMain.handle('db:annotations', (_e, bookId: string) => db.listAnnotations(bookId))
  ipcMain.handle('db:addAnnotation', (_e, a: Omit<db.AnnotationRow, 'id' | 'createdAt'>) =>
    db.addAnnotation(a)
  )
  ipcMain.handle(
    'db:updateAnnotation',
    (_e, id: string, patch: { color?: string; note?: string | null }) =>
      db.updateAnnotation(id, patch)
  )
  ipcMain.handle('db:removeAnnotation', (_e, id: string) => db.removeAnnotation(id))
  ipcMain.handle('db:allAnnotations', (_e, offset: number, limit: number) =>
    db.allAnnotations(offset, limit)
  )
  ipcMain.handle(
    'db:addSession',
    (
      _e,
      bookId: string,
      s: { date: string; mode: string; words: number; seconds: number; wpm: number }
    ) => db.addSession(bookId, s)
  )
  ipcMain.handle('db:setQuizScore', (_e, sessionId: number, score: number) =>
    db.setQuizScore(sessionId, score)
  )
  ipcMain.handle('db:listUniverses', (_e, q: string | undefined, offset: number, limit: number) =>
    db.listUniverses(q, offset, limit)
  )
  ipcMain.handle('db:getUniverse', (_e, id: string) => db.getUniverse(id))
  ipcMain.handle('db:upsertUniverse', (_e, u: Parameters<typeof db.upsertUniverse>[0]) =>
    db.upsertUniverse(u)
  )
  ipcMain.handle('db:deleteUniverse', async (_e, id: string) => {
    db.deleteUniverse(id)
    for (const ext of ['jpg', 'png', 'webp'])
      await fs.rm(join(universesDir(), `${id}.${ext}`), { force: true })
  })
  ipcMain.handle('db:assignBook', (_e, bookId: string, universeId: string | null) =>
    db.updateBook(bookId, { universeId })
  )
  ipcMain.handle('db:ensureUniverse', (_e, author: string) => ensureUniverseForAuthor(author))
  ipcMain.handle(
    'db:indexForLetter',
    (_e, by: 'title' | 'author', letter: string, universeId: string | null) =>
      db.indexForLetter(by, letter, universeId)
  )
  ipcMain.handle('db:letters', (_e, by: 'title' | 'author', universeId: string | null) =>
    db.lettersAvailable(by, universeId)
  )
  ipcMain.handle('settings:get', () => db.getSetting(db.getDb(), 'settings'))
  ipcMain.handle('settings:set', (_e, value: unknown) =>
    db.setSetting(db.getDb(), 'settings', value)
  )

  // ---- book text ----
  ipcMain.handle('text:load', async (_e, id: string) => {
    try {
      return JSON.parse(await fs.readFile(join(booksDir(), `${id}.json`), 'utf8'))
    } catch {
      return null
    }
  })
  ipcMain.handle(
    'text:save',
    async (_e, id: string, data: { chapters: { title: string; paragraphs: string[] }[] }) => {
      await ensureDirs()
      await fs.writeFile(join(booksDir(), `${id}.json`), JSON.stringify(data), 'utf8')
      return db.indexParagraphs(id, data.chapters)
    }
  )
  ipcMain.handle('search:query', (_e, q: string, universeId: string | null) =>
    db.searchText(q, universeId)
  )

  // ---- import ----
  ipcMain.handle('import:pick', async (_e, kind: 'files' | 'folder') => {
    const r = await dialog.showOpenDialog({
      title: kind === 'folder' ? 'Carpeta con libros' : 'Abrir libros',
      properties:
        kind === 'folder' ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections'],
      filters:
        kind === 'folder'
          ? undefined
          : [
              { name: 'Libros', extensions: ['pdf', 'epub'] },
              { name: 'PDF', extensions: ['pdf'] },
              { name: 'EPUB', extensions: ['epub'] }
            ]
    })
    return r.canceled ? [] : r.filePaths
  })
  ipcMain.handle('import:start', (e, paths: string[]) => importPaths(paths, win(e)))
  ipcMain.handle('import:cancel', () => cancelImport())
  ipcMain.handle('import:running', () => isImporting())
  ipcMain.handle('index:status', () => indexStatus())
  ipcMain.handle('index:set', (e, on: boolean) => setIndexing(on, win(e)))

  ipcMain.handle('book:initial', async () => {
    const filePath = initialFilePath()
    if (!filePath) return null
    try {
      return { path: filePath, data: await fs.readFile(filePath) }
    } catch {
      return null
    }
  })
  ipcMain.handle('book:read', (_e, filePath: string) => fs.readFile(filePath))
  ipcMain.handle('file:stat', async (_e, p: string) => {
    try {
      const s = await fs.stat(p)
      return { size: s.size }
    } catch {
      return null
    }
  })

  // ---- misc ----
  ipcMain.handle('dict:lookup', (_e, word: string, lang: string) => lookupWord(word, lang))
  ipcMain.handle('tts:voices', () => listVoices())
  ipcMain.handle('tts:synth', (_e, req: SynthRequest) => synthesize(req))
  ipcMain.handle('tts:clearCache', (_e, bookId?: string) => clearAudioCache(bookId))
  ipcMain.handle('tts:pickExportDir', async () => {
    const r = await dialog.showOpenDialog({
      title: 'Carpeta para el audiolibro',
      properties: ['openDirectory', 'createDirectory']
    })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('tts:export', (e, req: ExportRequest) => exportAudiobook(req, win(e)))
  ipcMain.handle('tts:cancelExport', () => cancelExport())
  ipcMain.handle('shell:openPath', (_e, p: string) => shell.openPath(p))
  ipcMain.handle('shell:showInFolder', (_e, p: string) => shell.showItemInFolder(p))
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url)
    return Promise.resolve()
  })
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('window:setFullScreen', (e, flag: boolean) => win(e)?.setFullScreen(flag))
  ipcMain.handle('window:isFullScreen', (e) => win(e)?.isFullScreen() ?? false)

  ipcMain.handle('data:getDir', () => ({ current: dataDir(), default: defaultDataDir() }))
  ipcMain.handle('data:move', async () => {
    const r = await dialog.showOpenDialog({
      title: 'Elige la carpeta donde guardar los datos de Xook',
      properties: ['openDirectory', 'createDirectory']
    })
    if (r.canceled || !r.filePaths[0]) return null
    const src = dataDir()
    const dest = dataDirFor(r.filePaths[0])
    if (dest === src) return src
    db.closeDb()
    await fs.mkdir(dest, { recursive: true })
    await fs.cp(src, dest, { recursive: true, force: true })
    setDataDir(dest)
    await fs.rm(src, { recursive: true, force: true })
    app.relaunch()
    app.exit(0)
    return dest
  })

  ipcMain.handle('convert:pickSave', async (_e, title: string, format: TargetFormat) => {
    const r = await dialog.showSaveDialog({
      title: 'Guardar como',
      defaultPath: join(app.getPath('documents'), suggestedFileName(title, format)),
      filters: [{ name: format.toUpperCase(), extensions: [format] }]
    })
    return r.canceled ? null : r.filePath
  })
  ipcMain.handle('convert:run', (_e, req: ConvertRequest) => convertBook(req))
  ipcMain.handle(
    'convert:toTemp',
    async (_e, req: Omit<ConvertRequest, 'outPath'>): Promise<string> => {
      if (req.format === 'epub')
        return ensureEpub(req.bookId, req.title, req.author, req.sourcePath)
      const ext = req.sourcePath.split('.').pop()?.toLowerCase()
      if (req.format === ext) return req.sourcePath
      const out = join(app.getPath('temp'), suggestedFileName(`xook-${req.title}`, req.format))
      if (req.format === 'pdf') {
        const raw = await fs.readFile(join(booksDir(), `${req.bookId}.json`), 'utf8')
        const chapters = (
          JSON.parse(raw) as { chapters: { title: string; paragraphs: string[] }[] }
        ).chapters
        await renderPdf(buildHtml(req.title, req.author, chapters), out)
        return out
      }
      return convertBook({ ...req, outPath: out })
    }
  )

  ipcMain.handle('mail:load', () => loadMailSettings())
  ipcMain.handle('mail:save', (_e, s: MailSettings, password?: string) =>
    saveMailSettings(s, password)
  )
  ipcMain.handle('mail:test', () => testMail())
  ipcMain.handle('mail:send', (_e, filePath: string, subject: string, to?: string) =>
    sendFile(filePath, subject, to)
  )
  ipcMain.handle('device:list', () => listDevices())
  ipcMain.handle('device:pickFolder', async () => {
    const r = await dialog.showOpenDialog({
      title: 'Carpeta del dispositivo',
      properties: ['openDirectory']
    })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('device:copy', (_e, filePath: string, dir: string) => copyToDevice(filePath, dir))

  // ---- universes: background image ----
  ipcMain.handle('universe:pickImage', async (_e, id: string) => {
    const result = await dialog.showOpenDialog({
      title: 'Imagen de fondo del universo',
      properties: ['openFile'],
      filters: [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
    })
    if (result.canceled || !result.filePaths[0]) return false
    const src = result.filePaths[0]
    const ext = (src.split('.').pop() ?? 'jpg').toLowerCase().replace('jpeg', 'jpg')
    await fs.mkdir(universesDir(), { recursive: true })
    for (const e of ['jpg', 'png', 'webp'])
      await fs.rm(join(universesDir(), `${id}.${e}`), { force: true })
    await fs.copyFile(src, join(universesDir(), `${id}.${ext}`))
    return true
  })
  ipcMain.handle('universe:deleteImage', async (_e, id: string) => {
    for (const e of ['jpg', 'png', 'webp'])
      await fs.rm(join(universesDir(), `${id}.${e}`), { force: true })
  })
  ipcMain.handle('universe:hasImage', async (_e, id: string) => !!(await findUniverseImage(id)))

  // ---- covers ----
  ipcMain.handle('cover:save', async (_e, id: string, data: Uint8Array, mime: string) => {
    await saveCover(id, data, mime)
    db.updateBook(id, { coverSource: 'file' })
  })
  ipcMain.handle('cover:delete', async (_e, id: string) => {
    await deleteCover(id)
    db.updateBook(id, { coverSource: 'none' })
  })
  ipcMain.handle('cover:search', (_e, title: string, author?: string) =>
    searchCovers(title, author)
  )
  ipcMain.handle('cover:setFromUrl', async (_e, id: string, url: string) => {
    const ok = await setCoverFromUrl(id, url)
    if (ok) db.updateBook(id, { coverSource: 'web' })
    return !!ok
  })
  ipcMain.handle('cover:auto', async (_e, id: string) => {
    const b = db.getBook(id)
    if (!b) return false
    const ok = await autoCover(id, b.title, b.author ?? undefined)
    db.updateBook(
      id,
      ok ? { coverSource: 'web' } : { coverSource: 'none', coverTriedAt: new Date().toISOString() }
    )
    return !!ok
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.lectorrapido.app')
  Menu.setApplicationMenu(null)
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  db.getDb()
  registerProtocol()
  registerIpc()
  createWindow()
  setTimeout(() => void reindexCached(), 3000)
  if (app.isPackaged) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    setTimeout(() => void autoUpdater.checkForUpdatesAndNotify().catch(() => undefined), 8000)
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  db.closeDb()
  if (process.platform !== 'darwin') app.quit()
})
