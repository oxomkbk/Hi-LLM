interface NormalizeCallbackOptions {
  fallback?: string
  origin?: string
}

export function createLoginUrl(callbackUrl: string, extra?: Record<string, string>) {
  const params = new URLSearchParams({ callbackURL: normalizeAuthCallbackUrl(callbackUrl) })
  for (const [key, value] of Object.entries(extra ?? {}))
    params.set(key, value)
  return `/login?${params.toString()}`
}

export function normalizeAuthCallbackUrl(
  value: unknown,
  options: NormalizeCallbackOptions = {},
) {
  const fallback = options.fallback ?? '/'
  if (typeof value !== 'string' || !value)
    return fallback
  if (value.length > 2_048 || hasControlCharacters(value) || value.includes('\\'))
    return fallback

  let decoded = value
  for (let index = 0; index < 3 && decoded.includes('%'); index += 1) {
    try {
      const next = decodeURIComponent(decoded)
      if (next === decoded)
        break
      decoded = next
    }
    catch {
      return fallback
    }
    if (hasControlCharacters(decoded) || decoded.includes('\\'))
      return fallback
  }
  const isAbsoluteHttp = /^https?:\/\//i.test(decoded)
  if (!decoded.startsWith('/') && !isAbsoluteHttp)
    return fallback
  const decodedPath = isAbsoluteHttp
    ? safeUrlPathname(decoded)
    : decoded.split(/[?#]/, 1)[0] ?? ''
  if (!decodedPath || decodedPath.startsWith('//') || decodedPath.includes('//'))
    return fallback

  const origin = options.origin ?? configuredOrigin()
  let parsed: URL
  try {
    parsed = new URL(value, origin)
  }
  catch {
    return fallback
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin || parsed.pathname.startsWith('//'))
    return fallback
  return `${parsed.pathname}${parsed.search}`
}

function configuredOrigin() {
  const value = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || 'http://localhost'
  try {
    return new URL(value).origin
  }
  catch {
    return 'http://localhost'
  }
}

function hasControlCharacters(value: string) {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code <= 31 || code === 127)
      return true
  }
  return false
}

function safeUrlPathname(value: string) {
  try {
    return new URL(value).pathname
  }
  catch {
    return ''
  }
}
