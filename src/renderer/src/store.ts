import { create } from 'zustand'
import type { ImportProgress, IndexStatus, BookRow } from '../../preload'
import {
  defaultSettings,
  fromAnnotationRow,
  fromUniverseRow,
  type Annotation,
  type BookText,
  type LibraryBook,
  type ReadingMode,
  type ReadingSession,
  type Settings,
  type Token,
  type Universe,
  type UniverseTheme
} from './lib/types'
import { countWords, tokenize } from './lib/text'
import { parsePdf } from './lib/parsers/pdf'
import { parseEpub } from './lib/parsers/epub'
import { makeUniverse } from './lib/universes'

export type SettingsSection = 'general' | 'reading' | 'book' | 'narrator' | 'mail' | 'about'

interface State {
  ready: boolean
  settings: Settings
  current: { book: LibraryBook; text: BookText; tokens: Token[] } | null
  currentUniverse: Universe | null
  currentUniverseImage: boolean
  mode: ReadingMode
  loading: { label: string; progress: number } | null
  error: string | null
  libraryVersion: number
  lastSessionId: number | null
  activeUniverse: Universe | null
  activeUniverseImage: boolean
  lastUniverseId: string | null
  importProgress: ImportProgress | null
  indexStatus: IndexStatus | null
  settingsOpen: SettingsSection | null

  init: () => Promise<void>
  openSettings: (section?: SettingsSection) => void
  closeSettings: () => void
  bump: () => void
  importPick: (kind: 'files' | 'folder') => Promise<void>
  importPaths: (paths: string[]) => Promise<void>
  dismissImport: () => void
  openBook: (id: string, at?: number) => Promise<void>
  closeBook: () => void
  removeBook: (id: string) => Promise<void>
  updateBook: (id: string, patch: Record<string, unknown>) => Promise<void>
  setMode: (m: ReadingMode) => void
  setPosition: (pos: number) => void
  updateSettings: (patch: Partial<Settings>) => void
  recordSession: (s: ReadingSession) => void
  addAnnotation: (a: Omit<Annotation, 'id' | 'createdAt'>) => Annotation
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void
  removeAnnotation: (id: string) => void
  setCoverFromUrl: (id: string, url: string) => Promise<boolean>
  removeCover: (id: string) => Promise<void>
  openUniverse: (id: string | null) => Promise<void>
  refreshUniverse: () => Promise<void>
  createUniverse: (name: string, authors?: string[]) => Promise<Universe>
  updateUniverse: (
    u: Universe,
    patch: Partial<Pick<Universe, 'name' | 'description' | 'authors' | 'theme'>>
  ) => Promise<void>
  deleteUniverse: (id: string) => Promise<void>
  assignBookToUniverse: (bookId: string, universeId: string | null) => Promise<void>
  pickUniverseImage: (id: string) => Promise<void>
  removeUniverseImage: (id: string) => Promise<void>
  setIndexing: (on: boolean) => Promise<void>
}

let initStarted = false
let saveTimer: ReturnType<typeof setTimeout> | null = null
function persistSettings(get: () => State): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void window.api.setSettings(get().settings), 300)
}

