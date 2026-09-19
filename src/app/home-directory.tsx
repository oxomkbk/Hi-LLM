/*
 * @Description: 首页导航目录
 */
'use client'

import { DatabaseFill, Plus } from '@gravity-ui/icons'
import { Button, Typography } from '@heroui/react'
import { useRouter } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import AlertContent from '@/components/AlertContent'
import BlurFade from '@/components/BlurFade'
import ErrorContent from '@/components/ErrorContent'
import HomeCategoryRail from '@/components/HomeCategoryRail'
import SearchPanel from '@/components/SearchPanel'
import SkeletonContent from '@/components/SkeletonContent'
import WebsiteCard from '@/components/WebSiteCard'
import useRequest from '@/hooks/use-request'
import { recordWebsiteVisit } from '@/lib/website-visit'

import type { PaginatingResponse, PublicCatalogCategory } from '@/types'

const USE_LEGACY_CATALOG = process.env.NEXT_PUBLIC_CATALOG_LEGACY === 'true'
const CATALOG_URL = USE_LEGACY_CATALOG ? '/categorys' : '/public/catalog'
const CATALOG_PARAMS = USE_LEGACY_CATALOG ? { pageIndex: 0, pageSize: 999 } : undefined

export default function HomeDirectory() {
  const router = useRouter()

  const { data, loading, error, run } = useRequest<PaginatingResponse<PublicCatalogCategory>>(CATALOG_URL, {
    params: CATALOG_PARAMS,
  })
  const list = useMemo(() => data?.list ?? [], [data])
  const isInitialLoading = loading || (!data && !error)
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const resolvedActiveCategoryId = list.some(category => category.id === activeCategoryId)
    ? activeCategoryId
    : (list[0]?.id ?? null)
  const [highlightedCategoryId, setHighlightedCategoryId] = useState<string | null>(null)
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reload = () => {
    run(CATALOG_PARAMS)
  }

  const goAdmin = () => {
    router.push('/admin')
  }

  const handleClick = useCallback((id: string) => {
    recordWebsiteVisit(id)
  }, [])

  const scrollToCategory = useCallback((id: string) => {
    const category = document.getElementById(`category-${id}`)

    if (!category) {
      return
    }

    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current)
    }

    setActiveCategoryId(id)
    setHighlightedCategoryId(id)
    category.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    })

    highlightTimerRef.current = setTimeout(() => {
      setHighlightedCategoryId(null)
      highlightTimerRef.current = null
    }, 3000)
  }, [])

  useEffect(() => {
    if (!list.length) {
      return
    }

    const sections = list
      .map(category => document.getElementById(`category-${category.id}`))
      .filter((section): section is HTMLElement => section !== null)

    const observer = new IntersectionObserver((entries) => {
      const visibleEntry = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => Math.abs(a.boundingClientRect.top - 132) - Math.abs(b.boundingClientRect.top - 132))[0]

      if (visibleEntry) {
        setActiveCategoryId(visibleEntry.target.getAttribute('data-category-id'))
      }
    }, {
      rootMargin: '-132px 0px -62% 0px',
      threshold: 0,
    })

    sections.forEach(section => observer.observe(section))

    return () => observer.disconnect()
  }, [list])

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current)
      }
    }
  }, [])

  return (
    <div className="home-directory-page relative isolate flex flex-1">
      <div aria-hidden="true" className="home-directory-atmosphere" />

      <div className="home-directory-content container relative z-10 mx-auto flex min-w-0 flex-1 flex-col gap-6 p-4">
        <SearchPanel />

        {!isInitialLoading && !error && list.length
          ? (
              <HomeCategoryRail
                activeId={resolvedActiveCategoryId}
                categories={list}
                onSelect={scrollToCategory}
              />
            )
          : null}

        {isInitialLoading
          ? <SkeletonContent />
          : error
            ? <ErrorContent refresh={reload} />
            : !list.length
                ? (
                    <div className="flex flex-1 flex-col items-center justify-center">
                      <div className="flex size-full max-h-100 max-w-xl flex-1 items-center justify-center rounded-2xl border-border bg-surface p-6 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <div className="rounded-full bg-default p-4 text-foreground">
                            <DatabaseFill className="size-5" />
                          </div>
                          <Typography type="h5">一切安静如常 🕊️</Typography>
                          <Typography type="body-sm">当前还没有任何分类，请前往后台进行添加。</Typography>
                          <Button size="sm" variant="primary" onPress={goAdmin}>
                            <Plus />
                            添加分类
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                : (
                    <div className="home-directory-groups">
                      {list.map(({ id, name, websites }) => {
                        const isHighlighted = highlightedCategoryId === id
                        const headingId = `category-heading-${id}`

                        return (
                          <section
                            key={id}
                            aria-labelledby={headingId}
                            id={`category-${id}`}
                            data-category-id={id}
                            className={`category-section ${isHighlighted ? 'category-section--highlighted' : ''}`}
                          >
                            <h2 id={headingId} className="sr-only">{name}</h2>
                            <BlurFade blur="0px" duration={0.42} inView offset={12}>
                              {websites?.length
                                ? (
                                    <div className="category-card-grid">
                                      {websites.map(item => (
                                        <WebsiteCard
                                          key={item.id}
                                          data={item}
                                          handleClick={handleClick}
                                        />
                                      ))}
                                    </div>
                                  )
                                : (
                                    <div className="flex justify-center p-4">
                                      <AlertContent
                                        title="暂无网站数据"
                                        actionText="添加网站"
                                        buttonAction={goAdmin}
                                        description="该分类还没有任何网站，请前往后台进行添加。"
                                        status="accent"
                                      />
                                    </div>
                                  )}
                            </BlurFade>
                          </section>
                        )
                      })}
                    </div>
                  )}
      </div>
    </div>
  )
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || document.documentElement.dataset.reduceMotion === 'true'
}
