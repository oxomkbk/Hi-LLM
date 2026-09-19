import { ProfileThemeArtwork } from './profile-theme-artwork'
import themeStyles from './profile-theme.module.css'

import type { ProfileAppearance } from '@/lib/account/appearance'
import type { CSSProperties, ReactNode } from 'react'

type BackdropProperties = CSSProperties & {
  '--profile-artwork-opacity': string
  '--profile-backdrop-height': string
  '--profile-image-opacity': string
  '--profile-wash-opacity': string
}

export function ProfileBackdrop({
  appearance,
  children,
  className = '',
  imageUrl = appearance.backgroundUrl,
  variant = 'page',
}: {
  appearance: ProfileAppearance
  children: ReactNode
  className?: string
  imageUrl?: string | null
  variant?: 'page' | 'preview'
}) {
  const hasVisibleImage = Boolean(imageUrl && appearance.opacity > 0)
  const imageProgress = imageUrl ? appearance.opacity / 100 : 0
  const backdropStyle: BackdropProperties = {
    '--profile-artwork-opacity': String(1 - imageProgress * 0.56),
    '--profile-backdrop-height': `${appearance.height}px`,
    '--profile-image-opacity': String(imageProgress),
    '--profile-wash-opacity': String(1 - imageProgress * 0.3),
  }
  const backgroundSize = appearance.fit === 'custom'
    ? `${appearance.scale}% auto`
    : appearance.fit
  const imageStyle: CSSProperties | undefined = hasVisibleImage
    ? {
        backgroundImage: `url(${JSON.stringify(imageUrl)})`,
        backgroundPosition: `${appearance.positionX}% ${appearance.positionY}%`,
        backgroundSize,
      }
    : undefined

  return (
    <section
      data-has-image={hasVisibleImage ? 'true' : 'false'}
      data-profile-backdrop=""
      data-profile-preset={appearance.preset}
      data-variant={variant}
      className={`${themeStyles.backdrop} ${className}`}
      style={backdropStyle}
    >
      {hasVisibleImage ? <span aria-hidden="true" data-backdrop-layer="image" className={themeStyles.backdropImage} style={imageStyle} /> : null}
      <span aria-hidden="true" data-backdrop-layer="wash" className={themeStyles.backdropWash} />
      <ProfileThemeArtwork preset={appearance.preset} className={themeStyles.backdropArtwork} />
      <span aria-hidden="true" data-backdrop-layer="protection" className={themeStyles.backdropProtection} />
      <div data-profile-content="" className={themeStyles.backdropContent}>{children}</div>
    </section>
  )
}
