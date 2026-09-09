import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

export interface BookFile {
  path: string
  data: Uint8Array
}

export interface DictEntry {
  word: string
  phonetic?: string
  meanings: { partOfSpeech: string; definitions: { definition: string; example?: string }[] }[]
  source: string
}

export interface CoverCandidate {
  url: string
  thumb: string
  thumbData: string
  source: string
  title?: string
  author?: string
}

export interface VoiceInfo {
  shortName: string
  friendlyName: string
  gender: string
  locale: string
}

export interface WordMark {
  offset: number
  duration: number
  text: string
}

export interface SynthRequest {
  text: string
  voice: string
  rate: number
  pitch: number
  bookId?: string
  segment?: number
}

export interface ExportRequest {
  bookId: string
  voice: string
  rate: number
  pitch: number
  outDir: string
  chapters: { title: string; segments: { index: number; text: string }[] }[]
}

export interface ExportProgress {
  done: number
  total: number
  chapter: string
}

export interface SearchHit {
  bookId: string
  title: string
  chapter: number
  paragraph: number
  token: number
  snippet: string
}

export type TargetFormat = 'epub' | 'pdf' | 'txt' | 'md' | 'html' | 'docx'

export interface ConvertRequest {
  bookId: string
  title: string
  author?: string
  sourcePath: string
  format: TargetFormat
  outPath: string
}

export interface MailSettings {
  host: string
  port: number
  secure: boolean
  user: string
  from: string
  to: string
}

export interface DeviceDrive {
  path: string
  label: string
  kind: 'kindle' | 'kobo' | 'drive'
}

export interface BookRow {
  id: string
  title: string
  author: string | null
  format: 'pdf' | 'epub'
  path: string
  size: number
  totalWords: number
  position: number
  addedAt: string
  lastReadAt: string | null
  coverSource: string | null
  coverTriedAt: string | null
  universeId: string | null
  voice: string | null
  hasText: number
  indexed: number
  avgWpm: number | null
  annotationCount: number
}

export interface AnnotationRow {
  id: string
  bookId: string
  start: number
  end: number
  text: string
  color: string
  note: string | null
  createdAt: string
}

export interface UniverseRow {
  id: string
  name: string
  description: string | null
  authors: string
  theme: string
  createdAt: string
  bookCount: number
  sampleIds: string
}

export interface ListParams {
  q?: string
  field?: 'all' | 'title' | 'author'
  sort?: 'recent' | 'added' | 'title' | 'author' | 'progress'
  offset?: number
  limit?: number
  universeId?: string | null
  unassigned?: boolean
  needsText?: boolean
}

export interface ImportProgress {
  phase: 'scanning' | 'importing' | 'done' | 'cancelled'
  scanned: number
  total: number
  done: number
  added: number
  skipped: number
  failed: number
  current: string
}

export interface IndexStatus {
  enabled: boolean
  busy: boolean
  pending: number
  current: string | null
}

type BookText = { chapters: { title: string; paragraphs: string[] }[] }

