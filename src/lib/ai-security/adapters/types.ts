import type { SecurityWorkerAdapter } from '../worker'

export type SecurityAssessmentAdapter = SecurityWorkerAdapter

export function isLocalDeterministicAssessment(
  assessment: { execution_profile: 'configured' | 'local_deterministic' },
) {
  return assessment.execution_profile === 'local_deterministic'
}
