export const SOURCE_TRANSLATION_LANGUAGE = 'chinese_simplified' as const

export const TRANSLATION_LANGUAGES = [
  { code: 'chinese_simplified', countryCode: 'CN', htmlLang: 'zh-CN', label: '简体中文', machineTranslationNotice: '非中文内容由机器翻译', nativeLabel: '简体中文' },
  { code: 'chinese_traditional', countryCode: 'CN', htmlLang: 'zh-TW', label: '繁体中文', machineTranslationNotice: '非中文內容由機器翻譯', nativeLabel: '繁體中文' },
  { code: 'english', countryCode: 'GB', htmlLang: 'en', label: '英语', machineTranslationNotice: 'Non-Chinese content is machine translated', nativeLabel: 'English' },
  { code: 'japanese', countryCode: 'JP', htmlLang: 'ja', label: '日语', machineTranslationNotice: '中国語以外のコンテンツは機械翻訳です', nativeLabel: '日本語' },
  { code: 'korean', countryCode: 'KR', htmlLang: 'ko', label: '韩语', machineTranslationNotice: '중국어 이외의 콘텐츠는 기계 번역됩니다', nativeLabel: '한국어' },
  { code: 'french', countryCode: 'FR', htmlLang: 'fr', label: '法语', machineTranslationNotice: 'Le contenu non chinois est traduit automatiquement', nativeLabel: 'Français' },
  { code: 'deutsch', countryCode: 'DE', htmlLang: 'de', label: '德语', machineTranslationNotice: 'Nicht-chinesische Inhalte werden maschinell übersetzt', nativeLabel: 'Deutsch' },
  { code: 'spanish', countryCode: 'ES', htmlLang: 'es', label: '西班牙语', machineTranslationNotice: 'El contenido no chino se traduce automáticamente', nativeLabel: 'Español' },
  { code: 'portuguese', countryCode: 'PT', htmlLang: 'pt', label: '葡萄牙语', machineTranslationNotice: 'O conteúdo não chinês é traduzido automaticamente', nativeLabel: 'Português' },
  { code: 'russian', countryCode: 'RU', htmlLang: 'ru', label: '俄语', machineTranslationNotice: 'Контент не на китайском языке переведен машинным переводом', nativeLabel: 'Русский' },
  { code: 'arabic', countryCode: 'SA', htmlLang: 'ar', label: '阿拉伯语', machineTranslationNotice: 'تتم ترجمة المحتوى غير الصيني آليًا', nativeLabel: 'العربية' },
  { code: 'vietnamese', countryCode: 'VN', htmlLang: 'vi', label: '越南语', machineTranslationNotice: 'Nội dung không phải tiếng Trung được dịch bằng máy', nativeLabel: 'Tiếng Việt' },
] as const

export interface NormalizedTranslationSettings {
  translationDefaultLanguage: TranslationLanguageCode
  translationEnabled: boolean
  translationLanguages: TranslationLanguageCode[]
}

export type TranslationLanguageCode = typeof TRANSLATION_LANGUAGES[number]['code']

export interface TranslationSettingsInput {
  translationDefaultLanguage: unknown
  translationEnabled: unknown
  translationLanguages: unknown
}

export const DEFAULT_TRANSLATION_LANGUAGE: TranslationLanguageCode = SOURCE_TRANSLATION_LANGUAGE
export const DEFAULT_TRANSLATION_LANGUAGES: readonly TranslationLanguageCode[] = TRANSLATION_LANGUAGES.map(language => language.code)

const LANGUAGE_CODES = new Set<TranslationLanguageCode>(DEFAULT_TRANSLATION_LANGUAGES)

export class TranslationSettingsValidationError extends Error {}

export function getTranslationLanguage(code: TranslationLanguageCode) {
  return TRANSLATION_LANGUAGES.find(language => language.code === code) ?? TRANSLATION_LANGUAGES[0]
}

export function isTranslationLanguageCode(value: unknown): value is TranslationLanguageCode {
  return typeof value === 'string' && LANGUAGE_CODES.has(value as TranslationLanguageCode)
}

export function normalizeTranslationSettings(input: TranslationSettingsInput): NormalizedTranslationSettings {
  if (typeof input.translationEnabled !== 'boolean')
    throw new TranslationSettingsValidationError('翻译开关无效')

  if (!Array.isArray(input.translationLanguages))
    throw new TranslationSettingsValidationError('翻译语言列表无效')

  const languages: TranslationLanguageCode[] = []
  for (const value of input.translationLanguages) {
    if (!isTranslationLanguageCode(value))
      throw new TranslationSettingsValidationError('翻译语言包含不支持的选项')
    if (!languages.includes(value))
      languages.push(value)
  }

  if (!languages.includes(SOURCE_TRANSLATION_LANGUAGE))
    throw new TranslationSettingsValidationError('翻译语言必须包含简体中文')
  if (input.translationEnabled && languages.length < 2)
    throw new TranslationSettingsValidationError('开启翻译时至少需要一种目标语言')
  if (!isTranslationLanguageCode(input.translationDefaultLanguage))
    throw new TranslationSettingsValidationError('默认翻译语言无效')
  if (!languages.includes(input.translationDefaultLanguage))
    throw new TranslationSettingsValidationError('默认翻译语言必须在已启用语言中')

  return {
    translationDefaultLanguage: input.translationDefaultLanguage,
    translationEnabled: input.translationEnabled,
    translationLanguages: languages,
  }
}

export function reconcileTranslationLanguage(
  preferred: unknown,
  fallback: TranslationLanguageCode,
  allowed: readonly TranslationLanguageCode[],
) {
  if (isTranslationLanguageCode(preferred) && allowed.includes(preferred))
    return preferred
  if (allowed.includes(fallback))
    return fallback
  return SOURCE_TRANSLATION_LANGUAGE
}
