import { hostname } from 'node:os'

import { mcpSecurityAdapter } from '../src/lib/ai-security/adapters/mcp'
import { promptSecurityAdapter } from '../src/lib/ai-security/adapters/prompt'
import { skillSecurityAdapter } from '../src/lib/ai-security/adapters/skill'
import { checkSecurityWorkerReadiness } from '../src/lib/ai-security/readiness'
import { runSecurityWorker, SecurityWorkerReadinessError } from '../src/lib/ai-security/worker'
import { closeBusinessPool } from '../src/lib/db/business'
import { closeControlPool } from '../src/lib/db/control'

import type { SecurityWorkerAdapter } from '../src/lib/ai-security/worker'

const adapters: SecurityWorkerAdapter[] = [skillSecurityAdapter, mcpSecurityAdapter, promptSecurityAdapter]
const workerId = cleanWorkerId(process.env.AI_SECURITY_WORKER_ID) ?? `${hostname()}:${process.pid}`

if (process.argv.includes('--check')) {
  try {
    const readiness = await checkSecurityWorkerReadiness(adapters)
    if (!readiness.operational) {
      console.error(JSON.stringify({ code: 'SECURITY_WORKER_NOT_READY', issues: readiness.issues }))
      process.exitCode = 1
    }
    else if (!readiness.serviceEnabled) {
      console.warn(JSON.stringify({
        code: 'SECURITY_WORKER_PAUSED',
        serviceStateVersion: readiness.serviceStateVersion,
        settings: readiness.settings,
        workerId,
      }))
    }
    else if (!readiness.ready) {
      console.warn(JSON.stringify({
        availableSubjectTypes: readiness.availableSubjectTypes,
        code: 'SECURITY_WORKER_DEGRADED',
        issues: readiness.issues,
        settings: readiness.settings,
        workerId,
      }))
    }
    else {
      console.warn(JSON.stringify({ code: 'SECURITY_WORKER_READY', settings: readiness.settings, workerId }))
    }
  }
  finally {
    await closeWorkerPools()
  }
}
else {
  const controller = new AbortController()
  const shutdown = () => controller.abort()
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)

  try {
    await runSecurityWorker({
      adapters,
      concurrencyCap: readInteger(process.env.AI_SECURITY_WORKER_CONCURRENCY_CAP, 4),
      signal: controller.signal,
      workerId,
    })
  }
  catch (error) {
    if (error instanceof SecurityWorkerReadinessError)
      console.error(JSON.stringify({ code: 'SECURITY_WORKER_NOT_READY', issues: error.issues }))
    else
      console.error(JSON.stringify({ code: 'SECURITY_WORKER_FAILED' }))
    process.exitCode = 1
  }
  finally {
    process.removeListener('SIGINT', shutdown)
    process.removeListener('SIGTERM', shutdown)
    await closeWorkerPools()
  }
}

function cleanWorkerId(value: string | undefined) {
  const normalized = value?.normalize('NFC').trim()
  if (!normalized)
    return null
  if (normalized.length > 180)
    throw new TypeError('AI_SECURITY_WORKER_ID is too long')
  return normalized
}

async function closeWorkerPools() {
  await Promise.allSettled([closeBusinessPool(), closeControlPool()])
}

function readInteger(value: string | undefined, fallback: number) {
  if (!value)
    return fallback
  const number = Number(value)
  if (!Number.isSafeInteger(number))
    throw new TypeError('Invalid AI security worker integer setting')
  return number
}
