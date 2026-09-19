import type { AdminUserRole } from '@/types'

const ADMIN_SCOPES = new Set([
  'catalog-icon',
  'prompt-asset',
  'prompt-package',
  'website-logo',
])

const USER_SCOPES = new Set([
  'community-mcp-icon',
  'community-prompt-asset',
  'community-skill-icon',
  'user-avatar',
  'user-profile-background',
  'wonderland-image',
  'wonderland-work-image',
])

const DISABLED_SCOPES = new Set(['generic-file'])

export class UploadScopeError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = 'UPLOAD_SCOPE_INVALID',
  ) {
    super(message)
  }
}

export function assertUploadScope(scope: string, role: AdminUserRole) {
  assertUploadScopeFormat(scope)
  if (!canCreateUploadScope(scope, role))
    throw new UploadScopeError('当前账号无权使用该上传用途', 403, 'UPLOAD_SCOPE_FORBIDDEN')
}

export function assertUploadScopeFormat(scope: string) {
  if (DISABLED_SCOPES.has(scope))
    throw new UploadScopeError('该上传用途尚未开放', 403, 'UPLOAD_SCOPE_DISABLED')
  if (!ADMIN_SCOPES.has(scope) && !USER_SCOPES.has(scope))
    throw new UploadScopeError('上传用途无效', 400, 'UPLOAD_SCOPE_INVALID')
}

export function canCreateUploadScope(scope: string, role: AdminUserRole) {
  if (ADMIN_SCOPES.has(scope))
    return role === 'admin'
  if (USER_SCOPES.has(scope))
    return role === 'admin' || role === 'user'
  return false
}

export function isAdminUploadScope(scope: string) {
  return ADMIN_SCOPES.has(scope)
}
