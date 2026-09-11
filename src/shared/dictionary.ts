// Dictionary lookups over public wiki APIs. Pure fetch: runs in the Electron main process
// and in the mobile WebView alike.
export interface DictEntry {
  word: string
  phonetic?: string
  meanings: { partOfSpeech: string; definitions: { definition: string; example?: string }[] }[]
  source: string
}

const TIMEOUT = 5000

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT)
    })
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  }
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanWikitext(s: string): string {
  let out = s
  for (let i = 0; i < 4; i++) {
    out = out
      .replace(/\{\{(?:plm|l\+?|l\*?|m|w)\|(?:[a-z-]+\|)?([^|}]+)(?:\|[^}]*)?\}\}/gi, '$1')
      .replace(/\{\{(?:csem|ámbito|ambito|uso|etimología|etimologia|pron-graf)[^}]*\}\}/gi, '')
      .replace(/\{\{[^{}]*\}\}/g, '')
  }
  return out
    .replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:]+/, '')
    .trim()
}

interface EsParse {
  parse?: { title: string; wikitext: string }
}

async function esWiktionary(word: string, depth = 0): Promise<DictEntry | null> {
  const data = await getJson<EsParse>(
    `https://es.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(word)}&prop=wikitext&format=json&formatversion=2&redirects=1&origin=*`
  )
  const wikitext = data?.parse?.wikitext
  if (!wikitext) return null

  const esStart = wikitext.search(/==\s*\{\{lengua\|es\}\}\s*==/i)
  if (esStart < 0) return null
  const rest = wikitext.slice(esStart + 10)
  const nextLang = rest.search(/\n==\s*\{\{lengua\|/i)
  const section = nextLang >= 0 ? rest.slice(0, nextLang) : rest

  const meanings: DictEntry['meanings'] = []
  let current: DictEntry['meanings'][number] | null = null
  let pending: { definition: string; example?: string } | null = null
  for (const rawLine of section.split('\n')) {
    const line = rawLine.trim()
    const header = line.match(/^===+\s*(.+?)\s*===+$/)
    if (header) {
      const pos = cleanWikitext(header[1].replace(/\{\{([^|}]+)[^}]*\}\}/, '$1'))
      if (
        /etimolog|pronunci|traducc|véase|vease|información|informacion|locuciones|refranes/i.test(
          pos
        )
      )
        current = null
      else {
        current = { partOfSpeech: pos, definitions: [] }
        meanings.push(current)
      }
      continue
    }
    const def = line.match(/^;\s*\d+(?:\s*\{\{[^}]*\}\})*\s*:\s*(.+)$/)
    if (def && current) {
      const definition = cleanWikitext(def[1])
      if (definition) {
        pending = { definition }
        current.definitions.push(pending)
      }
      continue
    }
    const ex =
      line.match(/^:\*?\s*'''Ejemplo:?'''\s*(.+)$/i) ?? line.match(/\{\{ejemplo\|([^}|]+)/i)
    if (ex && pending && !pending.example) {
      const example = cleanWikitext(ex[1])
      if (example) pending.example = example
    }
  }

  const filled = meanings.filter((m) => m.definitions.length > 0)
  if (filled.length) {
    const phon = section.match(/\{\{pron-graf[^}]*\|fone=([^|}]+)/i)?.[1]
    return {
      word: data!.parse!.title,
      phonetic: phon ? `[${phon}]` : undefined,
      meanings: filled.map((m) => ({ ...m, definitions: m.definitions.slice(0, 5) })),
      source: 'Wikcionario (es)'
    }
  }

  // Inflected forms point at the lemma, e.g. {{forma verbo|esperar|...}}
  const lemma = section.match(/\{\{forma[^|}]*\|([^|}]+)/i)?.[1]?.trim()
  if (lemma && depth < 1 && lemma.toLowerCase() !== word.toLowerCase()) {
    const base = await esWiktionary(lemma, depth + 1)
    if (base) return { ...base, word: `${word} → ${base.word}` }
  }
  return null
}

type EnDefinition = Record<
  string,
  { partOfSpeech: string; definitions: { definition: string; examples?: string[] }[] }[]
>

async function enWiktionary(word: string, lang: string): Promise<DictEntry | null> {
  const data = await getJson<EnDefinition>(
    `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}?redirect=true`
  )
  const groups = data?.[lang]
  if (!groups?.length) return null
  const meanings = groups
    .map((g) => ({
      partOfSpeech: g.partOfSpeech,
      definitions: g.definitions
        .map((d) => ({
          definition: stripHtml(d.definition),
          example: d.examples?.[0] && stripHtml(d.examples[0])
        }))
        .filter((d) => d.definition)
        .slice(0, 5)
    }))
    .filter((m) => m.definitions.length)
  if (!meanings.length) return null
  return { word, meanings, source: 'Wiktionary (en)' }
}

async function wikipedia(word: string, lang: string): Promise<DictEntry | null> {
  const d = await getJson<{ type?: string; title?: string; extract?: string }>(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`
  )
  if (!d?.extract || d.type === 'disambiguation') return null
  return {
    word: d.title ?? word,
    meanings: [{ partOfSpeech: 'Wikipedia', definitions: [{ definition: d.extract }] }],
    source: 'Wikipedia'
  }
}

export async function lookupWord(word: string, lang: string): Promise<DictEntry | null> {
  const w = word.trim()
  if (!w) return null
  const candidates = Array.from(new Set([w.toLowerCase(), w]))
  if (lang === 'es') {
    for (const c of candidates) {
      const r = await esWiktionary(c)
      if (r) return r
    }
    for (const c of candidates) {
      const r = await enWiktionary(c, 'es')
      if (r) return r
    }
  } else {
    for (const c of candidates) {
      const r = await enWiktionary(c, 'en')
      if (r) return r
    }
  }
  for (const c of candidates) {
    const r = await wikipedia(c, lang)
    if (r) return r
  }
  return null
}
