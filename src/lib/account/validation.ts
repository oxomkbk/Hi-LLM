import { isUuid } from '../uuid'

export interface AccountProfileInput {
  avatarFileId: string | null
  bio: string | null
  name: string
  website: string | null
}

export class AccountProfileValidationError extends Error {}

export function parseAccountProfileInput(value: unknown): AccountProfileInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AccountProfileValidationError('个人资料格式无效')
  const input = value as Record<string, unknown>
  const name = readText(input.name, 100, '显示名称', true)
  const bio = readText(input.bio, 280, '个人简介') || null
  const websiteInput = readText(input.website, 2_048, '个人网站')
  let website: string | null = null
  if (websiteInput) {
    try {
      const url = new URL(websiteInput)
      if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443'))
        throw new Error('invalid website')
      website = url.toString()
    }
    catch {
      throw new AccountProfileValidationError('个人网站必须是有效的 HTTPS 地址')
    }
  }
  const avatarFileId = input.avatarFileId == null || input.avatarFileId === ''
    ? null
    : readText(input.avatarFileId, 36, '头像编号', true)
  if (avatarFileId && !isUuid(avatarFileId))
    throw new AccountProfileValidationError('头像编号无效')
  return { avatarFileId, bio, name, website }
}

function readText(value: unknown, maxLength: number, label: string, required = false) {
  value ??= ''
  if (typeof value !== 'string')
    throw new AccountProfileValidationError(`${label}格式无效`)
  const result = value.trim()
  if (required && !result)
    throw new AccountProfileValidationError(`请填写${label}`)
  if (result.length > maxLength)
    throw new AccountProfileValidationError(`${label}不能超过 ${maxLength} 个字符`)
  return result
}
