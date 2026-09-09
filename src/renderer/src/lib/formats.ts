import type { TargetFormat } from '../../../preload'

export interface FormatInfo {
  id: TargetFormat
  label: string
  description: string
}

export const FORMATS: FormatInfo[] = [
  {
    id: 'epub',
    label: 'EPUB',
    description: 'Kindle (por correo o USB), Kobo, móviles y apps'
  },
  { id: 'pdf', label: 'PDF', description: 'Paginado A5, listo para imprimir o cualquier lector' },
  { id: 'txt', label: 'TXT', description: 'Texto plano, universal' },
  { id: 'md', label: 'Markdown', description: 'Para notas, Obsidian o Notion' },
  { id: 'html', label: 'HTML', description: 'Se abre en cualquier navegador' },
  { id: 'docx', label: 'Word', description: 'Documento editable (.docx)' }
]

export function normalizeText(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}
