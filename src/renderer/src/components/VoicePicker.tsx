import { useEffect, useRef, useState } from 'react'
import type { VoiceInfo } from '../../../preload'
import { useStore } from '../store'
import { CURATED, suggestVoice, voiceLabel } from '../lib/voices'
import type { AtmosphereEffect, VoiceSettings } from '../lib/types'
import Icon from './Icon'

interface Props {
  bookId: string
  current: VoiceSettings
  lang: 'es' | 'en'
  preset?: AtmosphereEffect
  sampleText: string
  onClose: () => void
  globalOnly?: boolean
}

const AVATAR_COLORS = [
  ['#f97316', '#c2410c'],
  ['#0ea5e9', '#0369a1'],
  ['#a855f7', '#6b21a8'],
  ['#22c55e', '#15803d'],
  ['#ec4899', '#9d174d'],
  ['#eab308', '#a16207'],
  ['#14b8a6', '#0f766e'],
  ['#ef4444', '#991b1b']
]

interface VoiceCardData {
  id: string
  name: string
  country: string
  gender: 'F' | 'M'
  style?: string
}

function fromId(id: string): { country: string; name: string } {
  const m = id.match(/^[a-z]{2}-([A-Z]{2})-(.+?)(?:Multilingual)?Neural$/)
  return { country: m?.[1] ?? '', name: m?.[2] ?? id }
}

function avatarColor(id: string): [string, string] {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length] as [string, string]
}

