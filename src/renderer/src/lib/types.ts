import type { AnnotationRow, BookRow, UniverseRow } from '../../../preload'

export type BookFormat = 'pdf' | 'epub'

export interface Chapter {
  title: string
  paragraphs: string[]
}

export interface BookText {
  chapters: Chapter[]
}

export interface Token {
  text: string
  chapter: number
  paragraph: number
  sentenceEnd: boolean
  paragraphEnd: boolean
}

export type ReadingMode = 'rsvp' | 'guided' | 'narrator' | 'book'

export interface VoiceSettings {
  voice: string
  rate: number
  pitch: number
}

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink'

export interface Annotation {
  id: string
  start: number
  end: number
  text: string
  color: HighlightColor
  note?: string
  createdAt: string
}

export function fromAnnotationRow(r: AnnotationRow): Annotation {
  return {
    id: r.id,
    start: r.start,
    end: r.end,
    text: r.text,
    color: r.color as HighlightColor,
    note: r.note ?? undefined,
    createdAt: r.createdAt
  }
}

// A book as the library lists it (straight from SQLite)
export type Book = BookRow

// The open book: row + its annotations, kept in memory while reading
export interface LibraryBook extends BookRow {
  annotations: Annotation[]
}

export function bookVoice(b: BookRow): VoiceSettings | undefined {
  if (!b.voice) return undefined
  try {
    return JSON.parse(b.voice) as VoiceSettings
  } catch {
    return undefined
  }
}

export type AtmosphereEffect =
  'eldritch' | 'fantasy' | 'scifi' | 'gothic' | 'mystery' | 'ocean' | 'desert' | 'library'

export interface UniverseTheme {
  preset: AtmosphereEffect
  bg1: string
  bg2: string
  accent: string
  hasImage?: boolean
}

export interface Universe {
  id: string
  name: string
  description?: string
  authors: string[]
  theme: UniverseTheme
  createdAt: string
  bookCount: number
  sampleIds: string[]
}

export function fromUniverseRow(r: UniverseRow): Universe {
  let authors: string[] = []
  let theme: UniverseTheme = {
    preset: 'library',
    bg1: '#1c1410',
    bg2: '#3a2a1e',
    accent: '#d9a066'
  }
  try {
    authors = JSON.parse(r.authors) as string[]
  } catch {
    /* keep empty */
  }
  try {
    theme = { ...theme, ...(JSON.parse(r.theme) as Partial<UniverseTheme>) }
  } catch {
    /* keep default */
  }
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    authors,
    theme,
    createdAt: r.createdAt,
    bookCount: r.bookCount,
    sampleIds: r.sampleIds ? r.sampleIds.split(',').filter(Boolean) : []
  }
}

export type BookFont = 'roboto' | 'georgia' | 'times' | 'segoe' | 'consolas'

export interface BookAppearance {
  font: BookFont
  lineHeight: number
  margin: 'narrow' | 'normal' | 'wide'
  columns: 'auto' | 1 | 2
  justify: boolean
  pageTheme: 'dark' | 'light' | 'sepia' | 'app'
}

export interface ReadingSession {
  date: string
  mode: ReadingMode
  words: number
  seconds: number
  wpm: number
  quizScore?: number
}

// neural = voces de Microsoft (internet); local = voces instaladas en Windows; auto = neural con respaldo local
export type NarratorEngine = 'auto' | 'neural' | 'local'

export interface Settings {
  wpm: number
  chunkSize: number
  punctuationPause: boolean
  bionic: boolean
  focusMode: boolean
  fontSize: number
  theme: 'dark' | 'light' | 'sepia'
  dictLang: 'es' | 'en'
  immersiveReader: boolean
  narrator: VoiceSettings | null
  narratorSpeed: number
  narratorEngine: NarratorEngine
  lastMode: ReadingMode
  backgroundIndex: boolean
  book: BookAppearance
  ramp: {
    enabled: boolean
    step: number
    everyWords: number
    max: number
  }
}

export const defaultSettings: Settings = {
  wpm: 300,
  chunkSize: 1,
  punctuationPause: true,
  bionic: false,
  focusMode: true,
  fontSize: 22,
  theme: 'dark',
  dictLang: 'es',
  immersiveReader: true,
  narrator: null,
  narratorSpeed: 1,
  narratorEngine: 'auto',
  lastMode: 'guided',
  backgroundIndex: false,
  book: {
    font: 'georgia',
    lineHeight: 1.6,
    margin: 'normal',
    columns: 'auto',
    justify: true,
    pageTheme: 'app'
  },
  ramp: { enabled: false, step: 10, everyWords: 300, max: 700 }
}
