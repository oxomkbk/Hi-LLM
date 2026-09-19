import { profileThemeStyle } from '@/lib/account/profile-theme'

import futureStyles from './profile-theme-futures.module.css'
import sceneStyles from './profile-theme-scenes.module.css'
import themeStyles from './profile-theme.module.css'

import type { ProfileAppearancePreset } from '@/lib/account/appearance'
import type { ReactNode } from 'react'

export function ProfileThemeScope({
  children,
  className = '',
  preset,
  variant = 'page',
}: {
  children: ReactNode
  className?: string
  preset: ProfileAppearancePreset
  variant?: 'page' | 'preview'
}) {
  return (
    <div
      data-profile-preset={preset}
      data-profile-theme-variant={variant}
      className={`${themeStyles.scope} ${sceneStyles.scene} ${futureStyles.futureScene} ${variant === 'page' ? themeStyles.page : themeStyles.preview} ${className}`}
      style={profileThemeStyle(preset)}
    >
      {variant === 'page'
        ? (
            <span aria-hidden="true" className={`${themeStyles.pageAtmosphere} ${sceneStyles.atmosphere} ${futureStyles.futureAtmosphere}`}>
              <i />
              <i />
              <i />
            </span>
          )
        : null}
      {children}
    </div>
  )
}
