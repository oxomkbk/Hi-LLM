export interface SecurityCapabilities {
  canApproveHighCritical: boolean
  canCancelAssessments: boolean
  canCreateTemporaryHigh: boolean
  canManageSettings: boolean
  canManageVisibility: boolean
  canProposeHighCritical: boolean
  canRetryAssessments: boolean
  canReviewLowMedium: boolean
  canStartAssessments: boolean
}

export function securityCapabilitiesForAdmin(userId: string): SecurityCapabilities {
  const configuredSupervisorId = process.env.BOOTSTRAP_ADMIN_USER_ID?.normalize('NFC').trim()
  // When no dedicated supervisor is configured, the surrounding route has already
  // verified the user is an administrator. Do not leave high-risk review actions
  // permanently unavailable in a valid single-admin installation.
  const supervisorAdmin = !configuredSupervisorId || userId === configuredSupervisorId
  return {
    canApproveHighCritical: supervisorAdmin,
    canCancelAssessments: true,
    canCreateTemporaryHigh: supervisorAdmin,
    canManageSettings: true,
    canManageVisibility: true,
    canProposeHighCritical: true,
    canRetryAssessments: true,
    canReviewLowMedium: true,
    canStartAssessments: true,
  }
}
