import { useCallback, useState } from 'react'
import type { BookRow } from '../../../preload'
import { useStore } from '../store'
import { PRESETS, themeFromPreset } from '../lib/universes'
import { useBooks } from '../hooks/useLibrary'
import type { Universe } from '../lib/types'
import Atmosphere from './Atmosphere'
import CoverFlow from './CoverFlow'
import CoverImage from './CoverImage'
import CoverPicker from './CoverPicker'
import SearchBox from './SearchBox'
import SendDialog from './SendDialog'
import ConvertDialog from './ConvertDialog'
import Icon from './Icon'
import { IS_MOBILE, useCoverUrl } from '../lib/platform'

export default function UniverseScreen({ universe }: { universe: Universe }): React.JSX.Element {
  const hasImage = useStore((s) => s.activeUniverseImage)
  const openUniverse = useStore((s) => s.openUniverse)
  const openBook = useStore((s) => s.openBook)
  const importPick = useStore((s) => s.importPick)
  const updateUniverse = useStore((s) => s.updateUniverse)
  const deleteUniverse = useStore((s) => s.deleteUniverse)
  const assignBook = useStore((s) => s.assignBookToUniverse)
  const pickImage = useStore((s) => s.pickUniverseImage)
  const removeImage = useStore((s) => s.removeUniverseImage)

  const [rawIndex, setIndex] = useState(0)
  const [imgVer, setImgVer] = useState(0)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(universe.name)
  const [description, setDescription] = useState(universe.description ?? '')
  const [newAuthor, setNewAuthor] = useState('')
  const [showTheme, setShowTheme] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [assignQuery, setAssignQuery] = useState('')
  const [pickerFor, setPickerFor] = useState<BookRow | null>(null)
  const [sendFor, setSendFor] = useState<BookRow | null>(null)
  const [convertFor, setConvertFor] = useState<BookRow | null>(null)

  const universeImg = useCoverUrl('universe', universe.id, imgVer)
  const mine = useBooks({ universeId: universe.id, sort: 'recent', limit: 300 })
  const candidates = useBooks({ q: assignQuery, limit: 30 })
  const index = Math.max(0, Math.min(rawIndex, Math.max(0, mine.rows.length - 1)))
  const selected = mine.rows[index]
  const get = useCallback((i: number) => mine.rows[i], [mine.rows])
  const ensure = useCallback(() => undefined, [])

  const saveEdit = (): void => {
    void updateUniverse(universe, {
      name: name.trim() || universe.name,
      description: description.trim() || undefined
    })
    setEditing(false)
  }
  const addAuthor = (): void => {
    const a = newAuthor.trim()
    if (!a || universe.authors.includes(a)) return
    void updateUniverse(universe, { authors: [...universe.authors, a] })
    setNewAuthor('')
  }

  return (
    <div
      className="screen universe-screen"
      style={{ ['--u-accent' as string]: universe.theme.accent }}
    >
      <Atmosphere
        theme={universe.theme}
        image={hasImage ? universeImg : undefined}
        className="universe-bg"
      />

      <header className="universe-header">
        <button className="ghost" onClick={() => void openUniverse(null)}>
          <Icon name="arrow-left" /> Biblioteca
        </button>
        <div className="universe-header-actions">
          <button className="ghost" onClick={() => setShowTheme((v) => !v)}>
            <Icon name="sparkles" /> Atmósfera
          </button>
          <button className="ghost" onClick={() => setShowAssign((v) => !v)}>
            <Icon name="user-plus" /> Asignar libros
          </button>
          <button className="ghost" onClick={() => void importPick('files')}>
            <Icon name="plus" /> Importar
          </button>
          <button
            className="ghost danger"
            onClick={() => {
              if (confirm(`¿Eliminar el universo "${universe.name}"? Los libros no se borran.`))
                void deleteUniverse(universe.id)
            }}
          >
            Eliminar
          </button>
        </div>
      </header>

      <main className="universe-main">
        <section className="universe-title">
          {editing ? (
            <div className="universe-edit">
              <input
                className="universe-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit()
                  if (e.key === 'Escape') setEditing(false)
                }}
              />
              <textarea
                value={description}
                rows={2}
                placeholder="Descripción del universo…"
                onChange={(e) => setDescription(e.target.value)}
              />
              <div className="row-end">
                <button className="ghost small-btn" onClick={() => setEditing(false)}>
                  Cancelar
                </button>
                <button className="primary small-btn" onClick={saveEdit}>
                  Guardar
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => setEditing(true)}
              title="Clic para editar"
              className="universe-heading"
            >
              <h1>{universe.name}</h1>
              <p className="universe-desc">
                {universe.description ?? 'Clic para añadir una descripción'}
              </p>
            </div>
          )}
          <div className="universe-authors">
            {universe.authors.map((a) => (
              <span key={a} className="chip">
                {a}
                <button
                  className="chip-x"
                  title="Quitar autor"
                  onClick={() =>
                    void updateUniverse(universe, {
                      authors: universe.authors.filter((x) => x !== a)
                    })
                  }
                >
                  <Icon name="x" size={12} />
                </button>
              </span>
            ))}
            <form
              className="chip-add"
              onSubmit={(e) => {
                e.preventDefault()
                addAuthor()
              }}
            >
              <input
                value={newAuthor}
                onChange={(e) => setNewAuthor(e.target.value)}
                placeholder="+ autor"
              />
            </form>
          </div>
        </section>

        {mine.total > 0 && (
          <div className="universe-search">
            <SearchBox
              universeId={universe.id}
              placeholder={`Buscar en ${universe.name}…`}
              onOpen={(id, token) => void openBook(id, token)}
            />
          </div>
        )}

        {showTheme && (
          <section className="universe-panel">
            <div className="settings-head">
              <strong>Atmósfera</strong>
              <button className="icon" onClick={() => setShowTheme(false)}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="preset-grid">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  className={`preset ${universe.theme.preset === p.id ? 'active' : ''}`}
                  onClick={() =>
                    void updateUniverse(universe, {
                      theme: { ...themeFromPreset(p.id), hasImage: universe.theme.hasImage }
                    })
                  }
                  style={{
                    background: `linear-gradient(135deg, ${p.bg2}, ${p.bg1})`,
                    borderColor: universe.theme.preset === p.id ? p.accent : 'transparent'
                  }}
                >
                  <span className="preset-dot" style={{ background: p.accent }} />
                  <span className="preset-label">{p.label}</span>
                  <span className="preset-desc">{p.description}</span>
                </button>
              ))}
            </div>
            <div className="universe-panel-row">
              <label className="small">
                Color de acento
                <input
                  type="color"
                  value={universe.theme.accent}
                  onChange={(e) =>
                    void updateUniverse(universe, {
                      theme: { ...universe.theme, accent: e.target.value }
                    })
                  }
                />
              </label>
              <button
                className="ghost small-btn"
                onClick={() => void pickImage(universe.id).then(() => setImgVer((v) => v + 1))}
              >
                {hasImage ? 'Cambiar imagen de fondo' : 'Usar imagen de fondo…'}
              </button>
              {hasImage && (
                <button
                  className="ghost small-btn danger"
                  onClick={() => void removeImage(universe.id)}
                >
                  Quitar imagen
                </button>
              )}
            </div>
          </section>
        )}

        {showAssign && (
          <section className="universe-panel">
            <div className="settings-head">
              <strong>Asignar libros a este universo</strong>
              <button className="icon" onClick={() => setShowAssign(false)}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="searchbox-input" style={{ marginBottom: 8 }}>
              <span className="searchbox-icon">
                <Icon name="search" />
              </span>
              <input
                value={assignQuery}
                onChange={(e) => setAssignQuery(e.target.value)}
                placeholder="Busca por título o autor…"
                autoFocus
              />
            </div>
            <ul className="assign-list">
              {candidates.rows
                .filter((b) => b.universeId !== universe.id)
                .map((b) => (
                  <li key={b.id}>
                    <div className="book-thumb">
                      <CoverImage book={b} />
                    </div>
                    <div className="book-info">
                      <div className="book-title">{b.title}</div>
                      <div className="muted small">{b.author ?? 'Sin autor'}</div>
                    </div>
                    <button
                      className="small-btn"
                      onClick={() => void assignBook(b.id, universe.id)}
                    >
                      Añadir
                    </button>
                  </li>
                ))}
              {candidates.rows.filter((b) => b.universeId !== universe.id).length === 0 && (
                <li className="muted small">Sin resultados.</li>
              )}
            </ul>
          </section>
        )}

        {mine.total === 0 ? (
          <div className="empty universe-empty">
            <p>Este universo todavía no tiene libros.</p>
            <p className="muted small">Importa un libro o asigna alguno de tu biblioteca.</p>
          </div>
        ) : (
          <>
            <CoverFlow
              total={mine.rows.length}
              get={get}
              ensure={ensure}
              index={index}
              onIndexChange={setIndex}
              onOpen={(b) => void openBook(b.id)}
            />
            {selected && (
              <div className="book-details universe-book">
                <div className="book-details-title">{selected.title}</div>
                <div className="muted">
                  {selected.author ? `${selected.author} · ` : ''}
                  {selected.totalWords.toLocaleString('es')} palabras ·{' '}
                  {Math.round((selected.position / Math.max(selected.totalWords, 1)) * 100)}%
                </div>
                <div className="book-details-actions">
                  <button className="primary" onClick={() => void openBook(selected.id)}>
                    {selected.position > 0 ? 'Continuar leyendo' : 'Empezar a leer'}
                  </button>
                  {!IS_MOBILE && (
                    <>
                      <button className="ghost" onClick={() => setSendFor(selected)}>
                        <Icon name="mail" /> Enviar
                      </button>
                      <button className="ghost" onClick={() => setConvertFor(selected)}>
                        <Icon name="convert" /> Convertir
                      </button>
                    </>
                  )}
                  <button className="ghost" onClick={() => setPickerFor(selected)}>
                    Portada
                  </button>
                  <button className="ghost" onClick={() => void assignBook(selected.id, null)}>
                    Sacar del universo
                  </button>
                </div>
                {mine.total > mine.rows.length && (
                  <div className="muted small">
                    Mostrando {mine.rows.length} de {mine.total.toLocaleString('es')} libros; usa la
                    búsqueda para el resto.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {pickerFor && <CoverPicker book={pickerFor} onClose={() => setPickerFor(null)} />}
      {sendFor && <SendDialog book={sendFor} onClose={() => setSendFor(null)} />}
      {convertFor && <ConvertDialog book={convertFor} onClose={() => setConvertFor(null)} />}
    </div>
  )
}
