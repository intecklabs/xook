import { useEffect } from 'react'
import { useStore } from './store'
import Library from './components/Library'
import Reader from './components/Reader'
import UniverseScreen from './components/UniverseScreen'
import ImportOverlay from './components/ImportOverlay'
import SettingsScreen from './components/SettingsScreen'

export default function App(): React.JSX.Element {
  const ready = useStore((s) => s.ready)
  const init = useStore((s) => s.init)
  const current = useStore((s) => s.current)
  const theme = useStore((s) => s.settings.theme)
  const loading = useStore((s) => s.loading)
  const error = useStore((s) => s.error)
  const activeUniverse = useStore((s) => s.activeUniverse)
  const settingsOpen = useStore((s) => s.settingsOpen)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  if (!ready) return <div className="screen center">Cargando…</div>

  return (
    <>
      {current ? (
        <Reader />
      ) : activeUniverse ? (
        <UniverseScreen key={activeUniverse.id} universe={activeUniverse} />
      ) : (
        <Library />
      )}
      {settingsOpen && <SettingsScreen section={settingsOpen} />}
      <ImportOverlay />
      {loading && (
        <div className="overlay">
          <div className="overlay-card">
            <div>{loading.label}</div>
            <div className="bar">
              <div
                className="bar-fill"
                style={{ width: `${Math.round(loading.progress * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}
      {error && (
        <div className="toast error" onClick={() => useStore.setState({ error: null })}>
          {error}
        </div>
      )}
    </>
  )
}
