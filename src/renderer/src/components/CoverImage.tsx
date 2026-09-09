import { useEffect, useRef, useState } from 'react'
import BookCover from './BookCover'
import { renderPdfCover } from '../lib/parsers/pdf'

export interface CoverBook {
  id: string
  title: string
  author?: string | null
  format: 'pdf' | 'epub'
  path?: string
  coverSource?: string | null
  coverTriedAt?: string | null
}

interface Props {
  book: CoverBook
  className?: string
  lazy?: boolean
}

// Serialize on-demand cover work so a long list doesn't spawn hundreds of fetches at once
const queue: (() => Promise<void>)[] = []
let active = 0
const tried = new Set<string>()
function enqueue(task: () => Promise<void>): void {
  queue.push(task)
  void pump()
}
async function pump(): Promise<void> {
  if (active >= 2) return
  const task = queue.shift()
  if (!task) return
  active++
  try {
    await task()
  } finally {
    active--
    void pump()
  }
}

export default function CoverImage({
  book,
  className = '',
  lazy = true
}: Props): React.JSX.Element {
  const has = !!book.coverSource && book.coverSource !== 'none'
  const [version, setVersion] = useState(0)
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(!lazy)

  useEffect(() => {
    if (!lazy || visible) return
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisible(true)
    })
    io.observe(el)
    return () => io.disconnect()
  }, [lazy, visible])

  // Books without a cover get one when they scroll into view: PDFs render page 1, others ask the web once
  useEffect(() => {
    if (!visible || has || tried.has(book.id)) return
    const recentlyTried =
      book.coverTriedAt && Date.now() - Date.parse(book.coverTriedAt) < 6 * 3600 * 1000
    if (book.coverSource === 'none' && recentlyTried) return
    tried.add(book.id)
    enqueue(async () => {
      try {
        if (book.format === 'pdf' && book.path) {
          const data = await window.api.readBook(book.path)
          const cover = await renderPdfCover(data)
          if (cover) {
            await window.api.saveCover(book.id, cover.data, cover.mime)
            setVersion((v) => v + 1)
            setFailed(false)
            return
          }
        }
        const ok = await window.api.autoCover(book.id)
        if (ok) {
          setVersion((v) => v + 1)
          setFailed(false)
        }
      } catch {
        /* keep placeholder */
      }
    })
  }, [visible, has, book.id, book.format, book.path, book.coverSource, book.coverTriedAt])

  const show = (has || version > 0) && !failed
  return (
    <div ref={ref} className={`cover-box ${className}`}>
      {show ? (
        <img
          className="cover-img"
          src={`cover://book/${book.id}?v=${version}`}
          alt={book.title}
          draggable={false}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <BookCover
          book={{ title: book.title, author: book.author ?? undefined, format: book.format }}
        />
      )}
    </div>
  )
}
