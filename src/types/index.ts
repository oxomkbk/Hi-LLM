import type { PaginationState } from '@tanstack/react-table'

export interface AdminEmailSettings {
  encryption: EmailEncryption
  fromEmail: string
  fromName: string
  host: string
  lastCheckAt: string | null
  lastCheckCode: string | null
  lastCheckOk: boolean | null
  passwordConfigured: boolean
  passwordHint: string | null
  port: number
  source: 'console' | 'database' | 'environment' | 'unconfigured'
  updatedAt: string | null
  username: string
}

export interface AdminLlmSettings {
  apiKeyConfigured: boolean
  apiKeyHint: string | null
  baseUrl: string
  lastCheckAt: string | null
  lastCheckCode: string | null
  lastCheckOk: boolean | null
  model: string
  navigationAiEnabled: boolean
  protocol: LlmProtocol
  updatedAt: string | null
}

/** @description: 后台素材库文件 */
export interface AdminMediaFile {
  created_at: string
  extension: string
  id: string
  mime_type: string
  original_name: string
  ready_at: string | null
  reference_count: number
  size_bytes: string
  status: AdminMediaFileStatus
  storage_profile: AdminStorageProfileSummary
  storage_profile_id: string
  url: string | null
  visibility: 'private' | 'public'
}

export type AdminMediaFileStatus = 'delete_failed' | 'deleting' | 'failed' | 'pending' | 'quarantined' | 'ready'

export interface AdminMediaResponse extends PaginatingResponse<AdminMediaFile> {
  profiles: AdminStorageProfileSummary[]
  providerTotals: Record<'all' | 'local-filesystem' | 'tencent-cos', number>
}

export interface AdminStorageProfileSummary {
  active: boolean
  id: string
  name: string
  provider: 'local-filesystem' | 'tencent-cos' | null
  status: 'archived' | 'selectable'
}

/** @description 后台用户管理列表项，不包含密码或认证令牌 */
export interface AdminUser {
  activity: AdminUserActivity
  avatarFileId: string | null
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
  role: AdminUserRole
  sessionCount: number
  status: AdminUserStatus
  updatedAt: string
}

export interface AdminUserActivity {
  answers: number
  comments: number
  lastContributionAt: string | null
  questions: number
  total: number
  works: number
}

export interface AdminUserListResponse extends PaginatingResponse<AdminUser> {
  currentUserId: string
  summary: AdminUserSummary
}

export type AdminUserRole = 'admin' | 'user'

export interface AdminUserSaveInput extends Record<string, unknown> {
  canAnswer: boolean
  canAsk: boolean
  canComment: boolean
  canPublishWorks: boolean
  canUpload: boolean
  email: string
  emailVerified: boolean
  image: string
  name: string
  password?: string
  role: AdminUserRole
  status: AdminUserStatus
}

export type AdminUserStatus = 'active' | 'disabled'

export interface AdminUserSummary {
  active: number
  activeLast7Days: number
  administrators: number
  disabled: number
  newLast30Days: number
  total: number
}

/** @description: 响应体 */
export interface ApiErrorPayload {
  code: string
  retryable: boolean
}

/** @description: 网站分类 */
export type Category = Columns & {
  name: string // 分类名称
  websites: Website[] // 网站列表
}

/** @description: 分类下拉选项 */
export type CategoryOption = Pick<Category, 'id' | 'name'>

/** @description: 网站分类表单 */
export type CategorySaveParams = Pick<Category, 'name' | 'sort'> & {
  id?: string
}

/** @description: 公共列 */
export interface Columns {
  id: string // 主键
  user_id: string // 登录用户 id
  emial: string // 邮箱
  sort: number // 排序
  created_at: string // 创建时间
  updated_at: string // 更新时间
}

export type EmailEncryption = 'starttls' | 'tls'

export interface IResponse<T = unknown> {
  code: number // 状态码
  data: T // 数据
  error?: ApiErrorPayload
  msg: string // 消息
  timestamp: number // 时间戳
}
export type LlmProtocol = 'anthropic' | 'openai'

