import { describe, expect, it } from 'vitest'

import { getSubmissionAvailability } from './submission-controls'

import type { PublicSiteAccessSettings } from './types'

const settings = {
  available: true,
  contentDetailOpenMode: 'same_tab',
  emailAccessMode: 'open',
  mcpSubmissionMode: 'anonymous',
  mcpSubmissionEnabled: true,
  mcpSubmissionVisible: true,
  promptSubmissionEnabled: true,
  promptSubmissionVisible: true,
  registrationEnabled: true,
  skillSubmissionMode: 'authenticated',
  skillSubmissionEnabled: true,
  skillSubmissionVisible: true,
  translationDefaultLanguage: 'chinese_simplified',
  translationEnabled: false,
  translationLanguages: ['chinese_simplified'],
  websiteSubmissionMode: 'anonymous',
  websiteSubmissionEnabled: true,
  websiteSubmissionVisible: true,
  wonderlandSubmissionEnabled: true,
  wonderlandSubmissionVisible: true,
  workSubmissionEnabled: true,
  workSubmissionVisible: true,
  wonderlandComposerMode: 'guest_preview',
} as PublicSiteAccessSettings

describe('submission control state', () => {
  it('hides a submission entry when its visibility switch is off', () => {
    expect(getSubmissionAvailability({ ...settings, skillSubmissionVisible: false }, 'skill')).toBe('hidden')
  })

  it('keeps a visible entry disabled when publishing is switched off', () => {
    expect(getSubmissionAvailability({ ...settings, workSubmissionEnabled: false }, 'work')).toBe('disabled')
  })

  it('only exposes an enabled submission when both switches are on', () => {
    expect(getSubmissionAvailability(settings, 'prompt')).toBe('enabled')
  })
})
