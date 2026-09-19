import { describe, expect, it } from 'vitest'

import {
  DEFAULT_TRANSLATION_LANGUAGES,
  normalizeTranslationSettings,
  reconcileTranslationLanguage,
  TRANSLATION_LANGUAGES,
  TranslationSettingsValidationError,
} from './languages'

describe('translation settings', () => {
  it('uses the Chinese flag for both Chinese writing systems without merging locales', () => {
    const simplified = TRANSLATION_LANGUAGES.find(language => language.code === 'chinese_simplified')
    const traditional = TRANSLATION_LANGUAGES.find(language => language.code === 'chinese_traditional')

    expect(simplified).toMatchObject({
      countryCode: 'CN',
      htmlLang: 'zh-CN',
      nativeLabel: '简体中文',
    })
    expect(traditional).toMatchObject({
      countryCode: 'CN',
      htmlLang: 'zh-TW',
      label: '繁体中文',
      machineTranslationNotice: '非中文內容由機器翻譯',
      nativeLabel: '繁體中文',
    })
    expect(reconcileTranslationLanguage(
      'chinese_traditional',
      'chinese_simplified',
      DEFAULT_TRANSLATION_LANGUAGES,
    )).toBe('chinese_traditional')
  })

  it('normalizes a valid configuration and removes duplicates', () => {
    expect(normalizeTranslationSettings({
      translationDefaultLanguage: 'chinese_simplified',
      translationEnabled: true,
      translationLanguages: ['chinese_simplified', 'english', 'english'],
    })).toEqual({
      translationDefaultLanguage: 'chinese_simplified',
      translationEnabled: true,
      translationLanguages: ['chinese_simplified', 'english'],
    })
  })

  it('requires the source language and an enabled target', () => {
    expect(() => normalizeTranslationSettings({
      translationDefaultLanguage: 'english',
      translationEnabled: true,
      translationLanguages: ['english'],
    })).toThrow(TranslationSettingsValidationError)

    expect(() => normalizeTranslationSettings({
      translationDefaultLanguage: 'chinese_simplified',
      translationEnabled: true,
      translationLanguages: ['chinese_simplified'],
    })).toThrow('至少需要一种目标语言')
  })

  it('keeps the default language inside the allowed list', () => {
    expect(() => normalizeTranslationSettings({
      translationDefaultLanguage: 'japanese',
      translationEnabled: false,
      translationLanguages: ['chinese_simplified', 'english'],
    })).toThrow('默认翻译语言必须在已启用语言中')
  })

  it('falls back when a saved visitor preference is no longer allowed', () => {
    expect(reconcileTranslationLanguage('japanese', 'english', ['chinese_simplified', 'english'])).toBe('english')
    expect(reconcileTranslationLanguage('english', 'chinese_simplified', DEFAULT_TRANSLATION_LANGUAGES)).toBe('english')
  })
})
