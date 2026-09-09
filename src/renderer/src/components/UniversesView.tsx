import { useState } from 'react'
import { useStore } from '../store'
import { useUniverses } from '../hooks/useLibrary'
import Atmosphere from './Atmosphere'
import Icon from './Icon'

export default function UniversesView(): React.JSX.Element {
  const openUniverse = useStore((s) => s.openUniverse)
  const createUniverse = useStore((s) => s.createUniverse)
  const [newName, setNewName] = useState('')
  const [q, setQ] = useState('')
  const { rows, total, more } = useUniverses(q, 60)

  return (
    <div className="universes">
      <div className="universe-toolbar">
        <div className="searchbox-input universe-filter">
          <span className="searchbox-icon">
            <Icon name="search" />
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Filtrar ${total.toLocaleString('es')} universos…`}
          />
        </div>
        <form
          className="universe-create"
          onSubmit={(e) => {
            e.preventDefault()
            const name = newName.trim()
            if (!name) return
            void createUniverse(name).then((u) => {
              setNewName('')
              void openUniverse(u.id)
            })
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nuevo universo (p. ej. Mitos de Cthulhu)"
          />
          <button className="primary" type="submit" disabled={!newName.trim()}>
            Crear
          </button>
        </form>
      </div>

      {total === 0 ? (
        <div className="empty">
          <p>{q ? 'Ningún universo coincide.' : 'Aún no hay universos.'}</p>
          <p className="muted small">
            Se crean solos al importar libros con autor, o créalos aquí y asígnales libros.
          </p>
        </div>
      ) : (
        <div className="universe-grid">
          {rows.map((u) => (
            <button key={u.id} className="universe-card" onClick={() => void openUniverse(u.id)}>
              <Atmosphere
                theme={u.theme}
                image={u.theme.hasImage ? `cover://universe/${u.id}` : undefined}
                intensity={0.5}
                animate={false}
              />
              <div className="universe-card-body">
                <div className="universe-card-name">{u.name}</div>
                <div className="universe-card-meta">
                  {u.authors.slice(0, 3).join(', ')}
                  {u.authors.length > 3 ? '…' : ''}
                  {u.bookCount
                    ? ` · ${u.bookCount.toLocaleString('es')} ${u.bookCount === 1 ? 'libro' : 'libros'}`
                    : ''}
                </div>
                <div className="universe-card-covers">
                  {u.sampleIds.map((id) => (
                    <div key={id} className="universe-card-cover">
                      <img src={`cover://book/${id}`} alt="" loading="lazy" draggable={false} />
                    </div>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {rows.length < total && (
        <div className="center" style={{ padding: 12 }}>
          <button className="ghost" onClick={more}>
            Cargar más ({(total - rows.length).toLocaleString('es')} restantes)
          </button>
        </div>
      )}
    </div>
  )
}
