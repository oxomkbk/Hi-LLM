export interface AdminContentItem {
  createdAt: string
  featured: boolean
  id: string
  owner: string
  publishedAt: string | null
  securityReportState: 'blocked' | 'failed' | 'passed' | 'review_required' | 'stale' | 'unassessed' | null
  securityScanStatus: 'preparing' | 'queued' | 'running' | null
  securityScore: number | null
  slug: string
  status: AdminContentStatus
  summary: string
  title: string
  type: AdminContentType
  updatedAt: string
  visual: string | null
}

export interface AdminContentPage {
  list: AdminContentItem[]
  page: number
  pageSize: number
  summary: AdminContentSummary
  total: number
  unavailableTypes: AdminContentType[]
}

export type AdminContentSecurityFilter = 'active' | 'all' | 'attention' | 'passed' | 'unassessed'

export type AdminContentStatus = 'archived' | 'draft' | 'published'

export interface AdminContentSummary {
  byStatus: Record<AdminContentStatus, number>
  byType: Record<AdminContentType, number>
  total: number
}

export type AdminContentType = 'mcp' | 'prompt' | 'skill'