export default function VoicePicker({
  bookId,
  current,
  lang,
  preset,
  sampleText,
  onClose,
  globalOnly = false
}: Props): React.JSX.Element {
  const updateBook = useStore((s) => s.updateBook)
  const updateSettings = useStore((s) => s.updateSettings)
  const bookHasOwnVoice = useStore((s) => s.current?.book.id === bookId && !!s.current.book.voice)
  const [tab, setTab] = useState<'es' | 'en' | 'all'>(lang)
  const [scope, setScope] = useState<'book' | 'all'>(
    bookHasOwnVoice && !globalOnly ? 'book' : 'all'
  )
  const [allVoices, setAllVoices] = useState<VoiceInfo[] | null>(null)
  const [rate, setRate] = useState(current.rate)
  const [pitch, setPitch] = useState(current.pitch)
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const suggested = suggestVoice(preset, lang)

  useEffect(() => {
    if (tab !== 'all' || allVoices) return
    let cancelled = false
    void window.api.ttsVoices().then((v) => {
      if (!cancelled) setAllVoices(v)
    })
    return () => {
      cancelled = true
    }
  }, [tab, allVoices])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      audioRef.current?.pause()
    }
  }, [onClose])

  const stopPreview = (): void => {
    audioRef.current?.pause()
    audioRef.current = null
    setPreviewing(null)
  }

  const preview = async (voice: string): Promise<void> => {
    if (previewing === voice) {
      stopPreview()
      return
    }
    stopPreview()
    setLoadingPreview(voice)
    try {
      const r = await window.api.ttsSynth({ text: sampleText, voice, rate, pitch })
      const blob = new Blob([r.audio as BlobPart], { type: 'audio/mpeg' })
      const a = new Audio(URL.createObjectURL(blob))
      audioRef.current = a
      a.onended = () => setPreviewing(null)
      setPreviewing(voice)
      await a.play()
    } catch {
      setPreviewing(null)
    } finally {
      setLoadingPreview(null)
    }
  }

  const apply = (voice: string): void => {
    const settings: VoiceSettings = { voice, rate, pitch }
    if (scope === 'book' && bookId) void updateBook(bookId, { voice: settings })
    else {
      updateSettings({ narrator: settings })
      if (bookId) void updateBook(bookId, { voice: null })
    }
    onClose()
  }

  const curatedCards: VoiceCardData[] = CURATED.filter((c) => c.lang === tab).map((c) => ({
    id: c.id,
    name: c.name,
    country: fromId(c.id).country,
    gender: c.gender,
    style: c.style
  }))
  const allCards: VoiceCardData[] = (allVoices ?? [])
    .filter((v) => /^(es|en|pt|fr|it|de)-/.test(v.locale))
    .sort((a, b) => a.locale.localeCompare(b.locale))
    .map((v) => ({
      id: v.shortName,
      name: fromId(v.shortName).name,
      country: v.locale.split('-')[1] ?? '',
      gender: v.gender === 'Female' ? 'F' : 'M'
    }))
  const cards = tab === 'all' ? allCards : curatedCards
  const suggestedCard: VoiceCardData = {
    id: suggested.voice,
    name: fromId(suggested.voice).name,
    country: fromId(suggested.voice).country,
    gender: CURATED.find((c) => c.id === suggested.voice)?.gender ?? 'F',
    style: CURATED.find((c) => c.id === suggested.voice)?.style
  }

  const card = (v: VoiceCardData, hero = false): React.JSX.Element => {
    const [c1, c2] = avatarColor(v.id)
    const active = current.voice === v.id
    const busy = loadingPreview === v.id
    const playing = previewing === v.id
    return (
      <div key={v.id} className={`vp-card ${active ? 'active' : ''} ${hero ? 'hero' : ''}`}>
        <button
          className={`vp-avatar ${playing ? 'playing' : ''}`}
          style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
          onClick={() => void preview(v.id)}
          title={playing ? 'Detener' : 'Escuchar muestra'}
          disabled={busy}
        >
          {busy ? (
            <span className="vp-spinner" />
          ) : playing ? (
            <span className="vp-eq">
              <i />
              <i />
              <i />
            </span>
          ) : (
            <span className="vp-play">
              <Icon name="play" size={18} />
            </span>
          )}
        </button>
        <div className="vp-body">
          <div className="vp-name">
            {v.name}
            <span className="vp-flag">{v.country}</span>
            <span className="vp-gender">{v.gender === 'F' ? '♀' : '♂'}</span>
          </div>
          {v.style ? (
            <div className="vp-style">{v.style}</div>
          ) : (
            <div className="vp-style muted">{voiceLabel(v.id)}</div>
          )}
        </div>
        <button className={`vp-use ${active ? 'primary' : ''}`} onClick={() => apply(v.id)}>
          {active ? 'En uso' : 'Usar'}
        </button>
      </div>
    )
  }

  const pct = (v: number, min: number, max: number): string => `${((v - min) / (max - min)) * 100}%`

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="overlay-card vp" onMouseDown={(e) => e.stopPropagation()}>
        <div className="vp-head">
          <div>
            <h2>Narrador</h2>
            <div className="muted small">
              Voces neuronales · toca el avatar para escuchar una muestra del libro
            </div>
          </div>
          <button className="icon" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="vp-scope" hidden={globalOnly}>
          <span className="small muted">Aplicar a</span>
          <div className="pill-tabs">
            <button className={scope === 'book' ? 'active' : ''} onClick={() => setScope('book')}>
              Este libro
            </button>
            <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>
              Todos los libros
            </button>
          </div>
        </div>

        <section className="vp-section">
          <div className="vp-section-title">
            {globalOnly ? 'Sugerida' : 'Sugerida para este universo'}
          </div>
          {card(suggestedCard, true)}
        </section>

        <section className="vp-section vp-sliders">
          <label className="slider">
            <div className="slider-head">
              <span>Ritmo</span>
              <strong>
                {rate > 0 ? '+' : ''}
                {rate}%
              </strong>
            </div>
            <input
              type="range"
              min={-30}
              max={40}
              value={rate}
              style={{ ['--pct' as string]: pct(rate, -30, 40) }}
              onChange={(e) => setRate(Number(e.target.value))}
            />
          </label>
          <label className="slider">
            <div className="slider-head">
              <span>Tono</span>
              <strong>
                {pitch > 0 ? '+' : ''}
                {pitch} Hz
              </strong>
            </div>
            <input
              type="range"
              min={-25}
              max={25}
              value={pitch}
              style={{ ['--pct' as string]: pct(pitch, -25, 25) }}
              onChange={(e) => setPitch(Number(e.target.value))}
            />
          </label>
        </section>

        <section className="vp-section">
          <div className="vp-section-row">
            <div className="vp-section-title">Voces</div>
            <div className="pill-tabs">
              <button className={tab === 'es' ? 'active' : ''} onClick={() => setTab('es')}>
                Español
              </button>
              <button className={tab === 'en' ? 'active' : ''} onClick={() => setTab('en')}>
                English
              </button>
              <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>
                Todas
              </button>
            </div>
          </div>
          <div className="vp-grid">
            {tab === 'all' && allVoices === null ? (
              <div className="muted small">Cargando voces…</div>
            ) : (
              cards.map((v) => card(v))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
