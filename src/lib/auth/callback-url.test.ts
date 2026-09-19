import { describe, expect, it } from 'vitest'

import { createLoginUrl, normalizeAuthCallbackUrl } from './callback-url'

const ORIGIN = 'https://nav.example.com'

describe('normalizeAuthCallbackUrl', () => {
  it.each([
    ['/skills/submit', '/skills/submit'],
    ['/wonderland/ask?draft=1', '/wonderland/ask?draft=1'],
    ['https://nav.example.com/account', '/account'],
  ])('accepts same-origin callback %s', (input, expected) => {
    expect(normalizeAuthCallbackUrl(input, { origin: ORIGIN })).toBe(expected)
  })

  it.each([
    '//evil.example/path',
    '/%2f%2fevil.example/path',
    '/%252f%252fevil.example/path',
    '/safe//double',
    '/safe\\evil',
    'javascript:alert(1)',
    'https://evil.example/path',
    '/safe\u0000evil',
  ])('rejects unsafe callback %s', (input) => {
    expect(normalizeAuthCallbackUrl(input, { fallback: '/', origin: ORIGIN })).toBe('/')
  })

  it('encodes a normalized login callback', () => {
    expect(createLoginUrl('/?intent=submit-website')).toBe('/login?callbackURL=%2F%3Fintent%3Dsubmit-website')
  })
})
