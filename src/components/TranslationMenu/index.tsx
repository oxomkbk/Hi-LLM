'use client'

import { Globe } from '@gravity-ui/icons'
import { Button, Description, Dropdown, Label } from '@heroui/react'

import { useAccessSettings } from '@/components/AccessSettingsProvider/context'
import LanguageFlag from '@/components/LanguageFlag'
import { useTranslation } from '@/components/TranslationProvider/context'
import {
  getTranslationLanguage,
  isTranslationLanguageCode,
  SOURCE_TRANSLATION_LANGUAGE,
} from '@/lib/translation/languages'

export default function TranslationMenu() {
  const { loading, settings } = useAccessSettings()
  const { language, selectLanguage, status } = useTranslation()

  if (loading || !settings.available || !settings.translationEnabled)
    return null

  const current = getTranslationLanguage(language)
  const languages = settings.translationLanguages.map(getTranslationLanguage)

  return (
    <Dropdown className="ignore">
      <Button
        aria-label={`翻译，当前语言：${current.label}`}
        size="sm"
        variant="ghost"
        isIconOnly
        className="ignore relative"
      >
        <Globe aria-hidden="true" />
        {language !== SOURCE_TRANSLATION_LANGUAGE
          ? <LanguageFlag countryCode={current.countryCode} className="absolute bottom-1 right-0.5 w-3.5" />
          : null}
      </Button>

      <Dropdown.Popover placement="bottom end" className="ignore min-w-[15rem] rounded-2xl p-1.5 shadow-xl">
        <div translate="no" className="px-2.5 pb-2 pt-2">
          <p className="text-xs font-semibold text-foreground">页面语言</p>
          <p className={`mt-0.5 text-[11px] ${status === 'error' ? 'text-danger' : 'text-muted'}`}>
            {status === 'error' ? '翻译服务暂不可用，请稍后重试' : '选择后自动翻译当前与后续页面'}
          </p>
        </div>
        <Dropdown.Menu
          aria-label="选择页面语言"
          selectedKeys={new Set([language])}
          selectionMode="single"
          onAction={(key) => {
            const next = String(key)
            if (isTranslationLanguageCode(next))
              selectLanguage(next)
          }}
        >
          {languages.map(item => (
            <Dropdown.Item key={item.code} id={item.code} textValue={`${item.nativeLabel} ${item.label}`}>
              <Dropdown.ItemIndicator />
              <div translate="no" className="flex min-w-0 flex-1 items-center gap-2.5">
                <LanguageFlag countryCode={item.countryCode} className="w-5" />
                <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
                  <Label className="truncate text-sm">{item.nativeLabel}</Label>
                  {item.nativeLabel !== item.label ? <Description className="shrink-0 text-[11px]">{item.label}</Description> : null}
                </div>
              </div>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
        {language !== SOURCE_TRANSLATION_LANGUAGE
          ? (
              <p dir={language === 'arabic' ? 'rtl' : 'ltr'} lang={current.htmlLang} translate="no" className="mx-2.5 mt-1 border-t border-border/70 pb-1.5 pt-2 text-[10px] leading-4 text-muted">
                {current.machineTranslationNotice}
              </p>
            )
          : null}
      </Dropdown.Popover>
    </Dropdown>
  )
}
