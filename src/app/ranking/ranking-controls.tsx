'use client'

import { ChevronLeft, ChevronRight } from '@gravity-ui/icons'
import { Button } from '@heroui/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { getRankingScrollState, RANKING_PERIOD_OPTIONS } from '@/lib/rankings'

import type { RankingCategory, RankingPeriod } from '@/types'

interface RankingControlsProps {
  categories: RankingCategory[]
  categoryId: string | null
  loading: boolean
  onCategoryChange: (categoryId: string | null) => void
  onPeriodChange: (period: RankingPeriod) => void
  period: RankingPeriod
}

const SCROLL_EDGE_EPSILON = 4

export default function RankingControls({
  categories,
  categoryId,
  loading,
  onCategoryChange,
  onPeriodChange,
  period,
}: RankingControlsProps) {
  const categoryScrollRef = useRef<HTMLDivElement>(null)
  const scrollFrameRef = useRef<number | null>(null)
  const [scrollState, setScrollState] = useState({
    canScrollLeft: false,
    canScrollRight: false,
    hasOverflow: false,
  })

  const updateScrollState = useCallback(() => {
    if (scrollFrameRef.current !== null)
      return

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null
      const element = categoryScrollRef.current
      if (!element)
        return

      const nextState = getRankingScrollState(
        element.scrollLeft,
        element.clientWidth,
        element.scrollWidth,
        SCROLL_EDGE_EPSILON,
      )

      setScrollState((current) => {
        if (
          current.canScrollLeft === nextState.canScrollLeft
          && current.canScrollRight === nextState.canScrollRight
          && current.hasOverflow === nextState.hasOverflow
        ) {
          return current
        }

        return nextState
      })
    })
  }, [])

  useEffect(() => {
    const element = categoryScrollRef.current
    if (!element)
      return

    const frame = window.requestAnimationFrame(updateScrollState)
    const resizeObserver = new ResizeObserver(updateScrollState)
    resizeObserver.observe(element)

    return () => {
      window.cancelAnimationFrame(frame)
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current)
        scrollFrameRef.current = null
      }
      resizeObserver.disconnect()
    }
  }, [categories.length, updateScrollState])

  const scrollCategories = (direction: -1 | 1) => {
    const element = categoryScrollRef.current
    if (!element)
      return

    const distance = direction * Math.max(220, element.clientWidth * 0.72)
    const reduceMotion = document.documentElement.dataset.reduceMotion === 'true'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduceMotion) {
      const previousScrollBehavior = element.style.scrollBehavior
      element.style.scrollBehavior = 'auto'
      element.scrollLeft += distance
      element.style.scrollBehavior = previousScrollBehavior
      updateScrollState()
      return
    }

    element.scrollBy({
      behavior: 'smooth',
      left: distance,
    })
  }

  return (
    <div aria-busy={loading} className="ranking-controls">
      <span aria-atomic="true" aria-live="polite" role="status" className="sr-only">
        {loading ? '排行榜正在更新' : '排行榜数据已更新'}
      </span>
      <div className="ranking-period-control">
        <span className="ranking-control-kicker">统计周期</span>
        <div aria-label="选择排行榜统计周期" role="group" className="ranking-period-switch">
          {RANKING_PERIOD_OPTIONS.map(option => (
            <Button
              key={option.value}
              aria-pressed={period === option.value}
              size="sm"
              variant="ghost"
              isDisabled={loading}
              data-active={period === option.value}
              onPress={() => onPeriodChange(option.value)}
              className="ranking-filter-button"
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="ranking-category-filter">
        <div className="ranking-category-heading">
          <span className="ranking-control-kicker">榜单分类</span>
          {scrollState.hasOverflow
            ? (
                <span className="ranking-category-hint">
                  横向滑动查看更多
                  <ChevronRight aria-hidden="true" />
                </span>
              )
            : null}
        </div>
        <div
          data-can-scroll-left={scrollState.canScrollLeft}
          data-can-scroll-right={scrollState.canScrollRight}
          className="ranking-category-viewport"
        >
          <Button
            aria-hidden={!scrollState.canScrollLeft}
            aria-label="向左浏览更多分类"
            size="sm"
            variant="secondary"
            isDisabled={loading || !scrollState.canScrollLeft}
            isIconOnly
            onPress={() => scrollCategories(-1)}
            className="ranking-category-scroll-button is-left"
            style={{ display: scrollState.canScrollLeft ? 'inline-flex' : 'none' }}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>

          <div
            ref={categoryScrollRef}
            aria-label="选择排行榜分类"
            role="group"
            onScroll={updateScrollState}
            className="ranking-category-scroll"
          >
            <Button
              aria-pressed={categoryId === null}
              size="sm"
              variant="ghost"
              isDisabled={loading}
              data-active={categoryId === null}
              onPress={() => onCategoryChange(null)}
              className="ranking-category-button"
            >
              综合
            </Button>
            {categories.map(category => (
              <Button
                key={category.id}
                aria-pressed={categoryId === category.id}
                size="sm"
                variant="ghost"
                isDisabled={loading}
                data-active={categoryId === category.id}
                onPress={() => onCategoryChange(category.id)}
                className="ranking-category-button"
              >
                {category.name}
              </Button>
            ))}
          </div>

          <Button
            aria-hidden={!scrollState.canScrollRight}
            aria-label="向右浏览更多分类"
            size="sm"
            variant="secondary"
            isDisabled={loading || !scrollState.canScrollRight}
            isIconOnly
            onPress={() => scrollCategories(1)}
            className="ranking-category-scroll-button is-right"
            style={{ display: scrollState.canScrollRight ? 'inline-flex' : 'none' }}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div aria-hidden="true" data-loading={loading} className="ranking-refresh-state">
        <span aria-hidden="true" />
        {loading ? '正在更新数据' : '数据已更新'}
      </div>
    </div>
  )
}
