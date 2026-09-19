import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import {
  buildGitSourceArchiveUrl,
  createPinnedProviderLookup,
  isPublicInternetAddress,
  normalizeFixedGitRevision,
  parseGitUploadPackAdvertisement,
  requestAcrossProviderAddresses,
  resolveGitSourceRevision,
  securitySourceHttpError,
  selectProviderAddress,
} from './git-provider'
import { parseProviderUrl } from './provider-url'

describe('security source network policy', () => {
  const packet = (value: string) => `${(Buffer.byteLength(value) + 4).toString(16).padStart(4, '0')}${value}`

  it('allows public addresses and blocks local, private, metadata and documentation ranges', () => {
    expect(isPublicInternetAddress('8.8.8.8')).toBe(true)
    expect(isPublicInternetAddress('2606:4700:4700::1111')).toBe(true)
    expect(isPublicInternetAddress('127.0.0.1')).toBe(false)
    expect(isPublicInternetAddress('10.0.0.2')).toBe(false)
    expect(isPublicInternetAddress('169.254.169.254')).toBe(false)
    expect(isPublicInternetAddress('192.168.1.1')).toBe(false)
    expect(isPublicInternetAddress('::1')).toBe(false)
    expect(isPublicInternetAddress('fc00::1')).toBe(false)
    expect(isPublicInternetAddress('2001:db8::1')).toBe(false)
  })

  it('returns an address array when Node requests all lookup results', async () => {
    const selected = { address: '20.205.243.168', family: 4 }
    const lookup = createPinnedProviderLookup(selected)
    const result = await new Promise<unknown[]>((resolve) => {
      lookup('api.github.com', { all: true }, (...args) => resolve(args))
    })

    expect(result).toEqual([null, [selected]])
  })

  it('returns a single address for legacy lookup callers', async () => {
    const selected = { address: '20.205.243.168', family: 4 }
    const lookup = createPinnedProviderLookup(selected)
    const result = await new Promise<unknown[]>((resolve) => {
      lookup('api.github.com', { all: false }, (...args) => resolve(args))
    })

    expect(result).toEqual([null, selected.address, selected.family])
  })

  it('prefers IPv4 when a provider publishes both address families', () => {
    expect(selectProviderAddress([
      { address: '2606:4700:90:0:f22e:fbec:5bed:a9b9', family: 6 },
      { address: '172.65.251.78', family: 4 },
    ])).toEqual({ address: '172.65.251.78', family: 4 })
  })

  it('retries a connection failure on the next validated provider address', async () => {
    const first = { address: '20.205.243.168', family: 4 }
    const second = { address: '140.82.121.4', family: 4 }
    const attempted: string[] = []

    const result = await requestAcrossProviderAddresses([first, second], async (address) => {
      attempted.push(address.address)
      if (address === first)
        throw new Error('connect timeout')
      return 'ok'
    })

    expect(result).toBe('ok')
    expect(attempted).toEqual([first.address, second.address])
  })

  it('does not retry a permanent provider response failure', async () => {
    const attempted: string[] = []
    const permanent = securitySourceHttpError(404)

    await expect(requestAcrossProviderAddresses([
      { address: '20.205.243.168', family: 4 },
      { address: '140.82.121.4', family: 4 },
    ], async (address) => {
      attempted.push(address.address)
      throw permanent
    })).rejects.toBe(permanent)

    expect(attempted).toHaveLength(1)
  })

  it('accepts immutable commit revisions without a provider API lookup', () => {
    expect(normalizeFixedGitRevision('ABCDEF0123456789ABCDEF0123456789ABCDEF01'))
      .toBe('abcdef0123456789abcdef0123456789abcdef01')
    expect(normalizeFixedGitRevision('main')).toBeNull()
  })

  it('resolves an immutable source URL without requiring a provider API request', async () => {
    const revision = 'abcdef0123456789abcdef0123456789abcdef01'

    await expect(resolveGitSourceRevision({
      sourceUrl: `https://github.com/acme/skills/tree/${revision}/review`,
    })).resolves.toEqual(expect.objectContaining({
      providerUrl: expect.objectContaining({
        projectPath: 'acme/skills',
        subdirectory: 'review',
      }),
      sourceRevision: revision,
    }))
  })

  it('builds an archive URL only from a parsed provider URL and fixed revision', () => {
    const revision = 'abcdef0123456789abcdef0123456789abcdef01'
    const github = parseProviderUrl('https://github.com/acme/skills')
    const gitlab = parseProviderUrl('https://gitlab.com/acme/team/skills')

    expect(buildGitSourceArchiveUrl(github, revision).toString())
      .toBe(`https://codeload.github.com/acme/skills/zip/${revision}`)
    expect(buildGitSourceArchiveUrl(gitlab, revision).toString())
      .toBe(`https://gitlab.com/api/v4/projects/acme%2Fteam%2Fskills/repository/archive.zip?sha=${revision}`)
    expect(() => buildGitSourceArchiveUrl(github, 'main')).toThrowError(/固定提交/)
  })

  it('parses HEAD, branches, lightweight tags and peeled annotated tags', () => {
    const main = '1'.repeat(40)
    const releaseTag = '2'.repeat(40)
    const releaseCommit = '3'.repeat(40)
    const advertisement = Buffer.from([
      packet('# service=git-upload-pack\n'),
      '0000',
      packet(`${main} HEAD\0symref=HEAD:refs/heads/main agent=git/2.50\n`),
      packet(`${main} refs/heads/main\n`),
      packet(`${releaseTag} refs/tags/v1\n`),
      packet(`${releaseCommit} refs/tags/v1^{}\n`),
      '0000',
    ].join(''), 'utf8')

    expect(parseGitUploadPackAdvertisement(advertisement, 'HEAD')).toBe(main)
    expect(parseGitUploadPackAdvertisement(advertisement, 'main')).toBe(main)
    expect(parseGitUploadPackAdvertisement(advertisement, 'v1')).toBe(releaseCommit)
  })

  it('accepts the protocol v1 marker emitted by GitLab before ref records', () => {
    const main = '1'.repeat(40)
    const advertisement = Buffer.from([
      packet('# service=git-upload-pack\n'),
      '0000',
      packet('version 1\n'),
      packet(`${main} HEAD\0symref=HEAD:refs/heads/main\n`),
      packet(`${main} refs/heads/main\n`),
      '0000',
    ].join(''), 'utf8')

    expect(parseGitUploadPackAdvertisement(advertisement, 'HEAD')).toBe(main)
  })

  it('rejects malformed or truncated upload-pack packets', () => {
    expect(() => parseGitUploadPackAdvertisement(Buffer.from('0003', 'ascii'), 'HEAD'))
      .toThrowError(/pkt-line/)
    expect(() => parseGitUploadPackAdvertisement(Buffer.from('0010too-short', 'ascii'), 'HEAD'))
      .toThrowError(/pkt-line/)
    expect(() => parseGitUploadPackAdvertisement(Buffer.from('zzzz', 'ascii'), 'HEAD'))
      .toThrowError(/pkt-line/)
    const withoutTerminalFlush = Buffer.from([
      packet('# service=git-upload-pack\n'),
      '0000',
      packet(`${'1'.repeat(40)} HEAD\0symref=HEAD:refs/heads/main\n`),
    ].join(''), 'utf8')
    expect(() => parseGitUploadPackAdvertisement(withoutTerminalFlush, 'HEAD'))
      .toThrowError(/pkt-line/)
    const invalidUtf8 = Buffer.concat([
      Buffer.from(`${(5).toString(16).padStart(4, '0')}`, 'ascii'),
      Buffer.from([0xFF]),
    ])
    expect(() => parseGitUploadPackAdvertisement(invalidUtf8, 'HEAD'))
      .toThrowError(/pkt-line/)
  })

  it('classifies only throttling and server failures as transient HTTP errors', () => {
    expect(securitySourceHttpError(429)).toMatchObject({ code: 'SECURITY_SOURCE_TRANSIENT' })
    expect(securitySourceHttpError(503)).toMatchObject({ code: 'SECURITY_SOURCE_TRANSIENT' })
    expect(securitySourceHttpError(404)).toMatchObject({ code: 'SECURITY_SOURCE_INVALID' })
  })
})
