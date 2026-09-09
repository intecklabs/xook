import type { usePlayer } from '../hooks/usePlayer'
import { useStore } from '../store'
import Icon from './Icon'

interface Props {
  player: ReturnType<typeof usePlayer>
  onEndSession: () => void
}

export default function Controls({ player, onEndSession }: Props): React.JSX.Element {
  const total = useStore((s) => s.current?.tokens.length ?? 1)
  const { state } = player

  return (
    <div
      className="controls"
      onMouseUp={(e) => (e.target as HTMLElement).closest('button')?.blur()}
    >
      <input
        type="range"
        className="seek"
        min={0}
        max={total}
        value={state.pos}
        onChange={(e) => player.seek(Number(e.target.value))}
      />
      <div className="controls-row">
        <button onClick={() => player.skipSentence(-1)} title="Oración anterior (←)">
          <Icon name="skip-back" />
        </button>
        <button
          className="primary play"
          onClick={player.toggle}
          title="Reproducir / pausar (espacio)"
        >
          {state.playing ? <Icon name="pause" size={18} /> : <Icon name="play" size={18} />}
        </button>
        <button onClick={() => player.skipSentence(1)} title="Siguiente oración (→)">
          <Icon name="skip-forward" />
        </button>

        <div className="wpm">
          <button onClick={() => player.changeWpm(-25)} title="−25 ppm (↓)">
            −
          </button>
          <div className="wpm-value">
            <strong>{state.wpm}</strong>
            <span className="small muted">ppm</span>
          </div>
          <button onClick={() => player.changeWpm(25)} title="+25 ppm (↑)">
            +
          </button>
        </div>

        <button
          className="ghost"
          onClick={onEndSession}
          disabled={state.sessionStart === 0}
          title="Guarda la sesión y hace un quiz de comprensión"
        >
          Terminar sesión
        </button>
      </div>
    </div>
  )
}
