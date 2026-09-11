// Offline text-to-speech with the voices installed on the device. The default provider is the
// browser's Web Speech API (Windows/Electron); the mobile layer registers a native provider
// because the Android WebView has no speechSynthesis.

export interface LocalSpeakRequest {
  text: string
  lang: string
  rate: number // 1 = normal
  pitch: number // 1 = normal
  onBoundary: (charIndex: number) => void
  onEnd: () => void
  onError: (message: string) => void
}

export interface LocalTts {
  available: () => boolean
  speak: (req: LocalSpeakRequest) => void
  cancel: () => void
  warmUp?: () => void
}

function pickWebVoice(locale: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  const lang = locale.slice(0, 2)
  const exact = voices.filter(
    (v) => v.lang.replace('_', '-').toLowerCase() === locale.toLowerCase()
  )
  const same = voices.filter((v) => v.lang.toLowerCase().startsWith(lang))
  const pool = exact.length ? exact : same.length ? same : voices
  if (!pool.length) return null
  // Prefer natural/neural voices if the OS has them installed
  return pool.find((v) => /natural|neural|online/i.test(v.name)) ?? pool[0]
}

const webSpeech: LocalTts = {
  available: () => typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined',
  warmUp: () => window.speechSynthesis.getVoices(),
  cancel: () => window.speechSynthesis.cancel(),
  speak: (req) => {
    const synth = window.speechSynthesis
    synth.cancel()
    const u = new SpeechSynthesisUtterance(req.text)
    u.lang = req.lang
    const v = pickWebVoice(req.lang)
    if (v) u.voice = v
    u.rate = req.rate
    u.pitch = req.pitch
    u.onboundary = (e) => {
      if (e.name && e.name !== 'word') return
      req.onBoundary(e.charIndex)
    }
    u.onend = () => req.onEnd()
    u.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') return
      req.onError('No se pudo usar la voz local del sistema')
    }
    synth.speak(u)
  }
}

let provider: LocalTts = webSpeech

export function setLocalTts(p: LocalTts): void {
  provider = p
}

export const localTts: LocalTts = {
  available: () => provider.available(),
  speak: (req) => provider.speak(req),
  cancel: () => provider.cancel(),
  warmUp: () => provider.warmUp?.()
}
