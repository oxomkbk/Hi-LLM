'use client'

import { ArrowUpFromLine, Camera, Check, Lock, Person } from '@gravity-ui/icons'
import {
  Avatar,
  Button,
  FieldError,
  Form,
  Input,
  Label,
  ProgressBar,
  Spinner,
  TextArea,
  TextField,
  toast,
} from '@heroui/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import styles from '@/components/Profile/profile.module.css'
import { buildProfileCompletion } from '@/lib/account/profile-view-model'
import { authClient } from '@/lib/auth/client'
import { AUTH_MAX_PASSWORD_LENGTH, AUTH_MIN_PASSWORD_LENGTH } from '@/lib/auth/password-policy'
import { request } from '@/lib/request'
import { uploadAccountAvatar } from '@/lib/wonderland/client-upload'

import AppearanceEditor from './appearance-editor'

import type { AccountSection } from './account-sections'
import type { PrivateAccountData } from '@/lib/account/profile-types'
import type { FormEvent } from 'react'

interface AccountSettingsPanelProps {
  data: PrivateAccountData
  section: Exclude<AccountSection, 'overview'>
}

export function AccountSettingsPanel({ data: initialData, section }: AccountSettingsPanelProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [data, setData] = useState(initialData)
  const [avatarFileId, setAvatarFileId] = useState<string | null>(initialData.user.avatarFileId)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(initialData.user.image)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [saving, setSaving] = useState(false)
  const [securitySaving, setSecuritySaving] = useState(false)

  useEffect(() => () => {
    if (avatarPreview?.startsWith('blob:'))
      URL.revokeObjectURL(avatarPreview)
  }, [avatarPreview])

  const chooseAvatar = async (file?: File | null) => {
    if (!file)
      return
    setUploading(true)
    setUploadProgress(0)
    try {
      const uploaded = await uploadAccountAvatar(file, setUploadProgress)
      if (avatarPreview?.startsWith('blob:'))
        URL.revokeObjectURL(avatarPreview)
      setAvatarPreview(URL.createObjectURL(file))
      setAvatarFileId(uploaded.fileId)
      toast.success('头像已上传，保存资料后公开生效')
    }
    catch (error) {
      toast.danger((error as Error).message)
    }
    finally {
      setUploading(false)
      if (fileInputRef.current)
        fileInputRef.current.value = ''
    }
  }

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    try {
      const form = new FormData(event.currentTarget)
      const result = await request<PrivateAccountData>('/account/profile', {
        body: JSON.stringify({
          avatarFileId,
          bio: form.get('bio'),
          name: form.get('name'),
          website: form.get('website'),
        }),
        method: 'PATCH',
      })
      setData(result.data)
      setAvatarFileId(result.data.user.avatarFileId)
      setAvatarPreview(result.data.user.image)
      toast.success('个人资料已保存')
      router.refresh()
    }
    catch (error) {
      toast.danger((error as Error).message)
    }
    finally {
      setSaving(false)
    }
  }

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const currentPassword = String(form.get('currentPassword') ?? '')
    const newPassword = String(form.get('newPassword') ?? '')
    const confirmPassword = String(form.get('confirmPassword') ?? '')
    if (newPassword !== confirmPassword) {
      toast.danger('两次输入的新密码不一致')
      return
    }
    setSecuritySaving(true)
    try {
      const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })
      if (result.error)
        throw new Error(result.error.message || '密码修改失败')
      event.currentTarget.reset()
      toast.success('密码已修改，其他设备会话已退出')
      router.refresh()
    }
    catch (error) {
      toast.danger((error as Error).message)
    }
    finally {
      setSecuritySaving(false)
    }
  }

  const completion = buildProfileCompletion(data.user, data.appearanceConfigured)
  const removeAvatar = () => {
    setAvatarFileId(null)
    setAvatarPreview(null)
  }

  if (section === 'appearance') {
    return (
      <section className={`${styles.section} ${styles.sectionFeature}`}>
        <SectionHeading id="account-section-title" title="主页外观" description="选择底色或上传一张真正属于你的封面，所有调整先预览、保存后公开生效。" />
        <AppearanceEditor
          name={data.user.name}
          appearance={data.appearance}
          onSaved={(appearance) => {
            setData(current => ({
              ...current,
              appearance,
              appearanceConfigured: true,
            }))
            router.refresh()
          }}
        />
      </section>
    )
  }

  if (section === 'security') {
    return (
      <div className={styles.focusedGrid}>
        <section className={`${styles.section} ${styles.sectionFeature}`}>
          <SectionHeading id="account-section-title" title="账号安全" description="修改密码后，其他设备上的会话会自动退出。" />
          {data.user.loginMethods.includes('credential')
            ? (
                <Form onSubmit={changePassword} className={styles.securityForm}>
                  <TextField name="currentPassword" type="password" isRequired>
                    <Label>当前密码</Label>
                    <Input type="password" variant="secondary" autoComplete="current-password" fullWidth />
                    <FieldError />
                  </TextField>
                  <div className={styles.passwordGrid}>
                    <TextField name="newPassword" type="password" isRequired maxLength={AUTH_MAX_PASSWORD_LENGTH} minLength={AUTH_MIN_PASSWORD_LENGTH}>
                      <Label>新密码</Label>
                      <Input type="password" variant="secondary" autoComplete="new-password" fullWidth />
                      <FieldError />
                    </TextField>
                    <TextField name="confirmPassword" type="password" isRequired maxLength={AUTH_MAX_PASSWORD_LENGTH} minLength={AUTH_MIN_PASSWORD_LENGTH}>
                      <Label>确认新密码</Label>
                      <Input type="password" variant="secondary" autoComplete="new-password" fullWidth />
                      <FieldError />
                    </TextField>
                  </div>
                  <Button type="submit" size="sm" variant="secondary" isPending={securitySaving}>
                    {({ isPending }) => isPending
                      ? (
                          <>
                            <Spinner color="current" size="sm" />
                            更新中…
                          </>
                        )
                      : (
                          <>
                            <Lock aria-hidden="true" />
                            修改密码并退出其他设备
                          </>
                        )}
                  </Button>
                </Form>
              )
            : <p className={styles.securityNotice}>当前账号通过第三方平台登录，请在对应平台管理登录凭据。</p>}
        </section>
        <aside className={`${styles.section} ${styles.accountStatusCard}`}>
          <SectionHeading title="账号状态" description="这些登录与身份信息只对你可见。" />
          <dl className={styles.accountFacts}>
            <AccountFact label="邮箱" value={data.user.email} />
            <AccountFact label="邮箱状态" value={data.user.emailVerified ? '已验证' : '待验证'} />
            <AccountFact label="登录方式" value={formatMethods(data.user.loginMethods)} />
            <AccountFact label="有效会话" value={`${data.user.sessionCount} 个`} />
          </dl>
        </aside>
      </div>
    )
  }

  const handleAvatarPaste = (event: React.ClipboardEvent) => {
    const image = Array.from(event.clipboardData.files).find(file => file.type.startsWith('image/'))
    if (image) {
      event.preventDefault()
      void chooseAvatar(image)
    }
  }

  return (
    <div className={styles.focusedGrid}>
      <section className={`${styles.section} ${styles.sectionFeature}`}>
        <SectionHeading id="account-section-title" title="公开资料" description="头像、名称与简介保存后会立即同步到公开主页。" />
        <div className={styles.profileEditorLead}>
          <div
            onDragOver={event => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              void chooseAvatar(event.dataTransfer.files[0])
            }}
            onPaste={handleAvatarPaste}
            className={styles.avatarEditor}
          >
            <Avatar className="size-20 border border-border text-2xl sm:size-24">
              {avatarPreview ? <Avatar.Image alt={data.user.name} src={avatarPreview} /> : null}
              <Avatar.Fallback><Person className="size-7" /></Avatar.Fallback>
            </Avatar>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              isDisabled={uploading || saving}
              onPress={() => fileInputRef.current?.click()}
            >
              {uploading ? <Spinner color="current" size="sm" /> : <ArrowUpFromLine aria-hidden="true" />}
              {uploading ? '正在上传…' : '更换头像'}
            </Button>
            {avatarPreview
              ? <Button type="button" size="sm" variant="tertiary" isDisabled={uploading || saving} onPress={removeAvatar}>移除</Button>
              : null}
            <input
              ref={fileInputRef}
              aria-label="选择头像图片"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={event => void chooseAvatar(event.target.files?.[0])}
              className="sr-only"
            />
          </div>
          <div>
            <strong>
              <Camera aria-hidden="true" />
              公开头像
            </strong>
            <p>支持点击、拖入或粘贴 PNG、JPG、WebP，最大 2MB。上传后仍需保存资料。</p>
            {uploading ? <LabeledProgress label="头像上传进度" value={uploadProgress} /> : null}
          </div>
        </div>
        <Form onSubmit={saveProfile} className={styles.profileForm}>
          <TextField name="name" isRequired defaultValue={data.user.name} maxLength={100}>
            <Label>显示名称</Label>
            <Input variant="secondary" autoComplete="name" fullWidth placeholder="你希望社区如何称呼你" />
            <FieldError />
          </TextField>
          <TextField name="bio" defaultValue={data.user.bio ?? ''} maxLength={280}>
            <Label>个人简介</Label>
            <TextArea variant="secondary" fullWidth placeholder="专业方向、正在研究的主题，或你愿意帮助他人解决的问题" rows={4} />
            <FieldError />
          </TextField>
          <TextField name="website" type="url" defaultValue={data.user.website ?? ''} maxLength={2048}>
            <Label>个人网站</Label>
            <Input type="url" variant="secondary" fullWidth placeholder="https://example.com" />
            <FieldError />
          </TextField>
          <div className={styles.formActions}>
            <p>公开主页只展示保存后的资料，不会暴露邮箱与账号状态。</p>
            <Button type="submit" size="sm" isDisabled={uploading} isPending={saving}>
              {({ isPending }) => isPending
                ? (
                    <>
                      <Spinner color="current" size="sm" />
                      保存中…
                    </>
                  )
                : (
                    <>
                      <Check aria-hidden="true" />
                      保存资料
                    </>
                  )}
            </Button>
          </div>
        </Form>
      </section>

      <aside className={`${styles.section} ${styles.completionCard}`}>
        <span className={styles.completionValue}>
          {completion.percentage}
          %
        </span>
        <h2>公开主页完成度</h2>
        <p>{completion.percentage === 100 ? '公开身份已经准备好，接下来用作品和回答持续更新它。' : '补齐身份信息后，访问者更容易理解你的方向。'}</p>
        <LabeledProgress label="公开主页完成度" value={completion.percentage} />
        <ul className={styles.completionList}>
          {completion.items.map(item => (
            <li key={item.id} data-complete={item.complete || undefined}>
              <span>{item.complete ? <Check aria-hidden="true" /> : null}</span>
              {item.label}
            </li>
          ))}
        </ul>
        <Link href={`/users/${data.user.id}`} className={styles.websiteLink}>预览公开主页</Link>
      </aside>
    </div>
  )
}

function AccountFact({ label, value }: { label: string, value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function formatMethods(methods: string[]) {
  if (!methods.length)
    return '未绑定登录方式'
  return methods.map(method => method === 'credential' ? '密码登录' : method).join(' · ')
}

function LabeledProgress({ label, value }: { label: string, value: number }) {
  return (
    <ProgressBar aria-label={label} value={value} className={styles.progressBar}>
      <ProgressBar.Track className={styles.progressTrack}>
        <ProgressBar.Fill className={styles.progressFill} />
      </ProgressBar.Track>
    </ProgressBar>
  )
}

function SectionHeading({ description, id, title }: { description: string, id?: string, title: string }) {
  return (
    <header className={styles.sectionHeader}>
      <h2 id={id} tabIndex={id ? -1 : undefined} className={styles.sectionTitle}>{title}</h2>
      <p className={styles.sectionDescription}>{description}</p>
    </header>
  )
}
