import { describe, expect, it } from 'vitest'

import { DEFAULT_PROFILE_APPEARANCE, parseProfileAppearanceInput } from './appearance'

const BACKGROUND_ID = 'b5dfbc7b-066d-44d6-aa52-f4a93dd6f10d'

describe('parseProfileAppearanceInput', () => {
  it('normalizes non-custom scale', () => {
    expect(parseProfileAppearanceInput({
      backgroundFileId: BACKGROUND_ID,
      fit: 'cover',
      height: 360,
      opacity: 65,
      positionX: 35,
      positionY: 60,
      preset: 'sea-glass',
      scale: 180,
    })).toEqual({
      backgroundFileId: BACKGROUND_ID,
      fit: 'cover',
      height: 360,
      opacity: 65,
      positionX: 35,
      positionY: 60,
      preset: 'sea-glass',
      scale: 100,
    })
  })

  it('accepts the default appearance', () => {
    expect(DEFAULT_PROFILE_APPEARANCE.preset).toBe('apple-studio')
    expect(parseProfileAppearanceInput(DEFAULT_PROFILE_APPEARANCE)).toEqual({
      ...DEFAULT_PROFILE_APPEARANCE,
      backgroundUrl: undefined,
    })
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
    'accepts the extended %s preset',
    (preset) => {
      expect(parseProfileAppearanceInput({ ...DEFAULT_PROFILE_APPEARANCE, preset }).preset).toBe(preset)
    },
  )

  it.each([
    ['unknown preset', { ...DEFAULT_PROFILE_APPEARANCE, preset: 'neon' }],
    ['unknown fit', { ...DEFAULT_PROFILE_APPEARANCE, fit: 'stretch' }],
    ['invalid background id', { ...DEFAULT_PROFILE_APPEARANCE, backgroundFileId: 'invalid' }],
    ['decimal opacity', { ...DEFAULT_PROFILE_APPEARANCE, opacity: 30.5 }],
    ['short height', { ...DEFAULT_PROFILE_APPEARANCE, height: 179 }],
    ['large scale', { ...DEFAULT_PROFILE_APPEARANCE, fit: 'custom', scale: 201 }],
  ])('rejects %s', (_label, input) => {
    expect(() => parseProfileAppearanceInput(input)).toThrow()
  })
})
