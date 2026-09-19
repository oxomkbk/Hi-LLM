'use client'

import {
  CircleCheckFill,
  Clock,
  Envelope,
  FloppyDisk,
  Lock,
  PaperPlane,
  PlugConnection,
  ShieldCheck,
  TriangleExclamationFill,
} from '@gravity-ui/icons'
import {
  Button,
  Description,
  FieldError,
  Form,
  Input,
  Label,
  ListBox,
  Select,
  Spinner,
  TextField,
  toast,
} from '@heroui/react'
import { useEffect, useState } from 'react'

import { isEmailRegistrationReady } from '@/lib/email/readiness'
import { notifyRequestFailure, request } from '@/lib/request'
import { formatDate, RESPONSE } from '@/lib/utils'

import { AdminPageHeader } from './admin-ui'
import EmailDeliveryQueueStatus from './email-delivery-queue-status'
import styles from './email-settings-form.module.css'

import type { EmailTestResult } from './email-delivery-queue-status'
import type { AdminEmailSettings, EmailEncryption } from '@/types'
import type { FormEvent } from 'react'

interface EmailCheckResult {
  checkedAt: string
  source: 'database' | 'environment'
  status: 'ready'
}

const SOURCE_LABELS: Record<AdminEmailSettings['source'], string> = {
  console: 'Console 开发模式',
  database: '后台配置',
  environment: '环境变量',
  unconfigured: '尚未配置',
}

