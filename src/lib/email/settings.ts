import 'server-only'

import { createHash } from 'node:crypto'

import nodemailer from 'nodemailer'

import { decryptConfig, encryptConfig } from '@/lib/db/config-crypto'
import { getControlPool, withControlTransaction } from '@/lib/db/control'
import { optionalServerEnv } from '@/lib/db/env'

import { isEmailRegistrationReady } from './readiness'
import { requiresSmtpPasswordReentry } from './settings-security'
import {
  EmailSettingsValidationError,
  normalizeEmailMailboxOrNull,
  normalizeEmailSettingsInput,
  normalizeTestEmailRecipient,
} from './settings-validation'
import { createSmtpTestTemplate } from './templates'

import type { EncryptedConfig } from '@/lib/db/config-crypto'
import type { AdminEmailSettings, EmailEncryption } from '@/types'
import type { PoolClient } from 'pg'

const EMAIL_SETTINGS_LOCK_KEY = 'hillm-nav:email-settings'
const EMAIL_TEST_LOCK_PREFIX = 'hillm-nav:email-test'

export interface SmtpRuntimeConfig {
  encryption: EmailEncryption
  fromEmail: string
  fromName: string
  host: string
  password: string
  port: number
  username: string
}

interface EmailPasswordSecret { password: string }

interface EmailSettingsRow {
  encrypted_password: EncryptedConfig
  encryption: EmailEncryption
  from_email: string
  from_name: string
  host: string
  last_check_at: Date | null
  last_check_code: string | null
  last_check_ok: boolean | null
  port: number
  updated_at: Date
  username: string
}

type SmtpAuditCommand = 'api' | 'data' | 'mail_from' | 'rcpt_to' | 'unknown'

interface SmtpFailureDiagnostic {
  command: SmtpAuditCommand
  responseCode: number | null
}

interface SmtpRuntimeSnapshot {
  config: SmtpRuntimeConfig
  fingerprint: string
  source: 'database' | 'environment'
}

export class EmailSettingsError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = 'EMAIL_SETTINGS_INVALID',
    readonly retryable = false,
  ) {
    super(message)
    this.name = 'EmailSettingsError'
  }
}

export class EmailNotConfiguredError extends EmailSettingsError {
  constructor() {
    super('请先在后台配置邮件服务', 409, 'EMAIL_NOT_CONFIGURED')
  }
}

export async function assertEmailRegistrationReady() {
  const row = await readSettingsRow()
  if (row) {
    let runtime: SmtpRuntimeConfig
    try {
      runtime = rowToRuntimeConfig(row)
    }
    catch {
      throw new EmailSettingsError('邮件服务配置不可用，请重新保存邮件设置', 503, 'EMAIL_NOT_READY')
    }

    if (!isEmailRegistrationReady({
      host: row.host,
      lastCheckAt: row.last_check_at,
      lastCheckOk: row.last_check_ok,
      mode: 'smtp',
      passwordConfigured: Boolean(runtime.password),
      source: 'database',
      updatedAt: row.updated_at,
    })) {
      throw new EmailSettingsError('邮件服务尚未通过测试，暂不能开放注册', 409, 'EMAIL_NOT_READY')
    }
    return
  }

  try {
    const runtime = await getEmailRuntimeConfig()
    if (runtime.mode === 'console' && !isEmailRegistrationReady({
      host: '',
      lastCheckAt: null,
      lastCheckOk: null,
      mode: 'console',
      passwordConfigured: false,
      source: 'console',
      updatedAt: null,
    })) {
      throw new Error('console email mode is not allowed')
    }
  }
  catch {
    throw new EmailSettingsError('注册暂不可用，请先在后台配置邮件服务', 503, 'EMAIL_NOT_READY')
  }
}

export function createSmtpEnvelope(config: SmtpRuntimeConfig, recipient: string) {
  const normalizedRecipient = normalizeEmailMailboxOrNull(recipient)
  const identity = createSmtpMessageIdentity(config)
  if (!normalizedRecipient)
    throw new EmailSettingsError('邮件信封地址格式无效，请检查 SMTP 账号和发件邮箱')

  return {
    from: identity.from.address,
    to: [normalizedRecipient],
  }
}

