import 'server-only'

import { Buffer } from 'node:buffer'

const BUILD_PHASE = 'phase-production-build'

export function getAuthSecret() {
  const secret = requireServerEnv('AUTH_SECRET')
  if (process.env.NEXT_PHASE !== BUILD_PHASE && Buffer.byteLength(secret) < 32)
    throw new Error('AUTH_SECRET 必须至少 32 字节')
  return secret
}

export function getBootstrapBusinessDatabaseUrl() {
  return requireServerEnv('BUSINESS_DATABASE_URL')
}

export function getControlDatabaseUrl() {
  return requireServerEnv('CONTROL_DATABASE_URL')
}

export function optionalServerEnv(name: string) {
  return process.env[name]?.trim() || undefined
}

export function requireServerEnv(name: string) {
  const value = process.env[name]?.trim()

  if (value)
    return value

  if (process.env.NEXT_PHASE === BUILD_PHASE)
    return buildPlaceholder(name)

  throw new Error(`缺少服务端环境变量 ${name}`)
}

function buildPlaceholder(name: string) {
  if (name.endsWith('_DATABASE_URL'))
    return 'postgresql://build:build@127.0.0.1:5432/build'

  return `build-only-${name.toLowerCase()}-placeholder-value`
}
