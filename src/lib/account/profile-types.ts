import type { ProfileAppearance } from './appearance'
import type { WonderBadgeProgress } from '@/lib/wonderland/domain'

export interface CommunityContributions {
  answers: number
  comments: number
  questions: number
  works: number
}

export interface CommunityStats {
  contributions: CommunityContributions
  workImpact: {
    likes: number
    views: number
  }
}

export interface CommunitySummary {
  badges: DataSlice<WonderBadgeProgress[]>
  recentAnswers: DataSlice<RecentAnswer[]>
  recentQuestions: DataSlice<RecentQuestion[]>
  recentWorks: DataSlice<RecentWork[]>
  stats: DataSlice<CommunityStats>
}

export type DataSlice<T>
  = | { data: T, status: 'ready' }
    | { status: 'error' }

export interface PrivateAccountData {
  appearance: ProfileAppearance
  appearanceConfigured: boolean
  community: CommunitySummary
  user: PrivateAccountUser
}

export interface PrivateAccountUser {
  avatarFileId: string | null
  bio: string | null
  canAnswer: boolean
  canAsk: boolean
  canComment: boolean
  canPublishWorks: boolean
  canUpload: boolean
  createdAt: string
  email: string
  emailVerified: boolean
  id: string
  image: string | null
  lastSessionAt: string | null
  loginMethods: string[]
  name: string
  role: 'admin' | 'user'
  sessionCount: number
  updatedAt: string
  website: string | null
}

export interface PublicAccountData {
  appearance: ProfileAppearance
  community: CommunitySummary
  user: PublicAccountUser
}

export interface PublicAccountUser {
  bio: string | null
  createdAt: string
  id: string
  image: string | null
  name: string
  website: string | null
}

export interface RecentAnswer {
  createdAt: string
  id: string
  isAccepted: boolean
  question: {
    slug: string
    title: string
  }
  voteScore: number
}

export interface RecentQuestion {
  acceptedAnswerId: string | null
  answerCount: number
  createdAt: string
  id: string
  isClosed: boolean
  slug: string
  title: string
  viewCount: number
}

export interface RecentWork {
  coverFileId: string
  featured: boolean
  id: string
  kind: string
  likeCount: number
  publishedAt: string
  slug: string
  summary: string
  title: string
  viewCount: number
}

export function isReadySlice<T>(slice: DataSlice<T>): slice is { data: T, status: 'ready' } {
  return slice.status === 'ready'
}
