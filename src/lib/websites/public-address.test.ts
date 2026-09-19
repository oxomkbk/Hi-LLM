import { describe, expect, it } from 'vitest'

import { isPublicIpAddress } from './public-address'

describe('website extraction address policy', () => {
  it('rejects non-public addresses', () => {
    const addresses = [
      '127.0.0.1',
      '10.0.0.8',
      '172.16.1.1',
      '192.168.1.1',
      '169.254.169.254',
      '203.0.113.8',
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
    ]
    for (const address of addresses)
      expect(isPublicIpAddress(address), address).toBe(false)
  })

  it('accepts ordinary public IPv4 and IPv6 addresses', () => {
    expect(isPublicIpAddress('1.1.1.1')).toBe(true)
    expect(isPublicIpAddress('2606:4700:4700::1111')).toBe(true)
  })
})