export function createSmtpMessageIdentity(config: SmtpRuntimeConfig) {
  const configuredAddress = normalizeEmailMailboxOrNull(config.fromEmail)
  const authenticatedAddress = normalizeEmailMailboxOrNull(config.username)
  if (!configuredAddress)
    throw new EmailSettingsError('发件邮箱格式无效，请检查邮件服务配置')

  const senderAddress = authenticatedAddress ?? configuredAddress
  return {
    from: { address: senderAddress, name: config.fromName },
    ...(senderAddress === configuredAddress
      ? {}
      : { replyTo: { address: configuredAddress } }),
  }
}

export function createSmtpTransport(config: SmtpRuntimeConfig) {
  return nodemailer.createTransport({
    auth: { pass: config.password, user: config.username },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    host: config.host,
    port: config.port,
    requireTLS: config.encryption === 'starttls',
    secure: config.encryption === 'tls',
    socketTimeout: 15_000,
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
  })
}

export async function getAdminEmailSettings(): Promise<AdminEmailSettings> {
  const row = await readSettingsRow()
  if (row)
    return rowToAdminSettings(row, 'database')

  const environment = readEnvironmentConfig()
  if (environment) {
    return {
      encryption: environment.encryption,
      fromEmail: environment.fromEmail,
      fromName: environment.fromName,
      host: environment.host,
      lastCheckAt: null,
      lastCheckCode: null,
      lastCheckOk: null,
      passwordConfigured: true,
      passwordHint: '由环境变量提供',
      port: environment.port,
      source: 'environment',
      updatedAt: null,
      username: environment.username,
    }
  }

  return {
    encryption: 'tls',
    fromEmail: '',
    fromName: process.env.NEXT_PUBLIC_APP_NAME || 'HI LLM',
    host: '',
    lastCheckAt: null,
    lastCheckCode: null,
    lastCheckOk: null,
    passwordConfigured: false,
    passwordHint: null,
    port: 465,
    source: emailMode() === 'console' ? 'console' : 'unconfigured',
    updatedAt: null,
    username: '',
  }
}

export async function getEmailRuntimeConfig(): Promise<{ mode: 'console' } | ({ mode: 'smtp' } & SmtpRuntimeConfig)> {
  const row = await readSettingsRow()
  if (row) {
    return {
      ...rowToRuntimeConfig(row),
      mode: 'smtp',
    }
  }

  const environment = readEnvironmentConfig()
  if (environment)
    return { ...environment, mode: 'smtp' }
  if (isConsoleMode())
    return { mode: 'console' }
  throw new EmailNotConfiguredError()
}

export async function saveEmailSettings(input: Record<string, unknown>, actorId: string) {
  let normalized: ReturnType<typeof normalizeEmailSettingsInput>
  try {
    normalized = normalizeEmailSettingsInput(input)
  }
  catch (error) {
    if (error instanceof EmailSettingsValidationError)
      throw new EmailSettingsError(error.message)
    throw error
  }

  await withControlTransaction(async (client) => {
    await lockEmailSettings(client)
    const existing = await readSettingsRowFromClient(client)
    const fallback = existing ? rowToRuntimeConfig(existing) : readEnvironmentConfig()
    if (requiresSmtpPasswordReentry({
      existing: existing
        ? {
            encryption: existing.encryption,
            host: existing.host,
            port: existing.port,
            username: existing.username,
          }
        : null,
      next: {
        encryption: normalized.encryption,
        host: normalized.host,
        port: normalized.port,
        username: normalized.username,
      },
      suppliedPassword: normalized.password,
    })) {
      throw new EmailSettingsError(
        '更换邮件服务器地址或账号时必须重新填写 SMTP 密钥',
        400,
        'EMAIL_PASSWORD_REQUIRED_ON_ENDPOINT_CHANGE',
      )
    }
    const password = normalized.password || fallback?.password || ''
    if (!password)
      throw new EmailSettingsError('请填写 SMTP 密钥')

    await client.query(`
      insert into control.email_settings (
        id, provider, host, port, encryption, username, from_email, from_name,
        encrypted_password, last_check_at, last_check_ok, last_check_code
      ) values (true, 'smtp', $1, $2, $3, $4, $5, $6, $7::jsonb, null, null, null)
      on conflict (id) do update set
        host = excluded.host,
        port = excluded.port,
        encryption = excluded.encryption,
        username = excluded.username,
        from_email = excluded.from_email,
        from_name = excluded.from_name,
        encrypted_password = excluded.encrypted_password,
        last_check_at = null,
        last_check_ok = null,
        last_check_code = null
    `, [
      normalized.host,
      normalized.port,
      normalized.encryption,
      normalized.username,
      normalized.fromEmail,
      normalized.fromName,
      JSON.stringify(encryptConfig<EmailPasswordSecret>({ password })),
    ])
    await client.query(`
      insert into control.audit_logs (
        actor_user_id, action, resource_type, resource_id, success, code, metadata
      ) values (
        $1, 'email_settings.update', 'email_settings', 'singleton', true,
        'EMAIL_SETTINGS_SAVED', jsonb_build_object('host', $2::text, 'port', $3::int, 'encryption', $4::text)
      )
    `, [actorId, normalized.host, normalized.port, normalized.encryption])
  })
  return getAdminEmailSettings()
}

