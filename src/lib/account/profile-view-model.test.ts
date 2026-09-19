import { describe, expect, it } from 'vitest'

import {
  buildProfileActivity,
  buildProfileCompletion,
  buildProfileNextSteps,
  contributionTotal,
} from './profile-view-model'

import type { DataSlice, PrivateAccountUser } from './profile-types'
import type { WonderBadgeProgress } from '@/lib/wonderland/domain'

const USER: PrivateAccountUser = {
  avatarFileId: null,
  bio: null,
  canAnswer: true,
  canAsk: true,
  canComment: true,
  canPublishWorks: true,
  canUpload: true,
  createdAt: '2026-08-01T00:00:00.000Z',
  email: 'member@example.com',
  emailVerified: true,
  id: '00000000-0000-4000-8000-000000000001',
  image: null,
  lastSessionAt: null,
  loginMethods: ['credential'],
  name: '创作者',
  role: 'user',
  sessionCount: 1,
  updatedAt: '2026-08-01T00:00:00.000Z',
  website: null,
}

const EMPTY_STATS = {
  contributions: { answers: 0, comments: 0, questions: 0, works: 0 },
  workImpact: { likes: 0, views: 0 },
}

describe('profile view model', () => {
  it('calculates completion only from persisted public fields', () => {
    expect(buildProfileCompletion(USER, false)).toMatchObject({ completed: 0, percentage: 0 })
    expect(buildProfileCompletion({ ...USER, bio: '产品设计', image: '/avatar.png' }, false))
      .toMatchObject({ completed: 2, percentage: 50 })
    expect(buildProfileCompletion({ ...USER, bio: '产品设计', image: '/avatar.png', website: 'https://example.com' }, true))
      .toMatchObject({ completed: 4, percentage: 100 })
  })

  it('does not turn a failed stats slice into zero-data tasks', () => {
    const steps = buildProfileNextSteps({
      appearanceConfigured: true,
      badges: { data: [], status: 'ready' },
      stats: { status: 'error' },
      user: { ...USER, bio: '完整简介', image: '/avatar.png', website: 'https://example.com' },
    })
    expect(steps).toEqual([])
  })

  it('prioritizes missing profile data and normalized badge progress', () => {
    const badges: DataSlice<WonderBadgeProgress[]> = {
      data: [
        badge('near', 90, 100),
        badge('far', 2, 10),
      ],
      status: 'ready',
    }
    const steps = buildProfileNextSteps({
      appearanceConfigured: false,
      badges,
      stats: { data: EMPTY_STATS, status: 'ready' },
      user: USER,
    })
    expect(steps.map(step => step.id)).toEqual([
      'complete-avatar',
      'publish-first-work',
      'join-community',
    ])

    const completeUserSteps = buildProfileNextSteps({
      appearanceConfigured: true,
      badges,
      stats: { data: { ...EMPTY_STATS, contributions: { ...EMPTY_STATS.contributions, works: 1 } }, status: 'ready' },
      user: { ...USER, bio: '完整简介', image: '/avatar.png', website: 'https://example.com' },
    })
    expect(completeUserSteps.at(-1)?.id).toBe('badge-near')
  })

  it('merges questions and answers by time with explicit states', () => {
    const activity = buildProfileActivity({
      data: [
        {
          acceptedAnswerId: null,
          answerCount: 2,
          createdAt: '2026-08-27T00:00:00.000Z',
          id: 'closed-question',
          isClosed: true,
          slug: 'closed-question',
          title: '已关闭问题',
          viewCount: 10,
        },
        {
          acceptedAnswerId: 'answer-1',
          answerCount: 1,
          createdAt: '2026-08-26T00:00:00.000Z',
          id: 'resolved-question',
          isClosed: false,
          slug: 'resolved-question',
          title: '已解决问题',
          viewCount: 8,
        },
      ],
      status: 'ready',
    }, {
      data: [{
        createdAt: '2026-08-28T00:00:00.000Z',
        id: 'answer-1',
        isAccepted: true,
        question: { slug: 'resolved-question', title: '已解决问题' },
        voteScore: 3,
      }],
      status: 'ready',
    })

    expect(activity.items.map(item => [item.id, item.state])).toEqual([
      ['answer-answer-1', 'accepted'],
      ['question-closed-question', 'closed'],
      ['question-resolved-question', 'resolved'],
    ])
  })

  it('keeps partial activity instead of hiding successful data', () => {
    const activity = buildProfileActivity({ status: 'error' }, {
      data: [{
        createdAt: '2026-08-28T00:00:00.000Z',
        id: 'answer-1',
        isAccepted: false,
        question: { slug: 'question', title: '问题' },
        voteScore: 0,
      }],
      status: 'ready',
    })
    expect(activity).toMatchObject({ partial: true, status: 'ready' })
    expect(activity.items).toHaveLength(1)
  })

  it('adds every contribution type without inventing a score', () => {
    expect(contributionTotal({
      contributions: { answers: 2, comments: 3, questions: 1, works: 4 },
      workImpact: { likes: 99, views: 500 },
    })).toBe(10)
  })
})

function badge(id: string, progress: number, threshold: number): WonderBadgeProgress {
  return {
    awarded_at: null,
    description: id,
    earned: false,
    icon: 'spark',
    id,
    name: id,
    progress,
    slug: id,
    threshold,
    tone: 'amber',
  }
}
