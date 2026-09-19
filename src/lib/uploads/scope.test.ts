import { describe, expect, it } from 'vitest'

import { assertUploadScope, canCreateUploadScope, isAdminUploadScope } from './scope'

describe('upload scope authorization', () => {
  it('rejects the generic file fallback for every actor', () => {
    expect(canCreateUploadScope('generic-file', 'user')).toBe(false)
    expect(canCreateUploadScope('generic-file', 'admin')).toBe(false)
    expect(() => assertUploadScope('generic-file', 'user')).toThrow('该上传用途尚未开放')
  })

  it('limits admin-only resources to administrators', () => {
    for (const scope of ['prompt-asset', 'prompt-package', 'catalog-icon', 'website-logo']) {
      expect(canCreateUploadScope(scope, 'user')).toBe(false)
      expect(canCreateUploadScope(scope, 'admin')).toBe(true)
      expect(isAdminUploadScope(scope)).toBe(true)
    }
  })

  it('keeps account and feature-linked user uploads available', () => {
    for (const scope of ['user-avatar', 'user-profile-background', 'community-prompt-asset', 'community-skill-icon', 'community-mcp-icon', 'wonderland-image', 'wonderland-work-image']) {
      expect(canCreateUploadScope(scope, 'user')).toBe(true)
      expect(isAdminUploadScope(scope)).toBe(false)
    }
  })

  it('rejects unknown scopes instead of trusting database policy names', () => {
    expect(canCreateUploadScope('future-file-scope', 'user')).toBe(false)
    expect(() => assertUploadScope('future-file-scope', 'admin')).toThrow('上传用途无效')
  })
})
