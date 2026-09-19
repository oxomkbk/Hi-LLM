'use client'

import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'

import { useAccessSettings } from '@/components/AccessSettingsProvider/context'
import {
  getTranslationLanguage,
  reconcileTranslationLanguage,
  SOURCE_TRANSLATION_LANGUAGE,
} from '@/lib/translation/languages'

import { TranslationContext } from './context'

import type { TranslationRuntimeStatus } from './context'
import type { TranslationLanguageCode } from '@/lib/translation/languages'
import type { PropsWithChildren } from 'react'

const TRANSLATION_LANGUAGE_STORAGE_KEY = 'hi-llm:translation-language'
let translateRuntimePromise: Promise<Xnx3TranslateApi> | null = null

interface Xnx3TranslateApi {
  changeLanguage: (language: string) => void
  execute: () => void
  ignore: {
    class: string[] | { data: string[] }
    tag: string[]
  }
  language: {
    getCurrent: () => string
    setLocal: (language: string) => void
    translateLanguagesRange: string[]
  }
  listener: {
    observer?: MutationObserver
    start: () => void
  }
  reset: (config?: { notTranslateTip?: boolean, selectLanguageRefreshRender?: boolean }) => void
  service: {
    use: (channel: string) => void
  }
  selectLanguageTag: {
    show: boolean
  }
}

declare global {
  interface Window {
    translate?: Xnx3TranslateApi
  }
}

export default function TranslationProvider({ children }: PropsWithChildren) {
  const pathname = usePathname()
  const { settings } = useAccessSettings()
  const [preferredLanguage, setPreferredLanguage] = useState<unknown>(() => {
    if (typeof window === 'undefined')
      return null
    try {
      return localStorage.getItem(TRANSLATION_LANGUAGE_STORAGE_KEY)
    }
    catch {
      return null
    }
  })
  const [status, updateStatus] = useReducer((_: TranslationRuntimeStatus, next: TranslationRuntimeStatus) => next, 'idle')
  const enabled = settings.available && settings.translationEnabled
  const language = reconcileTranslationLanguage(
    preferredLanguage,
    settings.translationDefaultLanguage,
    settings.translationLanguages,
  )

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== TRANSLATION_LANGUAGE_STORAGE_KEY)
        return
      setPreferredLanguage(event.newValue)
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [settings.translationDefaultLanguage, settings.translationLanguages])

  useEffect(() => {
    let cancelled = false
    const activeLanguage = enabled ? language : SOURCE_TRANSLATION_LANGUAGE
    updateDocumentLanguage(activeLanguage)

    if (activeLanguage === SOURCE_TRANSLATION_LANGUAGE) {
      resetTranslationRuntime()
      updateStatus(enabled ? 'ready' : 'idle')
      return () => {
        cancelled = true
      }
    }

    updateStatus('loading')
    void loadTranslateRuntime()
      .then((translate) => {
        if (cancelled)
          return
        configureTranslateRuntime(translate, settings.translationLanguages)
        translate.changeLanguage(activeLanguage)
        updateStatus('ready')
      })
      .catch(() => {
        if (!cancelled)
          updateStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [enabled, language, settings.translationLanguages])

  useEffect(() => {
    if (!enabled || language === SOURCE_TRANSLATION_LANGUAGE || !window.translate)
      return

    const frame = requestAnimationFrame(() => window.translate?.execute())
    return () => cancelAnimationFrame(frame)
  }, [enabled, language, pathname])

  useEffect(() => () => {
    resetTranslationRuntime()
    updateDocumentLanguage(SOURCE_TRANSLATION_LANGUAGE)
  }, [])

  const selectLanguage = useCallback((nextLanguage: TranslationLanguageCode) => {
    if (!settings.translationLanguages.includes(nextLanguage))
      return
    setPreferredLanguage(nextLanguage)
    try {
      localStorage.setItem(TRANSLATION_LANGUAGE_STORAGE_KEY, nextLanguage)
    }
    catch {
      // 隐私模式或禁用存储时，当前标签页内仍然可以完成切换。
    }
  }, [settings.translationLanguages])

  const value = useMemo(() => ({ language, selectLanguage, status }), [language, selectLanguage, status])
  return <TranslationContext value={value}>{children}</TranslationContext>
}

function configureTranslateRuntime(translate: Xnx3TranslateApi, languages: readonly TranslationLanguageCode[]) {
  translate.language.setLocal(SOURCE_TRANSLATION_LANGUAGE)
  translate.language.translateLanguagesRange = [...languages]
  translate.service.use('client.edge')
  translate.selectLanguageTag.show = false
  const ignoredClasses = Array.isArray(translate.ignore.class)
    ? translate.ignore.class
    : translate.ignore.class.data
  pushUnique(ignoredClasses, 'notranslate')
  pushUnique(ignoredClasses, 'translate-ignore')
  for (const tag of ['textarea', 'input', 'select', 'option', 'kbd'])
    pushUnique(translate.ignore.tag, tag)
  translate.listener.start()
}

function loadTranslateRuntime() {
  if (window.translate)
    return Promise.resolve(window.translate)
  if (translateRuntimePromise)
    return translateRuntimePromise

  translateRuntimePromise = import('i18n-jsautotranslate')
    .then((module) => {
      const runtime = (module.default ?? module) as Xnx3TranslateApi
      if (!runtime?.changeLanguage || !runtime?.execute)
        throw new Error('translate.js 初始化失败')
      window.translate = runtime
      return runtime
    })
    .catch((error) => {
      translateRuntimePromise = null
      throw error
    })
  return translateRuntimePromise
}

function pushUnique(values: string[], value: string) {
  if (!values.includes(value))
    values.push(value)
}

function resetTranslationRuntime() {
  const translate = window.translate
  if (!translate)
    return
  try {
    if (translate.language.getCurrent() !== SOURCE_TRANSLATION_LANGUAGE)
      translate.changeLanguage(SOURCE_TRANSLATION_LANGUAGE)
    translate.reset({ notTranslateTip: false, selectLanguageRefreshRender: false })
  }
  catch {
    // 第三方运行时异常不应阻断站点路由与 React 渲染。
  }
}

function updateDocumentLanguage(language: TranslationLanguageCode) {
  const { htmlLang } = getTranslationLanguage(language)
  document.documentElement.lang = htmlLang
  document.documentElement.dir = language === 'arabic' ? 'rtl' : 'ltr'
  document.documentElement.dataset.translationLanguage = language
}
