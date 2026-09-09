import { useEffect, useRef, useState } from 'react'
import type { BookRow } from '../../../preload'
import { useStore } from '../store'
import { estimateMinutes } from '../lib/text'
import { useAllAnnotations, usePagedBooks, useStats } from '../hooks/useLibrary'
import CoverFlow from './CoverFlow'
import ShelfView from './ShelfView'
import AlphabetIndex from './AlphabetIndex'
import { useFastNav } from '../hooks/useFastNav'
import CoverPicker from './CoverPicker'
import CoverImage from './CoverImage'
import UniversesView from './UniversesView'
import SearchBox from './SearchBox'
import SendDialog from './SendDialog'
import ConvertDialog from './ConvertDialog'
import Icon from './Icon'

type Tab = 'flow' | 'shelf' | 'universes' | 'list' | 'notes'
type Sort = 'recent' | 'added' | 'title' | 'author' | 'progress'

const SORTS: { id: Sort; label: string }[] = [
  { id: 'recent', label: 'Leídos recientemente' },
  { id: 'added', label: 'Añadidos' },
  { id: 'title', label: 'Título' },
  { id: 'author', label: 'Autor' },
  { id: 'progress', label: 'Progreso' }
]

const ROW = 84

export default function Library(): React.JSX.Element {
  const settings = useStore((s) => s.settings)
  const importPick = useStore((s) => s.importPick)
  const openBook = useStore((s) => s.openBook)
  const removeBook = useStore((s) => s.removeBook)
  const updateSettings = useStore((s) => s.updateSettings)
  const openSettings = useStore((s) => s.openSettings)
  const stats = useStats()
  const [tab, setTab] = useState<Tab>(() =>
    useStore.getState().lastUniverseId ? 'universes' : 'flow'
  )
  const [sort, setSort] = useState<Sort>('recent')
  const [rawIndex, setIndex] = useState(0)
  const [pickerFor, setPickerFor] = useState<BookRow | null>(null)
  const [sendFor, setSendFor] = useState<BookRow | null>(null)
  const [convertFor, setConvertFor] = useState<BookRow | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [jump, setJump] = useState<{ index: number; n: number } | undefined>(undefined)
  const fast = useFastNav()

  const paged = usePagedBooks({ sort })
  const index = Math.max(0, Math.min(rawIndex, Math.max(0, paged.total - 1)))
  const selected = paged.get(index)
  const isDark = settings.theme === 'dark'

  const remove = (b: BookRow): void => {
    if (confirm(`¿Quitar "${b.title}" de la biblioteca?`)) void removeBook(b.id)
  }
  const openAt = (id: string, token?: number): void => void openBook(id, token)

  // A–Z index: appears while browsing fast (or pinned); jumps by title/author
  const azBy: 'title' | 'author' = sort === 'author' ? 'author' : 'title'
  const showAz =
    (tab === 'flow' || tab === 'shelf' || tab === 'list') &&
    paged.total > 60 &&
    (fast.pinned || fast.active)
  const jumpTo = (i: number): void => {
    if (sort !== 'title' && sort !== 'author') setSort('title')
    setIndex(i)
    setJump({ index: i, n: Date.now() })
  }
  const onIndexChange = (i: number): void => {
    setIndex(i)
    fast.bump()
  }

  return (
    <div className="screen library" onMouseDown={() => setMenuFor(null)}>
      <div className="lib-content">
        <header className="lib-header">
          <div>
            <h1 className="brand">Xook</h1>
            <p className="muted">
              Lee más rápido, entiende más.{' '}
              <span className="brand-note">Xook: «leer» en maya.</span>
            </p>
          </div>
          <div className="lib-actions">
            <button
              className="ghost icon-btn"
              title={isDark ? 'Modo claro' : 'Modo oscuro'}
              onClick={() => updateSettings({ theme: isDark ? 'light' : 'dark' })}
            >
              {isDark ? <Icon name="sun" size={18} /> : <Icon name="moon" size={18} />}
            </button>
            <button className="ghost icon-btn" title="Configuración" onClick={() => openSettings()}>
              <Icon name="sliders" size={18} />
            </button>
            <button
              className="ghost"
              onClick={() => void importPick('folder')}
              title="Importa todos los PDF y EPUB de una carpeta (y subcarpetas)"
            >
              <Icon name="folder" /> Importar carpeta
            </button>
            <button className="primary" onClick={() => void importPick('files')}>
              <Icon name="plus" /> Abrir libros
            </button>
          </div>
        </header>

        <SearchBox onOpen={openAt} />

        <section className="stats-row">
          <div className="stat">
            <span className="stat-value">{stats.wpm ?? '—'}</span>
            <span className="stat-label">ppm promedio</span>
          </div>
          <div className="stat">
            <span className="stat-value">{stats.words.toLocaleString('es')}</span>
            <span className="stat-label">palabras leídas</span>
          </div>
          <div className="stat">
            <span className="stat-value">{stats.books.toLocaleString('es')}</span>
            <span className="stat-label">libros</span>
          </div>
          <div className="stat">
            <span className="stat-value">{stats.notes.toLocaleString('es')}</span>
            <span className="stat-label">subrayados y notas</span>
          </div>
        </section>

        <div className="lib-toolbar">
          <div className="lib-tabs seg">
            <button className={tab === 'flow' ? 'active' : ''} onClick={() => setTab('flow')}>
              Portadas
            </button>
            <button className={tab === 'shelf' ? 'active' : ''} onClick={() => setTab('shelf')}>
              Estantería
            </button>
            <button
              className={tab === 'universes' ? 'active' : ''}
              onClick={() => setTab('universes')}
            >
              Universos
            </button>
            <button className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>
              Lista
            </button>
            <button className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>
              Anotaciones
            </button>
          </div>
          {(tab === 'flow' || tab === 'shelf' || tab === 'list') && paged.total > 60 && (
            <button
              className={`ghost az-toggle ${fast.pinned ? 'active' : ''}`}
              title="Índice alfabético"
              onClick={fast.togglePin}
            >
              A–Z
            </button>
          )}
          {(tab === 'flow' || tab === 'shelf' || tab === 'list') && paged.total > 1 && (
            <select
              className="lib-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
        </div>

        {tab === 'notes' ? (
          <AnnotationsOverview onOpen={openAt} />
        ) : tab === 'universes' ? (
          <UniversesView />
        ) : paged.total === 0 ? (
          <div className="empty">
            <p>Todavía no tienes libros. Abre un PDF o EPUB, o importa una carpeta completa.</p>
            <p className="muted small">
              Consejo: un lector promedio va a 200-250 ppm. Con entrenamiento constante es realista
              llegar a 400-500 ppm manteniendo la comprensión.
            </p>
          </div>
        ) : tab === 'shelf' ? (
          <ShelfView
            total={paged.total}
            get={paged.get}
            ensure={paged.ensure}
            reset={paged.reset}
            onOpen={(b) => void openBook(b.id)}
            jump={jump}
            onActivity={fast.bump}
          />
        ) : tab === 'flow' ? (
          <>
            <CoverFlow
              total={paged.total}
              get={paged.get}
              ensure={paged.ensure}
              index={index}
              onIndexChange={onIndexChange}
              onOpen={(b) => void openBook(b.id)}
            />
            {selected && (
              <BookDetails
                book={selected}
                wpm={selected.avgWpm ?? settings.wpm}
                onOpen={() => void openBook(selected.id)}
                onCover={() => setPickerFor(selected)}
                onSend={() => setSendFor(selected)}
                onConvert={() => setConvertFor(selected)}
                onRemove={() => remove(selected)}
              />
            )}
          </>
        ) : (
          <VirtualList
            total={paged.total}
            get={paged.get}
            ensure={paged.ensure}
            reset={paged.reset}
            jump={jump}
            onActivity={fast.bump}
            render={(b, i) => {
              const pct = Math.round((b.position / Math.max(b.totalWords, 1)) * 100)
              const wpm = b.avgWpm ?? settings.wpm
              const left = estimateMinutes(b.totalWords - b.position, wpm)
              return (
                <div
                  className="book"
                  onClick={() => {
                    setIndex(i)
                    void openBook(b.id)
                  }}
                >
                  <div className="book-thumb">
                    <CoverImage book={b} />
                  </div>
                  <div className="book-info">
                    <div className="book-title">{b.title}</div>
                    <div className="muted small">
                      {b.author ? `${b.author} · ` : ''}
                      {b.format.toUpperCase()} · {b.totalWords.toLocaleString('es')} palabras
                      {b.hasText ? '' : ' (aprox.)'} · ~{left} min
                      {b.annotationCount ? ` · ${b.annotationCount} anotaciones` : ''}
                    </div>
                    <div className="bar thin">
                      <div className="bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="book-pct">{pct}%</div>
                  <div className="book-menu-wrap" onMouseDown={(e) => e.stopPropagation()}>
                    <button
                      className="icon"
                      title="Más acciones"
                      onClick={(e) => {
                        e.stopPropagation()
                        setMenuFor(menuFor === b.id ? null : b.id)
                      }}
                    >
                      <Icon name="more" />
                    </button>
                    {menuFor === b.id && (
                      <div className="book-menu" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            setMenuFor(null)
                            setSendFor(b)
                          }}
                        >
                          <Icon name="mail" /> Enviar a dispositivo
                        </button>
                        <button
                          onClick={() => {
                            setMenuFor(null)
                            setConvertFor(b)
                          }}
                        >
                          <Icon name="convert" /> Convertir formato
                        </button>
                        <button
                          onClick={() => {
                            setMenuFor(null)
                            setPickerFor(b)
                          }}
                        >
                          <Icon name="image" /> Cambiar portada
                        </button>
                        <button
                          className="danger"
                          onClick={() => {
                            setMenuFor(null)
                            remove(b)
                          }}
                        >
                          × Quitar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            }}
          />
        )}
        {showAz && (
          <AlphabetIndex by={azBy} onJump={jumpTo} onPin={fast.togglePin} pinned={fast.pinned} />
        )}
      </div>
      {pickerFor && <CoverPicker book={pickerFor} onClose={() => setPickerFor(null)} />}
      {sendFor && <SendDialog book={sendFor} onClose={() => setSendFor(null)} />}
      {convertFor && <ConvertDialog book={convertFor} onClose={() => setConvertFor(null)} />}
    </div>
  )
}

function VirtualList({
  total,
  get,
  ensure,
  reset,
  render,
  jump,
  onActivity
}: {
  total: number
  get: (i: number) => BookRow | undefined
  ensure: (i: number) => void
  reset: number
  render: (b: BookRow, i: number) => React.JSX.Element
  jump?: { index: number; n: number }
  onActivity?: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState({ start: 0, end: 20 })

  useEffect(() => {
    if (!jump || !ref.current) return
    ref.current.scrollTo({ top: jump.index * ROW, behavior: 'smooth' })
  }, [jump])

  const update = (): void => {
    const el = ref.current
    if (!el) return
    const start = Math.max(0, Math.floor(el.scrollTop / ROW) - 4)
    const end = Math.min(total, Math.ceil((el.scrollTop + el.clientHeight) / ROW) + 4)
    setRange((r) => (r.start === start && r.end === end ? r : { start, end }))
  }

  useEffect(() => {
    update()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, reset])

  useEffect(() => {
    ensure(range.start)
    ensure(range.end - 1)
  }, [range, ensure])

  const rows: React.JSX.Element[] = []
  for (let i = range.start; i < range.end; i++) {
    const b = get(i)
    rows.push(
      <div
        key={b?.id ?? i}
        className={`vrow ${b ? '' : 'skeleton'}`}
        style={{ top: i * ROW, height: ROW }}
      >
        {b ? render(b, i) : <div className="book book-skeleton" />}
      </div>
    )
  }
  return (
    <div
      className="vlist"
      ref={ref}
      onScroll={() => {
        update()
        onActivity?.()
      }}
    >
      <div style={{ height: total * ROW, position: 'relative' }}>{rows}</div>
    </div>
  )
}

function BookDetails({
  book,
  wpm,
  onOpen,
  onCover,
  onSend,
  onConvert,
  onRemove
}: {
  book: BookRow
  wpm: number
  onOpen: () => void
  onCover: () => void
  onSend: () => void
  onConvert: () => void
  onRemove: () => void
}): React.JSX.Element {
  const pct = Math.round((book.position / Math.max(book.totalWords, 1)) * 100)
  const left = estimateMinutes(book.totalWords - book.position, wpm)
  return (
    <div className="book-details">
      <div className="book-details-title">{book.title}</div>
      <div className="muted">
        {book.author ? `${book.author} · ` : ''}
        {book.format.toUpperCase()} · {book.totalWords.toLocaleString('es')} palabras
        {book.hasText ? '' : ' (aprox.)'}
        {book.annotationCount ? ` · ${book.annotationCount} anotaciones` : ''}
      </div>
      <div className="book-details-progress">
        <div className="bar thin" style={{ flex: 1, marginTop: 0 }}>
          <div className="bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="small muted">
          {pct}% · faltan ~{left} min a {wpm} ppm
        </span>
      </div>
      <div className="book-details-actions">
        <button className="primary" onClick={onOpen}>
          {book.position > 0 ? 'Continuar leyendo' : 'Empezar a leer'}
        </button>
        <button className="ghost" onClick={onSend} title="Enviar a Kindle, móvil o USB">
          <Icon name="mail" /> Enviar
        </button>
        <button className="ghost" onClick={onConvert} title="Convertir a otro formato">
          <Icon name="convert" /> Convertir
        </button>
        <button className="ghost" onClick={onCover}>
          Portada
        </button>
        <button className="ghost danger" onClick={onRemove}>
          Quitar
        </button>
      </div>
    </div>
  )
}

function AnnotationsOverview({
  onOpen
}: {
  onOpen: (id: string, at: number) => void
}): React.JSX.Element {
  const { rows, total, more } = useAllAnnotations(100)
  if (total === 0) {
    return (
      <div className="empty">
        <p>Aún no tienes subrayados ni notas.</p>
        <p className="muted small">
          En el modo Guiado selecciona texto para subrayarlo, agregar una nota o ver la definición
          de una palabra.
        </p>
      </div>
    )
  }
  const groups: { title: string; bookId: string; items: typeof rows }[] = []
  for (const r of rows) {
    const g = groups[groups.length - 1]
    if (g && g.bookId === r.bookId) g.items.push(r)
    else groups.push({ title: r.title, bookId: r.bookId, items: [r] })
  }
  return (
    <div>
      {groups.map((g) => (
        <div key={g.bookId} className="lib-book-group">
          <h3>
            {g.title} <span className="muted small">· {g.items.length}</span>
          </h3>
          {g.items.map((a) => (
            <div key={a.id} className={`note-card ${a.color}`}>
              <div
                className="note-text"
                onClick={() => onOpen(a.bookId, a.start)}
                title="Abrir aquí"
              >
                {a.text.length > 300 ? a.text.slice(0, 300) + '…' : a.text}
              </div>
              {a.note && <div className="note-body">{a.note}</div>}
            </div>
          ))}
        </div>
      ))}
      {rows.length < total && (
        <div className="center" style={{ padding: 12 }}>
          <button className="ghost" onClick={more}>
            Cargar más ({total - rows.length} restantes)
          </button>
        </div>
      )}
    </div>
  )
}
