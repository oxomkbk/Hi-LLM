import { createHash } from 'node:crypto'

export { normalizeSecurityPath } from './security-path'

type CanonicalValue = boolean | null | number | string | CanonicalValue[] | { [key: string]: CanonicalValue }

export function canonicalJson(value: unknown) {
  return JSON.stringify(toCanonicalValue(value, new Set()))
}

export function sha256Canonical(value: unknown) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')
}

function toCanonicalValue(value: unknown, ancestors: Set<object>): CanonicalValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return typeof value === 'string' ? value.normalize('NFC') : value

  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError('Canonical JSON only accepts finite numbers')
    return Object.is(value, -0) ? 0 : value
  }

  if (typeof value !== 'object')
    throw new TypeError(`Canonical JSON does not support ${typeof value}`)
  if (ancestors.has(value))
    throw new TypeError('Canonical JSON does not support circular values')

  ancestors.add(value)
  try {
    if (Array.isArray(value))
      return value.map(item => toCanonicalValue(item, ancestors))

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null)
      throw new TypeError('Canonical JSON only accepts plain objects')

    const result: Record<string, CanonicalValue> = {}
    const normalizedKeys = Object.keys(value).map(key => ({ key, normalized: key.normalize('NFC') })).sort((left, right) => left.normalized.localeCompare(right.normalized))

    for (const { key, normalized } of normalizedKeys) {
      if (Object.hasOwn(result, normalized))
        throw new TypeError('Canonical JSON contains duplicate normalized keys')
      result[normalized] = toCanonicalValue((value as Record<string, unknown>)[key], ancestors)
    }
    return result
  }
  finally {
    ancestors.delete(value)
  }
}
