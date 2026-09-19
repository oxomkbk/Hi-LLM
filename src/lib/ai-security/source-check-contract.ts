export const SECURITY_SOURCE_CHECK_SUBJECT_TYPES = [
  'skill',
  'skill_submission',
  'mcp',
  'mcp_submission',
] as const

export type SecuritySourceCheckErrorCode
  = | 'SOURCE_CHECK_DOWNLOAD_FAILED'
    | 'SOURCE_CHECK_FAILED'
    | 'SOURCE_CHECK_LIMIT_EXCEEDED'
    | 'SOURCE_CHECK_NOT_APPLICABLE'
    | 'SOURCE_CHECK_REQUEST_INVALID'
    | 'SOURCE_CHECK_REVISION_UNAVAILABLE'
    | 'SOURCE_CHECK_STRUCTURE_INVALID'
    | 'SOURCE_CHECK_SUBJECT_NOT_FOUND'
    | 'SOURCE_CHECK_URL_INVALID'

export interface SecuritySourceCheckResult {
  archiveBytes: number
  canonicalUrl: string
  checkedAt: string
  fileCount: number
  projectPath: string
  provider: 'github' | 'gitlab'
  ref: string
  sourceRevision: string
  subdirectory: string | null
  totalBytes: number
}

export type SecuritySourceCheckSubjectType = typeof SECURITY_SOURCE_CHECK_SUBJECT_TYPES[number]