export default function EmailSettingsForm({ initialSettings }: { initialSettings: AdminEmailSettings }) {
  const [settings, setSettings] = useState(initialSettings)
  const [encryption, setEncryption] = useState<EmailEncryption>(initialSettings.encryption)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [sending, setSending] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [recipient, setRecipient] = useState('')
  const [lastDelivery, setLastDelivery] = useState<EmailTestResult | null>(null)

  const mode = settings.source === 'console'
    ? 'console'
    : settings.source === 'unconfigured'
      ? 'unconfigured'
      : 'smtp'
  const ready = isEmailRegistrationReady({
    host: settings.host,
    lastCheckAt: settings.lastCheckAt,
    lastCheckOk: settings.lastCheckOk,
    mode,
    passwordConfigured: settings.passwordConfigured,
    source: settings.source,
    updatedAt: settings.updatedAt,
  })
  const smtpAvailable = (settings.source === 'database' || settings.source === 'environment')
    && settings.passwordConfigured
    && Boolean(settings.host)
  const busy = saving || testing || sending
  const diagnosticsDisabled = busy || dirty || !smtpAvailable
  const diagnosticsHint = dirty
    ? '当前有未保存修改，请先保存后再测试生效配置。'
    : !smtpAvailable
        ? '请先完成 SMTP 配置并保存。'
        : '所有测试均使用当前已保存并生效的配置。'

  useEffect(() => {
    if (!dirty)
      return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [dirty])

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    setSaving(true)
    try {
      const result = await request<AdminEmailSettings>('/admin/email-settings', {
        body: JSON.stringify({
          encryption,
          fromEmail: values.get('fromEmail'),
          fromName: values.get('fromName'),
          host: values.get('host'),
          password: values.get('password'),
          port: values.get('port'),
          username: values.get('username'),
        }),
        method: 'PUT',
      })
      if (result.code !== RESPONSE.SUCCESS)
        return
      setSettings(result.data)
      setDirty(false)
      setLastDelivery(null)
      const password = form.elements.namedItem('password')
      if (password instanceof HTMLInputElement)
        password.value = ''
      toast.success(result.msg, { indicator: <CircleCheckFill /> })
    }
    catch (error) {
      notifyRequestFailure(error, '邮件设置保存失败，请稍后重试')
    }
    finally {
      setSaving(false)
    }
  }

  const sendTest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSending(true)
    try {
      const result = await request<EmailTestResult>('/admin/email-settings/send-test', {
        body: JSON.stringify({ recipient }),
        method: 'POST',
      })
      if (result.code !== RESPONSE.SUCCESS)
        return
      setLastDelivery(result.data)
      setSettings(current => ({
        ...current,
        lastCheckAt: result.data.queuedAt,
        lastCheckCode: 'EMAIL_READY',
        lastCheckOk: true,
      }))
      toast.info(result.msg, {
        description: 'SMTP 已接收，但这不代表邮件已进入收件箱。',
        indicator: <PaperPlane />,
      })
    }
    catch (error) {
      notifyRequestFailure(error, '测试邮件发送失败，请稍后重试')
    }
    finally {
      setSending(false)
    }
  }

  const testConnection = async () => {
    setTesting(true)
    try {
      const result = await request<EmailCheckResult>('/admin/email-settings/test', { method: 'POST' })
      if (result.code === RESPONSE.SUCCESS) {
        setSettings(current => ({
          ...current,
          lastCheckAt: result.data.checkedAt,
          lastCheckCode: 'EMAIL_READY',
          lastCheckOk: true,
        }))
        toast.success(result.msg, { indicator: <CircleCheckFill /> })
      }
    }
    catch (error) {
      notifyRequestFailure(error, 'SMTP 连接检测失败，请稍后重试')
    }
    finally {
      setTesting(false)
    }
  }

  return (
    <div className={`${styles.page} admin-settings-page mx-auto w-full max-w-[1200px] pb-10`}>
      <AdminPageHeader
        title="邮件服务"
        actions={(
          <div data-ready={ready} className={styles.headerStatus}>
            <span aria-hidden="true" className={styles.statusDot} />
            <span>
              <strong>{ready ? '服务可用' : '等待完成配置'}</strong>
              <small>{SOURCE_LABELS[settings.source]}</small>
            </span>
          </div>
        )}
        description="配置安全邮件通道，检查 SMTP 连接，并验证邮件是否进入服务商投递队列。"
      />

      <section aria-label="邮件服务摘要" className={styles.overview}>
        <div className={styles.metric}>
          <span className={styles.metricIcon}><Envelope aria-hidden="true" /></span>
          <span>
            <small>发件身份</small>
            <strong>{settings.fromName || '尚未设置'}</strong>
            <em>{settings.fromEmail || '—'}</em>
          </span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricIcon}><ShieldCheck aria-hidden="true" /></span>
          <span>
            <small>传输安全</small>
            <strong>{encryption === 'tls' ? 'TLS 直连' : 'STARTTLS'}</strong>
            <em>最低 TLS 1.2</em>
          </span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricIcon}><Clock aria-hidden="true" /></span>
          <span>
            <small>最近连接检测</small>
            <strong>{settings.lastCheckAt ? (settings.lastCheckOk ? '连接正常' : '连接失败') : '尚未检测'}</strong>
            <em>{settings.lastCheckAt ? formatDate(settings.lastCheckAt, 'datetime') : '保存配置后执行检测'}</em>
          </span>
        </div>
      </section>

      <div className={styles.workspace}>
        <div onChange={() => setDirty(true)} className={styles.settingsColumn}>
          <Form id="email-settings-form" onSubmit={save} className={styles.settingsForm}>
            <section aria-labelledby="smtp-connection-heading" className={`${styles.panel} admin-settings-section`}>
              <div className={styles.sectionHeading}>
                <span><PlugConnection aria-hidden="true" /></span>
                <div>
                  <h2 id="smtp-connection-heading">服务器连接</h2>
                  <p>填写 SMTP 地址与端口，选择服务商要求的加密方式。</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
                <TextField name="host" isRequired defaultValue={settings.host}>
                  <Label>SMTP 主机</Label>
                  <Input variant="secondary" fullWidth placeholder="smtp.example.com" spellCheck={false} />
                  <FieldError />
                </TextField>
                <TextField name="port" isRequired defaultValue={String(settings.port)}>
                  <Label>端口</Label>
                  <Input
                    type="number"
                    variant="secondary"
                    fullWidth
                    inputMode="numeric"
                    max={65535}
                    min={1}
                  />
                  <FieldError />
                </TextField>
              </div>
              <div className="mt-4">
                <Select
                  aria-label="连接加密"
                  variant="secondary"
                  value={encryption}
                  onChange={(value) => {
                    setDirty(true)
                    setEncryption(String(value) as EmailEncryption)
                  }}
                >
                  <Label>连接加密</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id="tls" textValue="TLS（常用端口 465）">
                        TLS（常用端口 465）
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="starttls" textValue="STARTTLS（常用端口 587）">
                        STARTTLS（常用端口 587）
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    </ListBox>
                  </Select.Popover>
                </Select>
              </div>
            </section>

            <section aria-labelledby="smtp-credentials-heading" className={`${styles.panel} admin-settings-section`}>
              <div className={styles.sectionHeading}>
                <span><Lock aria-hidden="true" /></span>
                <div>
                  <h2 id="smtp-credentials-heading">身份凭据</h2>
                  <p>凭据只在服务端加密保存，页面不会读取或回显密钥。</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField name="username" isRequired defaultValue={settings.username}>
                  <Label>SMTP 用户名</Label>
                  <Input variant="secondary" autoComplete="off" fullWidth spellCheck={false} />
                  <FieldError />
                </TextField>
                <TextField name="password" isRequired={!settings.passwordConfigured}>
                  <Label>SMTP 密钥</Label>
                  <Input
                    type="password"
                    variant="secondary"
                    autoComplete="new-password"
                    fullWidth
                    placeholder={settings.passwordConfigured ? '留空保留当前密钥' : '输入 SMTP 密钥'}
                  />
                  <Description>{settings.passwordHint ?? '保存后将使用服务端配置密钥加密'}</Description>
                  <FieldError />
                </TextField>
              </div>
            </section>

            <section aria-labelledby="sender-identity-heading" className={`${styles.panel} admin-settings-section`}>
              <div className={styles.sectionHeading}>
                <span><Envelope aria-hidden="true" /></span>
                <div>
                  <h2 id="sender-identity-heading">发件身份</h2>
                  <p>发件名称保持品牌；登录用户名为邮箱时会作为实际发件地址，配置邮箱同时作为回复地址。</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField name="fromName" isRequired defaultValue={settings.fromName}>
                  <Label>发件人名称</Label>
                  <Input variant="secondary" fullWidth placeholder="HiLLM" />
                  <FieldError />
                </TextField>
                <TextField name="fromEmail" type="email" isRequired defaultValue={settings.fromEmail}>
                  <Label>配置发件 / 回复邮箱</Label>
                  <Input variant="secondary" fullWidth placeholder="no-reply@example.com" spellCheck={false} />
                  <Description>与 SMTP 登录邮箱不同时，系统会优先对齐登录身份以提高送达率。</Description>
                  <FieldError />
                </TextField>
              </div>
            </section>

            <div className="admin-settings-actions">
              <span data-dirty={dirty ? 'true' : 'false'}>{dirty ? '有未保存的更改' : '所有设置已保存'}</span>
              <Button type="submit" isDisabled={testing || sending || !dirty} isPending={saving}>
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner color="current" size="sm" /> : <FloppyDisk />}
                    保存设置
                  </>
                )}
              </Button>
            </div>
          </Form>
        </div>

        <aside aria-label="邮件服务诊断" className={styles.diagnostics}>
          <section className={styles.diagnosticPanel}>
            <div className={styles.diagnosticHeading}>
              <span><PlugConnection aria-hidden="true" /></span>
              <div>
                <small>第一步</small>
                <h2>检查 SMTP 连接</h2>
              </div>
            </div>
            <p>验证服务器、端口、TLS 和凭据，不会发送邮件。</p>
            <Button
              type="button"
              variant="outline"
              isDisabled={diagnosticsDisabled}
              isPending={testing}
              fullWidth
              onPress={() => void testConnection()}
            >
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : <PlugConnection />}
                  开始连接检测
                </>
              )}
            </Button>
          </section>

          <Form onSubmit={sendTest} className={`${styles.diagnosticPanel} ${styles.deliveryPanel}`}>
            <div className={styles.diagnosticHeading}>
              <span><PaperPlane aria-hidden="true" /></span>
              <div>
                <small>第二步</small>
                <h2>发送测试邮件</h2>
              </div>
            </div>
            <p>实际发送一封新版 HiLLM 邮件，确认 SMTP 是否接收并进入后续投递队列。</p>
            <TextField name="recipient" isRequired value={recipient} onChange={setRecipient}>
              <Label>测试收件邮箱</Label>
              <Input
                variant="secondary"
                autoCapitalize="none"
                fullWidth
                inputMode="email"
                placeholder="you@example.com"
                spellCheck={false}
              />
              <Description>可发送到任意有效邮箱，不要求是站内账号。</Description>
              <FieldError />
            </TextField>
            <Button
              type="submit"
              isDisabled={diagnosticsDisabled || !recipient.trim()}
              isPending={sending}
              fullWidth
            >
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : <PaperPlane />}
                  发送测试邮件
                </>
              )}
            </Button>
            {lastDelivery
              ? <EmailDeliveryQueueStatus result={lastDelivery} />
              : null}
          </Form>

          <div data-warning={dirty || !smtpAvailable} className={styles.diagnosticNote}>
            {dirty || !smtpAvailable
              ? <TriangleExclamationFill aria-hidden="true" />
              : <ShieldCheck aria-hidden="true" />}
            <p>{diagnosticsHint}</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
