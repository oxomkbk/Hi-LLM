import { WonderlandError } from './errors'

export type WonderDiscussionModerationAction = 'delete' | 'hide' | 'restore'
export type WonderQuestionModerationAction = 'close' | 'delete' | 'hide' | 'lock' | 'reopen' | 'restore' | 'unlock'
export type WonderVisibility = 'deleted' | 'hidden' | 'visible'

export function discussionModerationTransition(action: WonderDiscussionModerationAction, visibility: WonderVisibility) {
  if (visibility === 'deleted' && action !== 'restore' && action !== 'delete')
    throw new WonderlandError('已删除内容请先恢复后再处理', 409, 'DISCUSSION_STATE_INVALID')

  const nextVisibility: WonderVisibility = action === 'delete'
    ? 'deleted'
    : action === 'hide'
      ? 'hidden'
      : 'visible'

  return { changed: nextVisibility !== visibility, nextVisibility }
}

export function questionModerationTransition(action: WonderQuestionModerationAction, state: {
  isClosed: boolean
  isLocked: boolean
  visibility: WonderVisibility
}) {
  if (state.visibility === 'deleted' && action !== 'restore' && action !== 'delete')
    throw new WonderlandError('已删除问题请先恢复后再处理', 409, 'QUESTION_STATE_INVALID')

  const next = {
    isClosed: state.isClosed,
    isLocked: state.isLocked,
    visibility: state.visibility,
  }

  if (action === 'delete')
    next.visibility = 'deleted'
  else if (action === 'hide')
    next.visibility = 'hidden'
  else if (action === 'restore')
    next.visibility = 'visible'
  else if (action === 'close')
    next.isClosed = true
  else if (action === 'reopen')
    next.isClosed = false
  else if (action === 'lock')
    next.isLocked = true
  else
    next.isLocked = false

  return {
    changed: next.visibility !== state.visibility || next.isClosed !== state.isClosed || next.isLocked !== state.isLocked,
    nextIsClosed: next.isClosed,
    nextIsLocked: next.isLocked,
    nextVisibility: next.visibility,
  }
}
