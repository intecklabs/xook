import { useEffect, useMemo, useRef, useState } from 'react'
import type { BookRow, SearchHit } from '../../../preload'
import { normalizeText } from '../lib/formats'
import CoverImage from './CoverImage'
import Icon from './Icon'

interface Props {
  universeId?: string
  placeholder?: string
  onOpen: (bookId: string, token?: number) => void
}

function highlight(text: string, q: string): React.ReactNode {
  const terms = normalizeText(q).split(/\s+/).filter(Boolean)
  if (!terms.length) return text
  const norm = normalizeText(text)
  const parts: React.ReactNode[] = []
  let i = 0
  while (i < text.length) {
    let best = -1
    let len = 0
    for (const t of terms) {
      const idx = norm.indexOf(t, i)
      if (idx >= 0 && (best === -1 || idx < best)) {
        best = idx
        len = t.length
      }
    }
    if (best === -1) {
      parts.push(text.slice(i))
      break
    }
    parts.push(text.slice(i, best), <mark key={best}>{text.slice(best, best + len)}</mark>)
    i = best + len
  }
  return parts
}

export default function SearchBox({ universeId, placeholder, onOpen }: Props): React.JSX.Element {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<{ key: string; books: BookRow[]; hits: SearchHit[] } | null>(
    null
  )
  const boxRef = useRef<HTMLDivElement>(null)
  const debounced = useDebounced(q, 220)
  const key = `${debounced.trim()}|${universeId ?? ''}`

  useEffect(() => {
    const nq = debounced.trim()
    if (nq.length < 2) return
    let cancelled = false
    void Promise.all([
      window.api.listBooks({ q: nq, universeId: universeId ?? undefined, limit: 8 }),
      window.api.searchText(nq, universeId ?? null)
    ]).then(([b, h]) => {
      if (!cancelled) setResult({ key, books: b.rows, hits: h })
    })
    return () => {
      cancelled = true
    }
  }, [debounced, universeId, key])

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [])

  const wanted = q.trim()
  const ready = wanted.length >= 2 && result?.key === `${wanted}|${universeId ?? ''}`
  const searching = wanted.length >= 2 && !ready
  const books = ready ? result!.books : []
  const hits = ready ? result!.hits : []

  const byBook = useMemo(() => {
    const map = new Map<string, { title: string; list: SearchHit[] }>()
    for (const h of hits) {
      const g = map.get(h.bookId) ?? { title: h.title, list: [] }
      g.list.push(h)
      map.set(h.bookId, g)
    }
    return Array.from(map.entries())
  }, [hits])

  const show = open && wanted.length >= 2

  return (
    <div className="searchbox" ref={boxRef}>
      <div className="searchbox-input">
        <span className="searchbox-icon">
          <Icon name="search" />
        </span>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setQ('')
              setOpen(false)
            }
            if (e.key === 'Enter') {
              if (books[0]) onOpen(books[0].id)
              else if (byBook[0]) onOpen(byBook[0][0], byBook[0][1].list[0].token)
            }
          }}
          placeholder={placeholder ?? 'Buscar libros, autores o texto dentro de los libros…'}
        />
        {q && (
          <button className="icon searchbox-clear" onClick={() => setQ('')}>
            <Icon name="x" size={16} />
          </button>
        )}
      </div>
      {show && (
        <div className="searchbox-results">
          {books.length > 0 && (
            <div className="sr-group">
              <div className="sr-title">Libros</div>
              {books.map((b) => (
                <button key={b.id} className="sr-book" onClick={() => onOpen(b.id)}>
                  <div className="sr-cover">
                    <CoverImage book={b} lazy={false} />
                  </div>
                  <div>
                    <div className="sr-book-title">{highlight(b.title, q)}</div>
                    <div className="muted small">
                      {b.author ? highlight(b.author, q) : b.format.toUpperCase()}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="sr-group">
            <div className="sr-title">
              En el texto{' '}
              {searching ? '· buscando…' : hits.length ? `· ${hits.length} coincidencias` : ''}
            </div>
            {!searching && hits.length === 0 && books.length === 0 && (
              <div className="muted small sr-empty">
                Sin resultados para «{q}». Solo se busca en el texto de libros ya abiertos o
                indexados en segundo plano.
              </div>
            )}
            {byBook.map(([bookId, g]) => (
              <div key={bookId} className="sr-textbook">
                <div className="sr-textbook-head">
                  <span className="sr-book-title">{g.title}</span>
                </div>
                {g.list.map((h, i) => (
                  <button key={i} className="sr-hit" onClick={() => onOpen(bookId, h.token)}>
                    <span className="sr-hit-chapter">Capítulo {h.chapter + 1}</span>
                    <span className="sr-hit-snippet">{highlight(h.snippet, q)}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}
