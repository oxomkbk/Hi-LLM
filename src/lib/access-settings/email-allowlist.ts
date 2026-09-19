const EMAIL_PATTERN = /^[\w.%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i
const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i
const MAX_ALLOWLIST_ENTRIES = 200

export type EmailAccessMode = 'allowlist' | 'open'

export class EmailAllowlistError extends Error {}

export function emailMatchesAllowlist(email: string, allowlist: string[]) {
  const normalizedEmail = email.trim().toLowerCase()
  const domain = normalizedEmail.split('@')[1]
  if (!domain)
    return false
  return allowlist.some(entry => entry === normalizedEmail || (entry.startsWith('@') && entry.slice(1) === domain))
}

export function normalizeEmailAccessMode(value: unknown): EmailAccessMode {
  if (value !== 'open' && value !== 'allowlist')
    throw new EmailAllowlistError('邮箱访问模式无效')
  return value
}

export function normalizeEmailAllowlist(value: unknown) {
  if (!Array.isArray(value))
    throw new EmailAllowlistError('邮箱白名单格式无效')
  if (value.length > MAX_ALLOWLIST_ENTRIES)
    throw new EmailAllowlistError(`邮箱白名单最多支持 ${MAX_ALLOWLIST_ENTRIES} 条规则`)

  const entries: string[] = []
  const seen = new Set<string>()
  for (const rawEntry of value) {
    if (typeof rawEntry !== 'string')
      throw new EmailAllowlistError('邮箱白名单只能包含邮箱或域名')
    const entry = rawEntry.trim().toLowerCase()
    if (!entry)
      continue
    if (entry.length > 254)
      throw new EmailAllowlistError(`白名单规则过长：${entry.slice(0, 32)}…`)
    const valid = entry.startsWith('@')
      ? DOMAIN_PATTERN.test(entry.slice(1))
      : EMAIL_PATTERN.test(entry)
    if (!valid)
      throw new EmailAllowlistError(`白名单规则无效：${entry}`)
    if (!seen.has(entry)) {
      seen.add(entry)
      entries.push(entry)
    }
  }
  return entries
}