export async function sendTestEmail(recipientInput: string, actorId: string) {
  const recipient = normalizeTestEmailRecipient(recipientInput)
  return withEmailTestSingleFlight(actorId, () => deliverTestEmail(recipient, actorId))
}

export async function testSavedEmailSettings(actorId: string) {
  const snapshot = await readSmtpRuntimeSnapshot()

  let ok = false
  let code = 'EMAIL_CHECK_FAILED'
  let checkedAt = new Date()
  try {
    await createSmtpTransport(snapshot.config).verify()
    checkedAt = await persistEmailCheckResult(snapshot, true, 'EMAIL_READY', new Date())
    ok = true
    code = 'EMAIL_READY'
    return {
      checkedAt: checkedAt.toISOString(),
      source: snapshot.source,
      status: 'ready' as const,
    }
  }
  catch (error) {
    if (error instanceof EmailSettingsError) {
      code = error.code
      throw error
    }

    checkedAt = new Date()
    try {
      await persistEmailCheckResult(snapshot, false, code, checkedAt)
    }
    catch (stateError) {
      if (stateError instanceof EmailSettingsError)
        code = stateError.code
      throw stateError
    }
    throw new EmailSettingsError('无法连接邮件服务器，请检查主机、端口、加密方式和密钥', 502, code)
  }
  finally {
    await getControlPool().query(`
      insert into control.audit_logs (
        actor_user_id, action, resource_type, resource_id, success, code, metadata
      ) values (
        $1, 'email_settings.check', 'email_settings', 'singleton', $2, $3,
        jsonb_build_object('source', $4::text)
      )
    `, [actorId, ok, code, snapshot.source]).catch(() => undefined)
  }
}

