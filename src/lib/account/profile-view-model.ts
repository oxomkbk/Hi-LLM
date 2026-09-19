import { questionDisplayState } from '../wonderland/domain'
import { isReadySlice } from './profile-types'

import type {
  CommunityStats,
  DataSlice,
  PrivateAccountUser,
  RecentAnswer,
  RecentQuestion,
} from './profile-types'
import type { WonderBadgeProgress } from '@/lib/wonderland/domain'

export interface ProfileActivity {
  createdAt: string
  href: string
  id: string
  kind: 'answer' | 'question'
  metrics: Array<{ label: string, value: number }>
  state: 'accepted' | 'closed' | 'open' | 'resolved'
  title: string
}

export interface ProfileCompletion {
  completed: number
  items: Array<{
    complete: boolean
    id: 'appearance' | 'avatar' | 'bio' | 'website'
    label: string
  }>
  percentage: number
}

export interface ProfileNextStep {
  description: string
  href: string
  id: string
  label: string
}

export function buildProfileActivity(
  questions: DataSlice<RecentQuestion[]>,
  answers: DataSlice<RecentAnswer[]>,
): { items: ProfileActivity[], partial: boolean, status: 'error' | 'ready' } {
  if (!isReadySlice(questions) && !isReadySlice(answers))
    return { items: [], partial: false, status: 'error' }

  const questionItems: ProfileActivity[] = isReadySlice(questions)
    ? questions.data.map((question) => {
        const state = questionDisplayState({
          accepted_answer_id: question.acceptedAnswerId,
          is_closed: question.isClosed,
        })
        return {
          createdAt: question.createdAt,
          href: `/wonderland/questions/${question.slug}`,
          id: `question-${question.id}`,
          kind: 'question',
          metrics: [
            { label: '回答', value: question.answerCount },
            { label: '浏览', value: question.viewCount },
          ],
          state,
          title: question.title,
        }
      })
    : []

  const answerItems: ProfileActivity[] = isReadySlice(answers)
    ? answers.data.map(answer => ({
        createdAt: answer.createdAt,
        href: `/wonderland/questions/${answer.question.slug}`,
        id: `answer-${answer.id}`,
        kind: 'answer',
        metrics: [{ label: '得票', value: answer.voteScore }],
        state: answer.isAccepted ? 'accepted' : 'open',
        title: answer.question.title,
      }))
    : []

  return {
    items: [...questionItems, ...answerItems]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
      .slice(0, 8),
    partial: !isReadySlice(questions) || !isReadySlice(answers),
    status: 'ready',
  }
}

export function buildProfileCompletion(
  user: Pick<PrivateAccountUser, 'bio' | 'image' | 'website'>,
  appearanceConfigured: boolean,
): ProfileCompletion {
  const items: ProfileCompletion['items'] = [
    { complete: Boolean(user.image), id: 'avatar', label: '设置头像' },
    { complete: Boolean(user.bio?.trim()), id: 'bio', label: '补充简介' },
    { complete: Boolean(user.website?.trim()), id: 'website', label: '添加个人网站' },
    { complete: appearanceConfigured, id: 'appearance', label: '保存主页外观' },
  ]
  const completed = items.filter(item => item.complete).length
  return { completed, items, percentage: completed * 25 }
}

export function buildProfileNextSteps({
  appearanceConfigured,
  badges,
  stats,
  user,
}: {
  appearanceConfigured: boolean
  badges: DataSlice<WonderBadgeProgress[]>
  stats: DataSlice<CommunityStats>
  user: PrivateAccountUser
}): ProfileNextStep[] {
  const completion = buildProfileCompletion(user, appearanceConfigured)
  const steps: ProfileNextStep[] = []
  const missingProfile = completion.items.find(item => !item.complete)

  if (missingProfile) {
    const appearanceMissing = missingProfile.id === 'appearance'
    steps.push({
      description: appearanceMissing ? '选择一套封面风格，让公开主页更有辨识度。' : '补齐公开身份信息，让其他成员更快认识你。',
      href: appearanceMissing ? '/account?section=appearance' : '/account?section=profile',
      id: `complete-${missingProfile.id}`,
      label: missingProfile.label,
    })
  }

  if (isReadySlice(stats)) {
    const contributions = stats.data.contributions
    if (!contributions.works && (user.canPublishWorks || user.role === 'admin')) {
      steps.push({
        description: '把正在做的项目带到作品广场，建立第一张创作名片。',
        href: '/wonderland/works/new',
        id: 'publish-first-work',
        label: '发布第一件作品',
      })
    }
    if (!contributions.questions && !contributions.answers && (user.canAsk || user.canAnswer || user.role === 'admin')) {
      steps.push({
        description: '发起问题或回答一条讨论，留下第一条社区足迹。',
        href: '/wonderland',
        id: 'join-community',
        label: '参与妙妙屋',
      })
    }
  }

  if (isReadySlice(badges)) {
    const nextBadge = [...badges.data]
      .filter(badge => !badge.earned && badge.threshold > 0)
      .sort((left, right) => {
        const progressDifference = right.progress / right.threshold - left.progress / left.threshold
        return progressDifference || left.id.localeCompare(right.id)
      })[0]
    if (nextBadge) {
      steps.push({
        description: `${Math.min(nextBadge.progress, nextBadge.threshold)} / ${nextBadge.threshold}，继续创作即可推进。`,
        href: '/account?section=overview#achievements',
        id: `badge-${nextBadge.id}`,
        label: `接近「${nextBadge.name}」`,
      })
    }
  }

  return steps.slice(0, 3)
}

export function contributionTotal(stats: CommunityStats) {
  return Object.values(stats.contributions).reduce((total, value) => total + value, 0)
}
