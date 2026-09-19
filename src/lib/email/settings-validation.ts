import { Buffer } from 'node:buffer'
import { isIP } from 'node:net'
import { domainToASCII } from 'node:url'

import { stripControlCharacters } from '../security'

import type { EmailEncryption } from '../../types'

const SMTPUTF8_LOCAL_PART = /^[\w!#$%&'*+/=?^`{|}.~\u0080-\u{10FFFF}-]+$/iu
const SMTP_DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export class EmailRecipientValidationError extends Error {
  readonly code = 'EMAIL_RECIPIENT_INVALID'
  readonly status = 400

  constructor(message = '请输入有效的测试收件邮箱') {
    super(message)
    this.name = 'EmailRecipientValidationError'
  }
}

export class EmailSettingsValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmailSettingsValidationError'
  }
}

export class EmailTestRequestValidationError extends Error {
  readonly code = 'EMAIL_TEST_REQUEST_INVALID'
  readonly status: number

  constructor(message = '测试邮件请求格式无效', status = 400) {
    super(message)
    this.name = 'EmailTestRequestValidationError'
    this.status = status
  }
}

export function normalizeEmailMailboxOrNull(value: string) {
  try {
    return normalizeSingleMailbox(value)
  }
  catch {
    return null
  }
}

export function normalizeEmailSettingsInput(input: Record<string, unknown>) {
  return {
    encryption: normalizeEncryption(input.encryption),
    fromEmail: normalizeEmail(input.fromEmail, '发件邮箱'),
    fromName: cleanText(input.fromName, 120, '发件人名称'),
    host: normalizeHost(input.host),
    password: normalizeOptionalPassword(input.password),
    port: normalizePort(input.port),
    username: cleanText(input.username, 320, 'SMTP 用户名'),
  }
}

export function normalizeEmailTestRequest(input: unknown) {
  if (!isPlainObject(input))
    throw new EmailTestRequestValidationError()

  const keys = Object.keys(input)
  if (keys.length !== 1 || keys[0] !== 'recipient' || typeof input.recipient !== 'string')
    throw new EmailTestRequestValidationError()

  return { recipient: normalizeTestEmailRecipient(input.recipient) }
}

export function normalizeTestEmailRecipient(value: string) {
  try {
    return normalizeSingleMailbox(value)
  }
  catch {
    throw new EmailRecipientValidationError()
  }
}

function cleanText(value: unknown, maxLength: number, name: string) {
  if (typeof value !== 'string')
    throw new EmailSettingsValidationError(`请填写${name}`)
  const result = stripControlCharacters(value).trim()
  if (!result || result.length > maxLength)
    throw new EmailSettingsValidationError(`${name}格式无效`)
  return result
}

function hasUnsafeMailboxCharacter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 31 || (code >= 127 && code <= 159))
      return true
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = value.charCodeAt(index + 1)
      if (next < 0xDC00 || next > 0xDFFF)
        return true
      index += 1
    }
    else if (code >= 0xDC00 && code <= 0xDFFF) {
      return true
    }
  }
  return false
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function normalizeEmail(value: unknown, name: string) {
  const email = normalizeEmailMailboxOrNull(cleanText(value, 320, name).toLowerCase())
  if (!email)
    throw new EmailSettingsValidationError(`${name}格式无效`)
  return email
}

function normalizeEncryption(value: unknown): EmailEncryption {
  if (value !== 'tls' && value !== 'starttls')
    throw new EmailSettingsValidationError('请选择有效的连接加密方式')
  return value
}

function normalizeHost(value: unknown) {
  const host = cleanText(value, 253, 'SMTP 主机').toLowerCase()
  if (host.includes('://') || (!isIP(host) && !/^(?=.{1,253}$)(?!-)[a-z0-9-]+(?:\.(?!-)[a-z0-9-]+)*$/.test(host)))
    throw new EmailSettingsValidationError('SMTP 主机格式无效，请勿包含协议或路径')
  return host
}

function normalizeOptionalPassword(value: unknown) {
  if (value === undefined || value === null || value === '')
    return ''
  return cleanText(value, 4096, 'SMTP 密钥')
}

function normalizePort(value: unknown) {
  const port = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new EmailSettingsValidationError('SMTP 端口必须是 1–65535 之间的整数')
  return port
}

function normalizeSingleMailbox(value: string) {
  if (typeof value !== 'string' || value.length > 1024 || hasUnsafeMailboxCharacter(value))
    throw new Error('invalid mailbox')

  const mailbox = value.trim().normalize('NFC')
  if (!mailbox || /\s/u.test(mailbox))
    throw new Error('invalid mailbox')

  const separator = mailbox.indexOf('@')
  if (separator <= 0 || separator !== mailbox.lastIndexOf('@'))
    throw new Error('invalid mailbox')

  const localPart = mailbox.slice(0, separator)
  const unicodeDomain = mailbox.slice(separator + 1)
  if (
    !SMTPUTF8_LOCAL_PART.test(localPart)
    || localPart.startsWith('.')
    || localPart.endsWith('.')
    || localPart.includes('..')
    || Buffer.byteLength(localPart, 'utf8') > 64
  ) {
    throw new Error('invalid mailbox')
  }

  let domain = ''
  try {
    domain = domainToASCII(unicodeDomain).toLowerCase()
  }
  catch {
    throw new Error('invalid mailbox')
  }
  const labels = domain.split('.')
  if (
    !domain
    || domain.length > 253
    || labels.some(label => !SMTP_DOMAIN_LABEL.test(label))
  ) {
    throw new Error('invalid mailbox')
  }

  const normalized = `${localPart}@${domain}`
  if (Buffer.byteLength(normalized, 'utf8') > 254)
    throw new Error('invalid mailbox')
  return normalized
}
