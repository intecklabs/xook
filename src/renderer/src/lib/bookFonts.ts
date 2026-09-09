import type { BookFont } from './types'

export const BOOK_FONTS: Record<BookFont, { label: string; css: string }> = {
  georgia: { label: 'Georgia', css: "Georgia, 'Times New Roman', serif" },
  times: { label: 'Times', css: "'Times New Roman', Times, serif" },
  roboto: { label: 'Roboto', css: "'Roboto', 'Segoe UI', sans-serif" },
  segoe: { label: 'Segoe UI', css: "'Segoe UI', system-ui, sans-serif" },
  consolas: { label: 'Consolas', css: "Consolas, 'Courier New', monospace" }
}
