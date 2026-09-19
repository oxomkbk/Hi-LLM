const LOCAL_ORIGIN = 'https://hillm-nav.local'
const MAX_RETURN_TO_LENGTH = 2_048
const SAFE_TARGET_PART_PATTERN = /[^\w-]+/g

export interface ReturnToPolicy {
  exactPathnames?: readonly string[]
  pathnamePrefixes?: readonly string[]
}

export function buildContextualHref(detailHref: string, returnTo: string, targetId?: string) {
  const detailUrl = new URL(detailHref, LOCAL_ORIGIN)
  const listUrl = new URL(returnTo, LOCAL_ORIGIN)

  if (detailUrl.origin !== LOCAL_ORIGIN || listUrl.origin !== LOCAL_ORIGIN)
    return detailHref

  if (targetId)
    listUrl.hash = targetId

  detailUrl.searchParams.set('returnTo', relativeUrl(listUrl))
  return relativeUrl(detailUrl)
}

export function returnTargetId(channel: string, id: string) {
  const safeChannel = channel.trim().replace(SAFE_TARGET_PART_PATTERN, '-').replace(/^-+|-+$/g, '')
  const safeId = id.trim().replace(SAFE_TARGET_PART_PATTERN, '-').replace(/^-+|-+$/g, '')
  return `return-${safeChannel || 'item'}-${safeId || 'unknown'}`
}

export function safeReturnTo(
  value: string | string[] | null | undefined,
  fallback: string,
  policy: ReturnToPolicy,
) {
  const candidate = Array.isArray(value) ? value[0] : value
  if (!candidate || candidate.length > MAX_RETURN_TO_LENGTH || hasUnsafeCharacter(candidate))
    return fallback

  try {
    if (!candidate.startsWith('/') || candidate.startsWith('//'))
      return fallback

    const url = new URL(candidate, LOCAL_ORIGIN)
    if (url.origin !== LOCAL_ORIGIN || !isAllowedPathname(url.pathname, policy))
      return fallback

    return relativeUrl(url)
  }
  catch {
    return fallback
  }
}

function hasUnsafeCharacter(value: string) {
  if (value.includes('\\'))
    return true

  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}

function isAllowedPathname(pathname: string, policy: ReturnToPolicy) {
  if (policy.exactPathnames?.includes(pathname))
    return true

  return policy.pathnamePrefixes?.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`)) ?? false
}

function relativeUrl(url: URL) {
  return `${url.pathname}${url.search}${url.hash}`
}
