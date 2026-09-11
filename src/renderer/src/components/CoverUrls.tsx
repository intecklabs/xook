import Atmosphere from './Atmosphere'
import { useCoverUrl } from '../lib/platform'
import type { UniverseTheme } from '../lib/types'

// Small helpers so list items can resolve stored images through the platform layer

export function SampleCover({ id }: { id: string }): React.JSX.Element | null {
  const url = useCoverUrl('book', id)
  if (!url) return null
  return <img src={url} alt="" loading="lazy" draggable={false} />
}

export function UniverseArt({
  id,
  theme,
  hasImage,
  version = 0,
  intensity,
  animate,
  className
}: {
  id: string
  theme: UniverseTheme
  hasImage: boolean
  version?: number
  intensity?: number
  animate?: boolean
  className?: string
}): React.JSX.Element {
  const url = useCoverUrl('universe', id, version)
  return (
    <Atmosphere
      theme={theme}
      image={hasImage ? url : undefined}
      intensity={intensity}
      animate={animate}
      className={className}
    />
  )
}
