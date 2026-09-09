const PALETTES = [
  ['#3b5bdb', '#1e2a78'],
  ['#c2410c', '#7c2d12'],
  ['#0f766e', '#134e4a'],
  ['#7e22ce', '#3b0764'],
  ['#be123c', '#4c0519'],
  ['#4d7c0f', '#1a2e05'],
  ['#0369a1', '#0c2f4a'],
  ['#a16207', '#422006']
]

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

interface Props {
  book: { title: string; author?: string; format: 'pdf' | 'epub' }
  className?: string
}

// Generated placeholder cover: gradient keyed by the title
export default function BookCover({ book, className = '' }: Props): React.JSX.Element {
  const [a, b] = PALETTES[hash(book.title) % PALETTES.length]
  return (
    <div
      className={`cover-placeholder ${className}`}
      style={{ background: `linear-gradient(160deg, ${a}, ${b})` }}
    >
      <div className="cover-placeholder-title">{book.title}</div>
      {book.author && <div className="cover-placeholder-author">{book.author}</div>}
      <div className="cover-placeholder-format">{book.format.toUpperCase()}</div>
    </div>
  )
}
