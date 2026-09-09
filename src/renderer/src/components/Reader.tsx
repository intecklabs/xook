import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { usePlayer } from '../hooks/usePlayer'
import { useNarrator } from '../hooks/useNarrator'
import { usePinchZoom } from '../hooks/usePinchZoom'
import RsvpView from './RsvpView'
import GuidedView from './GuidedView'
import BookView from './BookView'
import BookAppearance from './BookAppearance'
import BookSearchPanel from './BookSearchPanel'
import Controls from './Controls'
import NarratorControls from './NarratorControls'
import VoicePicker from './VoicePicker'
import SettingsPanel from './SettingsPanel'
import AnnotationsPanel from './AnnotationsPanel'
import SelectionPopover from './SelectionPopover'
import Quiz from './Quiz'
import Atmosphere from './Atmosphere'
import Icon from './Icon'
import { estimateMinutes, formatDuration } from '../lib/text'
import { detectLanguage, suggestVoice } from '../lib/voices'
import type { TextSelection } from '../lib/selection'
import { bookVoice, type ReadingMode } from '../lib/types'

type Panel = 'settings' | 'notes' | 'voices' | 'appearance' | 'search' | null

export default function Reader(): React.JSX.Element {
  const current = useStore((s) => s.current)!
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)
  const closeBook = useStore((s) => s.closeBook)
  const setPosition = useStore((s) => s.setPosition)
  const player = usePlayer(mode)
  const zoomIndicator = usePinchZoom()
  const [panel, setPanel] = useState<Panel>(null)
  const [selection, setSelection] = useState<TextSelection | null>(null)
  const [quizRange, setQuizRange] = useState<{ from: number; to: number; wpm: number } | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  const [mainSize, setMainSize] = useState({ w: 800, h: 600 })
  const immersive = useStore((s) => s.settings.immersiveReader)
  const narratorDefault = useStore((s) => s.settings.narrator)
  const narratorSpeed = useStore((s) => s.settings.narratorSpeed)
  const narratorEngine = useStore((s) => s.settings.narratorEngine)
  const wpmSetting = useStore((s) => s.settings.wpm)
  const universe = useStore((s) => s.currentUniverse ?? undefined)
  const universeImage = useStore((s) =>
    s.currentUniverse && s.currentUniverseImage
      ? `cover://universe/${s.currentUniverse.id}`
      : undefined
  )
  const isBook = mode === 'book'
  const showAtmosphere = immersive && !!universe && !isBook

  const [chrome, setChrome] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [bookPos, setBookPos] = useState(current.book.position)
  const [bookProgress, setBookProgress] = useState({ page: 0, pages: 1, chapter: 0 })
  const chromeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { tokens, book } = current
  const lang = useMemo(() => detectLanguage(tokens), [tokens])
  const voice = useMemo(
    () => bookVoice(book) ?? narratorDefault ?? suggestVoice(universe?.theme.preset, lang),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [book.voice, narratorDefault, universe?.theme.preset, lang]
  )
  const narrator = useNarrator(
    tokens,
    book.id,
    voice,
    narratorSpeed,
    mode === 'narrator',
    setPosition,
    narratorEngine
  )

  useLayoutEffect(() => {
    const el = mainRef.current
    if (!el) return
    const update = (): void => setMainSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // In book mode the bars fade out after a moment unless the mouse is near the top
  useEffect(() => {
    if (!isBook) return
    const hide = (): void => {
      if (chromeTimer.current) clearTimeout(chromeTimer.current)
      chromeTimer.current = setTimeout(() => setChrome(false), 2500)
    }
    hide()
    const onMove = (e: MouseEvent): void => {
      if (e.clientY < 60) {
        setChrome(true)
        hide()
      }
    }
    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      if (chromeTimer.current) clearTimeout(chromeTimer.current)
    }
  }, [isBook])

  const setFull = useCallback(async (flag: boolean): Promise<void> => {
    await window.api.setFullScreen(flag)
    setFullscreen(flag)
  }, [])

  useEffect(() => {
    if (!isBook) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (fullscreen) void setFull(false)
        else setChrome((c) => !c)
      } else if (e.key === 'F11') {
        e.preventDefault()
        void setFull(!fullscreen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isBook, fullscreen, setFull])

  const toggleFullscreen = (): Promise<void> => setFull(!fullscreen)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setPanel((p) => (p === 'search' ? null : 'search'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const isNarrating = mode === 'narrator'
  const pos = isNarrating ? narrator.state.token : isBook ? bookPos : player.state.pos
  const pct = tokens.length ? (pos / tokens.length) * 100 : 0
  const sessionWpm =
    player.state.sessionSeconds > 5
      ? Math.round((player.state.sessionWords / player.state.sessionSeconds) * 60)
      : null

  const endSession = (): void => {
    const r = player.finishSession()
    if (r) setQuizRange({ from: r.from, to: r.to, wpm: Math.round((r.words / r.seconds) * 60) })
  }

  const handleSelect = useCallback(
    (sel: TextSelection | null) => {
      if (sel) {
        player.pause()
        narrator.pause()
      }
      setSelection(sel)
    },
    [player, narrator]
  )

  const closePopover = useCallback(() => {
    setSelection(null)
    window.getSelection()?.removeAllRanges()
  }, [])

  const bookPosition = useCallback(
    (t: number) => {
      setBookPos(t)
      setPosition(t)
    },
    [setPosition]
  )

  const currentPos = (): number =>
    isNarrating ? narrator.state.token : isBook ? bookPos : player.state.pos

  const switchMode = (m: ReadingMode): void => {
    if (m === mode) return
    closePopover()
    setPanel(null)
    const from = currentPos()
    player.pause()
    narrator.pause()
    if (mode === 'book' && fullscreen) void setFull(false)
    if (m === 'book') setChrome(true)
    if (m === 'narrator') narrator.startAt(from)
    else if (m === 'book') setBookPos(from)
    else player.seek(from)
    setMode(m)
  }

  const sampleText = useMemo(() => {
    const seg = narrator.segments[narrator.state.segIndex]
    const words = (
      seg?.text ??
      tokens
        .slice(0, 40)
        .map((t) => t.text)
        .join(' ')
    ).split(/\s+/)
    return words.slice(0, 32).join(' ')
  }, [narrator.segments, narrator.state.segIndex, tokens])

  const minutesLeft = estimateMinutes(tokens.length - pos, 240)

  const modeSwitch = (
    <div className="mode-switch">
      <button className={mode === 'book' ? 'active' : ''} onClick={() => switchMode('book')}>
        <Icon name="book-open" /> Libro
      </button>
      <button className={mode === 'rsvp' ? 'active' : ''} onClick={() => switchMode('rsvp')}>
        RSVP
      </button>
      <button className={mode === 'guided' ? 'active' : ''} onClick={() => switchMode('guided')}>
        Guiado
      </button>
      <button
        className={mode === 'narrator' ? 'active' : ''}
        onClick={() => switchMode('narrator')}
      >
        <Icon name="headphones" /> Escuchar
      </button>
    </div>
  )

  return (
    <div
      className={`screen reader ${showAtmosphere ? 'immersive' : ''} ${isBook ? 'book-mode' : ''} ${
        isBook && !chrome ? 'chrome-hidden' : ''
      }`}
      style={showAtmosphere ? { ['--u-accent' as string]: universe!.theme.accent } : undefined}
    >
      {showAtmosphere && (
        <Atmosphere
          theme={universe!.theme}
          image={universeImage}
          intensity={0.6}
          className="reader-bg"
        />
      )}
      <header className="reader-header">
        <button
          className="ghost"
          onClick={() => {
            player.pause()
            narrator.pause()
            if (fullscreen) void window.api.setFullScreen(false)
            closeBook()
          }}
        >
          <Icon name="arrow-left" /> <span className="lbl">Biblioteca</span>
        </button>
        <div className="reader-title" title={book.title}>
          {book.title}
        </div>
        {modeSwitch}
        <button
          className={`ghost ${panel === 'search' ? 'active' : ''}`}
          onClick={() => setPanel((p) => (p === 'search' ? null : 'search'))}
          title="Buscar en el libro (Ctrl+F)"
        >
          <Icon name="search" />
        </button>
        {isBook ? (
          <>
            <button
              className={`ghost ${panel === 'appearance' ? 'active' : ''}`}
              onClick={() => setPanel((p) => (p === 'appearance' ? null : 'appearance'))}
              title="Apariencia"
            >
              Aa
            </button>
            <button
              className={`ghost ${panel === 'notes' ? 'active' : ''}`}
              onClick={() => setPanel((p) => (p === 'notes' ? null : 'notes'))}
            >
              <Icon name="pen" />
              {book.annotations.length ? ` ${book.annotations.length}` : ''}
            </button>
            <button
              className="ghost"
              onClick={() => void toggleFullscreen()}
              title="Pantalla completa (F11)"
            >
              {fullscreen ? <Icon name="minimize" /> : <Icon name="maximize" />}
            </button>
          </>
        ) : (
          <>
            <button
              className={`ghost ${panel === 'notes' ? 'active' : ''}`}
              onClick={() => setPanel((p) => (p === 'notes' ? null : 'notes'))}
            >
              <Icon name="pen" /> <span className="lbl">Notas</span>
              {book.annotations.length ? ` (${book.annotations.length})` : ''}
            </button>
            <button
              className={`ghost ${panel === 'settings' ? 'active' : ''}`}
              onClick={() => setPanel((p) => (p === 'settings' ? null : 'settings'))}
            >
              <Icon name="sliders" /> <span className="lbl">Ajustes</span>
            </button>
          </>
        )}
      </header>

      <main className="reader-main" ref={mainRef}>
        {mode === 'rsvp' ? (
          <RsvpView
            tokens={tokens}
            pos={player.state.pos}
            end={player.state.chunkEnd}
            onSelect={handleSelect}
          />
        ) : isBook ? (
          <BookView
            tokens={tokens}
            pos={bookPos}
            onPosition={bookPosition}
            onSelect={handleSelect}
            onToggleChrome={() => setChrome((c) => !c)}
            onProgress={setBookProgress}
          />
        ) : isNarrating ? (
          <GuidedView
            tokens={tokens}
            pos={narrator.state.token}
            end={narrator.state.token + 1}
            playing={narrator.state.playing}
            onSeek={narrator.seekToToken}
            onSelect={handleSelect}
          />
        ) : (
          <GuidedView
            tokens={tokens}
            pos={player.state.pos}
            end={player.state.chunkEnd}
            playing={player.state.playing}
            onSeek={player.seek}
            onSelect={handleSelect}
          />
        )}
        {selection && (
          <SelectionPopover
            key={`${selection.start}-${selection.end}-${selection.existing?.id ?? ''}`}
            selection={selection}
            containerWidth={mainSize.w}
            containerHeight={mainSize.h}
            onClose={closePopover}
          />
        )}
        {panel === 'settings' && <SettingsPanel onClose={() => setPanel(null)} />}
        {panel === 'appearance' && <BookAppearance onClose={() => setPanel(null)} />}
        {panel === 'search' && (
          <BookSearchPanel
            tokens={tokens}
            onClose={() => setPanel(null)}
            onSeek={(p) => {
              closePopover()
              if (isNarrating) narrator.seekToToken(p)
              else if (isBook) setBookPos(p)
              else {
                if (mode === 'rsvp') setMode('guided')
                player.seek(p)
              }
            }}
          />
        )}
        {panel === 'voices' && (
          <VoicePicker
            bookId={book.id}
            current={voice}
            lang={lang}
            preset={universe?.theme.preset}
            sampleText={sampleText}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === 'notes' && (
          <AnnotationsPanel
            onClose={() => setPanel(null)}
            onSeek={(p) => {
              closePopover()
              if (isNarrating) narrator.seekToToken(p)
              else if (isBook) setBookPos(p)
              else {
                if (mode !== 'guided') setMode('guided')
                player.seek(p)
              }
            }}
          />
        )}
        {zoomIndicator !== null && <div className="zoom-indicator">{zoomIndicator}px</div>}
        {isBook && (
          <div className="book-status">
            <span>{current.text.chapters[bookProgress.chapter]?.title}</span>
            <span>
              {bookProgress.page + 1} / {bookProgress.pages}
            </span>
            <span>
              {Math.round(pct)}% · ~{minutesLeft} min
            </span>
          </div>
        )}
      </main>

      {!isBook && (
        <footer className="reader-footer">
          <div className="session-info">
            <span>
              {Math.round(pct)}% · {pos.toLocaleString('es')} / {tokens.length.toLocaleString('es')}
            </span>
            {isNarrating ? (
              <span className="muted">
                Párrafo {narrator.state.segIndex + 1} / {narrator.segments.length}
                {narrator.state.loading ? ' · generando voz…' : ''}
              </span>
            ) : (
              player.state.sessionStart > 0 && (
                <span className="muted">
                  Sesión: {player.state.sessionWords} palabras ·{' '}
                  {formatDuration(player.state.sessionSeconds)}
                  {sessionWpm ? ` · ${sessionWpm} ppm reales` : ''}
                  {wpmSetting ? '' : ''}
                </span>
              )
            )}
          </div>
          {isNarrating ? (
            <NarratorControls
              narrator={narrator}
              voice={voice}
              onOpenVoices={() => setPanel((p) => (p === 'voices' ? null : 'voices'))}
            />
          ) : (
            <Controls player={player} onEndSession={endSession} />
          )}
        </footer>
      )}

      {quizRange && (
        <Quiz
          tokens={tokens}
          from={quizRange.from}
          to={quizRange.to}
          wpm={quizRange.wpm}
          onClose={() => setQuizRange(null)}
        />
      )}
    </div>
  )
}
