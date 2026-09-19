import type { EmailAccessMode } from './email-allowlist'
import type { TranslationLanguageCode } from '@/lib/translation/languages'

export type ContentDetailOpenMode = 'new_tab' | 'same_tab'
export type PublicSiteAccessSettings = Pick<
  SiteAccessSettings,
  | 'configVersion'
  | 'contentDetailOpenMode'
  | 'emailAccessMode'
  | 'mcpSubmissionMode'
  | 'mcpSubmissionEnabled'
  | 'mcpSubmissionVisible'
  | 'promptSubmissionEnabled'
  | 'promptSubmissionVisible'
  | 'registrationEnabled'
  | 'skillSubmissionMode'
  | 'skillSubmissionEnabled'
  | 'skillSubmissionVisible'
  | 'translationDefaultLanguage'
  | 'translationEnabled'
  | 'translationLanguages'
  | 'websiteSubmissionMode'
  | 'websiteSubmissionEnabled'
  | 'websiteSubmissionVisible'
  | 'wonderlandSubmissionEnabled'
  | 'wonderlandSubmissionVisible'
  | 'wonderlandComposerMode'
  | 'workSubmissionEnabled'
  | 'workSubmissionVisible'
> & {
  available: boolean
}
export interface SiteAccessSettings {
  configVersion: string
  contentDetailOpenMode: ContentDetailOpenMode
  createdAt: string
  emailAccessMode: EmailAccessMode
  emailAllowlist: string[]
  mcpSubmissionMode: SubmissionAccessMode
  mcpSubmissionEnabled: boolean
  mcpSubmissionVisible: boolean
  promptSubmissionEnabled: boolean
  promptSubmissionVisible: boolean
  registrationEnabled: boolean
  skillSubmissionMode: SubmissionAccessMode
  skillSubmissionEnabled: boolean
  skillSubmissionVisible: boolean
  translationDefaultLanguage: TranslationLanguageCode
  translationEnabled: boolean
  translationLanguages: TranslationLanguageCode[]
  updatedAt: string
  updatedBy: string | null
  websiteSubmissionMode: SubmissionAccessMode
  websiteSubmissionEnabled: boolean
  websiteSubmissionVisible: boolean
  wonderlandSubmissionEnabled: boolean
  wonderlandSubmissionVisible: boolean
  wonderlandComposerMode: WonderlandComposerMode
  workSubmissionEnabled: boolean
  workSubmissionVisible: boolean
}

export type SubmissionAccessMode = 'anonymous' | 'authenticated'

export type SubmissionAccessScope = 'mcp' | 'prompt' | 'skill' | 'website' | 'wonderland' | 'work'

export interface UpdateSiteAccessSettingsInput {
  contentDetailOpenMode: ContentDetailOpenMode
  expectedVersion: string
  emailAccessMode: EmailAccessMode
  emailAllowlist: string[]
  mcpSubmissionMode: SubmissionAccessMode
  mcpSubmissionEnabled: boolean
  mcpSubmissionVisible: boolean
  promptSubmissionEnabled: boolean
  promptSubmissionVisible: boolean
  registrationEnabled: boolean
  skillSubmissionMode: SubmissionAccessMode
  skillSubmissionEnabled: boolean
  skillSubmissionVisible: boolean
  translationDefaultLanguage: TranslationLanguageCode
  translationEnabled: boolean
  translationLanguages: TranslationLanguageCode[]
  websiteSubmissionMode: SubmissionAccessMode
  websiteSubmissionEnabled: boolean
  websiteSubmissionVisible: boolean
  wonderlandSubmissionEnabled: boolean
  wonderlandSubmissionVisible: boolean
  wonderlandComposerMode: WonderlandComposerMode
  workSubmissionEnabled: boolean
  workSubmissionVisible: boolean
}

export type WonderlandComposerMode = 'authenticated' | 'guest_preview'

export type { EmailAccessMode } from './email-allowlist'

export const FAIL_CLOSED_PUBLIC_ACCESS_SETTINGS: PublicSiteAccessSettings = {
  available: false,
  configVersion: '0',
  contentDetailOpenMode: 'same_tab',
  emailAccessMode: 'allowlist',
  mcpSubmissionMode: 'authenticated',
  mcpSubmissionEnabled: false,
  mcpSubmissionVisible: false,
  promptSubmissionEnabled: false,
  promptSubmissionVisible: false,
  registrationEnabled: false,
  skillSubmissionMode: 'authenticated',
  skillSubmissionEnabled: false,
  skillSubmissionVisible: false,
  translationDefaultLanguage: 'chinese_simplified',
  translationEnabled: false,
  translationLanguages: ['chinese_simplified'],
  websiteSubmissionMode: 'authenticated',
  websiteSubmissionEnabled: false,
  websiteSubmissionVisible: false,
  wonderlandSubmissionEnabled: false,
  wonderlandSubmissionVisible: false,
  wonderlandComposerMode: 'authenticated',
  workSubmissionEnabled: false,
  workSubmissionVisible: false,
}
