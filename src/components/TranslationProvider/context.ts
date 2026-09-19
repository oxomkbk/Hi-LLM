'use client'

import { createContext, use } from 'react'

import { SOURCE_TRANSLATION_LANGUAGE } from '@/lib/translation/languages'

import type { TranslationLanguageCode } from '@/lib/translation/languages'

export interface TranslationContextValue {
  language: TranslationLanguageCode
  selectLanguage: (language: TranslationLanguageCode) => void
  status: TranslationRuntimeStatus
}

export type TranslationRuntimeStatus = 'error' | 'idle' | 'loading' | 'ready'

export const TranslationContext = createContext<TranslationContextValue>({
  language: SOURCE_TRANSLATION_LANGUAGE,
  selectLanguage: () => undefined,
  status: 'idle',
})

export function useTranslation() {
  return use(TranslationContext)
}
