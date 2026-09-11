import { useEffect, useState } from 'react'

// Where the UI is running. Electron exposes `window.electron` from the preload script;
// anything else (Capacitor on Android/iOS, a plain browser while developing) is "mobile".
export const IS_ELECTRON =
  typeof window !== 'undefined' && !!(window as { electron?: unknown }).electron
export const IS_MOBILE = !IS_ELECTRON

export type CoverKind = 'book' | 'universe'

// The mobile layer registers how to turn a cover id into something an <img> can load
export interface CoverUrlProvider {
  // Synchronous URL when the platform can serve local files directly (native Capacitor)
  sync?: (kind: CoverKind, id: string, version: number) => string | null
  // Asynchronous fallback (blob: URL read from storage)
  load?: (kind: CoverKind, id: string) => Promise<string | null>
}

let provider: CoverUrlProvider = {}

export function setCoverUrlProvider(p: CoverUrlProvider): void {
  provider = p
}

export function coverUrlSync(kind: CoverKind, id: string, version = 0): string | null {
  if (IS_ELECTRON) return `cover://${kind}/${id}?v=${version}`
  return provider.sync?.(kind, id, version) ?? null
}

// URL for a stored cover / universe image, or undefined while it loads or when there is none
export function useCoverUrl(kind: CoverKind, id: string, version = 0): string | undefined {
  const key = `${kind}/${id}#${version}`
  const sync = coverUrlSync(kind, id, version)
  const [loaded, setLoaded] = useState<{ key: string; url?: string } | null>(null)

  useEffect(() => {
    if (sync || !provider.load) return
    let cancelled = false
    void provider.load(kind, id).then((url) => {
      if (!cancelled) setLoaded({ key, url: url ?? undefined })
    })
    return () => {
      cancelled = true
    }
  }, [key, kind, id, sync])

  if (sync) return sync
  return loaded?.key === key ? loaded.url : undefined
}
