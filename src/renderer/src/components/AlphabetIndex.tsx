import { useEffect, useState } from 'react'

const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')]

interface Props {
  by: 'title' | 'author'
  universeId?: string | null
  onJump: (index: number, letter: string) => void
  onPin?: () => void
  pinned?: boolean
}

// iOS-style letter strip: click a letter to jump to the first title/author starting with it
export default function AlphabetIndex({
  by,
  universeId,
  onJump,
  onPin,
  pinned
}: Props): React.JSX.Element {
  const [available, setAvailable] = useState<Set<string> | null>(null)
  const [current, setCurrent] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.api.letters(by, universeId ?? null).then((ls) => {
      if (!cancelled) setAvailable(new Set(ls))
    })
    return () => {
      cancelled = true
    }
  }, [by, universeId])

  const jump = (letter: string): void => {
    setCurrent(letter)
    void window.api.indexForLetter(by, letter, universeId ?? null).then((i) => onJump(i, letter))
  }

  return (
    <div className="az" role="navigation" aria-label="Índice alfabético">
      <div className="az-head">
        <span className="az-title">{by === 'author' ? 'Autor' : 'Título'}</span>
        {onPin && (
          <button
            className={`az-pin ${pinned ? 'active' : ''}`}
            title={pinned ? 'Ocultar índice' : 'Mantener visible'}
            onClick={onPin}
          >
            {pinned ? '×' : '•'}
          </button>
        )}
      </div>
      <div className="az-letters">
        {LETTERS.map((l) => {
          const has = !available || available.has(l)
          return (
            <button
              key={l}
              className={`az-letter ${current === l ? 'active' : ''} ${has ? '' : 'dim'}`}
              disabled={!has}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => jump(l)}
            >
              {l}
            </button>
          )
        })}
      </div>
    </div>
  )
}
