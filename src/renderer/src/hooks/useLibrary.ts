import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnnotationRow, BookRow, ListParams } from '../../../preload'
import { useStore } from '../store'
import { fromUniverseRow, type Universe } from '../lib/types'

export function useBooks(params: ListParams): { rows: BookRow[]; total: number; loading: boolean } {
  const version = useStore((s) => s.libraryVersion)
  const [state, setState] = useState<{ rows: BookRow[]; total: number; key: string }>({
    rows: [],
    total: 0,
    key: ''
  })
  const key = JSON.stringify(params) + '#' + version
  useEffect(() => {
    let cancelled = false
    void window.api.listBooks(params).then((r) => {
      if (!cancelled) setState({ ...r, key })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return { rows: state.rows, total: state.total, loading: state.key !== key }
}

export const PAGE = 60

// Windowed access to a sorted/filtered book list: only the pages near the viewport are loaded
export function usePagedBooks(params: Omit<ListParams, 'offset' | 'limit'>): {
  total: number
  get: (index: number) => BookRow | undefined
  ensure: (index: number) => void
  reset: number
} {
  const version = useStore((s) => s.libraryVersion)
  const key = JSON.stringify(params) + '#' + version
  // Pages are cached per key (params + library version), so a request started for the current
  // key can never be thrown away by a reset that runs a moment later.
  const store = useRef(new Map<string, { pages: Map<number, BookRow[]>; inflight: Set<number> }>())
  const [total, setTotal] = useState(0)
  const [tick, setTick] = useState(0)

  const load = useCallback(
    (page: number) => {
      let b = store.current.get(key)
      if (!b) {
        b = { pages: new Map(), inflight: new Set() }
        store.current.set(key, b)
      }
      const bucket = b
      if (bucket.pages.has(page) || bucket.inflight.has(page)) return
      bucket.inflight.add(page)
      void window.api.listBooks({ ...params, offset: page * PAGE, limit: PAGE }).then((r) => {
        bucket.inflight.delete(page)
        bucket.pages.set(page, r.rows)
        if (store.current.get(key) !== bucket) return
        setTotal(r.total)
        setTick((t) => t + 1)
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  )

  // Params or library changed: forget other keys and fetch the first page of this one
  useEffect(() => {
    for (const k of store.current.keys()) if (k !== key) store.current.delete(k)
    load(0)
  }, [key, load])

  const get = useCallback(
    (index: number): BookRow | undefined => {
      const page = Math.floor(index / PAGE)
      return store.current.get(key)?.pages.get(page)?.[index - page * PAGE]
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick, key]
  )
  const ensure = useCallback(
    (index: number) => {
      const page = Math.floor(Math.max(0, index) / PAGE)
      load(page)
      if (index % PAGE > PAGE - 15) load(page + 1)
      if (index % PAGE < 15 && page > 0) load(page - 1)
    },
    [load]
  )
  return { total, get, ensure, reset: tick }
}

export function useStats(): {
  books: number
  words: number
  sessions: number
  notes: number
  wpm: number | null
} {
  const version = useStore((s) => s.libraryVersion)
  const [stats, setStats] = useState({
    books: 0,
    words: 0,
    sessions: 0,
    notes: 0,
    wpm: null as number | null
  })
  useEffect(() => {
    let cancelled = false
    void window.api.stats().then((s) => {
      if (!cancelled) setStats(s)
    })
    return () => {
      cancelled = true
    }
  }, [version])
  return stats
}

export function useUniverses(
  q: string,
  limit: number
): { rows: Universe[]; total: number; more: () => void } {
  const version = useStore((s) => s.libraryVersion)
  const [rows, setRows] = useState<Universe[]>([])
  const [total, setTotal] = useState(0)
  const [pagesWanted, setPagesWanted] = useState(1)
  useEffect(() => {
    let cancelled = false
    void window.api.listUniverses(q || undefined, 0, limit * pagesWanted).then((r) => {
      if (cancelled) return
      setRows(r.rows.map(fromUniverseRow))
      setTotal(r.total)
    })
    return () => {
      cancelled = true
    }
  }, [q, limit, pagesWanted, version])
  const more = useCallback(() => setPagesWanted((p) => p + 1), [])
  return { rows, total, more }
}

export function useAllAnnotations(limit: number): {
  rows: (AnnotationRow & { title: string })[]
  total: number
  more: () => void
} {
  const version = useStore((s) => s.libraryVersion)
  const [rows, setRows] = useState<(AnnotationRow & { title: string })[]>([])
  const [total, setTotal] = useState(0)
  const [pagesWanted, setPagesWanted] = useState(1)
  useEffect(() => {
    let cancelled = false
    void window.api.allAnnotations(0, limit * pagesWanted).then((r) => {
      if (cancelled) return
      setRows(r.rows)
      setTotal(r.total)
    })
    return () => {
      cancelled = true
    }
  }, [limit, pagesWanted, version])
  const more = useCallback(() => setPagesWanted((p) => p + 1), [])
  return { rows, total, more }
}
