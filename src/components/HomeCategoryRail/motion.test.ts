import { describe, expect, it, vi } from 'vitest'

import {
  createAnimationFrameScheduler,
  createDirectManipulationController,
  DIRECT_MANIPULATION_IDLE_MS,
} from './motion'

describe('home category rail direct manipulation', () => {
  it('ignores mouse pointers and releases touch after the idle interval', () => {
    vi.useFakeTimers()
    const reveal = vi.fn()
    const controller = createDirectManipulationController(reveal)

    expect(controller.begin(1, 'mouse')).toBe(false)
    expect(controller.begin(2, 'touch')).toBe(true)
    expect(controller.deferActive('models')).toBe(true)
    controller.end(2)

    vi.advanceTimersByTime(DIRECT_MANIPULATION_IDLE_MS - 1)
    expect(reveal).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(reveal).toHaveBeenCalledOnce()
    expect(reveal).toHaveBeenCalledWith('models')
    expect(controller.isLocked()).toBe(false)
    vi.useRealTimers()
  })

  it('keeps only the latest deferred category', () => {
    vi.useFakeTimers()
    const reveal = vi.fn()
    const controller = createDirectManipulationController(reveal)

    controller.begin(1, 'pen')
    controller.deferActive('first')
    controller.deferActive('latest')
    controller.end(1)
    vi.runAllTimers()

    expect(reveal).toHaveBeenCalledOnce()
    expect(reveal).toHaveBeenCalledWith('latest')
    vi.useRealTimers()
  })

  it('waits for the final pointer and protects a newer gesture from an older timer', () => {
    vi.useFakeTimers()
    const reveal = vi.fn()
    const controller = createDirectManipulationController(reveal)

    controller.begin(1, 'touch')
    controller.begin(2, 'touch')
    controller.deferActive('agents')
    controller.end(1)
    vi.advanceTimersByTime(DIRECT_MANIPULATION_IDLE_MS)
    expect(reveal).not.toHaveBeenCalled()

    controller.end(2)
    vi.advanceTimersByTime(DIRECT_MANIPULATION_IDLE_MS - 20)
    controller.begin(3, 'touch')
    vi.advanceTimersByTime(DIRECT_MANIPULATION_IDLE_MS)
    expect(reveal).not.toHaveBeenCalled()

    controller.end(3)
    vi.advanceTimersByTime(DIRECT_MANIPULATION_IDLE_MS)
    expect(reveal).toHaveBeenCalledWith('agents')
    vi.useRealTimers()
  })

  it('postpones release until momentum scrolling becomes idle', () => {
    vi.useFakeTimers()
    const reveal = vi.fn()
    const controller = createDirectManipulationController(reveal)

    controller.begin(1, 'touch')
    controller.deferActive('writing')
    controller.end(1)
    vi.advanceTimersByTime(100)
    controller.noteScroll()
    vi.advanceTimersByTime(100)
    expect(reveal).not.toHaveBeenCalled()
    controller.noteScroll()
    vi.advanceTimersByTime(DIRECT_MANIPULATION_IDLE_MS)

    expect(reveal).toHaveBeenCalledWith('writing')
    vi.useRealTimers()
  })

  it('recovers immediately from lifecycle loss and ignores duplicate pointer endings', () => {
    vi.useFakeTimers()
    const reveal = vi.fn()
    const controller = createDirectManipulationController(reveal)

    controller.begin(8, 'touch')
    controller.deferActive('video')
    controller.end(99)
    expect(controller.isLocked()).toBe(true)
    controller.reset()

    expect(controller.isLocked()).toBe(false)
    expect(reveal).toHaveBeenCalledWith('video')
    controller.end(8)
    vi.runAllTimers()
    expect(reveal).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('does not reveal or run timers after disposal', () => {
    vi.useFakeTimers()
    const reveal = vi.fn()
    const controller = createDirectManipulationController(reveal)

    controller.begin(1, 'touch')
    controller.deferActive('audio')
    controller.end(1)
    controller.dispose()
    vi.runAllTimers()

    expect(reveal).not.toHaveBeenCalled()
    expect(controller.isLocked()).toBe(false)
    vi.useRealTimers()
  })
})

describe('home category rail animation frame scheduler', () => {
  it('coalesces bursts and permits scheduling from a completed measurement', () => {
    const callbacks: FrameRequestCallback[] = []
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback)
      return callbacks.length
    })
    const cancelFrame = vi.fn()
    let scheduler: ReturnType<typeof createAnimationFrameScheduler>
    const measure = vi.fn(() => scheduler.schedule())
    scheduler = createAnimationFrameScheduler(measure, requestFrame, cancelFrame)

    scheduler.schedule()
    scheduler.schedule()
    scheduler.schedule()
    expect(requestFrame).toHaveBeenCalledOnce()

    callbacks.shift()?.(0)
    expect(measure).toHaveBeenCalledOnce()
    expect(requestFrame).toHaveBeenCalledTimes(2)
  })

  it('cancels a pending frame and ignores late scheduling after disposal', () => {
    const requestFrame = vi.fn((_callback: FrameRequestCallback) => 42)
    const cancelFrame = vi.fn()
    const measure = vi.fn()
    const scheduler = createAnimationFrameScheduler(measure, requestFrame, cancelFrame)

    scheduler.schedule()
    scheduler.dispose()
    scheduler.schedule()

    expect(cancelFrame).toHaveBeenCalledWith(42)
    expect(requestFrame).toHaveBeenCalledOnce()
    expect(measure).not.toHaveBeenCalled()
  })
})
