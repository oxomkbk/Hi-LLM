import { describe, expect, it } from 'vitest'

import { aggregateSecurityWorkerState } from './worker-runtime-policy'

function heartbeat(input: Partial<Parameters<typeof aggregateSecurityWorkerState>[0]['heartbeats'][number]> = {}) {
  return {
    issues: [],
    lastSeenAt: new Date('2026-08-22T00:00:00.000Z'),
    observedServiceStateVersion: 3,
    readySubjectTypes: ['skill' as const],
    status: 'ready' as const,
    ...input,
  }
}

describe('security worker runtime aggregation', () => {
  it('reports a persisted pause independently of worker liveness', () => {
    const withoutWorker = aggregateSecurityWorkerState({
      heartbeats: [],
      serviceEnabled: false,
      serviceStateVersion: 3,
    })
    const acknowledged = aggregateSecurityWorkerState({
      heartbeats: [heartbeat({ status: 'paused' })],
      serviceEnabled: false,
      serviceStateVersion: 3,
    })

    expect(withoutWorker).toMatchObject({ serviceAcknowledged: false, status: 'paused' })
    expect(acknowledged).toMatchObject({ serviceAcknowledged: true, status: 'paused' })
  })

  it('waits for the current version instead of trusting fresh old heartbeats', () => {
    for (const status of ['paused', 'ready', 'degraded'] as const) {
      expect(aggregateSecurityWorkerState({
        heartbeats: [heartbeat({ observedServiceStateVersion: 2, status })],
        serviceEnabled: true,
        serviceStateVersion: 3,
      })).toMatchObject({ serviceAcknowledged: false, status: 'starting' })
    }
  })

  it('reports offline only when the service is enabled and no worker is fresh', () => {
    expect(aggregateSecurityWorkerState({
      heartbeats: [],
      serviceEnabled: true,
      serviceStateVersion: 3,
    })).toMatchObject({ serviceAcknowledged: false, status: 'offline' })
  })

  it('aggregates only current-version workers into ready and degraded states', () => {
    const ready = heartbeat()
    const degraded = heartbeat({ status: 'degraded' })
    const old = heartbeat({ observedServiceStateVersion: 2, status: 'degraded' })

    expect(aggregateSecurityWorkerState({
      heartbeats: [ready, old],
      serviceEnabled: true,
      serviceStateVersion: 3,
    }).status).toBe('ready')
    expect(aggregateSecurityWorkerState({
      heartbeats: [ready, degraded, old],
      serviceEnabled: true,
      serviceStateVersion: 3,
    }).status).toBe('degraded')
  })
})
