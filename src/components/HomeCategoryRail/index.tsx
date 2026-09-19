'use client'

import { ChevronLeft, ChevronRight } from '@gravity-ui/icons'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  createAnimationFrameScheduler,
  createDirectManipulationController,
} from './motion'

import type {
  AnimationFrameScheduler,
  DirectManipulationController,
} from './motion'
import type { PointerEvent as ReactPointerEvent } from 'react'

interface CategoryNavigationItem {
  id: string
  name: string
  websites?: unknown[]
}

interface HomeCategoryRailProps {
  activeId: string | null
  categories: CategoryNavigationItem[]
  onSelect: (id: string) => void
}

const EDGE_TOLERANCE = 2

export default function HomeCategoryRail({ activeId, categories, onSelect }: HomeCategoryRailProps) {
  const railRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const itemMapRef = useRef(new Map<string, HTMLButtonElement>())
  const overflowSchedulerRef = useRef<AnimationFrameScheduler | null>(null)
  const interactionControllerRef = useRef<DirectManipulationController | null>(null)
  const stuckRef = useRef(false)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [isStuck, setIsStuck] = useState(false)

  const measureOverflow = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport)
      return

    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    const nextCanScrollLeft = viewport.scrollLeft > EDGE_TOLERANCE
    const nextCanScrollRight = maxScrollLeft - viewport.scrollLeft > EDGE_TOLERANCE
    setCanScrollLeft(current => current === nextCanScrollLeft ? current : nextCanScrollLeft)
    setCanScrollRight(current => current === nextCanScrollRight ? current : nextCanScrollRight)
  }, [])

  const revealActiveItem = useCallback((id: string, behavior: ScrollBehavior) => {
    const viewport = viewportRef.current
    const activeItem = itemMapRef.current.get(id)
    if (!viewport || !activeItem)
      return

    const itemStart = activeItem.offsetLeft
    const itemEnd = itemStart + activeItem.offsetWidth
    const visibleStart = viewport.scrollLeft
    const visibleEnd = visibleStart + viewport.clientWidth
    const nextScrollLeft = itemStart < visibleStart
      ? itemStart
      : itemEnd > visibleEnd
        ? itemEnd - viewport.clientWidth
        : null

    if (nextScrollLeft !== null) {
      viewport.scrollTo({
        behavior,
        left: Math.max(0, nextScrollLeft),
      })
    }

    overflowSchedulerRef.current?.schedule()
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport)
      return

    const scheduler = createAnimationFrameScheduler(
      measureOverflow,
      callback => window.requestAnimationFrame(callback),
      frame => window.cancelAnimationFrame(frame),
    )
    overflowSchedulerRef.current = scheduler
    const scheduleOverflow = () => scheduler.schedule()
    const handleScroll = () => {
      scheduler.schedule()
      interactionControllerRef.current?.noteScroll()
    }
    const resizeObserver = new ResizeObserver(scheduleOverflow)

    resizeObserver.observe(viewport)
    if (viewport.firstElementChild instanceof HTMLElement)
      resizeObserver.observe(viewport.firstElementChild)
    viewport.addEventListener('scroll', handleScroll, { passive: true })
    scheduler.schedule()
    void document.fonts?.ready.then(scheduleOverflow)

    return () => {
      resizeObserver.disconnect()
      viewport.removeEventListener('scroll', handleScroll)
      scheduler.dispose()
      if (overflowSchedulerRef.current === scheduler)
        overflowSchedulerRef.current = null
    }
  }, [categories, measureOverflow])

  useEffect(() => {
    const controller = createDirectManipulationController((id) => {
      revealActiveItem(id, 'auto')
    })
    interactionControllerRef.current = controller

    const releaseInteraction = () => controller.reset()
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden')
        releaseInteraction()
    }

    window.addEventListener('blur', releaseInteraction)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('blur', releaseInteraction)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      controller.dispose()
      if (interactionControllerRef.current === controller)
        interactionControllerRef.current = null
    }
  }, [revealActiveItem])

  useEffect(() => {
    let frame = 0

    const measureStuckState = () => {
      frame = 0
      const rail = railRef.current
      if (!rail)
        return

      const nextIsStuck = rail.getBoundingClientRect().top <= 65
      if (nextIsStuck === stuckRef.current)
        return

      stuckRef.current = nextIsStuck
      setIsStuck(nextIsStuck)
    }

    const scheduleMeasurement = () => {
      if (frame === 0)
        frame = window.requestAnimationFrame(measureStuckState)
    }

    scheduleMeasurement()
    window.addEventListener('scroll', scheduleMeasurement, { passive: true })
    window.addEventListener('resize', scheduleMeasurement)

    return () => {
      if (frame !== 0)
        window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', scheduleMeasurement)
      window.removeEventListener('resize', scheduleMeasurement)
    }
  }, [])

  useEffect(() => {
    if (!activeId)
      return

    if (interactionControllerRef.current?.deferActive(activeId)) {
      overflowSchedulerRef.current?.schedule()
      return
    }

    revealActiveItem(activeId, prefersImmediateRailMovement() ? 'auto' : 'smooth')
  }, [activeId, revealActiveItem])

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const didBegin = interactionControllerRef.current?.begin(event.pointerId, event.pointerType)
    if (didBegin && !event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
    interactionControllerRef.current?.end(event.pointerId)
  }

  const scrollRail = (direction: -1 | 1) => {
    const viewport = viewportRef.current
    if (!viewport)
      return

    viewport.scrollBy({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      left: direction * Math.max(180, viewport.clientWidth * 0.72),
    })
  }

  return (
    <div
      ref={railRef}
      data-can-scroll-left={canScrollLeft}
      data-can-scroll-right={canScrollRight}
      data-is-stuck={isStuck}
      className="home-category-rail"
    >
      <nav
        ref={viewportRef}
        aria-label="网站分类"
        onLostPointerCapture={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerEnd}
        className="home-category-rail-viewport"
      >
        <div className="home-category-rail-track">
          {categories.map(category => (
            <button
              key={category.id}
              ref={(node) => {
                if (node)
                  itemMapRef.current.set(category.id, node)
                else
                  itemMapRef.current.delete(category.id)
              }}
              aria-current={category.id === activeId ? 'location' : undefined}
              aria-label={`${category.name}，${category.websites?.length ?? 0} 个站点`}
              type="button"
              onClick={() => onSelect(category.id)}
              className="home-category-rail-item"
            >
              <span aria-hidden="true" className="home-category-rail-active-dot" />
              <span className="home-category-rail-label">{category.name}</span>
              <span aria-hidden="true" className="home-category-rail-count">
                {category.websites?.length ?? 0}
              </span>
            </button>
          ))}
        </div>
      </nav>

      <span aria-hidden="true" className="home-category-rail-edge home-category-rail-edge--left" />
      <span aria-hidden="true" className="home-category-rail-edge home-category-rail-edge--right" />
      <button
        aria-label="向左浏览分类"
        type="button"
        disabled={!canScrollLeft}
        onClick={() => scrollRail(-1)}
        className="home-category-rail-control home-category-rail-control--left"
      >
        <ChevronLeft aria-hidden="true" />
      </button>
      <button
        aria-label="向右浏览分类"
        type="button"
        disabled={!canScrollRight}
        onClick={() => scrollRail(1)}
        className="home-category-rail-control home-category-rail-control--right"
      >
        <ChevronRight aria-hidden="true" />
      </button>
    </div>
  )
}

function prefersImmediateRailMovement() {
  return prefersReducedMotion() || window.matchMedia('(max-width: 39.999rem)').matches
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || document.documentElement.dataset.reduceMotion === 'true'
}
