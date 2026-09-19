'use client'

import { useRouter } from '@bprogress/next/app'
import {
  ArrowRight,
  ArrowRotateLeft,
  Check,
  Envelope,
  Eye,
  EyeSlash,
  Lock,
} from '@gravity-ui/icons'
import {
  Button,
  Description,
  FieldError,
  Form,
  InputGroup,
  Label,
  Spinner,
  TextField,
  toast,
} from '@heroui/react'
import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'

import { normalizeAuthCallbackUrl } from '@/lib/auth/callback-url'
import { signIn, signUp } from '@/lib/auth/client'
import { AUTH_MAX_PASSWORD_LENGTH, AUTH_MIN_PASSWORD_LENGTH, isStrongPassword } from '@/lib/auth/password-policy'

import styles from './login.module.css'

import type { IResponse } from '@/types'
import type { FormEvent } from 'react'

interface EmailForm {
  email: string
  password: string
}

interface MathCaptchaChallenge {
  expiresAt: string
  id: string
  question: string
}

export default function LoginForm({
  authError,
  emailAccessMode,
  registrationEnabled,
}: {
  authError?: string
  emailAccessMode: 'allowlist' | 'open'
  registrationEnabled: boolean
}) {
  const router = useRouter()
  const [captcha, setCaptcha] = useState<MathCaptchaChallenge | null>(null)
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [captchaError, setCaptchaError] = useState('')
  const [captchaLoading, setCaptchaLoading] = useState(true)
  const [emailLoading, setEmailLoading] = useState(false)
  const [isSignup, setIsSignup] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const captchaInputRef = useRef<HTMLInputElement>(null)

  const loadCaptcha = useCallback(async (options: { focusAnswer?: boolean, signal?: AbortSignal } = {}) => {
    setCaptchaLoading(true)
    setCaptchaError('')
    try {
      const next = await fetchMathCaptcha(options.signal)
      if (options.signal?.aborted)
        return
      setCaptcha(next)
      setCaptchaAnswer('')
      if (options.focusAnswer) {
        window.requestAnimationFrame(() => captchaInputRef.current?.focus())
      }
    }
    catch (error) {
      if (options.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError'))
        return
      setCaptcha(null)
      setCaptchaAnswer('')
      setCaptchaError(error instanceof Error ? error.message : '验证码暂时无法加载')
    }
    finally {
      if (!options.signal?.aborted)
        setCaptchaLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authError === 'registration-disabled')
      toast.warning('注册暂未开放，已有账号仍可正常登录')
    else if (authError === 'email-not-allowed')
      toast.danger('该邮箱未被授权访问')
  }, [authError])

  useEffect(() => {
    const controller = new AbortController()
    void loadCaptcha({ signal: controller.signal })
    return () => controller.abort()
  }, [isSignup, loadCaptcha])

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form).entries()) as unknown as EmailForm
    const callbackURL = readCallbackUrl()
    if (!captcha || !/^\d{1,3}$/.test(captchaAnswer.trim())) {
      toast.warning('请先完成安全校验')
      if (!captcha)
        void loadCaptcha({ focusAnswer: true })
      return
    }

    const captchaHeaders = {
      'x-hillm-captcha-answer': captchaAnswer.trim(),
      'x-hillm-captcha-id': captcha.id,
    }

    setEmailLoading(true)
    const authPromise = (async () => {
      try {
        const email = data.email.trim().toLowerCase()
        if (isSignup) {
          const { error } = await signUp.email({
            callbackURL,
            email,
            name: email.split('@')[0] || '用户',
            password: data.password,
          }, { headers: captchaHeaders })
          if (error) {
            if (error.code === 'ACCESS_REGISTRATION_DISABLED_V1' || error.code === 'REGISTRATION_DISABLED') {
              setIsSignup(false)
              throw new Error('注册暂未开放，已有账号仍可正常登录')
            }
            if (error.code === 'ACCESS_EMAIL_NOT_ALLOWED_V1' || error.code === 'EMAIL_NOT_ALLOWED')
              throw new Error('该邮箱未被授权访问')
            if (error.code === 'EMAIL_NOT_READY')
              throw new Error('注册服务暂不可用，请先配置邮件服务')
            throw new Error(authErrorMessage(error))
          }
          return
        }

        const { error } = await signIn.email({
          callbackURL,
          email,
          password: data.password,
        }, { headers: captchaHeaders })
        if (error) {
          if (error.code === 'ACCESS_EMAIL_NOT_ALLOWED_V1' || error.code === 'EMAIL_NOT_ALLOWED')
            throw new Error('该邮箱未被授权访问')
          if (error.code === 'INVALID_EMAIL_OR_PASSWORD')
            throw new Error('邮箱、密码或访问权限不正确')
          throw new Error(authErrorMessage(error))
        }
      }
      catch (error) {
        void loadCaptcha({ focusAnswer: true })
        throw error
      }
    })()

    toast.promise(authPromise, {
      error: (error: { message: string }) => {
        setEmailLoading(false)
        return `${isSignup ? '注册失败' : '登录失败'}：${error.message}`
      },
      loading: isSignup ? '正在创建账号…' : '正在验证身份…',
      success: () => {
        setEmailLoading(false)
        if (isSignup) {
          form.reset()
          setIsSignup(false)
          return '账号已创建，请查收验证邮件；未收到时请稍后重试'
        }
        router.push(callbackURL)
        router.refresh()
        return '登录成功'
      },
    })
  }

  const inviteOnly = emailAccessMode === 'allowlist'

  return (
    <div className={`${styles.page} login-page-full`}>
      <section aria-labelledby="login-heading" className={styles.shell}>
        <aside className={styles.introduction}>
          <div className={styles.brand}>
            <span className={styles.logo}>
              <Image
                alt=""
                fill
                priority
                sizes="32px"
                src="/logo-new.png"
                className="object-contain"
              />
            </span>
            <span>{process.env.NEXT_PUBLIC_APP_NAME || 'HI LLM'}</span>
          </div>
          <div className={styles.entryTitle}>
            <span>ADMIN</span>
            <strong>用户中心</strong>
          </div>
          <p className={styles.securityNote}>
            <Lock aria-hidden="true" />
            安全连接
          </p>
        </aside>

        <div className={styles.formPanel}>
          <div className={styles.formHeader}>
            <p className={styles.formEyebrow}>{isSignup ? 'CREATE ACCOUNT' : 'SIGN IN'}</p>
            <h2 id="login-heading">{isSignup ? '创建你的账号' : '邮箱登录'}</h2>
            <p>{isSignup ? '使用工作邮箱完成注册。' : '使用已授权的邮箱进入管理后台。'}</p>
          </div>

          {inviteOnly
            ? (
                <div className={styles.accessNotice}>
                  <Lock aria-hidden="true" />
                  <div>
                    <strong>当前为受限访问</strong>
                    <span>仅已授权邮箱可登录</span>
                  </div>
                </div>
              )
            : null}

          <Form onSubmit={onSubmit} className={styles.form}>
            <TextField
              name="email"
              type="email"
              isRequired
              validate={value => /^[\w.%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value) ? null : '请输入有效的邮箱地址'}
            >
              <Label>邮箱地址</Label>
              <InputGroup variant="secondary" className={styles.inputGroup}>
                <InputGroup.Prefix><Envelope aria-hidden="true" className="size-4 text-muted" /></InputGroup.Prefix>
                <InputGroup.Input
                  aria-label="邮箱地址"
                  autoCapitalize="none"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="name@company.com"
                  spellCheck={false}
                />
              </InputGroup>
              <FieldError />
            </TextField>

            <TextField
              name="password"
              type={showPassword ? 'text' : 'password'}
              isRequired
              maxLength={AUTH_MAX_PASSWORD_LENGTH}
              minLength={isSignup ? AUTH_MIN_PASSWORD_LENGTH : 1}
              validate={(value) => {
                if (!value)
                  return '请输入密码'
                if (value.length > AUTH_MAX_PASSWORD_LENGTH)
                  return `密码长度不能超过 ${AUTH_MAX_PASSWORD_LENGTH} 个字符`
                if (!isSignup)
                  return null
                if (value.length < AUTH_MIN_PASSWORD_LENGTH)
                  return `密码长度应为 ${AUTH_MIN_PASSWORD_LENGTH}–${AUTH_MAX_PASSWORD_LENGTH} 个字符`
                if (!isStrongPassword(value))
                  return '密码必须包含大小写字母和数字'
                return null
              }}
            >
              <Label>密码</Label>
              <InputGroup variant="secondary" className={styles.inputGroup}>
                <InputGroup.Prefix><Lock aria-hidden="true" className="size-4 text-muted" /></InputGroup.Prefix>
                <InputGroup.Input
                  aria-label="密码"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  placeholder="输入登录密码"
                />
                <InputGroup.Suffix className="pr-0">
                  <Button
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    size="sm"
                    variant="ghost"
                    isIconOnly
                    onPress={() => setShowPassword(current => !current)}
                  >
                    {showPassword ? <Eye aria-hidden="true" className="size-4" /> : <EyeSlash aria-hidden="true" className="size-4" />}
                  </Button>
                </InputGroup.Suffix>
              </InputGroup>
              {isSignup ? <Description>使用 6–64 个字符，并包含大小写字母和数字。</Description> : null}
              <FieldError />
            </TextField>

            <TextField
              aria-describedby="math-captcha-question"
              name="captchaAnswer"
              isDisabled={captchaLoading || Boolean(captchaError)}
              isRequired
              validate={value => /^\d{1,3}$/.test(value.trim()) ? null : '请输入正确的整数结果'}
              value={captchaAnswer}
              onChange={value => setCaptchaAnswer(value.replace(/\D/g, '').slice(0, 3))}
              className={styles.captchaField}
            >
              <Label>安全校验</Label>
              <div className={styles.captchaControls}>
                <div
                  aria-label={captcha ? speakMathQuestion(captcha.question) : captchaLoading ? '正在生成安全校验题目' : '安全校验题目未就绪'}
                  aria-live="polite"
                  id="math-captcha-question"
                  data-loading={captchaLoading || undefined}
                  className={styles.captchaQuestion}
                >
                  <span aria-hidden="true">{captcha?.question ?? (captchaLoading ? '正在出题' : '校验未就绪')}</span>
                </div>
                <InputGroup variant="secondary" className={styles.captchaInputGroup}>
                  <InputGroup.Input
                    ref={captchaInputRef}
                    aria-describedby="math-captcha-question"
                    aria-label="安全校验计算结果"
                    autoComplete="off"
                    inputMode="numeric"
                    maxLength={3}
                    placeholder="答案"
                    className={styles.captchaAnswer}
                  />
                </InputGroup>
                <Button
                  aria-label="换一道安全校验题"
                  type="button"
                  size="sm"
                  variant="secondary"
                  isDisabled={captchaLoading || emailLoading}
                  isIconOnly
                  onPress={() => void loadCaptcha({ focusAnswer: true })}
                  className={styles.captchaRefresh}
                >
                  {captchaLoading ? <Spinner color="current" size="sm" /> : <ArrowRotateLeft aria-hidden="true" />}
                </Button>
              </div>
              {captchaError ? <p role="alert" className={styles.captchaError}>{captchaError}</p> : null}
              <FieldError />
            </TextField>

            <Button
              type="submit"
              isDisabled={emailLoading || captchaLoading || !captcha}
              isPending={emailLoading}
              className={styles.submitButton}
            >
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : isSignup ? <Check aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
                  {isPending ? (isSignup ? '正在注册…' : '正在登录…') : (isSignup ? '创建账号' : '进入工作台')}
                </>
              )}
            </Button>
          </Form>

          <div className={styles.accountSwitch}>
            {registrationEnabled
              ? (
                  <>
                    <span>{isSignup ? '已经有账号？' : '还没有账号？'}</span>
                    <button type="button" onClick={() => setIsSignup(current => !current)}>
                      {isSignup ? '返回登录' : '使用邮箱注册'}
                    </button>
                  </>
                )
              : <span>新账号注册暂未开放，请联系管理员。</span>}
          </div>
        </div>
      </section>
    </div>
  )
}

