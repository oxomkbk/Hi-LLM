'use client'

import {
  Bookmark,
  BookmarkFill,
  Check,
  ThumbsDown,
  ThumbsUp,
  ThumbsUpFill,
} from '@gravity-ui/icons'
import { toast } from '@heroui/react'
import { useRouter } from 'next/navigation'
import { createContext, use, useEffect, useMemo, useState } from 'react'

import { useAuthUser } from '@/hooks/use-auth-user'
import { request } from '@/lib/request'

interface EngagementContextValue {
  answerVotes: Record<string, number>
  favorite: boolean
  follow: boolean
  questionVote: number
  setAnswerVote: (answerId: string, value: number) => void
  setFavorite: (selected: boolean) => void
  setFollow: (selected: boolean) => void
  setQuestionVote: (value: number) => void
  signedIn: boolean
  userId: string | null
}

interface ViewerState {
  answerVotes: Record<string, number>
  favorite: boolean
  follow: boolean
  questionVote: number
}

const EngagementContext = createContext<EngagementContextValue | null>(null)

export function AnswerEngagement({ answerAuthorId, answerId, isAccepted, questionAuthorId, questionId, voteScore }: { answerAuthorId: string, answerId: string, isAccepted: boolean, questionAuthorId: string, questionId: string, voteScore: number }) {
  const context = useEngagement()
  const router = useRouter()
  const [accepted, setAccepted] = useState(isAccepted)
  const [score, setScore] = useState(voteScore)
  const [pending, setPending] = useState(false)
  const value = context.answerVotes[answerId] ?? 0

  const vote = async (requested: -1 | 1) => {
    if (!context.signedIn) {
      toast.warning('登录后即可参与社区互动')
      return
    }
    if (answerAuthorId === context.userId) {
      toast.warning('不能给自己的回答投票')
      return
    }
    const next = value === requested ? 0 : requested
    setPending(true)
    try {
      const result = await request<{ value: number, voteScore: number }>(`/wonderland/answers/${answerId}/vote`, { body: JSON.stringify({ value: next }), method: 'PUT' })
      context.setAnswerVote(answerId, result.data.value)
      setScore(result.data.voteScore)
    }
    catch {}
    finally { setPending(false) }
  }

  const accept = async () => {
    setPending(true)
    try {
      await request(`/wonderland/questions/${questionId}/accepted-answer`, { body: JSON.stringify({ answerId, selected: !accepted }), method: 'PUT' })
      setAccepted(current => !current)
      toast.success(accepted ? '已取消采纳' : '回答已采纳')
      router.refresh()
    }
    catch {}
    finally { setPending(false) }
  }

  return (
    <aside className="wonderland-vote-rail">
      <button
        aria-label="赞同回答"
        aria-pressed={value === 1}
        type="button"
        disabled={pending}
        onClick={() => void vote(1)}
        className={value === 1 ? 'is-selected' : ''}
      >
        {value === 1 ? <ThumbsUpFill /> : <ThumbsUp />}
      </button>
      <strong>{score}</strong>
      <button
        aria-label="不赞同回答"
        aria-pressed={value === -1}
        type="button"
        disabled={pending}
        onClick={() => void vote(-1)}
        className={value === -1 ? 'is-selected' : ''}
      >
        <ThumbsDown />
      </button>
      {questionAuthorId === context.userId
        ? (
            <button
              aria-label={accepted ? '取消采纳' : '采纳回答'}
              aria-pressed={accepted}
              title={accepted ? '取消采纳' : '采纳回答'}
              type="button"
              disabled={pending}
              onClick={() => void accept()}
              className={accepted ? 'is-selected is-accepted' : ''}
            >
              <Check />
            </button>
          )
        : accepted ? <Check className="wonderland-accepted-check" /> : null}
    </aside>
  )
}

