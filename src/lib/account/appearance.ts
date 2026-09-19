import { isUuid } from '../uuid'

export const PROFILE_APPEARANCE_PRESETS = [
  'apple-studio',
  'spatial-orbit',
  'sea-glass',
  'quantum-core',
  'carbon-forge',
  'polar-signal',
  'neon-district',
  'terminal-zero',
  'lime-air',
  'daybreak',
  'peach-haze',
  'sakura-silk',
  'candy-cloud',
  'wisteria-dusk',
  'lacquer-gold',
] as const
export const PROFILE_BACKGROUND_FITS = ['cover', 'contain', 'custom'] as const

export interface ProfileAppearance {
  backgroundFileId: string | null
  backgroundUrl: string | null
  fit: ProfileBackgroundFit
  height: number
  opacity: number
  positionX: number
  positionY: number
  preset: ProfileAppearancePreset
  scale: number
}

export type ProfileAppearanceInput = Omit<ProfileAppearance, 'backgroundUrl'>
export type ProfileAppearancePreset = typeof PROFILE_APPEARANCE_PRESETS[number]
export type ProfileBackgroundFit = typeof PROFILE_BACKGROUND_FITS[number]

export const DEFAULT_PROFILE_APPEARANCE: ProfileAppearance = {
  backgroundFileId: null,
  backgroundUrl: null,
  fit: 'cover',
  height: 300,
  opacity: 55,
  positionX: 50,
  positionY: 50,
  preset: 'apple-studio',
  scale: 100,
}

export class ProfileAppearanceValidationError extends Error {}

export function isProfileAppearancePreset(value: unknown): value is ProfileAppearancePreset {
  return typeof value === 'string' && PROFILE_APPEARANCE_PRESETS.includes(value as ProfileAppearancePreset)
}

export function parseProfileAppearanceInput(value: unknown): ProfileAppearanceInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ProfileAppearanceValidationError('主页外观格式无效')
  const input = value as Record<string, unknown>
  const preset = readEnum(input.preset, PROFILE_APPEARANCE_PRESETS, '主页主题')
  const fit = readEnum(input.fit, PROFILE_BACKGROUND_FITS, '图片显示方式')
  const backgroundFileId = input.backgroundFileId == null || input.backgroundFileId === ''
    ? null
    : String(input.backgroundFileId)
  if (backgroundFileId && !isUuid(backgroundFileId))
    throw new ProfileAppearanceValidationError('背景图片编号无效')

  return {
    backgroundFileId,
    fit,
    height: readInteger(input.height, 180, 520, '封面高度'),
    opacity: readInteger(input.opacity, 0, 100, '图片透明度'),
    positionX: readInteger(input.positionX, 0, 100, '水平焦点'),
    positionY: readInteger(input.positionY, 0, 100, '垂直焦点'),
    preset,
    scale: fit === 'custom' ? readInteger(input.scale, 50, 200, '图片缩放') : 100,
  }
}

function readEnum<T extends readonly string[]>(value: unknown, values: T, label: string): T[number] {
  if (typeof value !== 'string' || !values.includes(value))
    throw new ProfileAppearanceValidationError(`${label}无效`)
  return value as T[number]
}

function readInteger(value: unknown, min: number, max: number, label: string) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
    throw new ProfileAppearanceValidationError(`${label}必须在 ${min}–${max} 之间`)
  return value
}
