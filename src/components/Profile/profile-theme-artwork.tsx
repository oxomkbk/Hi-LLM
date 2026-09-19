import collectionStyles from './profile-theme-artwork-collection.module.css'
import futureStyles from './profile-theme-artwork-futures.module.css'
import styles from './profile-theme-artwork.module.css'

import type { ProfileAppearancePreset } from '@/lib/account/appearance'

export function ProfileThemeArtwork({
  className = '',
  preset,
  variant = 'cover',
}: {
  className?: string
  preset: ProfileAppearancePreset
  variant?: 'cover' | 'thumbnail'
}) {
  return (
    <span
      aria-hidden="true"
      data-art-preset={preset}
      data-art-variant={variant}
      className={`${styles.artwork} ${collectionStyles.collection} ${futureStyles.futures} ${className}`}
    >
      <i data-theme-layer="one" className={styles.layerOne} />
      <i data-theme-layer="two" className={styles.layerTwo} />
      <i data-theme-layer="three" className={styles.layerThree} />
      <i data-theme-layer="glint" className={styles.glint} />
    </span>
  )
}