export const useStore = create<State>((set, get) => ({
  ready: false,
  settings: defaultSettings,
  current: null,
  currentUniverse: null,
  currentUniverseImage: false,
  mode: 'guided',
  loading: null,
  error: null,
  libraryVersion: 0,
  lastSessionId: null,
  activeUniverse: null,
  activeUniverseImage: false,
  lastUniverseId: null,
  importProgress: null,
  settingsOpen: null,
  openSettings: (section = 'general') => set({ settingsOpen: section }),
  closeSettings: () => set({ settingsOpen: null }),
  indexStatus: null,

  bump: () => set((s) => ({ libraryVersion: s.libraryVersion + 1 })),

  init: async () => {
    if (initStarted) return
    initStarted = true
    const saved = (await window.api.getSettings()) as Partial<Settings> | null
    const settings: Settings = {
      ...defaultSettings,
      ...(saved ?? {}),
      book: { ...defaultSettings.book, ...(saved?.book ?? {}) },
      ramp: { ...defaultSettings.ramp, ...(saved?.ramp ?? {}) }
    }
    set({ ready: true, settings, mode: settings.lastMode })
    window.api.onImportProgress((p) => {
      set({ importProgress: p })
      if (p.phase === 'done' || p.phase === 'cancelled') get().bump()
      else if (p.done % 25 === 0) get().bump()
    })
    window.api.onIndexStatus((s) => {
      set({ indexStatus: s })
      if (!s.busy) get().bump()
    })
    if (settings.backgroundIndex)
      void window.api.setIndexing(true).then((s) => set({ indexStatus: s }))
    else void window.api.indexStatus().then((s) => set({ indexStatus: s }))
    const initial = await window.api.initialBook()
    if (initial) {
      const existing = await window.api.getBookByPath(initial.path)
      if (existing) await get().openBook(existing.id)
      else await get().importPaths([initial.path])
    }
  },

  importPick: async (kind) => {
    const paths = await window.api.pickImport(kind)
    if (paths.length) await get().importPaths(paths)
  },

  importPaths: async (paths) => {
    set({ error: null })
    try {
      const result = await window.api.startImport(paths)
      set({ importProgress: result })
      get().bump()
      // A single file: open it right away
      if (
        paths.length === 1 &&
        result.added + result.skipped === 1 &&
        /\.(pdf|epub)$/i.test(paths[0])
      ) {
        const b = await window.api.getBookByPath(paths[0])
        if (b) {
          set({ importProgress: null })
          await get().openBook(b.id)
        }
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  dismissImport: () => set({ importProgress: null }),

  openBook: async (id, at) => {
    const row = await window.api.getBook(id)
    if (!row) return
    set({ loading: { label: 'Abriendo libro…', progress: 0.3 }, error: null })
    try {
      let text = await window.api.loadText(id)
      let patch: Record<string, unknown> = {}
      if (!text) {
        set({ loading: { label: 'Extrayendo texto…', progress: 0.5 } })
        const data = await window.api.readBook(row.path)
        const onProgress = (done: number, total: number): void =>
          set({ loading: { label: `Extrayendo texto… ${done}/${total}`, progress: done / total } })
        const parsed =
          row.format === 'epub'
            ? await parseEpub(data, onProgress)
            : await parsePdf(data, onProgress)
        if (countWords(parsed.book) === 0)
          throw new Error('No se encontró texto legible en el archivo.')
        text = parsed.book
        const totalWords = await window.api.saveText(id, text)
        patch = { totalWords }
        if (parsed.cover && (!row.coverSource || row.coverSource === 'none')) {
          await window.api.saveCover(id, parsed.cover.data, parsed.cover.mime)
          row.coverSource = 'file'
        }
        if (!row.author && parsed.author) {
          patch.author = parsed.author
          patch.universeId = row.universeId ?? (await window.api.ensureUniverse(parsed.author))
        }
        row.hasText = 1
        row.totalWords = totalWords
      }
      const annotations = (await window.api.annotations(id)).map(fromAnnotationRow)
      const position = at ?? row.position
      patch.lastReadAt = new Date().toISOString()
      if (at !== undefined) patch.position = at
      await window.api.updateBook(id, patch)
      const book: LibraryBook = { ...row, ...(patch as Partial<BookRow>), position, annotations }
      const uni = book.universeId ? await window.api.getUniverse(book.universeId) : null
      const hasImage = uni ? await window.api.universeHasImage(uni.id) : false
      set({
        current: { book, text, tokens: tokenize(text) },
        currentUniverse: uni ? fromUniverseRow(uni) : null,
        currentUniverseImage: hasImage,
        loading: null
      })
      get().bump()
    } catch (e) {
      set({ loading: null, error: e instanceof Error ? e.message : String(e) })
    }
  },

  closeBook: () => {
    set({ current: null, currentUniverse: null })
    get().bump()
  },

  removeBook: async (id) => {
    await window.api.removeBook(id)
    set((s) => ({ current: s.current?.book.id === id ? null : s.current }))
    get().bump()
  },

  updateBook: async (id, patch) => {
    await window.api.updateBook(id, patch)
    set((s) =>
      s.current?.book.id === id
        ? {
            current: {
              ...s.current,
              book: { ...s.current.book, ...(patch as Partial<LibraryBook>) }
            }
          }
        : {}
    )
    get().bump()
  },

  setMode: (mode) => {
    set({ mode })
    if (mode !== get().settings.lastMode) get().updateSettings({ lastMode: mode })
  },

  setPosition: (pos) => {
    const cur = get().current
    if (!cur) return
    const position = Math.max(0, Math.min(pos, cur.tokens.length))
    set({ current: { ...cur, book: { ...cur.book, position } } })
    void window.api.updateBook(cur.book.id, { position, lastReadAt: new Date().toISOString() })
  },

  updateSettings: (patch) => {
    set((s) => ({ settings: { ...s.settings, ...patch } }))
    persistSettings(get)
  },

  recordSession: (session) => {
    const cur = get().current
    if (!cur) return
    void window.api
      .addSession(cur.book.id, {
        date: session.date,
        mode: session.mode,
        words: session.words,
        seconds: session.seconds,
        wpm: session.wpm
      })
      .then((id) => {
        set({ lastSessionId: id })
        get().bump()
      })
  },

  addAnnotation: (a) => {
    const cur = get().current
    const temp: Annotation = { ...a, id: `tmp-${Date.now()}`, createdAt: new Date().toISOString() }
    if (!cur) return temp
    set({
      current: {
        ...cur,
        book: {
          ...cur.book,
          annotations: [...cur.book.annotations, temp].sort((x, y) => x.start - y.start)
        }
      }
    })
    void window.api
      .addAnnotation({
        bookId: cur.book.id,
        start: a.start,
        end: a.end,
        text: a.text,
        color: a.color,
        note: a.note ?? null
      })
      .then((row) => {
        const c = get().current
        if (!c) return
        set({
          current: {
            ...c,
            book: {
              ...c.book,
              annotationCount: c.book.annotations.length,
              annotations: c.book.annotations.map((x) =>
                x.id === temp.id ? fromAnnotationRow(row) : x
              )
            }
          }
        })
        get().bump()
      })
    return temp
  },

  updateAnnotation: (id, patch) => {
    const cur = get().current
    if (!cur) return
    set({
      current: {
        ...cur,
        book: {
          ...cur.book,
          annotations: cur.book.annotations.map((a) => (a.id === id ? { ...a, ...patch } : a))
        }
      }
    })
    if (!id.startsWith('tmp-'))
      void window.api.updateAnnotation(id, {
        color: patch.color,
        note: 'note' in patch ? (patch.note ?? null) : undefined
      })
  },

  removeAnnotation: (id) => {
    const cur = get().current
    if (!cur) return
    set({
      current: {
        ...cur,
        book: { ...cur.book, annotations: cur.book.annotations.filter((a) => a.id !== id) }
      }
    })
    if (!id.startsWith('tmp-')) void window.api.removeAnnotation(id).then(() => get().bump())
  },

  setCoverFromUrl: async (id, url) => {
    const ok = await window.api.setCoverFromUrl(id, url)
    if (ok) {
      set((s) =>
        s.current?.book.id === id
          ? { current: { ...s.current, book: { ...s.current.book, coverSource: 'web' } } }
          : {}
      )
      get().bump()
    }
    return ok
  },

  removeCover: async (id) => {
    await window.api.deleteCover(id)
    get().bump()
  },

  openUniverse: async (id) => {
    if (!id) {
      set((s) => ({
        activeUniverse: null,
        lastUniverseId: s.activeUniverse?.id ?? s.lastUniverseId
      }))
      return
    }
    const row = await window.api.getUniverse(id)
    if (!row) return
    const hasImage = await window.api.universeHasImage(id)
    set({ activeUniverse: fromUniverseRow(row), activeUniverseImage: hasImage, lastUniverseId: id })
  },

  refreshUniverse: async () => {
    const id = get().activeUniverse?.id
    if (!id) return
    const row = await window.api.getUniverse(id)
    if (row) set({ activeUniverse: fromUniverseRow(row) })
  },

  createUniverse: async (name, authors = []) => {
    const u = makeUniverse(
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      authors[0] ?? name
    )
    const universe: Universe = { ...u, name, authors, bookCount: 0, sampleIds: [] }
    await window.api.upsertUniverse({
      id: universe.id,
      name: universe.name,
      description: null,
      authors: universe.authors,
      theme: universe.theme,
      createdAt: universe.createdAt
    })
    get().bump()
    return universe
  },

  updateUniverse: async (u, patch) => {
    const next: Universe = { ...u, ...patch }
    await window.api.upsertUniverse({
      id: next.id,
      name: next.name,
      description: next.description ?? null,
      authors: next.authors,
      theme: next.theme as UniverseTheme,
      createdAt: next.createdAt
    })
    set((s) => ({
      activeUniverse: s.activeUniverse?.id === u.id ? next : s.activeUniverse,
      currentUniverse: s.currentUniverse?.id === u.id ? next : s.currentUniverse
    }))
    get().bump()
  },

  deleteUniverse: async (id) => {
    await window.api.deleteUniverse(id)
    set((s) => ({ activeUniverse: s.activeUniverse?.id === id ? null : s.activeUniverse }))
    get().bump()
  },

  assignBookToUniverse: async (bookId, universeId) => {
    await window.api.assignBook(bookId, universeId)
    set((s) =>
      s.current?.book.id === bookId
        ? { current: { ...s.current, book: { ...s.current.book, universeId } } }
        : {}
    )
    await get().refreshUniverse()
    get().bump()
  },

  pickUniverseImage: async (id) => {
    const ok = await window.api.pickUniverseImage(id)
    if (!ok) return
    const u = get().activeUniverse
    if (u && u.id === id) await get().updateUniverse(u, { theme: { ...u.theme, hasImage: true } })
    set({ activeUniverseImage: true })
  },

  removeUniverseImage: async (id) => {
    await window.api.deleteUniverseImage(id)
    const u = get().activeUniverse
    if (u && u.id === id) await get().updateUniverse(u, { theme: { ...u.theme, hasImage: false } })
    set({ activeUniverseImage: false })
  },

  setIndexing: async (on) => {
    get().updateSettings({ backgroundIndex: on })
    const s = await window.api.setIndexing(on)
    set({ indexStatus: s })
  }
}))
