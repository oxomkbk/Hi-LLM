import { describe, expect, it } from 'vitest'

import { parseAccountProfileInput } from './validation'

const AVATAR_ID = '2ddde9d9-73f1-4f53-9df2-8ce8dd7bb9cc'

describe('parseAccountProfileInput', () => {
  it('normalizes a valid public profile', () => {
    expect(parseAccountProfileInput({
      avatarFileId: AVATAR_ID,
      bio: '  产品与工程  ',
      name: '  Alice  ',
      website: 'https://example.com/about',
    })).toEqual({
      avatarFileId: AVATAR_ID,
      bio: '产品与工程',
      name: 'Alice',
      website: 'https://example.com/about',
    })
  })

  it('accepts clearing optional public fields', () => {
    expect(parseAccountProfileInput({ avatarFileId: null, bio: '', name: 'Alice', website: '' }))
      .toEqual({ avatarFileId: null, bio: null, name: 'Alice', website: null })
  })

  it.each([
    ['empty name', { name: '', website: '' }],
    ['http website', { name: 'Alice', website: 'http://example.com' }],
    ['credential website', { name: 'Alice', website: 'https://user:pass@example.com' }],
    ['invalid avatar id', { avatarFileId: 'not-a-uuid', name: 'Alice', website: '' }],
    ['long bio', { bio: 'x'.repeat(281), name: 'Alice', website: '' }],
  ])('rejects %s', (_label, input) => {
    expect(() => parseAccountProfileInput(input)).toThrow()
  })
})