export function QuestionEngagement({ favoriteCount, followerCount, questionId, voteScore }: { favoriteCount: number, followerCount: number, questionId: string, voteScore: number }) {
  const context = useEngagement()
  const [counts, setCounts] = useState({ favorite: favoriteCount, follow: followerCount, vote: voteScore })
  const [pending, setPending] = useState<string | null>(null)

  const requireLogin = () => {
    if (context.signedIn)
      return true
    toast.warning('登录后即可参与社区互动')
    return false
  }

  const vote = async (requested: -1 | 1) => {
    if (!requireLogin() || pending)
      return
    const next = context.questionVote === requested ? 0 : requested
    setPending('vote')
    try {
      const result = await request<{ value: number, voteScore: number }>(`/wonderland/questions/${questionId}/vote`, { body: JSON.stringify({ value: next }), method: 'PUT' })
      context.setQuestionVote(result.data.value)
      setCounts(current => ({ ...current, vote: result.data.voteScore }))
    }
    catch {}
    finally { setPending(null) }
  }

  const engage = async (type: 'favorite' | 'follow') => {
    if (!requireLogin() || pending)
      return
    const selected = type === 'favorite' ? !context.favorite : !context.follow
    setPending(type)
    try {
      const result = await request<{ count: number, selected: boolean }>(`/wonderland/questions/${questionId}/engagement`, { body: JSON.stringify({ selected, type }), method: 'PUT' })
      if (type === 'favorite')
        context.setFavorite(result.data.selected)
      else
        context.setFollow(result.data.selected)
      setCounts(current => ({ ...current, [type]: result.data.count }))
    }
    catch {}
    finally { setPending(null) }
  }

  return (
    <aside className="wonderland-vote-rail">
      <button
        aria-label="赞同问题"
        aria-pressed={context.questionVote === 1}
        type="button"
        disabled={Boolean(pending)}
        onClick={() => void vote(1)}
        className={context.questionVote === 1 ? 'is-selected' : ''}
      >
        {context.questionVote === 1 ? <ThumbsUpFill /> : <ThumbsUp />}
      </button>
      <strong>{counts.vote}</strong>
      <button
        aria-label="不赞同问题"
        aria-pressed={context.questionVote === -1}
        type="button"
        disabled={Boolean(pending)}
        onClick={() => void vote(-1)}
        className={context.questionVote === -1 ? 'is-selected' : ''}
      >
        <ThumbsDown />
      </button>
      <button
        aria-label="收藏问题"
        aria-pressed={context.favorite}
        title={`${counts.favorite} 人收藏`}
        type="button"
        disabled={Boolean(pending)}
        onClick={() => void engage('favorite')}
        className={context.favorite ? 'is-selected' : ''}
      >
        {context.favorite ? <BookmarkFill /> : <Bookmark />}
      </button>
      <button
        aria-label="关注问题"
        aria-pressed={context.follow}
        title={`${counts.follow} 人关注`}
        type="button"
        disabled={Boolean(pending)}
        onClick={() => void engage('follow')}
        className={`wonderland-follow-button ${context.follow ? 'is-selected' : ''}`}
      >
        {context.follow ? '已关注' : '关注'}
      </button>
    </aside>
  )
}

export function WonderlandEngagementProvider({ children, questionId }: { children: React.ReactNode, questionId: string }) {
  const { user } = useAuthUser()
  const [state, setState] = useState<ViewerState>({ answerVotes: {}, favorite: false, follow: false, questionVote: 0 })

  useEffect(() => {
    const controller = new AbortController()
    void fetch(`/api/wonderland/questions/${questionId}/view`, { method: 'POST', signal: controller.signal }).catch(() => undefined)
    return () => controller.abort()
  }, [questionId])

  useEffect(() => {
    if (!user)
      return
    let active = true
    void request<ViewerState>(`/wonderland/viewer/questions/${questionId}`)
      .then((result) => {
        if (active)
          setState(result.data)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [questionId, user])

  const value = useMemo<EngagementContextValue>(() => ({
    ...state,
    setAnswerVote: (answerId, next) => setState(current => ({ ...current, answerVotes: { ...current.answerVotes, [answerId]: next } })),
    setFavorite: favorite => setState(current => ({ ...current, favorite })),
    setFollow: follow => setState(current => ({ ...current, follow })),
    setQuestionVote: questionVote => setState(current => ({ ...current, questionVote })),
    signedIn: Boolean(user),
    userId: user?.id ?? null,
  }), [state, user])

  return <EngagementContext value={value}>{children}</EngagementContext>
}

function useEngagement() {
  const value = use(EngagementContext)
  if (!value)
    throw new Error('Wonderland engagement provider is missing')
  return value
}
