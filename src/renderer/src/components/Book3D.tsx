import type { BookRow } from '../../../preload'
import CoverImage from './CoverImage'

// A cover with real thickness: spine on the left, page block on the right and bottom.
// Needs a parent with `transform-style: preserve-3d` to show the sides when rotated.
export default function Book3D({
  book,
  lazy = true
}: {
  book: BookRow
  lazy?: boolean
}): React.JSX.Element {
  return (
    <div className="book3d">
      <div className="book3d-front">
        <CoverImage book={book} lazy={lazy} />
      </div>
      <div className="book3d-spine" />
      <div className="book3d-pages" />
      <div className="book3d-bottom" />
    </div>
  )
}
