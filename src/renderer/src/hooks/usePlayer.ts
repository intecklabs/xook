import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { nextChunk, nextSentenceStart, prevSentenceStart, sentenceStart } from '../lib/text'
import type { ReadingMode } from '../lib/types'

export interface PlayerState {
  playing: boolean
  pos: number
  chunkEnd: number
  wpm: number
  sessionWords: number
  sessionSeconds: number
  sessionStart: number
}

interface Session {
  start: number
  from: number
  words: number
  wordsSinceRamp: number
  activeMs: number
  lastResume: number
}

const emptySession = (): Session => ({
  start: 0,
  from: 0,
  words: 0,
  wordsSinceRamp: 0,
  activeMs: 0,
  lastResume: 0
})

function snapshotOf(s: Session): { words: number; seconds: number; start: number } {
  const active = s.activeMs + (s.lastResume ? Date.now() - s.lastResume : 0)
  return { words: s.words, seconds: active / 1000, start: s.start }
}

export function usePlayer(mode: ReadingMode): {
  state: PlayerState
  toggle: () => void
  pause: () => void
  seek: (pos: number) => void
  skipSentence: (dir: 1 | -1) => void
  changeWpm: (delta: number) => void
  finishSession: () => { from: number; to: number; words: number; seconds: number } | null
} {
  const current = useStore((s) => s.current)
  const settings = useStore((s) => s.settings)
  const setPosition = useStore((s) => s.setPosition)
  const updateSettings = useStore((s) => s.updateSettings)
  const recordSession = useStore((s) => s.recordSession)

  const tokens = current?.tokens ?? []
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(current?.book.position ?? 0)
  const [chunkEnd, setChunkEnd] = useState(pos)
  const [snap, setSnap] = useState({ words: 0, seconds: 0, start: 0 })

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const session = useRef<Session>(emptySession())
  const posRef = useRef(pos)
  const wpmRef = useRef(settings.wpm)
  const stepRef = useRef<() => void>(() => {})

  useEffect(() => {
    wpmRef.current = settings.wpm
  }, [settings.wpm])

  useEffect(() => {
    const id = setInterval(() => setSnap(snapshotOf(session.current)), 1000)
    return () => clearInterval(id)
  }, [])

  const clear = (): void => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  const step = useCallback(() => {
    const chunk = nextChunk(
      tokens,
      posRef.current,
      mode === 'rsvp' ? settings.chunkSize : Math.max(settings.chunkSize, 3),
      wpmRef.current,
      settings.punctuationPause
    )
    if (!chunk) {
      setPlaying(false)
      return
    }
    setPos(chunk.start)
    setChunkEnd(chunk.end)

    // Words count only once the chunk has been displayed for its full time,
    // so seeking or re-rendering mid-chunk doesn't inflate the session stats
    timer.current = setTimeout(() => {
      const n = chunk.end - chunk.start
      session.current.words += n
      session.current.wordsSinceRamp += n
      if (settings.ramp.enabled && session.current.wordsSinceRamp >= settings.ramp.everyWords) {
        session.current.wordsSinceRamp = 0
        const next = Math.min(settings.ramp.max, wpmRef.current + settings.ramp.step)
        wpmRef.current = next
        updateSettings({ wpm: next })
      }
      posRef.current = chunk.end
      stepRef.current()
    }, chunk.delayMs)
  }, [tokens, mode, settings.chunkSize, settings.punctuationPause, settings.ramp, updateSettings])

  useEffect(() => {
    stepRef.current = step
  }, [step])

  useEffect(() => {
    clear()
    if (playing) {
      if (!session.current.start) {
        session.current = {
          ...emptySession(),
          start: Date.now(),
          from: posRef.current,
          lastResume: Date.now()
        }
      } else {
        session.current.lastResume = Date.now()
      }
      step()
    } else if (session.current.lastResume) {
      session.current.activeMs += Date.now() - session.current.lastResume
      session.current.lastResume = 0
      setPosition(posRef.current)
    }
    const id = setTimeout(() => setSnap(snapshotOf(session.current)), 0)
    return () => {
      clear()
      clearTimeout(id)
    }
  }, [playing, step, setPosition])

  const pause = useCallback(() => setPlaying(false), [])
  const toggle = useCallback(() => {
    if (!playing && posRef.current >= tokens.length) {
      posRef.current = 0
      setPos(0)
    }
    setPlaying((p) => !p)
  }, [playing, tokens.length])

  const seek = useCallback(
    (p: number) => {
      const next = Math.max(0, Math.min(p, tokens.length))
      posRef.current = next
      setPos(next)
      setChunkEnd(next)
      setPosition(next)
      if (playing) {
        clear()
        step()
      }
    },
    [tokens.length, playing, step, setPosition]
  )

  const skipSentence = useCallback(
    (dir: 1 | -1) => {
      const cur = posRef.current
      seek(dir > 0 ? nextSentenceStart(tokens, cur) : prevSentenceStart(tokens, cur))
    },
    [tokens, seek]
  )

  const changeWpm = useCallback(
    (delta: number) => {
      const next = Math.max(60, Math.min(1500, wpmRef.current + delta))
      wpmRef.current = next
      updateSettings({ wpm: next })
    },
    [updateSettings]
  )

  const finishSession = useCallback(() => {
    setPlaying(false)
    const s = session.current
    if (!s.start || s.words < 20) {
      session.current = emptySession()
      setSnap(snapshotOf(session.current))
      return null
    }
    const active = s.activeMs + (s.lastResume ? Date.now() - s.lastResume : 0)
    const seconds = Math.max(1, active / 1000)
    const result = { from: s.from, to: posRef.current, words: s.words, seconds }
    recordSession({
      date: new Date().toISOString(),
      mode,
      words: s.words,
      seconds: Math.round(seconds),
      wpm: Math.round((s.words / seconds) * 60)
    })
    session.current = emptySession()
    setSnap(snapshotOf(session.current))
    return result
  }, [mode, recordSession])

  useEffect(() => {
    if (mode === 'narrator' || mode === 'book') return
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (tag === 'BUTTON' && e.code === 'Space')) return
      if (e.code === 'Space') {
        e.preventDefault()
        toggle()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        changeWpm(e.shiftKey ? 50 : 10)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        changeWpm(e.shiftKey ? -50 : -10)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        skipSentence(-1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        skipSentence(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, changeWpm, skipSentence, mode])

  return {
    state: {
      playing,
      pos,
      chunkEnd: Math.max(chunkEnd, pos),
      wpm: settings.wpm,
      sessionWords: snap.words,
      sessionSeconds: snap.seconds,
      sessionStart: snap.start
    },
    toggle,
    pause,
    seek: (p) => seek(sentenceStart(tokens, p)),
    skipSentence,
    changeWpm,
    finishSession
  }
}
