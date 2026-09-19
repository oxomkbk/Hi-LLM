import type { SecurityPublicSubjectType } from './domain'

export interface SecurityWorkerHeartbeatSnapshot {
  issues: Array<{ code: string, message: string, subjectType?: SecurityPublicSubjectType }>
  lastSeenAt: Date
  observedServiceStateVersion: number
  readySubjectTypes: SecurityPublicSubjectType[]
  status: SecurityWorkerHeartbeatStatus
}
export type SecurityWorkerHeartbeatStatus = 'degraded' | 'paused' | 'ready'

export type SecurityWorkerRuntimeStatus = 'degraded' | 'offline' | 'paused' | 'ready' | 'starting'

export function aggregateSecurityWorkerState(input: {
  heartbeats: readonly SecurityWorkerHeartbeatSnapshot[]
  serviceEnabled: boolean
  serviceStateVersion: number
}) {
  const matching = input.heartbeats.filter(
    heartbeat => heartbeat.observedServiceStateVersion === input.serviceStateVersion,
  )
  const acknowledged = input.serviceEnabled
    ? matching.filter(heartbeat => heartbeat.status !== 'paused')
    : matching.filter(heartbeat => heartbeat.status === 'paused')

  let status: SecurityWorkerRuntimeStatus
  if (!input.serviceEnabled)
    status = 'paused'
  else if (acknowledged.length > 0)
    status = acknowledged.every(heartbeat => heartbeat.status === 'ready') ? 'ready' : 'degraded'
  else if (input.heartbeats.length > 0)
    status = 'starting'
  else
    status = 'offline'

  return {
    acknowledgedHeartbeats: acknowledged,
    serviceAcknowledged: acknowledged.length > 0,
    status,
  }
}
