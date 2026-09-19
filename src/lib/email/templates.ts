const DEFAULT_BRAND_NAME = 'HiLLM'

export interface RenderedEmailTemplate {
  html: string
  subject: string
  text: string
}

interface ActionEmailInput {
  actionUrl: string
}

interface EmailShellInput {
  action?: {
    label: string
    url: string
  }
  details?: Array<{ label: string, value: string }>
  eyebrow: string
  preheader: string
  title: string
  description: string
  notice: string
}

interface TestEmailInput {
  encryption: 'starttls' | 'tls'
  fromEmail: string
  fromName: string
  sentAt: string
}

export class EmailTemplateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmailTemplateError'
  }
}

export function createEmailVerificationTemplate(input: ActionEmailInput): RenderedEmailTemplate {
  const actionUrl = normalizeTrustedActionUrl(input.actionUrl)
  return {
    html: renderEmailShell({
      action: { label: '验证邮箱地址', url: actionUrl },
      description: '完成邮箱验证后，你就可以安全地登录并使用 HiLLM 的完整功能。',
      eyebrow: '账户安全',
      notice: '如果你没有注册或发起验证，请忽略这封邮件。你的账户不会因此发生变化。',
      preheader: '验证你的 HiLLM 邮箱地址',
      title: '确认这是你的邮箱',
    }),
    subject: '验证你的 HiLLM 邮箱',
    text: [
      '验证你的 HiLLM 邮箱',
      '',
      '完成邮箱验证后，你就可以安全地登录并使用 HiLLM 的完整功能。',
      '',
      `验证链接：${actionUrl}`,
      '',
      '如果你没有注册或发起验证，请忽略这封邮件。你的账户不会因此发生变化。',
    ].join('\n'),
  }
}

export function createPasswordResetTemplate(input: ActionEmailInput): RenderedEmailTemplate {
  const actionUrl = normalizeTrustedActionUrl(input.actionUrl)
  return {
    html: renderEmailShell({
      action: { label: '重置登录密码', url: actionUrl },
      description: '我们收到了你的密码重置请求。请通过下面的一次性操作链接设置新密码。',
      eyebrow: '账户安全',
      notice: '如果这不是你的操作，请忽略这封邮件，并继续使用原密码登录。',
      preheader: '安全地重置你的 HiLLM 登录密码',
      title: '重置你的登录密码',
    }),
    subject: '重置你的 HiLLM 登录密码',
    text: [
      '重置你的 HiLLM 登录密码',
      '',
      '我们收到了你的密码重置请求。请通过下面的一次性操作链接设置新密码。',
      '',
      `重置链接：${actionUrl}`,
      '',
      '如果这不是你的操作，请忽略这封邮件，并继续使用原密码登录。',
    ].join('\n'),
  }
}

export function createSmtpTestTemplate(input: TestEmailInput): RenderedEmailTemplate {
  const fromName = cleanDisplayValue(input.fromName)
  const fromEmail = cleanDisplayValue(input.fromEmail)
  const sentAt = formatEmailDate(input.sentAt)
  const encryption = input.encryption === 'tls' ? 'TLS 直连' : 'STARTTLS 升级加密'

  return {
    html: renderEmailShell({
      description: '这封邮件由 HiLLM 后台主动发送，用于确认发件身份、加密连接和真实投递链路均可工作。',
      details: [
        { label: '发件身份', value: `${fromName} <${fromEmail}>` },
        { label: '传输方式', value: encryption },
        { label: '发送时间', value: sentAt },
      ],
      eyebrow: '投递诊断',
      notice: 'SMTP 服务器已接受这封测试邮件。最终进入收件箱、推广邮件或垃圾邮件目录，仍取决于收件服务商策略。',
      preheader: 'HiLLM 邮件服务测试成功',
      title: '邮件投递链路工作正常',
    }),
    subject: 'HiLLM 邮件服务测试成功',
    text: [
      'HiLLM 邮件服务测试成功',
      '',
      '这封邮件由 HiLLM 后台主动发送，用于确认发件身份、加密连接和真实投递链路均可工作。',
      '',
      `发件身份：${fromName} <${fromEmail}>`,
      `传输方式：${encryption}`,
      `发送时间：${sentAt}`,
      '',
      'SMTP 服务器已接受这封测试邮件。最终进入收件箱、推广邮件或垃圾邮件目录，仍取决于收件服务商策略。',
    ].join('\n'),
  }
}

function cleanDisplayValue(value: string) {
  return [...value]
    .filter(character => !isControlCharacter(character))
    .join('')
    .trim()
    .slice(0, 320)
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
}

