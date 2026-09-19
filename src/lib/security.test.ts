import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  NAVIGATION_AI_REQUEST_HEADER,
  NAVIGATION_AI_REQUEST_HEADER_VALUE,
} from './navigation-ai/request-transport'
import {
  assertNavigationAiRequestOrigin,
  assertSameOrigin,
  createSecurityHash,
  createTrustedVisitorHash,
  normalizeWebsiteCategoryIds,
  RequestOriginValidationError,
} from './security'

const CATEGORY_A = '11111111-1111-4111-8111-111111111111'
const CATEGORY_B = '22222222-2222-4222-8222-222222222222'
const APP_ORIGIN = 'https://nav.example.com'

function configureProductionOrigin() {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', APP_ORIGIN)
  vi.stubEnv('BETTER_AUTH_URL', '')
}

function createNavigationAiRequest(headers: HeadersInit = {}) {
  return new NextRequest(`${APP_ORIGIN}/api/public/navigation-ai`, {
    headers,
    method: 'POST',
  })
}

describe('anonymous submission visitor identity', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('allows a same-origin localhost request in a production build', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('TRUST_PROXY_HEADERS', 'false')
    vi.stubEnv('VERCEL', '')
    vi.stubEnv('SUBMISSION_IP_HASH_SALT', 'test-only-submission-hash-salt-32-bytes')

    const request = new NextRequest('http://localhost:3000/api/submissions', {
      headers: { origin: 'http://localhost:3000' },
    })

    expect(createTrustedVisitorHash(request, 'website-submission')).toMatch(/^[a-f\d]{64}$/)
  })

  it('still fails closed for a public direct deployment without a trusted proxy', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('TRUST_PROXY_HEADERS', 'false')
    vi.stubEnv('VERCEL', '')
    vi.stubEnv('SUBMISSION_IP_HASH_SALT', 'test-only-submission-hash-salt-32-bytes')

    const request = new NextRequest('https://nav.example.com/api/submissions', {
      headers: { origin: 'https://nav.example.com' },
    })

    expect(() => createTrustedVisitorHash(request, 'website-submission'))
      .toThrow('匿名投稿安全网关尚未配置')
  })

  it('uses the same explicitly configured client IP header as authentication', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('TRUST_PROXY_HEADERS', 'false')
    vi.stubEnv('VERCEL', '')
    vi.stubEnv('AUTH_IP_HEADER', 'CF-Connecting-IP')
    vi.stubEnv('AUTH_TRUSTED_PROXY_CIDRS', '192.0.2.10/32')
    vi.stubEnv('SUBMISSION_IP_HASH_SALT', 'test-only-submission-hash-salt-32-bytes')

    const request = new NextRequest('https://nav.example.com/api/submissions', {
      headers: {
        'cf-connecting-ip': '203.0.113.8',
        'origin': 'https://nav.example.com',
      },
    })

    expect(createTrustedVisitorHash(request, 'website-submission'))
      .toBe(createSecurityHash('website-submission', '203.0.113.8'))
  })

  it('falls back to the auth secret when an independent hash salt is not configured', () => {
    vi.stubEnv('SUBMISSION_IP_HASH_SALT', '')
    vi.stubEnv('AUTH_SECRET', 'test-only-auth-secret-at-least-32-bytes')

    expect(createSecurityHash('visit', '127.0.0.1')).toMatch(/^[a-f\d]{64}$/)
  })
})