/** @description: 已发布或后台创建的 MCP Server */
export interface Mcp extends McpContent, PublicSecurityAssessment {
  created_at: string
  featured: boolean
  id: string
  publish_requested_at?: string | null
  published_at: string | null
  published_by: string | null
  sort: number
  status: McpStatus
  updated_at: string
  verified: boolean
}
export type McpAuthType = 'api-key' | 'custom' | 'none' | 'oauth2'
/** @description: MCP Server 可编辑内容 */
export interface McpContent extends Record<string, unknown> {
  capabilities: string[]
  category: string
  clients: string[]
  description: string
  docs_url: string | null
  homepage_url: string | null
  icon: string | null
  installations: McpInstallation[]
  language: string | null
  license: string | null
  name: string
  protocol_version: string
  publisher_name: string
  publisher_url: string | null
  registry_name: string | null
  slug: string
  source_url: string
  summary: string
  tags: string[]
  version: string | null
}
export interface McpEnvVariable {
  description: string
  name: string
  required: boolean
}
/** @description: MCP Server 安装或远程连接方式 */
export interface McpInstallation extends Record<string, unknown> {
  args: string[]
  auth_type: McpAuthType
  command: string | null
  config_template: Record<string, unknown>
  env_vars: McpEnvVariable[]
  headers: Record<string, string>
  id: string
  kind: 'package' | 'remote'
  label: string
  package: string | null
  remote_url: string | null
  transport: McpTransport
  version: string | null
}

export type McpSaveParams = McpContent & Pick<Mcp, 'featured' | 'sort' | 'status' | 'verified'> & {
  id?: string
}

export type McpStatus = 'archived' | 'draft' | 'published'

/** @description: 社区 MCP 投稿 */
export interface McpSubmission extends McpContent, PublicSecurityAssessment {
  approved_mcp_id: string | null
  created_at: string
  id: string
  review_note: string | null
  reviewed_at: string | null
  reviewer_id: string | null
  status: McpSubmissionStatus
  security_target_id: string | null
  submitted_ip_hash: string
  submitter_email: string | null
  submitter_name: string
  updated_at: string
}

export type McpSubmissionStatus = 'approved' | 'pending' | 'pending_security' | 'rejected'

export type McpTransport = 'stdio' | 'streamable-http'

/** @description: 分页响应体 */
export type PaginatingResponse<T = unknown> = {
  total: number // 总条数
  list: T[]
  page: number // 页码
  pageSize: number // 每页条数
} & PaginationState

export interface Prompt extends PublicSecurityAssessment {
  categories: PromptCategory[]
  compatibility: string[]
  content_kind: PromptContentKind
  cover_asset: PromptAsset | null
  created_at: string
  featured: boolean
  id: string
  primary_category_id: string
  preview_status: 'invalid' | 'none' | 'ready'
  publish_requested_at?: string | null
  published_at: string | null
  slug: string
  sort: number
  source_import_id: string | null
  status: PromptStatus
  submission_origin: PromptSubmissionOrigin
  submitted_at: string | null
  summary: string
  tags: string[]
  title: string
  updated_at: string
}

export interface PromptAsset {
  alt_text: string | null
  created_at: string
  file_id: string
  id: string
  import_id: string | null
  is_downloadable: boolean
  is_entrypoint: boolean
  is_primary: boolean
  metadata: Record<string, unknown>
  mime_type?: string
  name: string
  origin: 'direct_upload' | 'library_reference' | 'package_extracted' | 'package_source'
  poster_asset_id: string | null
  prompt_id: string
  role: PromptAssetRole
  size_bytes?: string
  sort: number
  source_path: string
  updated_at: string
  url?: string
}

export interface PromptAssetInput extends Record<string, unknown> {
  altText?: string | null
  fileId: string
  isDownloadable: boolean
  isEntrypoint: boolean
  isPrimary: boolean
  name: string
  role: PromptAssetRole
}

export type PromptAssetRole = 'attachment' | 'cover' | 'image' | 'poster' | 'source_package' | 'video' | 'web_preview'

/** @description Prompts 分类树节点。根分类通过 kind 绑定稳定的内容类型。 */
export interface PromptCategory {
  active: boolean
  children?: PromptCategory[]
  created_at: string
  description: string | null
  id: string
  kind: PromptContentKind | 'general' | null
  name: string
  parent_id: string | null
  slug: string
  sort: number
  updated_at: string
}

export type PromptContentKind = 'adaptation' | 'image' | 'video' | 'web_ui'

export interface PromptDetail extends Prompt {
  assets: PromptAsset[]
  documents: PromptDocument[]
}

export interface PromptDetailView extends Omit<PromptDetail, 'documents'> {
  documents: PromptDocumentSummary[]
  initial_document: PromptDocument | null
}

export interface PromptDocument {
  content: string
  created_at: string
  id: string
  is_primary: boolean
  language: string
  name: string
  prompt_id: string
  role: PromptDocumentRole
  sort: number
  source_path: string
  updated_at: string
}

export interface PromptDocumentInput extends Record<string, unknown> {
  content: string
  isPrimary: boolean
  language: string
  name: string
  role: PromptDocumentRole
  sourcePath: string
}

