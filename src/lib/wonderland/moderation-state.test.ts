import { describe, expect, it } from 'vitest'

import { discussionModerationTransition, questionModerationTransition } from './moderation-state'

describe('wonderland moderation state', () => {
  it('supports reversible question deletion without changing discussion flags', () => {
    const deleted = questionModerationTransition('delete', {
      isClosed: true,
      isLocked: true,
      visibility: 'hidden',
    })
    expect(deleted).toEqual({
      changed: true,
      nextIsClosed: true,
      nextIsLocked: true,
      nextVisibility: 'deleted',
    })

    expect(questionModerationTransition('restore', {
      isClosed: true,
      isLocked: true,
      visibility: 'deleted',
    })).toEqual({
      changed: true,
      nextIsClosed: true,
      nextIsLocked: true,
      nextVisibility: 'visible',
    })
  })

  it('treats repeated question actions as idempotent', () => {
    expect(questionModerationTransition('delete', {
      isClosed: false,
      isLocked: false,
      visibility: 'deleted',
    }).changed).toBe(false)
    expect(questionModerationTransition('close', {
      isClosed: true,
      isLocked: false,
      visibility: 'visible',
    }).changed).toBe(false)
  })

  it('rejects non-restore actions on deleted questions', () => {
    expect(() => questionModerationTransition('hide', {
      isClosed: false,
      isLocked: false,
      visibility: 'deleted',
    })).toThrow(/先恢复/)
    expect(() => questionModerationTransition('lock', {
      isClosed: false,
      isLocked: false,
      visibility: 'deleted',
    })).toThrow(/先恢复/)
  })

  it('models answer hide, delete, and restore transitions', () => {
    expect(discussionModerationTransition('hide', 'visible')).toEqual({ changed: true, nextVisibility: 'hidden' })
    expect(discussionModerationTransition('delete', 'hidden')).toEqual({ changed: true, nextVisibility: 'deleted' })
    expect(discussionModerationTransition('restore', 'deleted')).toEqual({ changed: true, nextVisibility: 'visible' })
    expect(discussionModerationTransition('restore', 'visible')).toEqual({ changed: false, nextVisibility: 'visible' })
    expect(() => discussionModerationTransition('hide', 'deleted')).toThrow(/先恢复/)
  })
})
