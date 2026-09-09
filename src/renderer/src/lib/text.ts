import type { BookText, Token } from './types'

const SENTENCE_END = /[.!?…]["»”')\]]*$/
const CLAUSE_END = /[,;:—–]["»”')\]]*$/

export function tokenize(book: BookText): Token[] {
  const tokens: Token[] = []
  book.chapters.forEach((ch, ci) => {
    ch.paragraphs.forEach((p, pi) => {
      const words = p.split(/\s+/).filter(Boolean)
      words.forEach((w, wi) => {
        const last = wi === words.length - 1
        tokens.push({
          text: w,
          chapter: ci,
          paragraph: pi,
          sentenceEnd: SENTENCE_END.test(w) || last,
          paragraphEnd: last
        })
      })
    })
  })
  return tokens
}

export function countWords(book: BookText): number {
  let n = 0
  for (const ch of book.chapters)
    for (const p of ch.paragraphs) n += p.split(/\s+/).filter(Boolean).length
  return n
}

// Optimal Recognition Point: slightly left of centre, as used by Spritz-style RSVP
export function orpIndex(word: string): number {
  const clean = word.replace(/^[^\p{L}\p{N}]+/u, '')
  const offset = word.length - clean.length
  const n = clean.length
  let idx: number
  if (n <= 1) idx = 0
  else if (n <= 5) idx = 1
  else if (n <= 9) idx = 2
  else if (n <= 13) idx = 3
  else idx = 4
  return Math.min(offset + idx, word.length - 1)
}

export function bionicSplit(word: string): [string, string] {
  const m = word.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}]+)(.*)$/u)
  if (!m) return [word, '']
  const [, pre, core, post] = m
  const boldLen = core.length <= 3 ? 1 : Math.ceil(core.length * 0.45)
  return [pre + core.slice(0, boldLen), core.slice(boldLen) + post]
}

export interface Chunk {
  start: number
  end: number
  delayMs: number
}

export function nextChunk(
  tokens: Token[],
  start: number,
  chunkSize: number,
  wpm: number,
  punctuationPause: boolean
): Chunk | null {
  if (start >= tokens.length) return null
  const base = 60000 / wpm
  let end = start
  let delay = 0
  let count = 0
  while (end < tokens.length && count < chunkSize) {
    const t = tokens[end]
    let factor = 1
    if (t.text.length > 9) factor += 0.25
    if (punctuationPause) {
      if (t.paragraphEnd) factor += 1.2
      else if (t.sentenceEnd) factor += 0.9
      else if (CLAUSE_END.test(t.text)) factor += 0.4
    }
    delay += base * factor
    count++
    end++
    if (chunkSize > 1 && (t.sentenceEnd || CLAUSE_END.test(t.text))) break
  }
  return { start, end, delayMs: delay }
}

export function sentenceStart(tokens: Token[], pos: number): number {
  let i = Math.min(pos, tokens.length - 1)
  while (i > 0 && !tokens[i - 1].sentenceEnd) i--
  return i
}

export function prevSentenceStart(tokens: Token[], pos: number): number {
  const cur = sentenceStart(tokens, pos)
  if (cur === 0) return 0
  return sentenceStart(tokens, cur - 1)
}

export function nextSentenceStart(tokens: Token[], pos: number): number {
  let i = pos
  while (i < tokens.length && !tokens[i].sentenceEnd) i++
  return Math.min(i + 1, tokens.length)
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m >= 60) {
    const h = Math.floor(m / 60)
    return `${h}h ${m % 60}m`
  }
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export function estimateMinutes(words: number, wpm: number): number {
  return Math.ceil(words / Math.max(wpm, 1))
}
