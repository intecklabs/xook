import type { Token } from './types'

export interface Segment {
  index: number
  start: number
  end: number
  chapter: number
  text: string
}

const MAX_CHARS = 900
const MIN_CHARS = 120

function joinTokens(tokens: Token[], start: number, end: number): string {
  let out = ''
  for (let i = start; i < end; i++) out += (i > start ? ' ' : '') + tokens[i].text
  return out
}

// Paragraph-sized pieces: long paragraphs split at sentence ends, short ones merged
export function buildSegments(tokens: Token[]): Segment[] {
  const segments: Segment[] = []
  let start = 0
  let chars = 0
  let lastSentence = -1
  const push = (end: number): void => {
    if (end <= start) return
    segments.push({
      index: segments.length,
      start,
      end,
      chapter: tokens[start].chapter,
      text: joinTokens(tokens, start, end)
    })
    start = end
    chars = 0
    lastSentence = -1
  }
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    chars += t.text.length + 1
    const nextChapter = i + 1 < tokens.length && tokens[i + 1].chapter !== t.chapter
    if (t.sentenceEnd) lastSentence = i
    if (nextChapter || i === tokens.length - 1) {
      push(i + 1)
      continue
    }
    if (t.paragraphEnd && chars >= MIN_CHARS) {
      push(i + 1)
      continue
    }
    if (chars >= MAX_CHARS) {
      if (lastSentence > start) {
        const end = lastSentence + 1
        push(end)
        chars = 0
        for (let j = end; j <= i; j++) chars += tokens[j].text.length + 1
      } else {
        push(i + 1)
      }
    }
  }
  push(tokens.length)
  return segments
}

export function segmentAt(segments: Segment[], tokenIndex: number): number {
  let lo = 0
  let hi = segments.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (segments[mid].end <= tokenIndex) lo = mid + 1
    else hi = mid
  }
  return lo
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

// Map the synthesizer's word timestamps back onto token indices of the segment
export function alignWords(
  tokens: Token[],
  seg: Segment,
  words: { offset: number; duration: number; text: string }[]
): { token: number; at: number }[] {
  const out: { token: number; at: number }[] = []
  let p = seg.start
  for (const w of words) {
    const nw = norm(w.text)
    if (!nw) continue
    let found = -1
    for (let k = p; k < Math.min(seg.end, p + 4); k++) {
      const nt = norm(tokens[k].text)
      if (nt && (nt === nw || nt.startsWith(nw) || nw.startsWith(nt))) {
        found = k
        break
      }
    }
    if (found === -1) {
      if (p < seg.end) found = p
      else break
    }
    if (!out.length || out[out.length - 1].token !== found) out.push({ token: found, at: w.offset })
    p = found + 1
  }
  return out
}
