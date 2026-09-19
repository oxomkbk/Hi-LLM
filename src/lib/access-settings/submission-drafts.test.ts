import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearSubmissionDraft, loadSubmissionDraft, saveSubmissionDraft } from './submission-drafts'

class MemoryStorage {
  private readonly values = new Map<string, string>()

  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

const storage = new MemoryStorage()

beforeEach(() => {
  storage.clear()
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } })
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window')
})

describe('submission drafts', () => {
  it('stores only the website field whitelist', () => {
    expect(saveSubmissionDraft('website', {
      categoryIds: ['cat-1'],
      company: 'honeypot',
      desc: '公开描述',
      logo: 'blob:https://nav.example.com/id',
      name: 'HiLLM Nav',
      url: 'https://example.com',
      vpn: true,
    })).toBe(true)
    expect(loadSubmissionDraft('website')).toEqual({
      categoryIds: ['cat-1'],
      desc: '公开描述',
      name: 'HiLLM Nav',
      url: 'https://example.com',
      vpn: true,
    })
  })

  it('isolates scopes and clears drafts explicitly', () => {
    saveSubmissionDraft('skill', { name: 'Review Skill' })
    expect(loadSubmissionDraft('mcp')).toBeNull()
    clearSubmissionDraft('skill')
    expect(loadSubmissionDraft('skill')).toBeNull()
  })

  it('removes expired drafts', () => {
    storage.setItem('better-nav:submission-draft:v1:website', JSON.stringify({
      data: { name: 'Expired' },
      expiresAt: Date.now() - 1,
      savedAt: Date.now() - 10,
      scope: 'website',
      version: 1,
    }))
    expect(loadSubmissionDraft('website')).toBeNull()
  })
})
