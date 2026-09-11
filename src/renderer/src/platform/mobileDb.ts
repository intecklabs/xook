import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { readBytes, writeBytes } from './files'

export type SqlValue = string | number | null | Uint8Array

const DB_FILE = 'library.db'
const SAVE_DELAY = 1500

// Same schema as the desktop app (src/main/db.ts)
const SCHEMA = `
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  format TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  size INTEGER DEFAULT 0,
  totalWords INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0,
  addedAt TEXT NOT NULL,
  lastReadAt TEXT,
  coverSource TEXT,
  coverTriedAt TEXT,
  universeId TEXT,
  voice TEXT,
  hasText INTEGER DEFAULT 0,
  indexed INTEGER DEFAULT 0,
  avgWpm INTEGER,
  annotationCount INTEGER DEFAULT 0,
  titleNorm TEXT,
  authorNorm TEXT
);
CREATE INDEX IF NOT EXISTS books_recent ON books(lastReadAt DESC, addedAt DESC);
CREATE INDEX IF NOT EXISTS books_added ON books(addedAt DESC);
CREATE INDEX IF NOT EXISTS books_title ON books(titleNorm);
CREATE INDEX IF NOT EXISTS books_author ON books(authorNorm);
CREATE INDEX IF NOT EXISTS books_universe ON books(universeId);
CREATE INDEX IF NOT EXISTS books_hasText ON books(hasText, indexed);
CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  bookId TEXT NOT NULL,
  start INTEGER NOT NULL,
  end INTEGER NOT NULL,
  text TEXT NOT NULL,
  color TEXT NOT NULL,
  note TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS annotations_book ON annotations(bookId, start);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bookId TEXT NOT NULL,
  date TEXT NOT NULL,
  mode TEXT NOT NULL,
  words INTEGER NOT NULL,
  seconds INTEGER NOT NULL,
  wpm INTEGER NOT NULL,
  quizScore INTEGER
);
CREATE INDEX IF NOT EXISTS sessions_book ON sessions(bookId, id DESC);
CREATE TABLE IF NOT EXISTS universes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  authors TEXT NOT NULL,
  theme TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  nameNorm TEXT
);
CREATE TABLE IF NOT EXISTS universe_authors (
  universeId TEXT NOT NULL,
  authorNorm TEXT NOT NULL,
  PRIMARY KEY (universeId, authorNorm)
);
CREATE INDEX IF NOT EXISTS universe_authors_author ON universe_authors(authorNorm);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE VIRTUAL TABLE IF NOT EXISTS paragraphs USING fts5(
  text, bookId UNINDEXED, chapter UNINDEXED, paragraph UNINDEXED, token UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);
`

// SQLite compiled to WebAssembly, kept in memory and written back to app storage after changes.
// The API mirrors the small subset of node:sqlite the desktop code uses.
export class MobileDb {
  private sqlite3!: Sqlite3Static
  private db!: Database
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private saving: Promise<void> | null = null
  private dirty = false

  async open(): Promise<void> {
    this.sqlite3 = await sqlite3InitModule()
    this.db = new this.sqlite3.oo1.DB(':memory:')
    const bytes = await readBytes(DB_FILE)
    if (bytes && bytes.length > 100) {
      const p = this.sqlite3.wasm.allocFromTypedArray(bytes)
      const rc = this.sqlite3.capi.sqlite3_deserialize(
        this.db.pointer!,
        'main',
        p,
        bytes.length,
        bytes.length,
        this.sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
          this.sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE
      )
      this.db.checkRc(rc)
    }
    this.db.exec(SCHEMA)
  }

  exec(sql: string): void {
    this.db.exec(sql)
    this.touch()
  }

  run(sql: string, ...bind: SqlValue[]): void {
    this.db.exec({ sql, bind: bind.map((v) => (v === undefined ? null : v)) })
    this.touch()
  }

  get<T>(sql: string, ...bind: SqlValue[]): T | undefined {
    const rows = this.db.exec({
      sql,
      bind: bind.map((v) => (v === undefined ? null : v)),
      rowMode: 'object',
      returnValue: 'resultRows'
    }) as T[]
    return rows[0]
  }

  all<T>(sql: string, ...bind: SqlValue[]): T[] {
    return this.db.exec({
      sql,
      bind: bind.map((v) => (v === undefined ? null : v)),
      rowMode: 'object',
      returnValue: 'resultRows'
    }) as T[]
  }

  lastInsertRowid(): number {
    return Number(this.sqlite3.capi.sqlite3_last_insert_rowid(this.db.pointer!))
  }

  transaction(fn: () => void): void {
    this.db.exec('BEGIN')
    try {
      fn()
      this.db.exec('COMMIT')
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
    this.touch()
  }

  private touch(): void {
    this.dirty = true
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => void this.flush(), SAVE_DELAY)
  }

  // Write the whole database to storage (debounced after writes; forced when the app pauses)
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    if (!this.dirty) return
    if (this.saving) await this.saving
    if (!this.dirty) return
    this.dirty = false
    const bytes = this.sqlite3.capi.sqlite3_js_db_export(this.db)
    this.saving = writeBytes(DB_FILE, bytes)
      .catch((e) => {
        console.error('[db] save failed', e)
        this.dirty = true
      })
      .finally(() => {
        this.saving = null
      })
    await this.saving
  }
}