function classifySmtpSendFailure(error: unknown, recipient: string): {
  diagnostic: SmtpFailureDiagnostic
  error: EmailSettingsError
} {
  const code = readErrorCode(error)
  const command = readSmtpCommand(error)
  const responseCode = readSmtpResponseCode(error)
  const retryable = isTemporarySmtpResponse(responseCode)
  const diagnostic = { command, responseCode }

  if (code === 'EAUTH') {
    return {
      diagnostic,
      error: new EmailSettingsError(
        'SMTP 身份验证失败，请检查登录账号和 SMTP 密钥',
        502,
        'EMAIL_SMTP_AUTH_FAILED',
      ),
    }
  }

  if (code === 'ETLS') {
    return {
      diagnostic,
      error: new EmailSettingsError(
        'SMTP TLS 安全连接失败，请检查端口、加密方式和服务器证书',
        502,
        'EMAIL_SMTP_TLS_FAILED',
      ),
    }
  }

  if (['ECONNECTION', 'ECONNREFUSED', 'ESOCKET', 'ETIMEDOUT'].includes(code)) {
    return {
      diagnostic,
      error: new EmailSettingsError(
        'SMTP 连接暂时不可用，请检查服务器状态后重试',
        502,
        'EMAIL_SMTP_CONNECTION_FAILED',
        true,
      ),
    }
  }

  if (code === 'EENVELOPE') {
    const rejectedRecipient = readRejectedSmtpAddresses(error).includes(recipient)
    if (command === 'rcpt_to' || rejectedRecipient) {
      return {
        diagnostic,
        error: new EmailSettingsError(
          retryable
            ? 'SMTP 服务器暂时无法接收该测试邮箱，请稍后重试'
            : 'SMTP 服务器拒绝了测试收件地址，请检查邮箱或服务商收件策略',
          502,
          'EMAIL_TEST_RECIPIENT_REJECTED',
          retryable,
        ),
      }
    }

    if (command === 'mail_from') {
      return {
        diagnostic,
        error: new EmailSettingsError(
          retryable
            ? 'SMTP 服务器暂时无法接受当前发件身份，请稍后重试'
            : 'SMTP 服务器拒绝了当前发件身份，请确认发件邮箱已获服务商授权，并检查是否需与登录账号一致',
          502,
          'EMAIL_TEST_SENDER_REJECTED',
          retryable,
        ),
      }
    }

    if (command === 'data') {
      return {
        diagnostic,
        error: new EmailSettingsError(
          retryable
            ? 'SMTP 服务器暂时无法进入邮件正文传输阶段，请稍后重试'
            : 'SMTP 服务器拒绝进入邮件正文传输阶段，请检查发件策略',
          502,
          'EMAIL_TEST_DATA_COMMAND_REJECTED',
          retryable,
        ),
      }
    }

    return {
      diagnostic,
      error: new EmailSettingsError(
        retryable
          ? 'SMTP 服务器暂时无法接受邮件信封，请稍后重试'
          : 'SMTP 服务器拒绝了邮件信封，请检查发件身份和服务商策略',
        502,
        'EMAIL_TEST_ENVELOPE_REJECTED',
        retryable,
      ),
    }
  }

  if (code === 'EMESSAGE' && command === 'data') {
    return {
      diagnostic,
      error: new EmailSettingsError(
        retryable
          ? 'SMTP 服务器暂时未能接受邮件内容，请稍后重试'
          : 'SMTP 服务器在接收邮件内容后拒绝了消息，请检查服务商内容策略',
        502,
        'EMAIL_TEST_MESSAGE_REJECTED',
        retryable,
      ),
    }
  }

  return {
    diagnostic,
    error: new EmailSettingsError(
      '测试邮件发送失败，请检查邮件服务配置后重试',
      502,
      'EMAIL_TEST_SEND_FAILED',
      retryable,
    ),
  }
}

