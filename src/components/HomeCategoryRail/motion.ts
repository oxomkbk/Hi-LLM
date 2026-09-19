export const DIRECT_MANIPULATION_IDLE_MS = 140

export interface AnimationFrameScheduler {
  dispose: () => void
  schedule: () => void
}

export interface DirectManipulationController {
  begin: (pointerId: number, pointerType: PointerKind) => boolean
  deferActive: (activeId: string) => boolean
  dispose: () => void
  end: (pointerId: number) => void
  isLocked: () => boolean
  noteScroll: () => void
  reset: () => void
}

type PointerKind = 'mouse' | 'pen' | 'touch' | string

export function createAnimationFrameScheduler(
  measure: () => void,
  requestFrame: (callback: FrameRequestCallback) => number,
  cancelFrame: (frame: number) => void,
): AnimationFrameScheduler {
  let disposed = false
  let frame: number | null = null

  return {
    dispose() {
      disposed = true
      if (frame !== null) {
        cancelFrame(frame)
        frame = null
      }
    },
    schedule() {
      if (disposed || frame !== null)
        return

      frame = requestFrame(() => {
        frame = null
        if (!disposed)
          measure()
      })
    },
  }
}

export function createDirectManipulationController(
  revealPending: (activeId: string) => void,
  idleMs = DIRECT_MANIPULATION_IDLE_MS,
): DirectManipulationController {
  const pointerIds = new Set<number>()
  let disposed = false
  let locked = false
  let pendingActiveId: string | null = null
  let releaseTimer: ReturnType<typeof setTimeout> | null = null

  const clearReleaseTimer = () => {
    if (releaseTimer === null)
      return

    clearTimeout(releaseTimer)
    releaseTimer = null
  }

  const release = () => {
    clearReleaseTimer()
    if (disposed)
      return

    pointerIds.clear()
    locked = false

    const activeId = pendingActiveId
    pendingActiveId = null
    if (activeId)
      revealPending(activeId)
  }

  const scheduleRelease = () => {
    clearReleaseTimer()
    releaseTimer = setTimeout(release, idleMs)
  }

  return {
    begin(pointerId, pointerType) {
      if (disposed || (pointerType !== 'touch' && pointerType !== 'pen'))
        return false

      clearReleaseTimer()
      pointerIds.add(pointerId)
      locked = true
      return true
    },
    deferActive(activeId) {
      if (!locked || disposed)
        return false

      pendingActiveId = activeId
      return true
    },
    dispose() {
      disposed = true
      clearReleaseTimer()
      pointerIds.clear()
      pendingActiveId = null
      locked = false
    },
    end(pointerId) {
      if (disposed || !pointerIds.delete(pointerId))
        return

      if (pointerIds.size === 0)
        scheduleRelease()
    },
    isLocked() {
      return locked
    },
    noteScroll() {
      if (!disposed && locked && pointerIds.size === 0)
        scheduleRelease()
    },
    reset: release,
  }
}