function authErrorMessage(error: { code?: string, message?: string }) {
  if (error.code === 'MATH_CAPTCHA_INVALID')
    return '验证码错误或已失效，请重新计算'
  if (error.code === 'MATH_CAPTCHA_UNAVAILABLE')
    return '验证码服务暂时不可用，请稍后重试'
  return error.message || '认证请求失败'
}

async function fetchMathCaptcha(signal?: AbortSignal) {
  const response = await fetch('/api/auth/math-challenge', {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    method: 'POST',
    signal,
  })
  const result = await response.json().catch(() => null) as IResponse<MathCaptchaChallenge> | null
  if (!response.ok || !result?.data)
    throw new Error(result?.msg || '验证码暂时无法加载')
  return result.data
}

function readCallbackUrl() {
  if (typeof window === 'undefined')
    return '/'
  const value = new URLSearchParams(window.location.search).get('callbackURL')
  return normalizeAuthCallbackUrl(value, { fallback: '/', origin: window.location.origin })
}

function speakMathQuestion(question: string) {
  return `${question
    .replace(' + ', ' 加 ')
    .replace(' − ', ' 减 ')
    .replace(' × ', ' 乘以 ')
    .replace(' ÷ ', ' 除以 ')
    .replace(' =', '')} 等于多少`
}