async function deliverTestEmail(recipient: string, actorId: string) {
  const snapshot = await readSmtpRuntimeSnapshot()
  const recipientDomain = recipient.slice(recipient.lastIndexOf('@') + 1)

  let auditCode = 'EMAIL_TEST_SEND_FAILED'
  let auditDiagnostic: SmtpFailureDiagnostic | null = null
  let auditSuccess = false
  let smtpAccepted = false
  try {
    const generatedAt = new Date()
    const template = createSmtpTestTemplate({
      encryption: snapshot.config.encryption,
      fromEmail: snapshot.config.fromEmail,
      fromName: snapshot.config.fromName,
      sentAt: generatedAt.toISOString(),
    })
    const result = await createSmtpTransport(snapshot.config).sendMail({
      envelope: createSmtpEnvelope(snapshot.config, recipient),
      ...createSmtpMessageIdentity(snapshot.config),
      html: template.html,
      subject: template.subject,
      text: template.text,
      to: { address: recipient },
    })

    if (!isRecipientAccepted(result, recipient)) {
      auditCode = 'EMAIL_TEST_RECIPIENT_REJECTED'
      throw new EmailSettingsError(
        'SMTP 服务器未接受测试收件地址，请检查邮箱后重试',
        502,
        auditCode,
      )
    }

    smtpAccepted = true
    const queuedAt = await persistEmailCheckResult(snapshot, true, 'EMAIL_READY', new Date())
    auditCode = 'EMAIL_TEST_SEND_ACCEPTED'
    auditSuccess = true
    return {
      deliveryConfirmed: false as const,
      messageId: readSafeMessageId(result.messageId),
      queuedAt: queuedAt.toISOString(),
      recipient,
      source: snapshot.source,
      status: 'queued' as const,
    }
  }
  catch (error) {
    if (error instanceof EmailSettingsError) {
      auditCode = error.code
      if (error.code === 'EMAIL_SETTINGS_CHANGED_DURING_TEST' && smtpAccepted) {
        throw new EmailSettingsError(
          '邮件配置在发送期间发生变化；测试邮件可能已投递，请先核对收件箱再使用当前配置重试',
          409,
          error.code,
        )
      }
      throw error
    }

    const failure = classifySmtpSendFailure(error, recipient)
    auditCode = failure.error.code
    auditDiagnostic = failure.diagnostic

    if (isSmtpConnectionFailure(error)) {
      try {
        await persistEmailCheckResult(snapshot, false, failure.error.code, new Date())
      }
      catch (stateError) {
        if (stateError instanceof EmailSettingsError) {
          auditCode = stateError.code
          throw stateError
        }
        throw stateError
      }
    }

    throw failure.error
  }
  finally {
    await recordTestEmailResult({
      actorId,
      code: auditCode,
      diagnostic: auditDiagnostic,
      recipientDomain,
      source: snapshot.source,
      success: auditSuccess,
    }).catch(() => undefined)
  }
}

function emailMode() {
  const configured = optionalServerEnv('AUTH_EMAIL_MODE')
  const mode = configured ?? (process.env.NODE_ENV === 'production' ? 'smtp' : 'console')
  if (mode !== 'console' && mode !== 'smtp')
    throw new EmailSettingsError('AUTH_EMAIL_MODE 必须是 console 或 smtp', 500)
  return mode
}

function fingerprintEnvironmentConfig(config: SmtpRuntimeConfig) {
  return hashSmtpFingerprint({
    encryption: config.encryption,
    fromEmail: config.fromEmail,
    fromName: config.fromName,
    host: config.host,
    password: config.password,
    port: config.port,
    source: 'environment',
    username: config.username,
  })
}

function fingerprintSettingsRow(row: EmailSettingsRow) {
  return hashSmtpFingerprint({
    encryptedPassword: row.encrypted_password,
    encryption: row.encryption,
    fromEmail: row.from_email,
    fromName: row.from_name,
    host: row.host,
    port: row.port,
    source: 'database',
    username: row.username,
  })
}

function hashSmtpFingerprint(value: Record<string, unknown>) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function isConsoleMode() {
  const mode = emailMode()
  if (mode === 'console' && process.env.NODE_ENV === 'production')
    throw new EmailSettingsError('生产环境禁止使用 console 邮件模式', 500)
  return mode === 'console'
}

function isRecipientAccepted(result: { accepted?: unknown[], rejected?: unknown[] }, recipient: string) {
  const accepted = result.accepted ?? []
  const rejected = result.rejected ?? []
  return accepted.some(value => readSmtpAddress(value) === recipient)
    && !rejected.some(value => readSmtpAddress(value) === recipient)
}

function isSmtpConnectionFailure(error: unknown) {
  const code = readErrorCode(error)
  return ['EAUTH', 'ECONNECTION', 'ECONNREFUSED', 'ESOCKET', 'ETIMEDOUT', 'ETLS'].includes(code)
}

function isTemporarySmtpResponse(responseCode: number | null) {
  return responseCode !== null && responseCode >= 400 && responseCode <= 499
}

async function lockEmailSettings(client: PoolClient) {
  await client.query('select pg_advisory_xact_lock(hashtext($1)::bigint)', [EMAIL_SETTINGS_LOCK_KEY])
}

