import type { Token } from './types'

export interface QuizQuestion {
  sentence: string
  blankWord: string
  options: string[]
  answer: number
}

const STOP = new Set(
  'el la los las un una unos unas de del al a en y o u que se su sus por para con sin como más pero es son fue era está están the a an of to in and or is are was were for with on at by from this that it as be'.split(
    ' '
  )
)

function clean(w: string): string {
  return w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')
}

function isContentWord(w: string): boolean {
  const c = clean(w).toLowerCase()
  return c.length >= 5 && !STOP.has(c) && /^\p{L}+$/u.test(c)
}

function seededRandom(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

function sentencesIn(tokens: Token[], from: number, to: number): Token[][] {
  const out: Token[][] = []
  let cur: Token[] = []
  for (let i = from; i < to && i < tokens.length; i++) {
    cur.push(tokens[i])
    if (tokens[i].sentenceEnd) {
      out.push(cur)
      cur = []
    }
  }
  if (cur.length) out.push(cur)
  return out.filter((s) => s.length >= 8 && s.length <= 40)
}

export function buildQuiz(tokens: Token[], from: number, to: number, count = 4): QuizQuestion[] {
  const rand = seededRandom(from * 31 + to)
  const sentences = sentencesIn(tokens, from, to)
  if (sentences.length === 0) return []

  const pool = Array.from(
    new Set(
      tokens
        .slice(from, to)
        .map((t) => clean(t.text))
        .filter((w) => isContentWord(w))
    )
  )
  if (pool.length < 4) return []

  const picked = new Set<number>()
  const questions: QuizQuestion[] = []
  let attempts = 0
  while (questions.length < count && attempts < 60 && picked.size < sentences.length) {
    attempts++
    const si = Math.floor(rand() * sentences.length)
    if (picked.has(si)) continue
    const sent = sentences[si]
    const candidates = sent.map((t, i) => ({ t, i })).filter(({ t }) => isContentWord(t.text))
    if (!candidates.length) continue
    picked.add(si)
    const { t, i } = candidates[Math.floor(rand() * candidates.length)]
    const answerWord = clean(t.text)
    const distractors: string[] = []
    let guard = 0
    while (distractors.length < 3 && guard < 100) {
      guard++
      const d = pool[Math.floor(rand() * pool.length)]
      if (d.toLowerCase() === answerWord.toLowerCase() || distractors.includes(d)) continue
      if (Math.abs(d.length - answerWord.length) > 4) continue
      distractors.push(d)
    }
    if (distractors.length < 3) continue
    const options = [...distractors]
    const answer = Math.floor(rand() * 4)
    options.splice(answer, 0, answerWord)
    const sentence = sent
      .map((tok, j) => (j === i ? tok.text.replace(answerWord, '_____') : tok.text))
      .join(' ')
    questions.push({ sentence, blankWord: answerWord, options, answer })
  }
  return questions
}
