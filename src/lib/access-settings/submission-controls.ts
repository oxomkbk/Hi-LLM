import type { PublicSiteAccessSettings, SiteAccessSettings } from './types'

export type SubmissionAvailability = 'disabled' | 'enabled' | 'hidden'
export type SubmissionChannel = 'mcp' | 'prompt' | 'skill' | 'website' | 'wonderland' | 'work'

interface SubmissionControlKeys {
  enabled: keyof Pick<SiteAccessSettings, 'mcpSubmissionEnabled' | 'promptSubmissionEnabled' | 'skillSubmissionEnabled' | 'websiteSubmissionEnabled' | 'wonderlandSubmissionEnabled' | 'workSubmissionEnabled'>
  visible: keyof Pick<SiteAccessSettings, 'mcpSubmissionVisible' | 'promptSubmissionVisible' | 'skillSubmissionVisible' | 'websiteSubmissionVisible' | 'wonderlandSubmissionVisible' | 'workSubmissionVisible'>
}

const SUBMISSION_CONTROL_KEYS: Record<SubmissionChannel, SubmissionControlKeys> = {
  mcp: { enabled: 'mcpSubmissionEnabled', visible: 'mcpSubmissionVisible' },
  prompt: { enabled: 'promptSubmissionEnabled', visible: 'promptSubmissionVisible' },
  skill: { enabled: 'skillSubmissionEnabled', visible: 'skillSubmissionVisible' },
  website: { enabled: 'websiteSubmissionEnabled', visible: 'websiteSubmissionVisible' },
  wonderland: { enabled: 'wonderlandSubmissionEnabled', visible: 'wonderlandSubmissionVisible' },
  work: { enabled: 'workSubmissionEnabled', visible: 'workSubmissionVisible' },
}

export function getSubmissionAvailability(settings: PublicSiteAccessSettings, channel: SubmissionChannel): SubmissionAvailability {
  if (!settings.available || !settings[SUBMISSION_CONTROL_KEYS[channel].visible])
    return 'hidden'
  return settings[SUBMISSION_CONTROL_KEYS[channel].enabled] ? 'enabled' : 'disabled'
}

export function isSubmissionEnabled(settings: SiteAccessSettings, channel: SubmissionChannel) {
  return settings[SUBMISSION_CONTROL_KEYS[channel].enabled]
}
