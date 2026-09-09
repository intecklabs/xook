import type { Annotation } from './types'

export interface TextSelection {
  start: number
  end: number
  text: string
  x: number
  y: number
  yTop: number
  existing?: Annotation
}

export function cleanWord(text: string): string {
  return text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

export function isSingleWord(text: string): boolean {
  return cleanWord(text).length > 0 && !/\s/.test(text.trim())
}

export function annotationsToMarkdown(title: string, annotations: Annotation[]): string {
  const lines = [`# ${title}`, '']
  for (const a of annotations) {
    lines.push(`> ${a.text}`)
    if (a.note) lines.push('', `**Nota:** ${a.note}`)
    lines.push('')
  }
  return lines.join('\n')
}

export function annotationAt(annotations: Annotation[], index: number): Annotation | undefined {
  return annotations.find((a) => index >= a.start && index < a.end)
}
