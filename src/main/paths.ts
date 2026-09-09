import { app } from 'electron'
import { join, basename } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'

let cached: string | null = null

const pointerFile = (): string => join(app.getPath('userData'), 'datadir.txt')

// The app used to be called "Lector Rápido"; adopt its data on first run so nothing is lost
function migrateLegacy(): void {
  if (existsSync(pointerFile()) || existsSync(defaultDataDir())) return
  const legacy = join(app.getPath('appData'), 'lector-rapido')
  if (!existsSync(legacy)) return
  let target: string | null = null
  try {
    const p = readFileSync(join(legacy, 'datadir.txt'), 'utf8').trim()
    if (p && existsSync(p)) target = p
  } catch {
    /* no pointer in the legacy folder */
  }
  if (!target && existsSync(join(legacy, 'data'))) target = join(legacy, 'data')
  if (target) setDataDir(target)
}

export function defaultDataDir(): string {
  return join(app.getPath('userData'), 'data')
}

// Library, covers, audio cache… live here; a pointer file lets the user move it to another drive
export function dataDir(): string {
  if (cached) return cached
  migrateLegacy()
  try {
    const p = readFileSync(pointerFile(), 'utf8').trim()
    if (p && existsSync(p)) cached = p
  } catch {
    /* no pointer: default location */
  }
  if (!cached) cached = defaultDataDir()
  return cached
}

export function setDataDir(p: string): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(pointerFile(), p, 'utf8')
  cached = p
}

export function dataDirFor(pickedFolder: string): string {
  const name = basename(pickedFolder).toLowerCase()
  return name === 'xook' || name === 'lectorrapido'
    ? join(pickedFolder, 'data')
    : join(pickedFolder, 'Xook', 'data')
}
