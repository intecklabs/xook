import { useStore } from '../store'
import Icon from './Icon'
import ReadingSettings from './ReadingSettings'
import { ThemeRow } from './SettingsRows'

interface Props {
  onClose: () => void
}

// Quick panel inside the reader: only what matters while reading
export default function SettingsPanel({ onClose }: Props): React.JSX.Element {
  const openSettings = useStore((s) => s.openSettings)

  return (
    <aside className="settings">
      <div className="settings-head">
        <strong>Ajustes</strong>
        <button className="icon" onClick={onClose}>
          <Icon name="x" size={18} />
        </button>
      </div>

      <ReadingSettings />

      <ThemeRow />

      <button className="ghost" onClick={() => openSettings('general')}>
        <Icon name="sliders" /> Toda la configuración…
      </button>

      <div className="hint" style={{ marginTop: 4 }}>
        Atajos: <kbd>espacio</kbd> play/pausa · <kbd>↑↓</kbd> velocidad · <kbd>←→</kbd> oración
      </div>
    </aside>
  )
}
