import type { AtmosphereEffect, Universe, UniverseTheme } from './types'

export interface AtmospherePreset {
  id: AtmosphereEffect
  label: string
  description: string
  bg1: string
  bg2: string
  accent: string
}

export const PRESETS: AtmospherePreset[] = [
  {
    id: 'eldritch',
    label: 'Cósmico',
    description: 'Niebla, abismos y estrellas frías',
    bg1: '#0b1a1c',
    bg2: '#1f0f2e',
    accent: '#5fd3b5'
  },
  {
    id: 'fantasy',
    label: 'Fantasía',
    description: 'Bosques antiguos y luces doradas',
    bg1: '#0f2a1c',
    bg2: '#2b1d0a',
    accent: '#e0b64a'
  },
  {
    id: 'scifi',
    label: 'Ciencia ficción',
    description: 'Campo de estrellas y rejilla',
    bg1: '#03071a',
    bg2: '#0a2145',
    accent: '#5ab0ff'
  },
  {
    id: 'gothic',
    label: 'Gótico',
    description: 'Ceniza, carmesí y penumbra',
    bg1: '#160608',
    bg2: '#2a0d14',
    accent: '#d63a4a'
  },
  {
    id: 'mystery',
    label: 'Misterio',
    description: 'Lluvia sobre una ciudad gris',
    bg1: '#0f141c',
    bg2: '#1f2a3a',
    accent: '#8fb3d9'
  },
  {
    id: 'ocean',
    label: 'Océano',
    description: 'Olas lentas y profundidad azul',
    bg1: '#03202e',
    bg2: '#05506b',
    accent: '#4fd1e0'
  },
  {
    id: 'desert',
    label: 'Desierto',
    description: 'Arena cálida y polvo al sol',
    bg1: '#3a2410',
    bg2: '#7a4a1e',
    accent: '#f2b25c'
  },
  {
    id: 'library',
    label: 'Biblioteca',
    description: 'Madera, papel y luz de lámpara',
    bg1: '#1c1410',
    bg2: '#3a2a1e',
    accent: '#d9a066'
  }
]

const AUTHOR_HINTS: [RegExp, AtmosphereEffect][] = [
  [/lovecraft|ligotti|barker|chambers|machen|blackwood/i, 'eldritch'],
  [
    /tolkien|rowling|martin|sanderson|jordan|le guin|leguin|pratchett|lewis|gaiman|rothfuss/i,
    'fantasy'
  ],
  [
    /asimov|clarke|herbert|dick|gibson|heinlein|bradbury|liu|verne|wells|banks|simmons|scalzi/i,
    'scifi'
  ],
  [/poe|stoker|shelley|rice|king|bécquer|becquer|le fanu|walpole/i, 'gothic'],
  [/christie|doyle|hammett|chandler|highsmith|larsson|nesbo|nesbø|leblanc|simenon/i, 'mystery'],
  [/verne|melville|conrad|hemingway|london|stevenson/i, 'ocean'],
  [/coelho|rulfo|mcCarthy|mccarthy|borges|herbert/i, 'desert']
]

export function suggestPreset(author: string): AtmosphereEffect {
  for (const [re, preset] of AUTHOR_HINTS) if (re.test(author)) return preset
  return 'library'
}

export function themeFromPreset(preset: AtmosphereEffect): UniverseTheme {
  const p = PRESETS.find((x) => x.id === preset) ?? PRESETS[PRESETS.length - 1]
  return { preset: p.id, bg1: p.bg1, bg2: p.bg2, accent: p.accent }
}

export function normalizeAuthor(author: string): string {
  let a = author
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9,\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (a.includes(',')) {
    const [last, first] = a.split(',').map((s) => s.trim())
    a = `${first} ${last}`.trim()
  }
  return a
}

export function displayAuthor(author: string): string {
  const a = author.trim()
  if (a.includes(',')) {
    const [last, first] = a.split(',').map((s) => s.trim())
    return `${first} ${last}`.trim()
  }
  return a
}

export function universeForAuthor(universes: Universe[], author: string): Universe | undefined {
  const key = normalizeAuthor(author)
  if (!key) return undefined
  return universes.find((u) => u.authors.some((x) => normalizeAuthor(x) === key))
}

export function makeUniverse(id: string, author: string): Universe {
  const name = displayAuthor(author)
  return {
    id,
    name,
    authors: [name],
    theme: themeFromPreset(suggestPreset(name)),
    createdAt: new Date().toISOString(),
    bookCount: 0,
    sampleIds: []
  }
}
