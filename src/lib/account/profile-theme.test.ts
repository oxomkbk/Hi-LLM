import { describe, expect, it } from 'vitest'

import { PROFILE_APPEARANCE_PRESETS } from './appearance'
import {
  PROFILE_THEME_TOKEN_KEYS,
  PROFILE_THEME_TOKENS,
  profileThemeStyle,
} from './profile-theme'

describe('profile themes', () => {
  it('keeps every persisted preset id and supplies complete light and dark tokens', () => {
    expect(Object.keys(PROFILE_THEME_TOKENS).sort()).toEqual([...PROFILE_APPEARANCE_PRESETS].sort())

    for (const preset of PROFILE_APPEARANCE_PRESETS) {
      const definition = PROFILE_THEME_TOKENS[preset]
      expect(definition.label.length).toBeGreaterThan(0)
      expect(definition.family.length).toBeGreaterThan(0)
      expect(Object.keys(definition.light).sort()).toEqual([...PROFILE_THEME_TOKEN_KEYS].sort())
      expect(Object.keys(definition.dark).sort()).toEqual([...PROFILE_THEME_TOKEN_KEYS].sort())
    }
  })

  it.each([
    'spatial-orbit',
    'quantum-core',
    'carbon-forge',
    'polar-signal',
    'neon-district',
    'terminal-zero',
    'sakura-silk',
    'candy-cloud',
    'wisteria-dusk',
    'lacquer-gold',
  ] as const)(
    'supports the extended %s scene across both color schemes',
    (preset) => {
      const definition = PROFILE_THEME_TOKENS[preset]
      expect(definition.description.length).toBeGreaterThan(12)
      expect(profileThemeStyle(preset)['--profile-light-accent']).toBe(definition.light.accent)
      expect(profileThemeStyle(preset)['--profile-dark-accent']).toBe(definition.dark.accent)
    },
  )

  it('only emits profile-scoped variables for both color schemes', () => {
    const style = profileThemeStyle('sea-glass') as Record<string, string>
    const keys = Object.keys(style)

    expect(keys.length).toBe(PROFILE_THEME_TOKEN_KEYS.length * 2)
    expect(keys.every(key => key.startsWith('--profile-light-') || key.startsWith('--profile-dark-'))).toBe(true)
    expect(keys.some(key => key === '--accent' || key === '--surface' || key === '--focus')).toBe(false)
  })

  it('uses a stable text support layer independent from image opacity', () => {
    for (const preset of PROFILE_APPEARANCE_PRESETS) {
      expect(readAlpha(PROFILE_THEME_TOKENS[preset].light.textSupport)).toBeGreaterThanOrEqual(0.88)
      expect(readAlpha(PROFILE_THEME_TOKENS[preset].dark.textSupport)).toBeGreaterThanOrEqual(0.88)
    }
  })
})

function readAlpha(value: string) {
  const match = value.match(/\/\s*(\d+)%/)
  if (!match)
    throw new Error(`缺少透明度：${value}`)
  return Number(match[1]) / 100
}
