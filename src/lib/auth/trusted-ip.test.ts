import { afterEach, describe, expect, it, vi } from 'vitest'

import { getAuthIpAddressConfig, isValidIpOrCidr } from './trusted-ip'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getAuthIpAddressConfig', () => {
  it('uses a shared direct-mode bucket in local development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('AUTH_IP_HEADER', '')
    vi.stubEnv('AUTH_TRUSTED_PROXY_CIDRS', '')
    expect(getAuthIpAddressConfig()).toEqual({
      ipAddressHeaders: ['x-hillm-nav-direct-ip-disabled'],
      trustedProxies: [],
    })
  })

  it('requires explicit paired proxy settings in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PHASE', '')
    vi.stubEnv('AUTH_IP_HEADER', '')
    vi.stubEnv('AUTH_TRUSTED_PROXY_CIDRS', '')
    expect(() => getAuthIpAddressConfig()).toThrow('必须成对配置')
  })

  it('normalizes a valid trusted proxy configuration', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PHASE', '')
    vi.stubEnv('AUTH_IP_HEADER', 'CF-Connecting-IP')
    vi.stubEnv('AUTH_TRUSTED_PROXY_CIDRS', '192.0.2.10, 2001:db8::/48,192.0.2.10')
    expect(getAuthIpAddressConfig()).toEqual({
      ipAddressHeaders: ['cf-connecting-ip'],
      trustedProxies: ['192.0.2.10', '2001:db8::/48'],
    })
  })

  it.each([
    ['192.0.2.1/33', false],
    ['2001:db8::/129', false],
    ['10.0.0.1/not-a-prefix', false],
    ['10.0.0.1/24', true],
    ['2001:db8::1', true],
  ])('validates proxy address %s', (value, expected) => {
    expect(isValidIpOrCidr(value)).toBe(expected)
  })
})