async function persistEmailCheckResult(
  snapshot: SmtpRuntimeSnapshot,
  ok: boolean,
  code: string,
  checkedAt: Date,
) {
  return withControlTransaction(async (client) => {
    await lockEmailSettings(client)
    const currentRow = await readSettingsRowFromClient(client)
    const currentEnvironment = currentRow ? null : readEnvironmentConfig()
    const currentFingerprint = currentRow
      ? fingerprintSettingsRow(currentRow)
      : currentEnvironment
        ? fingerprintEnvironmentConfig(currentEnvironment)
        : null
    const currentSource = currentRow ? 'database' : currentFingerprint ? 'environment' : null

    if (currentSource !== snapshot.source || currentFingerprint !== snapshot.fingerprint) {
      throw new EmailSettingsError(
        '邮件配置在测试期间发生变化，请使用当前配置重新测试',
        409,
        'EMAIL_SETTINGS_CHANGED_DURING_TEST',
      )
    }

    if (snapshot.source === 'database') {
      const result = await client.query<{ last_check_at: Date }>(`
        update control.email_settings
        set last_check_at = statement_timestamp(), last_check_ok = $1, last_check_code = $2
        where id = true
        returning last_check_at
      `, [ok, code])
      return result.rows[0]?.last_check_at ?? checkedAt
    }

    return checkedAt
  })
}

function readEnvironmentConfig(): SmtpRuntimeConfig | null {
  const host = optionalServerEnv('SMTP_HOST')
  const username = optionalServerEnv('SMTP_USER')
  const password = optionalServerEnv('SMTP_PASSWORD')
  const from = optionalServerEnv('SMTP_FROM')
  if (!host || !username || !password || !from)
    return null

  const openingBracket = from.lastIndexOf('<')
  const closingBracket = from.lastIndexOf('>')
  const hasNamedAddress = openingBracket > 0 && closingBracket === from.length - 1
  const fromEmail = (hasNamedAddress ? from.slice(openingBracket + 1, closingBracket) : from).trim()
  const configuredName = hasNamedAddress ? from.slice(0, openingBracket).trim().replace(/^"|"$/g, '') : ''
  const fromName = configuredName || process.env.NEXT_PUBLIC_APP_NAME || 'HI LLM'
  try {
    const normalized = normalizeEmailSettingsInput({
      encryption: (optionalServerEnv('SMTP_SECURE') ?? 'true') === 'true' ? 'tls' : 'starttls',
      fromEmail,
      fromName,
      host,
      password,
      port: optionalServerEnv('SMTP_PORT') ?? '465',
      username,
    })
    return { ...normalized, password }
  }
  catch {
    return null
  }
}

function readErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error))
    return ''
  return typeof error.code === 'string' ? error.code.toUpperCase() : ''
}

function readRejectedSmtpAddresses(error: unknown) {
  if (!error || typeof error !== 'object' || !('rejected' in error) || !Array.isArray(error.rejected))
    return []
  return error.rejected.map(readSmtpAddress).filter(Boolean)
}

function readSafeMessageId(value: unknown) {
  if (typeof value !== 'string')
    return null
  const sanitized = Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint > 31 && (codePoint < 127 || codePoint > 159)
    })
    .join('')
    .trim()
  return Array.from(sanitized).slice(0, 320).join('') || null
}

async function readSettingsRow() {
  const result = await getControlPool().query<EmailSettingsRow>(`
    select host, port, encryption, username, from_email, from_name, encrypted_password,
           last_check_at, last_check_ok, last_check_code, updated_at
    from control.email_settings where id = true
  `)
  return result.rows[0] ?? null
}

async function readSettingsRowFromClient(client: PoolClient) {
  const result = await client.query<EmailSettingsRow>(`
    select host, port, encryption, username, from_email, from_name, encrypted_password,
           last_check_at, last_check_ok, last_check_code, updated_at
    from control.email_settings where id = true
  `)
  return result.rows[0] ?? null
}

function readSmtpAddress(value: unknown) {
  const address = typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'address' in value && typeof value.address === 'string'
      ? value.address
      : ''
  return normalizeEmailMailboxOrNull(address) ?? ''
}