describe('website category selection', () => {
  it('supports the legacy single category and preserves selection order', () => {
    expect(normalizeWebsiteCategoryIds(CATEGORY_A)).toEqual([CATEGORY_A])
    expect(normalizeWebsiteCategoryIds([CATEGORY_B, CATEGORY_A])).toEqual([CATEGORY_B, CATEGORY_A])
  })

  it('removes duplicate category ids', () => {
    expect(normalizeWebsiteCategoryIds([CATEGORY_A, CATEGORY_A, CATEGORY_B]))
      .toEqual([CATEGORY_A, CATEGORY_B])
  })

  it('rejects empty, invalid, and excessive category selections', () => {
    expect(() => normalizeWebsiteCategoryIds([])).toThrow('请至少选择一个有效的网站分类')
    expect(() => normalizeWebsiteCategoryIds(['invalid'])).toThrow('请至少选择一个有效的网站分类')
    expect(() => normalizeWebsiteCategoryIds(Array.from({ length: 9 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`)))
      .toThrow('一个网站最多选择 8 个分类')
  })
})

describe('navigation AI request origin compatibility', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each([
    ['exact origin', { origin: APP_ORIGIN }],
    ['same-origin referrer', { referer: `${APP_ORIGIN}/` }],
    ['same-origin Fetch Metadata', { 'sec-fetch-site': 'same-origin' }],
    ['JSON request marker', {
      'content-type': 'application/json; charset=utf-8',
      [NAVIGATION_AI_REQUEST_HEADER]: NAVIGATION_AI_REQUEST_HEADER_VALUE,
    }],
    ['opaque origin with referrer', { origin: 'null', referer: `${APP_ORIGIN}/prompts` }],
    ['opaque origin with Fetch Metadata', { 'origin': 'null', 'sec-fetch-site': 'same-origin' }],
    ['opaque origin with JSON request marker', {
      'content-type': 'application/json',
      'origin': 'null',
      [NAVIGATION_AI_REQUEST_HEADER]: NAVIGATION_AI_REQUEST_HEADER_VALUE,
    }],
  ])('accepts %s evidence', (_label, headers) => {
    configureProductionOrigin()

    expect(() => assertNavigationAiRequestOrigin(createNavigationAiRequest(headers))).not.toThrow()
  })

  it.each([
    ['mismatched origin', { 'origin': 'https://attacker.example', 'referer': `${APP_ORIGIN}/`, 'sec-fetch-site': 'same-origin' }],
    ['malformed origin', { origin: 'not-an-origin', referer: `${APP_ORIGIN}/` }],
    ['mismatched referrer', { 'referer': 'https://attacker.example/', 'sec-fetch-site': 'same-origin' }],
    ['malformed referrer', { referer: 'not-a-url' }],
    ['same-site Fetch Metadata', { 'sec-fetch-site': 'same-site' }],
    ['cross-site Fetch Metadata', { 'sec-fetch-site': 'cross-site' }],
    ['navigation Fetch Metadata', { 'sec-fetch-site': 'none' }],
  ])('does not let the marker override %s', (_label, conflictingHeaders) => {
    configureProductionOrigin()
    const request = createNavigationAiRequest({
      'content-type': 'application/json',
      [NAVIGATION_AI_REQUEST_HEADER]: NAVIGATION_AI_REQUEST_HEADER_VALUE,
      ...conflictingHeaders,
    })

    expect(() => assertNavigationAiRequestOrigin(request)).toThrow(RequestOriginValidationError)
  })

  it.each([
    ['opaque origin without fallback', { origin: 'null' }],
    ['missing marker', { 'content-type': 'application/json' }],
    ['wrong marker', { 'content-type': 'application/json', [NAVIGATION_AI_REQUEST_HEADER]: 'other' }],
    ['non-JSON marker', { 'content-type': 'text/plain', [NAVIGATION_AI_REQUEST_HEADER]: NAVIGATION_AI_REQUEST_HEADER_VALUE }],
  ])('rejects %s', (_label, headers) => {
    configureProductionOrigin()

    expect(() => assertNavigationAiRequestOrigin(createNavigationAiRequest(headers))).toThrow(RequestOriginValidationError)
  })

  it.each([
    ['missing origin configuration', '', ''],
    ['invalid origin configuration', 'not-a-url', 'also-not-a-url'],
  ])('fails closed with %s', (_label, appUrl, authUrl) => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', appUrl)
    vi.stubEnv('BETTER_AUTH_URL', authUrl)

    const fallbackRequests = [
      createNavigationAiRequest({ 'sec-fetch-site': 'same-origin' }),
      createNavigationAiRequest({
        'content-type': 'application/json',
        [NAVIGATION_AI_REQUEST_HEADER]: NAVIGATION_AI_REQUEST_HEADER_VALUE,
      }),
    ]

    for (const request of fallbackRequests)
      expect(() => assertNavigationAiRequestOrigin(request)).toThrow(RequestOriginValidationError)
  })

  it('keeps the strict validator strict for other write APIs', () => {
    configureProductionOrigin()
    const request = createNavigationAiRequest({
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
      [NAVIGATION_AI_REQUEST_HEADER]: NAVIGATION_AI_REQUEST_HEADER_VALUE,
    })

    expect(() => assertSameOrigin(request)).toThrow(RequestOriginValidationError)
  })
})
