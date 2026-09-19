import { describe, expect, it } from 'vitest'

import { isAccessSettingsUpdatedMessage } from './client-sync'

describe('isAccessSettingsUpdatedMessage', () => {
  it('accepts versioned access settings updates', () => {
    expect(isAccessSettingsUpdatedMessage({ configVersion: '17', type: 'access-settings-updated' })).toBe(true)
  })

  it('rejects unrelated channel messages', () => {
    expect(isAccessSettingsUpdatedMessage({ type: 'updated' })).toBe(false)
    expect(isAccessSettingsUpdatedMessage(null)).toBe(false)
  })
})
