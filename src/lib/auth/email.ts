import 'server-only'

import {
  assertEmailRegistrationReady,
  createSmtpEnvelope,
  createSmtpMessageIdentity,
  createSmtpTransport,
  getEmailRuntimeConfig,
} from '@/lib/email/settings'

interface AuthEmail {
  html: string
  subject: string
  text: string
  to: string
}

export async function assertAuthEmailReady() {
  await assertEmailRegistrationReady()
}

export async function sendAuthEmail(message: AuthEmail) {
  const config = await getEmailRuntimeConfig()
  if (config.mode === 'console') {
    process.stdout.write(`[auth-email:console]\nto: ${message.to}\nsubject: ${message.subject}\n${message.text}\n`)
    return
  }

  await createSmtpTransport(config).sendMail({
    envelope: createSmtpEnvelope(config, message.to),
    ...createSmtpMessageIdentity(config),
    html: message.html,
    subject: message.subject,
    text: message.text,
    to: message.to,
  })
}

export async function verifyEmailTransport() {
  const config = await getEmailRuntimeConfig()
  if (config.mode === 'console')
    return true
  return createSmtpTransport(config).verify()
}
