import { isIP } from 'node:net'

export function isPublicIpAddress(address: string) {
  const version = isIP(address)
  if (version === 4) {
    const parts = address.split('.').map(Number)
    const [a, b] = parts
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255))
      return false
    return !(
      a === 0
      || a === 10
      || a === 127
      || (a === 100 && b! >= 64 && b! <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b! >= 16 && b! <= 31)
      || (a === 192 && b === 168)
      || (a === 192 && b === 0)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && parts[2] === 100)
      || (a === 203 && b === 0 && parts[2] === 113)
      || a! >= 224
    )
  }
  if (version === 6) {
    const normalized = address.toLowerCase().replace(/^\[|\]$/g, '')
    if (normalized.startsWith('::ffff:'))
      return isPublicIpAddress(normalized.slice(7))
    return !(
      normalized === '::'
      || normalized === '::1'
      || normalized.startsWith('fc')
      || normalized.startsWith('fd')
      || /^fe[89ab]/.test(normalized)
      || normalized.startsWith('ff')
      || normalized.startsWith('2001:db8')
    )
  }
  return false
}
