import type { AtmosphereEffect, Token } from './types'

export interface CuratedVoice {
  id: string
  name: string
  region: string
  gender: 'F' | 'M'
  lang: 'es' | 'en'
  style: string
  rate?: number
  pitch?: number
}

export const CURATED: CuratedVoice[] = [
  {
    id: 'es-MX-DaliaNeural',
    name: 'Dalia',
    region: 'México',
    gender: 'F',
    lang: 'es',
    style: 'Cálida y clara, ideal para todo tipo de libros'
  },
  {
    id: 'es-MX-JorgeNeural',
    name: 'Jorge',
    region: 'México',
    gender: 'M',
    lang: 'es',
    style: 'Grave y pausado, perfecto para terror y ciencia ficción'
  },
  {
    id: 'es-ES-AlvaroNeural',
    name: 'Álvaro',
    region: 'España',
    gender: 'M',
    lang: 'es',
    style: 'Narrador clásico, fantasía épica y aventuras'
  },
  {
    id: 'es-ES-ElviraNeural',
    name: 'Elvira',
    region: 'España',
    gender: 'F',
    lang: 'es',
    style: 'Expresiva y dramática, gótico y romance'
  },
  {
    id: 'es-AR-TomasNeural',
    name: 'Tomás',
    region: 'Argentina',
    gender: 'M',
    lang: 'es',
    style: 'Íntimo y cercano, misterio y novela negra'
  },
  {
    id: 'es-AR-ElenaNeural',
    name: 'Elena',
    region: 'Argentina',
    gender: 'F',
    lang: 'es',
    style: 'Serena, ensayo y no ficción'
  },
  {
    id: 'es-CL-LorenzoNeural',
    name: 'Lorenzo',
    region: 'Chile',
    gender: 'M',
    lang: 'es',
    style: 'Aventurero, relatos de viaje y mar'
  },
  {
    id: 'es-CL-CatalinaNeural',
    name: 'Catalina',
    region: 'Chile',
    gender: 'F',
    lang: 'es',
    style: 'Suave, poesía y cuentos'
  },
  {
    id: 'es-CO-GonzaloNeural',
    name: 'Gonzalo',
    region: 'Colombia',
    gender: 'M',
    lang: 'es',
    style: 'Vivaz y divertido, humor e infantil'
  },
  {
    id: 'es-CO-SalomeNeural',
    name: 'Salomé',
    region: 'Colombia',
    gender: 'F',
    lang: 'es',
    style: 'Alegre y musical, juvenil'
  },
  {
    id: 'es-US-AlonsoNeural',
    name: 'Alonso',
    region: 'EE. UU.',
    gender: 'M',
    lang: 'es',
    style: 'Neutro y moderno, tecnología y ciencia'
  },
  {
    id: 'es-US-PalomaNeural',
    name: 'Paloma',
    region: 'EE. UU.',
    gender: 'F',
    lang: 'es',
    style: 'Neutra, divulgación y negocios'
  },
  {
    id: 'es-PE-AlexNeural',
    name: 'Alex',
    region: 'Perú',
    gender: 'M',
    lang: 'es',
    style: 'Tranquilo, historia y biografías'
  },
  {
    id: 'es-VE-SebastianNeural',
    name: 'Sebastián',
    region: 'Venezuela',
    gender: 'M',
    lang: 'es',
    style: 'Enérgico, acción y thriller'
  },
  {
    id: 'en-US-AndrewMultilingualNeural',
    name: 'Andrew',
    region: 'US · multilingüe',
    gender: 'M',
    lang: 'en',
    style: 'Cálido y natural; también lee español'
  },
  {
    id: 'en-US-AvaMultilingualNeural',
    name: 'Ava',
    region: 'US · multilingüe',
    gender: 'F',
    lang: 'en',
    style: 'Brillante y expresiva; también lee español'
  },
  {
    id: 'en-GB-RyanNeural',
    name: 'Ryan',
    region: 'UK',
    gender: 'M',
    lang: 'en',
    style: 'British narrator, classics and mystery'
  },
  {
    id: 'en-GB-SoniaNeural',
    name: 'Sonia',
    region: 'UK',
    gender: 'F',
    lang: 'en',
    style: 'British, elegant and clear'
  },
  {
    id: 'en-US-GuyNeural',
    name: 'Guy',
    region: 'US',
    gender: 'M',
    lang: 'en',
    style: 'Podcast style, sci-fi and thriller'
  },
  {
    id: 'en-US-AriaNeural',
    name: 'Aria',
    region: 'US',
    gender: 'F',
    lang: 'en',
    style: 'Friendly, fiction and self-help'
  }
]

const BY_PRESET: Record<AtmosphereEffect, { es: string; en: string; rate: number; pitch: number }> =
  {
    eldritch: { es: 'es-MX-JorgeNeural', en: 'en-GB-RyanNeural', rate: -8, pitch: -6 },
    fantasy: { es: 'es-ES-AlvaroNeural', en: 'en-GB-RyanNeural', rate: -3, pitch: 0 },
    scifi: { es: 'es-US-AlonsoNeural', en: 'en-US-GuyNeural', rate: 0, pitch: 0 },
    gothic: { es: 'es-ES-ElviraNeural', en: 'en-GB-SoniaNeural', rate: -6, pitch: -2 },
    mystery: { es: 'es-AR-TomasNeural', en: 'en-GB-RyanNeural', rate: -4, pitch: -3 },
    ocean: { es: 'es-CL-LorenzoNeural', en: 'en-US-AndrewMultilingualNeural', rate: 0, pitch: 0 },
    desert: { es: 'es-CO-GonzaloNeural', en: 'en-US-GuyNeural', rate: 0, pitch: 0 },
    library: { es: 'es-MX-DaliaNeural', en: 'en-US-AvaMultilingualNeural', rate: 0, pitch: 0 }
  }

const EN_STOP = new Set([
  'the',
  'and',
  'of',
  'to',
  'in',
  'is',
  'that',
  'was',
  'with',
  'for',
  'he',
  'she',
  'it',
  'his',
  'her'
])
const ES_STOP = new Set([
  'el',
  'la',
  'de',
  'que',
  'y',
  'en',
  'los',
  'las',
  'un',
  'una',
  'por',
  'con',
  'para',
  'del',
  'se'
])

export function detectLanguage(tokens: Token[]): 'es' | 'en' {
  let en = 0
  let es = 0
  const limit = Math.min(tokens.length, 3000)
  for (let i = 0; i < limit; i++) {
    const w = tokens[i].text.toLowerCase().replace(/[^a-záéíóúñü]/g, '')
    if (EN_STOP.has(w)) en++
    if (ES_STOP.has(w)) es++
  }
  return en > es * 1.2 ? 'en' : 'es'
}

export function suggestVoice(
  preset: AtmosphereEffect | undefined,
  lang: 'es' | 'en'
): { voice: string; rate: number; pitch: number } {
  const s = BY_PRESET[preset ?? 'library']
  return { voice: lang === 'en' ? s.en : s.es, rate: s.rate, pitch: s.pitch }
}

export function voiceLabel(id: string): string {
  const c = CURATED.find((v) => v.id === id)
  if (c) return `${c.name} · ${c.region}`
  const m = id.match(/^([a-z]{2}-[A-Z]{2})-(.+?)(?:Multilingual)?Neural$/)
  return m ? `${m[2]} · ${m[1]}` : id
}