export type PromptDocumentRole = 'design' | 'example' | 'negative_prompt' | 'other' | 'parameters' | 'prompt' | 'readme' | 'style' | 'tokens'

export type PromptDocumentSummary = Omit<PromptDocument, 'content'>

export interface PromptImport {
  createdAt: string
  errorCode: string | null
  errorMessage: string | null
  expiresAt: string
  id: string
  promptId: string | null
  report: PromptImportReport
  sourceFileId: string
  status: PromptImportStatus
  updatedAt: string
}

export interface PromptImportCandidate {
  language: string
  path: string
  role: PromptDocumentRole | PromptAssetRole
  size: number
}

export interface PromptImportReport {
  assets: PromptImportCandidate[]
  blocking: string[]
  documents: PromptImportCandidate[]
  entryCount: number
  metadata: {
    categories: string[]
    compatibility: string[]
    contentKind: PromptContentKind
    primaryCategory?: string
    slug: string
    summary: string
    tags: string[]
    title: string
  } | null
  primaryPromptPath: string | null
  schemaVersion: 1 | null
  totalUncompressedBytes: number
  warnings: string[]
}

export type PromptImportStatus = 'committed' | 'committing' | 'expired' | 'failed' | 'parsed' | 'parsing'

export interface PromptSaveInput extends Record<string, unknown> {
  assets?: PromptAssetInput[]
  categoryIds: string[]
  compatibility: string[]
  contentKind: PromptContentKind
  documents: PromptDocumentInput[]
  featured: boolean
  primaryCategoryId: string
  slug: string
  sort: number
  status: PromptStatus
  summary: string
  tags: string[]
  title: string
}

export type PromptStatus = 'archived' | 'draft' | 'published'

export type PromptSubmissionOrigin = 'admin' | 'community'

/** @description: 首页公开目录分类 */
export interface PublicCatalogCategory {
  id: string
  name: string
  websites: PublicCatalogWebsite[]
}

/** @description: 首页公开目录网站 */
export type PublicCatalogWebsite = Pick<Website, | 'commonlyUsed'
  | 'categories'
  | 'category_ids'
  | 'created_at'
  | 'desc'
  | 'id'
  | 'logo'
  | 'name'
  | 'pinned'
  | 'recommend'
  | 'sort'
  | 'tags'
  | 'url'
  | 'vpn'> & {
    /** 全站有效访问排行，仅首页目录使用。 */
    rankingPosition?: number
  }

/** @description 可公开展示的统一 AI 内容安全评测字段 */
export interface PublicSecurityAssessment {
  security_assessed_at?: string | null
  security_assessment_id?: string | null
  security_coverage?: {
    included?: string[]
    label?: string
    level?: 'complete' | 'config_only' | 'partial'
    partitions?: Record<string, { includedCount: number, skippedCount: number, status: string }>
    skipped?: Array<{ reason: string, ref: string }>
    sourceRevision?: string | null
  } | null
  security_critical_count?: number
  security_grade?: 'A' | 'B' | 'C' | 'D' | null
  security_dimensions?: Array<{
    code: 'applicability' | 'effectiveness' | 'maintainability' | 'reliability' | 'safety'
    evidence: string[]
    recommendations: string[]
    score: number
    source: 'ai_assisted' | 'deterministic'
    strengths: string[]
    summary: string
    weaknesses: string[]
  }> | null
  security_evaluation_method?: 'deterministic' | 'document_evidence' | 'hybrid' | null
  security_evaluation_schema_version?: string | null
  security_evaluation_summary?: string | null
  security_high_count?: number
  security_info_count?: number
  security_low_count?: number
  security_medium_count?: number
  security_quality_rating?: 'exceptional' | 'excellent' | 'fair' | 'good' | 'poor' | null
  security_quality_score?: number | null
  security_publish_ready?: boolean
  security_publish_reason?: string
  security_report_state?: 'blocked' | 'failed' | 'passed' | 'review_required' | 'stale' | 'unassessed' | null
  security_scan_status?: 'preparing' | 'queued' | 'running' | null
  security_score?: number | null
  security_show_grade?: boolean
  security_show_risk_counts?: boolean
  security_show_score?: boolean
  security_show_summary?: boolean
  security_summary?: string | null
}

/** @description: 排行榜公开字段及当前统计窗口指标 */
export interface RankedWebsite extends Pick<Website, 'id' | 'name' | 'desc' | 'logo' | 'url' | 'tags' | 'visitCount' | 'vpn'> {
  badges: RankingBadgeKind[]
  categories: RankingCategory[]
  currentVisits: number
  growthRate: number | null
  previousRank: number | null
  previousVisits: number | null
  rank: number
  rankDelta: number | null
  visitDelta: number | null
}

