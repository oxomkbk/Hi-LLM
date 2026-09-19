export interface EmailRegistrationReadinessInput {
  host: string
  lastCheckAt: Date | string | null
  lastCheckOk: boolean | null
  mode: 'console' | 'smtp' | 'unconfigured'
  passwordConfigured: boolean
  source: 'console' | 'database' | 'environment' | 'unconfigured'
  updatedAt: Date | string | null
}

export function isEmailRegistrationReady(
  input: EmailRegistrationReadinessInput,
  environment: string | undefined = process.env.NODE_ENV,
) {
  if (input.mode === 'console')
    return environment !== 'production'
  if (input.mode !== 'smtp' || !input.host.trim() || !input.passwordConfigured)
    return false
  if (input.source === 'environment')
    return true
  if (input.source !== 'database' || input.lastCheckOk !== true || !input.lastCheckAt || !input.updatedAt)
    return false

  const checkedAt = new Date(input.lastCheckAt).getTime()
  const updatedAt = new Date(input.updatedAt).getTime()
  return Number.isFinite(checkedAt) && Number.isFinite(updatedAt) && checkedAt >= updatedAt
}
