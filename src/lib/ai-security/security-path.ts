import { AiSecurityError } from './errors'

export function normalizeSecurityPath(input: string) {
  const normalized = input.normalize('NFC').replaceAll('\\', '/')
  if (!normalized || normalized.includes('\0') || normalized.startsWith('/') || /^[a-z]:\//i.test(normalized))
    throw new AiSecurityError('SECURITY_INVALID_PATH', 'Path must be a non-empty relative path')

  const segments = normalized.split('/')
  if (segments.some(segment => !segment || segment === '.' || segment === '..'))
    throw new AiSecurityError('SECURITY_INVALID_PATH', 'Path contains an unsafe segment')

  return segments.join('/')
}