export type RankingBadgeKind = 'dark_horse' | 'growth_king' | 'new_entry' | 'streak'

export interface RankingCategory {
  id: string
  name: string
}

export interface RankingData {
  categories: RankingCategory[]
  categoryId: string | null
  generatedAt: string
  methodology: string
  period: RankingPeriod
  periodLabel: string
  summary: RankingSummary
  websites: RankedWebsite[]
}

export type RankingPeriod = 'all' | 'day' | 'month' | 'week'

export interface RankingSummary {
  activeSites: number
  fastestRiser: {
    id: string
    name: string
    rankDelta: number
  } | null
  newEntries: number
  totalVisits: number
}

/** @description: 已发布或后台创建的 Skill */
export interface Skill extends SkillContent, PublicSecurityAssessment {
  created_at: string
  featured: boolean
  id: string
  publish_requested_at?: string | null
  published_at: string | null
  published_by: string | null
  sort: number
  status: SkillStatus
  updated_at: string
  verified: boolean
}
/** @description: Skill 可编辑内容字段 */
export interface SkillContent extends Record<string, unknown> {
  author_name: string
  author_url: string | null
  category: string
  description: string
  homepage_url: string | null
  icon: string | null
  install_command: string | null
  license: string | null
  name: string
  platforms: string[]
  slug: string
  source_kind: SkillSourceKind
  source_url: string | null
  summary: string
  tags: string[]
  version: string | null
}
/** @description: Skill 后台表单 */
export type SkillSaveParams = SkillContent & Pick<Skill, 'featured' | 'sort' | 'status' | 'verified'> & {
  id?: string
}
/** @description Skill 内容来源与评测覆盖方式 */
export type SkillSourceKind = 'external_page' | 'git_repository' | 'platform_content'

/** @description: Skill 发布状态 */
export type SkillStatus = 'archived' | 'draft' | 'published'

/** @description: 社区 Skill 投稿 */
export interface SkillSubmission extends SkillContent {
  created_at: string
  id: string
  review_note: string | null
  reviewed_at: string | null
  reviewer_id: string | null
  security_target_id: string | null
  status: SkillSubmissionStatus
  submitted_ip_hash: string
  submitter_email: string | null
  submitter_name: string
  updated_at: string
  security_assessed_at?: string | null
  security_assessment_id?: string | null
  security_grade?: 'A' | 'B' | 'C' | 'D' | null
  security_publish_ready?: boolean
  security_publish_reason?: string
  security_report_state?: 'blocked' | 'failed' | 'passed' | 'review_required' | 'stale' | 'unassessed' | null
  security_scan_status?: 'preparing' | 'queued' | 'running' | null
  security_score?: number | null
}

/** @description: Skill 投稿审核状态 */
export type SkillSubmissionStatus = 'approved' | 'pending' | 'pending_security' | 'rejected'

/** @description: 网站列表 */
export type Website = Columns & {
  name: string // 分类名称
  desc: string | null // 描述
  logo: string | null // logo
  url: string // 链接
  tags: string[] // 站点标签
  pinned: boolean // 是否置顶
  recommend: boolean // 是否推荐
  vpn: boolean // 是否需要 vpn
  visitCount: number // 访问次数
  commonlyUsed: boolean // 是否常用
  category_id: string // 分类 id
  category_ids: string[] // 全部所属分类 id，第一个为兼容主分类
  category: Category
  categories: CategoryOption[] // 全部所属分类
}

export interface WebsiteExtractionIcon {
  dataUrl: string
  filename: string
  mimeType: string
  size: number
}

export interface WebsiteExtractionResult {
  description: string
  descriptionGeneratedByLlm: boolean
  icon: WebsiteExtractionIcon | null
  name: string
  sourceDescription: string
  title: string
  url: string
  warnings: string[]
}

/** @description: 网站列表表单 */
export type WebsiteSaveParams = Omit<Website, keyof Columns | 'visitCount' | 'category' | 'categories'> & Pick<Website, 'sort'> & {
  id?: string
}

/** @description: 用户提交的网站 */
export type WebsiteSubmission = Omit<Website, 'visitCount' | 'user_id' | 'emial' | 'category'> & {
  category: Pick<Category, 'id' | 'name'>
  status: WebsiteSubmissionStatus
  review_note: string | null
  reviewed_at: string | null
  reviewer_id: string | null
}

/** @description: 投稿审核状态 */
export type WebsiteSubmissionStatus = 'pending' | 'approved' | 'rejected'
