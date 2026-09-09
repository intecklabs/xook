import { useMemo, useState } from 'react'
import { useStore } from '../store'
import Icon from './Icon'
import { normalizeText } from '../lib/formats'
import type { Token } from '../lib/types'

interface Props {
  tokens: Token[]
  onClose: () => void
  onSeek: (token: number) => void
}

interface Para {
  start: number
  chapter: number
  text: string
  norm: string
}

export default function BookSearchPanel({ tokens, onClose, onSeek }: Props): React.JSX.Element {
  const chapters = useStore((s) => s.current?.text.chapters ?? [])
  const [q, setQ] = useState('')

  const paras = useMemo(() => {
    const out: Para[] = []
    let cur: Para | null = null
    let key = ''
    tokens.forEach((t, i) => {
      const k = `${t.chapter}:${t.paragraph}`
      if (k !== key) {
        if (cur) {
          cur.norm = normalizeText(cur.text)
          out.push(cur)
        }
        cur = { start: i, chapter: t.chapter, text: t.text, norm: '' }
        key = k
      } else if (cur) cur.text += ' ' + t.text
    })
    if (cur) {
      const c = cur as Para
      c.norm = normalizeText(c.text)
      out.push(c)
    }
    return out
  }, [tokens])

  const results = useMemo(() => {
    const nq = normalizeText(q.trim())
    if (nq.length < 2) return []
    const terms = nq.split(/\s+/)
    const hits: { para: Para; snippet: string }[] = []
    for (const p of paras) {
      if (!terms.every((t) => p.norm.includes(t))) continue
      const idx = p.norm.indexOf(terms[0])
      const s = Math.max(0, idx - 70)
      const e = Math.min(p.text.length, idx + 90)
      hits.push({
        para: p,
        snippet: (s > 0 ? '…' : '') + p.text.slice(s, e) + (e < p.text.length ? '…' : '')
      })
      if (hits.length >= 200) break
    }
    return hits
  }, [paras, q])

  return (
    <aside className="settings book-search">
      <div className="settings-head">
        <strong>Buscar en el libro</strong>
        <button className="icon" onClick={onClose}>
          <Icon name="x" size={18} />
        </button>
      </div>
      <div className="searchbox-input">
        <span className="searchbox-icon">
          <Icon name="search" />
        </span>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Palabra o frase…"
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'Enter' && results[0]) onSeek(results[0].para.start)
          }}
        />
      </div>
      <div className="muted small">
        {q.trim().length < 2 ? 'Escribe al menos 2 letras' : `${results.length} resultados`}
      </div>
      <div className="book-search-list">
        {results.map((r, i) => (
          <button key={i} className="sr-hit" onClick={() => onSeek(r.para.start)}>
            <span className="sr-hit-chapter">{chapters[r.para.chapter]?.title}</span>
            <span className="sr-hit-snippet">{r.snippet}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}