function formatEmailDate(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime()))
    throw new EmailTemplateError('测试邮件时间无效')
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Shanghai',
  }).format(date)
}

function isControlCharacter(character: string) {
  const code = character.charCodeAt(0)
  return code <= 31 || code === 127
}

function normalizeTrustedActionUrl(value: string) {
  if (!value || [...value].some(isControlCharacter))
    throw new EmailTemplateError('邮件操作链接无效')

  let actionUrl: URL
  try {
    actionUrl = new URL(value)
  }
  catch {
    throw new EmailTemplateError('邮件操作链接无效')
  }

  if (!['http:', 'https:'].includes(actionUrl.protocol) || actionUrl.username || actionUrl.password)
    throw new EmailTemplateError('邮件操作链接无效')

  const trustedOrigins = new Set<string>()
  for (const configuredUrl of [process.env.NEXT_PUBLIC_APP_URL, process.env.BETTER_AUTH_URL]) {
    if (!configuredUrl)
      continue
    try {
      trustedOrigins.add(new URL(configuredUrl).origin)
    }
    catch {
      // 无效环境配置不能成为可信邮件链接来源。
    }
  }
  if (!trustedOrigins.has(actionUrl.origin))
    throw new EmailTemplateError('邮件操作链接来源无效')

  return actionUrl.toString()
}

function renderEmailShell(input: EmailShellInput) {
  const brandName = DEFAULT_BRAND_NAME
  const action = input.action
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:30px 0 28px"><tr><td style="border-radius:12px;background:#1463ff"><a href="${escapeHtml(input.action.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 24px;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:16px;font-weight:700;line-height:20px;text-decoration:none">${escapeHtml(input.action.label)}</a></td></tr></table><p style="margin:0 0 8px;color:#64748b;font-size:13px;line-height:21px">按钮无法打开时，请复制下面的链接：</p><p style="margin:0;padding:13px 15px;border:1px solid #dbe4f0;border-radius:10px;background:#f8fafc;color:#334155;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:19px;word-break:break-all;overflow-wrap:anywhere">${escapeHtml(input.action.url)}</p>`
    : ''
  const details = input.details?.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0;border:1px solid #dbe4f0;border-radius:12px;border-collapse:separate;background:#f8fafc">${input.details.map(detail => `<tr><td style="padding:12px 16px;color:#64748b;font-size:13px;line-height:20px;border-bottom:1px solid #e8eef6">${escapeHtml(detail.label)}</td><td align="right" style="padding:12px 16px;color:#172033;font-size:13px;font-weight:650;line-height:20px;border-bottom:1px solid #e8eef6;overflow-wrap:anywhere">${escapeHtml(detail.value)}</td></tr>`).join('')}</table>`
    : ''

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:#eef3f8;color:#172033">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">${escapeHtml(input.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#eef3f8">
    <tr>
      <td align="center" style="padding:32px 14px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border:1px solid #d8e2ee;border-radius:18px;border-collapse:separate;background:#ffffff;box-shadow:0 14px 40px rgba(15,23,42,.08)">
          <tr><td style="height:5px;border-radius:18px 18px 0 0;background:#1463ff;font-size:0;line-height:0">&nbsp;</td></tr>
          <tr>
            <td style="padding:28px 32px 18px">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:20px;font-weight:800;letter-spacing:-.4px">${brandName}</td>
                  <td align="right"><span style="display:inline-block;padding:5px 9px;border:1px solid #cddcf1;border-radius:999px;background:#f4f8fd;color:#24518f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:11px;font-weight:700;letter-spacing:.6px">${escapeHtml(input.eyebrow)}</span></td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 32px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif">
              <h1 style="margin:0 0 14px;color:#0f172a;font-size:27px;font-weight:780;letter-spacing:-.7px;line-height:36px">${escapeHtml(input.title)}</h1>
              <p style="margin:0;color:#475569;font-size:16px;line-height:26px">${escapeHtml(input.description)}</p>
              ${action}
              ${details}
              <div style="margin-top:28px;padding:15px 16px;border-left:3px solid #7da8df;border-radius:8px;background:#f5f8fc;color:#52637a;font-size:13px;line-height:21px">${escapeHtml(input.notice)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:19px 32px;border-top:1px solid #e5ebf2;color:#7b8798;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:12px;line-height:19px">由 HiLLM 安全邮件服务发送 · 请勿直接回复</td>
          </tr>
        </table>
        <p style="margin:18px 0 0;color:#8995a6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:11px;line-height:18px">发现、收藏并分享值得访问的 AI 工具</p>
      </td>
    </tr>
  </table>
</body>
</html>`
}
