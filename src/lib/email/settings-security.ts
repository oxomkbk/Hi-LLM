interface SmtpConnectionIdentity {
  encryption: string
  host: string
  port: number
  username: string
}

export function requiresSmtpPasswordReentry(input: {
  existing: SmtpConnectionIdentity | null
  next: SmtpConnectionIdentity
  suppliedPassword: string
}) {
  if (input.suppliedPassword)
    return false
  if (!input.existing)
    return false
  return input.existing.encryption !== input.next.encryption
    || input.existing.host !== input.next.host
    || input.existing.port !== input.next.port
    || input.existing.username !== input.next.username
}
