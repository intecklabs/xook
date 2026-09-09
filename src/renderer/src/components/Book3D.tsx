import type { BookRow } from '../../../preload'
import CoverImage from './CoverImage'

// Spine colours: deep, cloth-like tones chosen per book (stable across sessions)
const PALETTE = [
  '#8b2f2f',
  '#2f4f8b',
  '#2f6b3f',
  '#6b4a2f',
  '#4a2f6b',
  '#2f6b6b',
  '#6b2f5a',
  '#3a3a3e',
  '#8b6b2f',
  '#2f3a5a',
  '#5a2f2f',
  '#2f5a4a'
]

function spineColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

// Thickness grows with the length of the book (12–34 px)
function thickness(words: number): number {
  return Math.round(Math.max(12, Math.min(34, 12 + words / 6000)))
}

// A cover with real thickness: coloured spine with the title, page block on the right and bottom.
// Needs a parent with `transform-style: preserve-3d` to show the sides when rotated.
export default function Book3D({
  book,
  lazy = true
}: {
  book: BookRow
  lazy?: boolean
}): React.JSX.Element {
  const t = thickness(book.totalWords)
  return (
    <div
      className="book3d"
      style={{ ['--t' as string]: `${t}px`, ['--spine' as string]: spineColor(book.id) }}
    >
      <div className="book3d-front">
        <CoverImage book={book} lazy={lazy} />
      </div>
      <div className="book3d-spine">
        <span className="book3d-spine-text">
          <span className="book3d-spine-title">{book.title}</span>
          {book.author && t >= 18 && <span className="book3d-spine-author">{book.author}</span>}
        </span>
      </div>
      <div className="book3d-pages" />
      <div className="book3d-bottom" />
    </div>
  )
}
