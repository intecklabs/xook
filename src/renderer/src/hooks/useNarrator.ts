import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { alignWords, buildSegments, segmentAt, type Segment } from '../lib/narration'
import type { NarratorEngine, Token, VoiceSettings } from '../lib/types'

interface Loaded {
  url: string
  marks: { token: number; at: number }[]
}

export interface NarratorState {
  playing: boolean
  loading: boolean
  segIndex: number
  token: number
  error: string | null
  local: boolean
}

const localAvailable = (): boolean => typeof window.speechSynthesis !== 'undefined'

function localeOf(voiceId: string): string {
  const m = voiceId.match(/^([a-z]{2}-[A-Z]{2})/)
  return m ? m[1] : 'es-MX'
}

function pickLocalVoice(locale: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  const lang = locale.slice(0, 2)
  const exact = voices.filter(
    (v) => v.lang.replace('_', '-').toLowerCase() === locale.toLowerCase()
  )
  const same = voices.filter((v) => v.lang.toLowerCase().startsWith(lang))
  const pool = exact.length ? exact : same.length ? same : voices
  if (!pool.length) return null
  // Prefer natural/neural voices if Windows has them installed
  return pool.find((v) => /natural|neural|online/i.test(v.name)) ?? pool[0]
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

export interface Narrator {
  state: NarratorState
  segments: Segment[]
  toggle: () => void
  pause: () => void
  play: () => void
  startAt: (token: number) => void
  seekToToken: (token: number) => void
  skipSegment: (dir: 1 | -1) => void
}

export function useNarrator(
  tokens: Token[],
  bookId: string,
  voice: VoiceSettings,
  speed: number,
  enabled: boolean,
  onPosition: (token: number) => void,
  engine: NarratorEngine = 'auto'
): Narrator {
  const segments = useMemo(() => buildSegments(tokens), [tokens])
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [segIndex, setSegIndex] = useState(0)
  const [token, setToken] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [local, setLocal] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const cache = useRef(new Map<string, Loaded>())
  const inflight = useRef(new Map<string, Promise<Loaded>>())
  const segRef = useRef(0)
  const playingRef = useRef(false)
  const tokenRef = useRef(0)
  const generation = useRef(0)
  const playSegmentRef = useRef<(index: number, fromToken?: number) => Promise<void>>(
    async () => {}
  )

  const rate = Math.round(voice.rate + (speed - 1) * 100)
  const voiceKey = `${voice.voice}|${rate}|${voice.pitch}`

  const load = useCallback(
    (seg: Segment): Promise<Loaded> => {
      const key = `${voiceKey}#${seg.index}`
      const hit = cache.current.get(key)
      if (hit) return Promise.resolve(hit)
      const pending = inflight.current.get(key)
      if (pending) return pending
      const p = window.api
        .ttsSynth({
          text: seg.text,
          voice: voice.voice,
          rate,
          pitch: voice.pitch,
          bookId,
          segment: seg.index
        })
        .then((r) => {
          const blob = new Blob([r.audio as BlobPart], { type: 'audio/mpeg' })
          const loaded: Loaded = {
            url: URL.createObjectURL(blob),
            marks: alignWords(tokens, seg, r.words)
          }
          cache.current.set(key, loaded)
          inflight.current.delete(key)
          return loaded
        })
        .catch((e) => {
          inflight.current.delete(key)
          throw e
        })
      inflight.current.set(key, p)
      return p
    },
    [voiceKey, voice.voice, voice.pitch, rate, bookId, tokens]
  )

  const prefetch = useCallback(
    (from: number) => {
      for (let i = from + 1; i <= from + 2 && i < segments.length; i++) {
        void load(segments[i]).catch(() => undefined)
      }
    },
    [segments, load]
  )

  // Windows voices through the Web Speech API: no internet, no external service
  const speakLocal = useCallback(
    (index: number, fromToken: number | undefined, gen: number) => {
      const seg = segments[index]
      const synth = window.speechSynthesis
      synth.cancel()
      const from = fromToken !== undefined ? clamp(fromToken, seg.start, seg.end - 1) : seg.start
      const starts: number[] = []
      const words: string[] = []
      let pos = 0
      for (let i = from; i < seg.end; i++) {
        const w = tokens[i].text
        starts.push(pos)
        words.push(w)
        pos += w.length + 1
      }
      const u = new SpeechSynthesisUtterance(words.join(' '))
      const locale = localeOf(voice.voice)
      u.lang = locale
      const v = pickLocalVoice(locale)
      if (v) u.voice = v
      u.rate = clamp(1 + rate / 100, 0.5, 2)
      u.pitch = clamp(1 + voice.pitch / 50, 0.5, 2)
      tokenRef.current = from
      setToken(from)
      setLocal(true)
      setLoading(false)
      u.onboundary = (e) => {
        if (gen !== generation.current) return
        if (e.name && e.name !== 'word') return
        let idx = 0
        while (idx + 1 < starts.length && starts[idx + 1] <= e.charIndex) idx++
        const cur = from + idx
        if (cur !== tokenRef.current) {
          tokenRef.current = cur
          setToken(cur)
        }
      }
      u.onend = () => {
        if (gen !== generation.current) return
        onPosition(seg.end)
        if (!playingRef.current) return
        if (index + 1 < segments.length) void playSegmentRef.current(index + 1)
        else {
          setPlaying(false)
          playingRef.current = false
        }
      }
      u.onerror = (e) => {
        if (gen !== generation.current) return
        if (e.error === 'interrupted' || e.error === 'canceled') return
        setError('No se pudo usar la voz local de Windows')
        setPlaying(false)
        playingRef.current = false
      }
      synth.speak(u)
    },
    [segments, tokens, voice.voice, voice.pitch, rate, onPosition]
  )

  const getAudio = (): HTMLAudioElement => {
    if (!audioRef.current) {
      const a = new Audio()
      a.preload = 'auto'
      audioRef.current = a
    }
    return audioRef.current
  }

  const playSegment = useCallback(
    async (index: number, fromToken?: number) => {
      const gen = ++generation.current
      const seg = segments[index]
      if (!seg) {
        setPlaying(false)
        playingRef.current = false
        return
      }
      segRef.current = index
      setSegIndex(index)
      setError(null)
      setLoading(true)
      if (engine === 'local' && localAvailable()) {
        speakLocal(index, fromToken, gen)
        prefetch(index)
        return
      }
      let loaded: Loaded
      try {
        loaded = await load(seg)
      } catch (e) {
        if (gen !== generation.current) return
        if (engine === 'auto' && localAvailable()) {
          speakLocal(index, fromToken, gen)
          return
        }
        setLoading(false)
        setPlaying(false)
        playingRef.current = false
        setError(e instanceof Error ? e.message : 'No se pudo generar la voz')
        return
      }
      if (gen !== generation.current) return
      setLoading(false)
      setLocal(false)
      const audio = getAudio()
      audio.src = loaded.url
      const startMark =
        fromToken !== undefined ? loaded.marks.filter((m) => m.token <= fromToken).pop() : undefined
      audio.currentTime = startMark ? startMark.at / 1000 : 0
      tokenRef.current = fromToken ?? seg.start
      setToken(tokenRef.current)

      const sync = (): void => {
        if (gen !== generation.current) return
        const ms = audio.currentTime * 1000
        let cur = seg.start
        for (const m of loaded.marks) {
          if (m.at <= ms + 40) cur = m.token
          else break
        }
        if (cur !== tokenRef.current) {
          tokenRef.current = cur
          setToken(cur)
        }
        if (!audio.paused && !audio.ended) requestAnimationFrame(sync)
      }
      audio.onplaying = () => requestAnimationFrame(sync)
      audio.onended = () => {
        onPosition(seg.end)
        if (!playingRef.current) return
        if (index + 1 < segments.length) void playSegmentRef.current(index + 1)
        else {
          setPlaying(false)
          playingRef.current = false
        }
      }
      try {
        await audio.play()
      } catch (e) {
        if (gen !== generation.current) return
        const name = e instanceof Error ? e.name : ''
        if (name !== 'AbortError') {
          setError(`No se pudo reproducir el audio (${name || 'error'})`)
          setPlaying(false)
          playingRef.current = false
        }
      }
      prefetch(index)
    },
    [segments, load, prefetch, onPosition, engine, speakLocal]
  )

  useEffect(() => {
    playSegmentRef.current = playSegment
  }, [playSegment])

  const play = useCallback(() => {
    if (!segments.length) return
    playingRef.current = true
    setPlaying(true)
    void playSegment(segRef.current, tokenRef.current)
  }, [segments.length, playSegment])

  const pause = useCallback(() => {
    playingRef.current = false
    setPlaying(false)
    generation.current++
    audioRef.current?.pause()
    if (localAvailable()) window.speechSynthesis.cancel()
    onPosition(tokenRef.current)
  }, [onPosition])

  const toggle = useCallback(() => {
    if (playingRef.current) pause()
    else play()
  }, [pause, play])

  const startAt = useCallback(
    (t: number) => {
      const idx = segmentAt(segments, t)
      segRef.current = idx
      tokenRef.current = t
      setSegIndex(idx)
      setToken(t)
      prefetch(idx - 1)
    },
    [segments, prefetch]
  )

  const seekToToken = useCallback(
    (t: number) => {
      const idx = segmentAt(segments, t)
      segRef.current = idx
      tokenRef.current = t
      setSegIndex(idx)
      setToken(t)
      if (playingRef.current) void playSegment(idx, t)
      else onPosition(t)
    },
    [segments, playSegment, onPosition]
  )

  const skipSegment = useCallback(
    (dir: 1 | -1) => {
      const idx = Math.max(0, Math.min(segments.length - 1, segRef.current + dir))
      seekToToken(segments[idx].start)
    },
    [segments, seekToToken]
  )

  // Voice or speed changed: drop generated audio and restart the current segment if playing
  useEffect(() => {
    for (const l of cache.current.values()) URL.revokeObjectURL(l.url)
    cache.current.clear()
    inflight.current.clear()
    if (playingRef.current) void playSegment(segRef.current, tokenRef.current)
  }, [voiceKey, engine, playSegment])

  useEffect(() => {
    if (enabled) return
    playingRef.current = false
    generation.current++
    audioRef.current?.pause()
    if (localAvailable()) window.speechSynthesis.cancel()
    const id = setTimeout(() => setPlaying(false), 0)
    return () => clearTimeout(id)
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (tag === 'BUTTON' && e.code === 'Space')) return
      if (e.code === 'Space') {
        e.preventDefault()
        toggle()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        skipSegment(-1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        skipSegment(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, toggle, skipSegment])

  useEffect(() => {
    const cacheMap = cache.current
    // warm the local voice list (Chromium fills it asynchronously)
    if (localAvailable()) window.speechSynthesis.getVoices()
    return () => {
      audioRef.current?.pause()
      if (localAvailable()) window.speechSynthesis.cancel()
      for (const l of cacheMap.values()) URL.revokeObjectURL(l.url)
      cacheMap.clear()
    }
  }, [])

  return {
    state: { playing, loading, segIndex, token, error, local },
    segments,
    toggle,
    pause,
    play,
    startAt,
    seekToToken,
    skipSegment
  }
}
