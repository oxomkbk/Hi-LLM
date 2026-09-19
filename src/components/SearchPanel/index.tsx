/*
 * @Description: 首页快捷搜索
 */
'use client'

import { Magnifier, ThumbsUpFill } from '@gravity-ui/icons'
import { Button, SearchField } from '@heroui/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'

import NavigationAiAssistant from '@/components/NavigationAiAssistant'

const SEARCH_ENGINES = [
  {
    id: 'resource',
    name: '资源网',
    url: 'https://human.rlybtd.com/?s=',
    recommended: true,
  },
  {
    id: 'baidu',
    name: '百度',
    url: 'https://www.baidu.com/s?word=',
  },
  {
    id: 'bing',
    name: '必应',
    url: 'https://cn.bing.com/search?q=',
  },
  {
    id: 'google',
    name: '谷歌',
    url: 'https://www.google.com/search?q=',
  },
  {
    id: 'sogou',
    name: '搜狗',
    url: 'https://www.sogou.com/web?query=',
  },
  {
    id: 'bilibili',
    name: '哔哩哔哩',
    url: 'https://search.bilibili.com/all?keyword=',
  },
  {
    id: 'zhihu',
    name: '知乎',
    url: 'https://www.zhihu.com/search?q=',
  },
] as const

type SearchEngine = (typeof SEARCH_ENGINES)[number]

const DEFAULT_ENGINE_ID: SearchEngine['id'] = 'baidu'

export default function SearchPanel() {
  const [engineId, setEngineId] = useState<SearchEngine['id']>(DEFAULT_ENGINE_ID)
  const [keyword, setKeyword] = useState('')
  const [aiOpen, setAiOpen] = useState(false)
  const shouldReduceMotion = useReducedMotion()
  const currentEngine = SEARCH_ENGINES.find(engine => engine.id === engineId) ?? SEARCH_ENGINES[1]

  const search = (value: string) => {
    const query = value.trim()

    if (!query) {
      return
    }

    window.open(`${currentEngine.url}${encodeURIComponent(query)}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <section
      aria-label="快捷搜索"
      className="home-search-panel relative isolate mx-auto w-full max-w-4xl py-6 sm:py-8"
    >
      <div className="mb-5 text-center">
        <h1 className="home-search-title text-xl font-black tracking-tight sm:text-2xl">搜索，从这里开始</h1>
      </div>

      <div
        aria-label="选择搜索引擎"
        role="group"
        className="home-search-engines mx-auto mb-4 flex w-fit max-w-full flex-wrap items-center justify-center gap-0.5 rounded-xl border border-border/60 bg-default/45 p-1"
      >
        {SEARCH_ENGINES.map((engine) => {
          const isSelected = engine.id === currentEngine.id

          return (
            <Button
              key={engine.id}
              aria-label={'recommended' in engine && engine.recommended ? `${engine.name}（推荐）` : engine.name}
              aria-pressed={isSelected}
              size="sm"
              variant="ghost"
              onPress={() => {
                setAiOpen(false)
                setEngineId(engine.id)
              }}
              className={`relative isolate h-8 min-w-max overflow-hidden rounded-lg px-2.5 text-[11px] font-bold transition-[color,transform] duration-200 data-[hovered=true]:-translate-y-px data-[pressed=true]:scale-[0.96] motion-reduce:transform-none motion-reduce:transition-none sm:text-xs ${isSelected ? 'text-background' : 'text-muted data-[hovered=true]:text-foreground'}`}
            >
              {isSelected
                ? (
                    <motion.span
                      aria-hidden="true"
                      layoutId="active-search-engine"
                      transition={shouldReduceMotion
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 560, damping: 32, mass: 0.55 }}
                      className="absolute inset-0 -z-10 rounded-lg bg-foreground shadow-sm"
                    />
                  )
                : null}
              {isSelected && !shouldReduceMotion
                ? (
                    <motion.span
                      key={`selection-pulse-${engine.id}`}
                      aria-hidden="true"
                      animate={{ opacity: 0, scale: 1.16 }}
                      initial={{ opacity: 0.45, scale: 0.82 }}
                      transition={{ duration: 0.42, ease: 'easeOut' }}
                      className="pointer-events-none absolute inset-0 z-0 rounded-lg border border-background/70"
                    />
                  )
                : null}
              <motion.span
                animate={isSelected
                  ? { opacity: 1, scale: 1, y: 0 }
                  : { opacity: 0.82, scale: 0.96, y: 1 }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
                className="relative z-10 flex items-center gap-1"
              >
                <span className="truncate">{engine.name}</span>
                {'recommended' in engine && engine.recommended
                  ? <ThumbsUpFill aria-hidden="true" className="size-2.5 shrink-0" />
                  : null}
              </motion.span>
            </Button>
          )
        })}
      </div>

      <div
        data-ai-open={aiOpen ? 'true' : 'false'}
        className="home-search-interaction mx-auto w-full max-w-4xl"
      >
        <SearchField
          aria-label={`在${currentEngine.name}中搜索`}
          fullWidth
          value={keyword}
          onChange={setKeyword}
          onSubmit={search}
          className="home-search-web-field w-full"
        >
          <SearchField.Group className="home-web-search-shell h-14 overflow-hidden rounded-2xl border border-border/90 bg-background/80 shadow-[0_10px_28px_-22px_rgba(0,0,0,0.55)] transition-[border-color,box-shadow] duration-200 focus-within:border-foreground/25 focus-within:shadow-[0_14px_32px_-20px_rgba(0,0,0,0.5)] motion-reduce:transition-none sm:h-15">
            <SearchField.SearchIcon className="ml-4 size-5 text-muted">
              <Magnifier />
            </SearchField.SearchIcon>
            <SearchField.Input
              autoComplete="off"
              placeholder={`在 ${currentEngine.name} 搜索关键词…`}
              className="h-full min-w-0 px-3 text-sm font-medium placeholder:font-normal sm:text-base"
            />
            <SearchField.ClearButton aria-label="清空搜索内容" className="shrink-0 text-muted" />
            <Button
              aria-label={`使用${currentEngine.name}搜索`}
              type="button"
              variant="primary"
              isDisabled={!keyword.trim()}
              onPress={() => search(keyword)}
              className="home-web-search-button mr-1.5 h-11 shrink-0 rounded-xl px-4 text-sm font-bold shadow-none transition-transform duration-200 data-[pressed=true]:scale-[0.97] motion-reduce:transform-none motion-reduce:transition-none sm:px-6"
            >
              <span className="sm:hidden">搜索</span>
              <span className="hidden min-w-20 items-center justify-center overflow-hidden sm:inline-flex">
                <AnimatePresence initial={false} mode="wait">
                  <motion.span
                    key={currentEngine.id}
                    animate={{ opacity: 1, y: 0 }}
                    exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -5 }}
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 5 }}
                    transition={{ duration: shouldReduceMotion ? 0 : 0.16, ease: 'easeOut' }}
                  >
                    {currentEngine.name}
                    搜索
                  </motion.span>
                </AnimatePresence>
              </span>
            </Button>
          </SearchField.Group>
        </SearchField>

        <NavigationAiAssistant open={aiOpen} onOpenChange={setAiOpen} />
      </div>
    </section>
  )
}
