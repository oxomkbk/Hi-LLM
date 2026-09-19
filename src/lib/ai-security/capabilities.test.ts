import { afterEach, describe, expect, it } from 'vitest'

import { securityCapabilitiesForAdmin } from './capabilities'

const originalBootstrapId = process.env.BOOTSTRAP_ADMIN_USER_ID

afterEach(() => {
  if (originalBootstrapId === undefined)
    delete process.env.BOOTSTRAP_ADMIN_USER_ID
  else
    process.env.BOOTSTRAP_ADMIN_USER_ID = originalBootstrapId
})

describe('aI security administrator capabilities', () => {
  it('allows every active administrator to manage policy and assessments', () => {
    process.env.BOOTSTRAP_ADMIN_USER_ID = 'bootstrap-id'
    const capabilities = securityCapabilitiesForAdmin('regular-admin')

    expect(capabilities.canManageSettings).toBe(true)
    expect(capabilities.canStartAssessments).toBe(true)
    expect(capabilities.canCancelAssessments).toBe(true)
    expect(capabilities.canApproveHighCritical).toBe(false)
    expect(capabilities.canCreateTemporaryHigh).toBe(false)
  })

  it('keeps high-risk approval capabilities restricted to the bootstrap administrator', () => {
    process.env.BOOTSTRAP_ADMIN_USER_ID = 'bootstrap-id'
    const capabilities = securityCapabilitiesForAdmin('bootstrap-id')

    expect(capabilities.canApproveHighCritical).toBe(true)
    expect(capabilities.canCreateTemporaryHigh).toBe(true)
  })

  it('keeps single-admin installations operable when no bootstrap administrator is configured', () => {
    delete process.env.BOOTSTRAP_ADMIN_USER_ID
    const capabilities = securityCapabilitiesForAdmin('active-admin')

    expect(capabilities.canApproveHighCritical).toBe(true)
    expect(capabilities.canCreateTemporaryHigh).toBe(true)
  })
})
