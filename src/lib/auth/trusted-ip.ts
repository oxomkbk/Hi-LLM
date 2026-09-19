import { isIP } from 'node:net'

const BUILD_PHASE = 'phase-production-build'
const DIRECT_MODE_SENTINEL_HEADER = 'x-hillm-nav-direct-ip-disabled'
const HEADER_NAME_PATTERN = /^[!#$%&'*+.^\w`|~-]+$/

export interface AuthIpAddressConfig {
  ipAddressHeaders: string[]
  trustedProxies: string[]
}

export function getAuthIpAddressConfig(): AuthIpAddressConfig {
  const header = process.env.AUTH_IP_HEADER?.trim()
  const rawCidrs = process.env.AUTH_TRUSTED_PROXY_CIDRS?.trim()
  const isBuild = process.env.NEXT_PHASE === BUILD_PHASE
  const productionRuntime = process.env.NODE_ENV === 'production' && !isBuild

  if (!header && !rawCidrs) {
    if (productionRuntime)
      throw new Error('生产环境必须成对配置 AUTH_IP_HEADER 与 AUTH_TRUSTED_PROXY_CIDRS')
    return { ipAddressHeaders: [DIRECT_MODE_SENTINEL_HEADER], trustedProxies: [] }
  }
  if (!header || !rawCidrs)
    throw new Error('AUTH_IP_HEADER 与 AUTH_TRUSTED_PROXY_CIDRS 必须成对配置')
  if (!HEADER_NAME_PATTERN.test(header) || header.includes(','))
    throw new Error('AUTH_IP_HEADER 格式无效，只允许一个 HTTP Header 名称')

  const trustedProxies = [...new Set(rawCidrs.split(',').map(value => value.trim()))]
  if (!trustedProxies.length || trustedProxies.some(value => !value))
    throw new Error('AUTH_TRUSTED_PROXY_CIDRS 不能为空')
  const invalid = trustedProxies.filter(value => !isValidIpOrCidr(value))
  if (invalid.length)
    throw new Error(`AUTH_TRUSTED_PROXY_CIDRS 包含无效地址：${invalid.join(', ')}`)
  return { ipAddressHeaders: [header.toLowerCase()], trustedProxies }
}

export function isValidIpOrCidr(value: string) {
  const slashIndex = value.lastIndexOf('/')
  const address = slashIndex === -1 ? value : value.slice(0, slashIndex)
  const family = isIP(address)
  if (!family)
    return false
  if (slashIndex === -1)
    return true
  const prefix = value.slice(slashIndex + 1)
  if (!/^\d+$/.test(prefix))
    return false
  const numericPrefix = Number(prefix)
  return numericPrefix >= 0 && numericPrefix <= (family === 4 ? 32 : 128)
}
