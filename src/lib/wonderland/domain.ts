export const WONDER_CATEGORY_SCOPES = ['question', 'news'] as const
export const WONDER_CONTENT_VISIBILITIES = ['visible', 'hidden', 'deleted'] as const
export const WONDER_NEWS_STATUSES = ['draft', 'scheduled', 'published', 'archived'] as const
export const WONDER_REPORT_REASONS = ['spam', 'abuse', 'illegal', 'misinformation', 'privacy', 'other'] as const
export const WONDER_REPORT_STATUSES = ['pending', 'reviewing', 'resolved', 'dismissed'] as const
export const WONDER_QUESTION_SORTS = ['newest', 'active', 'popular'] as const
export const WONDER_WORK_KINDS = ['app', 'game', 'library', 'plugin', 'template', 'other'] as const
export const WONDER_WORK_SORTS = ['newest', 'popular', 'liked'] as const

export interface WonderActor {
  email: string
  id: string
  image?: string | null
  name?: string | null
  role?: 'admin' | 'user'
}
export interface WonderAnswer {
  author: WonderPublicAuthor
  comment_count: number
  comments: WonderComment[]
  content_json: import('./content').WonderlandDocument
  created_at: string
  edited_at: string | null
  id: string
  is_accepted: boolean
  question_id: string
  vote_score: number
}
export interface WonderBadgeProgress {
  awarded_at: string | null
  description: string
  earned: boolean
  icon: 'crown' | 'eye' | 'heart' | 'layers' | 'spark'
  id: string
  name: string
  progress: number
  slug: string
  threshold: number
  tone: 'amber' | 'blue' | 'green' | 'ink' | 'rose'
}
export interface WonderCategory {
  created_at: string
  depth: 0 | 1
  description: string
  icon: string | null
  id: string
  is_active: boolean
  name: string
  parent_id: string | null
  scope: WonderCategoryScope
  slug: string
  sort: number
  updated_at: string
}
export type WonderCategoryScope = typeof WONDER_CATEGORY_SCOPES[number]

export interface WonderComment {
  answer_id: string | null
  author: WonderPublicAuthor
  body: string
  created_at: string
  edited_at: string | null
  id: string
  news_id: string | null
  parent_id: string | null
  question_id: string | null
  replies: WonderComment[]
}

export type WonderContentVisibility = typeof WONDER_CONTENT_VISIBILITIES[number]

export interface WonderNewsDetail extends WonderNewsListItem {
  author: WonderPublicAuthor
  content_json: import('./content').WonderlandDocument
  content_text: string
  seo_description: string | null
  seo_title: string | null
}

export interface WonderNewsListItem {
  category: Pick<WonderCategory, 'id' | 'name' | 'slug'>
  comment_count: number
  cover_file_id: string | null
  featured: boolean
  id: string
  pinned: boolean
  published_at: string
  slug: string
  summary: string
  title: string
}

export type WonderNewsStatus = typeof WONDER_NEWS_STATUSES[number]

export interface WonderPortalData {
  categories: Array<WonderCategory & { children: WonderCategory[] }>
  news: WonderNewsListItem[]
  questionTotal: number
  questions: WonderQuestionListItem[]
  stats: {
    answerCount: number
    memberCount: number
    questionCount: number
    resolvedCount: number
  }
  tags: WonderTag[]
}

export interface WonderPublicAuthor {
  id: string
  image: string | null
  name: string
}

export interface WonderQuestionDetail extends WonderQuestionListItem {
  answers: WonderAnswer[]
  comments: WonderComment[]
  content_json: import('./content').WonderlandDocument
  content_text: string
}

export interface WonderQuestionListItem {
  accepted_answer_id: string | null
  answer_count: number
  author: WonderPublicAuthor
  category: Pick<WonderCategory, 'id' | 'name' | 'slug'>
  comment_count: number
  created_at: string
  favorite_count: number
  follower_count: number
  hot_score: string
  id: string
  is_closed: boolean
  is_locked: boolean
  last_activity_at: string
  slug: string
  summary: string
  tags: Pick<WonderTag, 'id' | 'name' | 'slug'>[]
  title: string
  view_count: number
  vote_score: number
}

export type WonderQuestionSort = typeof WONDER_QUESTION_SORTS[number]

export type WonderReportReason = typeof WONDER_REPORT_REASONS[number]

export type WonderReportStatus = typeof WONDER_REPORT_STATUSES[number]

export interface WonderTag {
  description: string
  id: string
  is_active: boolean
  name: string
  slug: string
  sort: number
  usage_count: number
}

export interface WonderWorkDetail extends WonderWorkListItem {
  content_json: import('./content').WonderlandDocument
  content_text: string
  updated_at: string
}

export type WonderWorkKind = typeof WONDER_WORK_KINDS[number]

export interface WonderWorkListItem {
  author: WonderPublicAuthor
  cover_file_id: string
  demo_url: string | null
  featured: boolean
  id: string
  kind: WonderWorkKind
  like_count: number
  published_at: string
  slug: string
  source_url: string
  summary: string
  tags: string[]
  title: string
  view_count: number
}

export type WonderWorkSort = typeof WONDER_WORK_SORTS[number]

export function questionDisplayState(question: Pick<WonderQuestionListItem, 'accepted_answer_id' | 'is_closed'>) {
  if (question.is_closed)
    return 'closed' as const
  if (question.accepted_answer_id)
    return 'resolved' as const
  return 'open' as const
}
