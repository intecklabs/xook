import { useEffect, useRef } from 'react'
import type { UniverseTheme } from '../lib/types'

interface Props {
  theme: UniverseTheme
  image?: string
  intensity?: number
  className?: string
  animate?: boolean
}

interface Particle {
  x: number
  y: number
  r: number
  vx: number
  vy: number
  a: number
  phase: number
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

export default function Atmosphere({
  theme,
  image,
  intensity = 1,
  className = '',
  animate = true
}: Props): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduce = !animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let w = 0
    let h = 0
    let particles: Particle[] = []
    let t = 0

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect()
      w = canvas.width = Math.max(1, Math.floor(rect.width))
      h = canvas.height = Math.max(1, Math.floor(rect.height))
      seed()
    }

    const seed = (): void => {
      const n = Math.round(
        (theme.preset === 'scifi' ? 220 : theme.preset === 'eldritch' ? 14 : 70) * intensity
      )
      particles = Array.from({ length: n }, () => make())
    }

    const make = (): Particle => {
      const p = theme.preset
      const base: Particle = {
        x: Math.random() * w,
        y: Math.random() * h,
        r: 1,
        vx: 0,
        vy: 0,
        a: Math.random(),
        phase: Math.random() * Math.PI * 2
      }
      switch (p) {
        case 'eldritch':
          return {
            ...base,
            r: 120 + Math.random() * 220,
            vx: (Math.random() - 0.5) * 0.15,
            vy: (Math.random() - 0.5) * 0.1,
            a: 0.05 + Math.random() * 0.08
          }
        case 'fantasy':
          return {
            ...base,
            r: 1 + Math.random() * 2.5,
            vx: (Math.random() - 0.5) * 0.2,
            vy: -(0.1 + Math.random() * 0.35),
            a: 0.3 + Math.random() * 0.6
          }
        case 'scifi':
          return {
            ...base,
            r: 0.4 + Math.random() * 1.4,
            vx: 0,
            vy: 0.02 + Math.random() * 0.08,
            a: 0.3 + Math.random() * 0.7
          }
        case 'gothic':
          return {
            ...base,
            r: 1 + Math.random() * 2,
            vx: (Math.random() - 0.5) * 0.3,
            vy: 0.15 + Math.random() * 0.35,
            a: 0.2 + Math.random() * 0.5
          }
        case 'mystery':
          return {
            ...base,
            r: 8 + Math.random() * 16,
            vx: -0.6,
            vy: 6 + Math.random() * 5,
            a: 0.12 + Math.random() * 0.2
          }
        case 'ocean':
          return {
            ...base,
            r: 1 + Math.random() * 2,
            vx: (Math.random() - 0.5) * 0.1,
            vy: -(0.05 + Math.random() * 0.15),
            a: 0.2 + Math.random() * 0.4
          }
        case 'desert':
          return {
            ...base,
            r: 0.6 + Math.random() * 1.6,
            vx: 0.3 + Math.random() * 0.5,
            vy: (Math.random() - 0.5) * 0.1,
            a: 0.15 + Math.random() * 0.4
          }
        default:
          return {
            ...base,
            r: 0.6 + Math.random() * 1.5,
            vx: (Math.random() - 0.5) * 0.08,
            vy: (Math.random() - 0.5) * 0.08,
            a: 0.15 + Math.random() * 0.35
          }
      }
    }

    const draw = (): void => {
      t += 1
      ctx.clearRect(0, 0, w, h)
      const p = theme.preset
      const accent = theme.accent

      if (p === 'scifi') {
        ctx.strokeStyle = rgba(accent, 0.06)
        ctx.lineWidth = 1
        const step = 80
        const off = (t * 0.3) % step
        for (let y = h * 0.55; y < h; y += step * ((y - h * 0.5) / h + 0.4)) {
          ctx.beginPath()
          ctx.moveTo(0, y + off * ((y - h * 0.5) / h))
          ctx.lineTo(w, y + off * ((y - h * 0.5) / h))
          ctx.stroke()
        }
      }
      if (p === 'ocean') {
        for (let i = 0; i < 4; i++) {
          ctx.beginPath()
          ctx.strokeStyle = rgba(accent, 0.08 - i * 0.015)
          ctx.lineWidth = 2
          const baseY = h * (0.55 + i * 0.11)
          for (let x = 0; x <= w; x += 8) {
            const y =
              baseY + Math.sin(x * 0.012 + t * 0.012 + i) * 14 + Math.sin(x * 0.03 - t * 0.02) * 5
            if (x === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.stroke()
        }
      }

      for (const q of particles) {
        q.x += q.vx * intensity
        q.y += q.vy * intensity
        if (q.x < -q.r) q.x = w + q.r
        if (q.x > w + q.r) q.x = -q.r
        if (q.y < -q.r) q.y = h + q.r
        if (q.y > h + q.r) q.y = -q.r
        const tw = 0.6 + 0.4 * Math.sin(t * 0.03 + q.phase)

        if (p === 'eldritch') {
          const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.r)
          g.addColorStop(0, rgba(accent, q.a * tw))
          g.addColorStop(1, rgba(accent, 0))
          ctx.fillStyle = g
          ctx.fillRect(q.x - q.r, q.y - q.r, q.r * 2, q.r * 2)
        } else if (p === 'mystery') {
          ctx.strokeStyle = rgba(accent, q.a)
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(q.x, q.y)
          ctx.lineTo(q.x + q.vx * 2, q.y + q.r)
          ctx.stroke()
        } else {
          ctx.fillStyle = rgba(p === 'gothic' ? '#c9c9c9' : accent, q.a * tw)
          ctx.beginPath()
          ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2)
          ctx.fill()
          if (p === 'fantasy' && q.r > 2) {
            const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.r * 4)
            g.addColorStop(0, rgba(accent, 0.25 * tw))
            g.addColorStop(1, rgba(accent, 0))
            ctx.fillStyle = g
            ctx.fillRect(q.x - q.r * 4, q.y - q.r * 4, q.r * 8, q.r * 8)
          }
        }
      }
      if (!reduce) raf = requestAnimationFrame(draw)
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    draw()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [theme.preset, theme.accent, intensity, animate])

  const bg = `radial-gradient(120% 90% at 50% 0%, ${theme.bg2} 0%, ${theme.bg1} 70%)`
  return (
    <div className={`atmosphere ${className}`} style={{ background: bg }}>
      {image && <div className="atmosphere-image" style={{ backgroundImage: `url(${image})` }} />}
      <canvas ref={canvasRef} className="atmosphere-canvas" />
      <div className="atmosphere-vignette" />
    </div>
  )
}
