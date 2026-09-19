import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { createScannerJobToken, verifyScannerJobToken } from './tokens'

const SECRET = 'scanner-test-secret-that-is-at-least-32-bytes'

describe('scanner job tokens', () => {
  it('signs strict short-lived scanner claims without placing the secret in the token', () => {
    const token = createScannerJobToken({
      jobId: '84f7e294-80bc-4ac6-8986-2f3415585193',
      model: 'model-1',
      subjectType: 'skill',
    }, SECRET, new Date('2026-08-21T00:00:00.000Z'))
    const [payload, signature] = token.split('.')
    const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'))

    expect(signature).toMatch(/^[\w-]{43}$/)
    expect(claims).toEqual({
      aud: 'hillm-nav-ai-security-scanner',
      exp: 1787270700,
      jobId: '84f7e294-80bc-4ac6-8986-2f3415585193',
      model: 'model-1',
      subjectType: 'skill',
    })
    expect(token).not.toContain(SECRET)
  })

  it('rejects weak secrets and invalid job identities', () => {
    expect(() => createScannerJobToken({
      jobId: 'not-a-uuid',
      model: 'model-1',
      subjectType: 'skill',
    }, SECRET)).toThrow()
    expect(() => createScannerJobToken({
      jobId: '84f7e294-80bc-4ac6-8986-2f3415585193',
      model: 'model-1',
      subjectType: 'skill',
    }, 'weak')).toThrow()
  })

  it('verifies the signature, exact claims and five-minute lifetime', () => {
    const createdAt = new Date('2026-08-21T00:00:00.000Z')
    const token = createScannerJobToken({
      jobId: '84f7e294-80bc-4ac6-8986-2f3415585193',
      model: 'model-1',
      subjectType: 'skill',
    }, SECRET, createdAt)

    expect(verifyScannerJobToken(token, SECRET, new Date('2026-08-21T00:04:59.000Z')))
      .toEqual(expect.objectContaining({ model: 'model-1', subjectType: 'skill' }))
    expect(() => verifyScannerJobToken(token, SECRET, new Date('2026-08-21T00:05:01.000Z'))).toThrow()
    expect(() => verifyScannerJobToken(`${token.slice(0, -1)}x`, SECRET, createdAt)).toThrow()
  })
})
