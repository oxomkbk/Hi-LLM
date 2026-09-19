import { AiSecurityError } from '../errors'
import { isGitSourceConnectionError } from './git-provider'

export function shouldUsePlatformFallbackForSourceError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError')
    return false
  if (isGitSourceConnectionError(error))
    return true
  return error instanceof AiSecurityError
    && ['SECURITY_SOURCE_INVALID', 'SOURCE_LIMIT_EXCEEDED'].includes(error.code)
}