function on<T>(channel: string, cb: (p: T) => void): () => void {
  const handler = (_e: unknown, p: T): void => cb(p)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api = {
  // library
  listBooks: (p: ListParams): Promise<{ rows: BookRow[]; total: number }> =>
    ipcRenderer.invoke('db:listBooks', p),
  getBook: (id: string): Promise<BookRow | null> => ipcRenderer.invoke('db:getBook', id),
  getBookByPath: (p: string): Promise<BookRow | null> => ipcRenderer.invoke('db:getBookByPath', p),
  updateBook: (id: string, patch: Record<string, unknown>): Promise<void> =>
    ipcRenderer.invoke('db:updateBook', id, patch),
  removeBook: (id: string): Promise<void> => ipcRenderer.invoke('db:removeBook', id),
  stats: (): Promise<{
    books: number
    words: number
    sessions: number
    notes: number
    wpm: number | null
  }> => ipcRenderer.invoke('db:stats'),
  annotations: (bookId: string): Promise<AnnotationRow[]> =>
    ipcRenderer.invoke('db:annotations', bookId),
  addAnnotation: (a: Omit<AnnotationRow, 'id' | 'createdAt'>): Promise<AnnotationRow> =>
    ipcRenderer.invoke('db:addAnnotation', a),
  updateAnnotation: (id: string, patch: { color?: string; note?: string | null }): Promise<void> =>
    ipcRenderer.invoke('db:updateAnnotation', id, patch),
  removeAnnotation: (id: string): Promise<void> => ipcRenderer.invoke('db:removeAnnotation', id),
  allAnnotations: (
    offset: number,
    limit: number
  ): Promise<{ rows: (AnnotationRow & { title: string })[]; total: number }> =>
    ipcRenderer.invoke('db:allAnnotations', offset, limit),
  addSession: (
    bookId: string,
    s: { date: string; mode: string; words: number; seconds: number; wpm: number }
  ): Promise<number> => ipcRenderer.invoke('db:addSession', bookId, s),
  setQuizScore: (sessionId: number, score: number): Promise<void> =>
    ipcRenderer.invoke('db:setQuizScore', sessionId, score),
  indexForLetter: (
    by: 'title' | 'author',
    letter: string,
    universeId: string | null
  ): Promise<number> => ipcRenderer.invoke('db:indexForLetter', by, letter, universeId),
  letters: (by: 'title' | 'author', universeId: string | null): Promise<string[]> =>
    ipcRenderer.invoke('db:letters', by, universeId),
  listUniverses: (
    q: string | undefined,
    offset: number,
    limit: number
  ): Promise<{ rows: UniverseRow[]; total: number }> =>
    ipcRenderer.invoke('db:listUniverses', q, offset, limit),
  getUniverse: (id: string): Promise<UniverseRow | null> =>
    ipcRenderer.invoke('db:getUniverse', id),
  upsertUniverse: (u: {
    id: string
    name: string
    description?: string | null
    authors: string[]
    theme: unknown
    createdAt: string
  }): Promise<void> => ipcRenderer.invoke('db:upsertUniverse', u),
  deleteUniverse: (id: string): Promise<void> => ipcRenderer.invoke('db:deleteUniverse', id),
  assignBook: (bookId: string, universeId: string | null): Promise<void> =>
    ipcRenderer.invoke('db:assignBook', bookId, universeId),
  ensureUniverse: (author: string): Promise<string | null> =>
    ipcRenderer.invoke('db:ensureUniverse', author),
  getSettings: (): Promise<unknown> => ipcRenderer.invoke('settings:get'),
  setSettings: (value: unknown): Promise<void> => ipcRenderer.invoke('settings:set', value),
  loadText: (id: string): Promise<BookText | null> => ipcRenderer.invoke('text:load', id),
  saveText: (id: string, data: BookText): Promise<number> =>
    ipcRenderer.invoke('text:save', id, data),
  searchText: (q: string, universeId: string | null): Promise<SearchHit[]> =>
    ipcRenderer.invoke('search:query', q, universeId),
  // import
  pickImport: (kind: 'files' | 'folder'): Promise<string[]> =>
    ipcRenderer.invoke('import:pick', kind),
  startImport: (paths: string[]): Promise<ImportProgress> =>
    ipcRenderer.invoke('import:start', paths),
  cancelImport: (): Promise<void> => ipcRenderer.invoke('import:cancel'),
  importRunning: (): Promise<boolean> => ipcRenderer.invoke('import:running'),
  onImportProgress: (cb: (p: ImportProgress) => void): (() => void) => on('import:progress', cb),
  indexStatus: (): Promise<IndexStatus> => ipcRenderer.invoke('index:status'),
  setIndexing: (on: boolean): Promise<IndexStatus> => ipcRenderer.invoke('index:set', on),
  onIndexStatus: (cb: (s: IndexStatus) => void): (() => void) => on('index:status', cb),
  initialBook: (): Promise<BookFile | null> => ipcRenderer.invoke('book:initial'),
  readBook: (path: string): Promise<Uint8Array> => ipcRenderer.invoke('book:read', path),
  fileStat: (p: string): Promise<{ size: number } | null> => ipcRenderer.invoke('file:stat', p),
  // covers
  saveCover: (id: string, data: Uint8Array, mime: string): Promise<void> =>
    ipcRenderer.invoke('cover:save', id, data, mime),
  deleteCover: (id: string): Promise<void> => ipcRenderer.invoke('cover:delete', id),
  searchCovers: (title: string, author?: string): Promise<CoverCandidate[]> =>
    ipcRenderer.invoke('cover:search', title, author),
  setCoverFromUrl: (id: string, url: string): Promise<boolean> =>
    ipcRenderer.invoke('cover:setFromUrl', id, url),
  autoCover: (id: string): Promise<boolean> => ipcRenderer.invoke('cover:auto', id),
  // universes images
  pickUniverseImage: (id: string): Promise<boolean> => ipcRenderer.invoke('universe:pickImage', id),
  deleteUniverseImage: (id: string): Promise<void> =>
    ipcRenderer.invoke('universe:deleteImage', id),
  universeHasImage: (id: string): Promise<boolean> => ipcRenderer.invoke('universe:hasImage', id),
  // data dir
  getDataDir: (): Promise<{ current: string; default: string }> =>
    ipcRenderer.invoke('data:getDir'),
  moveDataDir: (): Promise<string | null> => ipcRenderer.invoke('data:move'),
  // convert / send
  pickSavePath: (title: string, format: TargetFormat): Promise<string | null> =>
    ipcRenderer.invoke('convert:pickSave', title, format),
  convertBook: (req: ConvertRequest): Promise<string> => ipcRenderer.invoke('convert:run', req),
  convertToTemp: (req: Omit<ConvertRequest, 'outPath'>): Promise<string> =>
    ipcRenderer.invoke('convert:toTemp', req),
  showInFolder: (p: string): Promise<void> => ipcRenderer.invoke('shell:showInFolder', p),
  openPath: (p: string): Promise<string> => ipcRenderer.invoke('shell:openPath', p),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  appVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  mailLoad: (): Promise<(MailSettings & { hasPassword: boolean }) | null> =>
    ipcRenderer.invoke('mail:load'),
  mailSave: (s: MailSettings, password?: string): Promise<void> =>
    ipcRenderer.invoke('mail:save', s, password),
  mailTest: (): Promise<void> => ipcRenderer.invoke('mail:test'),
  mailSend: (filePath: string, subject: string, to?: string): Promise<{ messageId: string }> =>
    ipcRenderer.invoke('mail:send', filePath, subject, to),
  listDevices: (): Promise<DeviceDrive[]> => ipcRenderer.invoke('device:list'),
  pickDeviceFolder: (): Promise<string | null> => ipcRenderer.invoke('device:pickFolder'),
  copyToDevice: (filePath: string, dir: string): Promise<string> =>
    ipcRenderer.invoke('device:copy', filePath, dir),
  // tts
  ttsVoices: (): Promise<VoiceInfo[]> => ipcRenderer.invoke('tts:voices'),
  ttsSynth: (req: SynthRequest): Promise<{ audio: Uint8Array; words: WordMark[] }> =>
    ipcRenderer.invoke('tts:synth', req),
  ttsClearCache: (bookId?: string): Promise<void> => ipcRenderer.invoke('tts:clearCache', bookId),
  ttsPickExportDir: (): Promise<string | null> => ipcRenderer.invoke('tts:pickExportDir'),
  ttsExport: (req: ExportRequest): Promise<{ files: string[]; cancelled: boolean }> =>
    ipcRenderer.invoke('tts:export', req),
  ttsCancelExport: (): Promise<void> => ipcRenderer.invoke('tts:cancelExport'),
  onTtsProgress: (cb: (p: ExportProgress) => void): (() => void) => on('tts:progress', cb),
  // misc
  lookupWord: (word: string, lang: string): Promise<DictEntry | null> =>
    ipcRenderer.invoke('dict:lookup', word, lang),
  setFullScreen: (flag: boolean): Promise<void> => ipcRenderer.invoke('window:setFullScreen', flag),
  isFullScreen: (): Promise<boolean> => ipcRenderer.invoke('window:isFullScreen')
}

export type Api = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