function readSmtpCommand(error: unknown): SmtpAuditCommand {
  if (!error || typeof error !== 'object' || !('command' in error) || typeof error.command !== 'string')
    return 'unknown'
  const command = error.command.trim().toUpperCase()
  if (command === 'API')
    return 'api'
  if (command === 'DATA')
    return 'data'
  if (command === 'MAIL FROM')
    return 'mail_from'
  if (command === 'RCPT TO')
    return 'rcpt_to'
  return 'unknown'
}

function readSmtpResponseCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('responseCode' in error))
    return null
  return typeof error.responseCode === 'number'
    && Number.isInteger(error.responseCode)
    && error.responseCode >= 100
    && error.responseCode <= 599
    ? error.responseCode
    : null
}

async function readSmtpRuntimeSnapshot(): Promise<SmtpRuntimeSnapshot> {
  const row = await readSettingsRow()
  if (row) {
    return {
      config: rowToRuntimeConfig(row),
      fingerprint: fingerprintSettingsRow(row),
      source: 'database',
    }
  }

  const environment = readEnvironmentConfig()
  if (environment) {
    return {
      config: environment,
      fingerprint: fingerprintEnvironmentConfig(environment),
      source: 'environment',
    }
  }

  throw new EmailNotConfiguredError()
}

async function recordTestEmailResult(input: {
  actorId: string
  code: string
  diagnostic: SmtpFailureDiagnostic | null
  recipientDomain: string
  source: SmtpRuntimeSnapshot['source']
  success: boolean
}) {
  await getControlPool().query(`
    insert into control.audit_logs (
      actor_user_id, action, resource_type, resource_id, success, code, metadata
    ) values (
      $1, 'email_settings.test_send', 'email_settings', 'singleton', $2, $3,
      jsonb_strip_nulls(jsonb_build_object(
        'recipient_domain', $4::text,
        'source', $5::text,
        'smtp_command', $6::text,
        'smtp_response_code', $7::int
      ))
    )
  `, [
    input.actorId,
    input.success,
    input.code,
    input.recipientDomain,
    input.source,
    input.diagnostic?.command ?? null,
    input.diagnostic?.responseCode ?? null,
  ])
}

function rowToAdminSettings(row: EmailSettingsRow, source: AdminEmailSettings['source']): AdminEmailSettings {
  const { password } = decryptConfig<EmailPasswordSecret>(row.encrypted_password)
  return {
    encryption: row.encryption,
    fromEmail: row.from_email,
    fromName: row.from_name,
    host: row.host,
    lastCheckAt: row.last_check_at?.toISOString() ?? null,
    lastCheckCode: row.last_check_code,
    lastCheckOk: row.last_check_ok,
    passwordConfigured: Boolean(password),
    passwordHint: password ? '已加密保存' : null,
    port: row.port,
    source,
    updatedAt: row.updated_at.toISOString(),
    username: row.username,
  }
}

function rowToRuntimeConfig(row: EmailSettingsRow): SmtpRuntimeConfig {
  return {
    encryption: row.encryption,
    fromEmail: row.from_email,
    fromName: row.from_name,
    host: row.host,
    password: decryptConfig<EmailPasswordSecret>(row.encrypted_password).password,
    port: row.port,
    username: row.username,
  }
}

async function withEmailTestSingleFlight<T>(actorId: string, operation: () => Promise<T>) {
  const client = await getControlPool().connect()
  const lockKey = `${EMAIL_TEST_LOCK_PREFIX}:${actorId}`
  let locked = false
  let discardClient = false
  try {
    const result = await client.query<{ locked: boolean }>(
      'select pg_try_advisory_lock(hashtext($1)::bigint) as locked',
      [lockKey],
    )
    locked = result.rows[0]?.locked === true
    if (!locked) {
      throw new EmailSettingsError(
        '已有一封测试邮件正在发送，请等待完成后再试',
        409,
        'EMAIL_TEST_ALREADY_RUNNING',
        true,
      )
    }
    return await operation()
  }
  finally {
    if (locked) {
      try {
        const result = await client.query<{ unlocked: boolean }>(
          'select pg_advisory_unlock(hashtext($1)::bigint) as unlocked',
          [lockKey],
        )
        discardClient = result.rows[0]?.unlocked !== true
      }
      catch {
        discardClient = true
      }
    }
    client.release(discardClient)
  }
}
