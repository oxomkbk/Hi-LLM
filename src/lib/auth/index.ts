import 'server-only'

import { randomUUID } from 'node:crypto'

import { APIError, betterAuth } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import { Pool } from 'pg'

import {
  assertEmailAccessAllowedFresh,
  assertRegistrationAllowedFresh,
  EMAIL_NOT_ALLOWED_SENTINEL,
  REGISTRATION_DISABLED_SENTINEL,
  RegistrationPolicyError,
} from '@/lib/access-settings/registration'
import { getAuthSecret, getControlDatabaseUrl, optionalServerEnv } from '@/lib/db/env'
import { createEmailVerificationTemplate, createPasswordResetTemplate } from '@/lib/email/templates'

import { assertAuthEmailReady, sendAuthEmail } from './email'
import {
  MathCaptchaInvalidError,
  MathCaptchaUnavailableError,
  verifyMathCaptcha,
} from './math-captcha'
import { AUTH_MAX_PASSWORD_LENGTH, AUTH_MIN_PASSWORD_LENGTH, isStrongPassword } from './password-policy'
import { getAuthIpAddressConfig } from './trusted-ip'

interface AuthGlobal {
  pool?: Pool
}

const authGlobal = globalThis as typeof globalThis & {
  __hillmNavAuth?: AuthGlobal
}

authGlobal.__hillmNavAuth ??= {}
authGlobal.__hillmNavAuth.pool ??= new Pool({
  application_name: 'hillm-nav-auth',
  connectionString: getControlDatabaseUrl(),
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
  max: 10,
  options: '-c search_path=auth,public',
  statement_timeout: 15_000,
})

const authIpAddress = getAuthIpAddressConfig()

export const auth = betterAuth({
  advanced: {
    database: {
      generateId: () => randomUUID(),
    },
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
    ipAddress: authIpAddress,
  },
  baseURL: optionalServerEnv('BETTER_AUTH_URL') ?? optionalServerEnv('NEXT_PUBLIC_APP_URL'),
  database: authGlobal.__hillmNavAuth.pool,
  databaseHooks: {
    user: {
      create: {
        before: async () => {
          await assertPublicRegistrationAllowed()
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const result = await authGlobal.__hillmNavAuth!.pool!.query<{ status: string }>(
            `select status from auth."user" where id = $1`,
            [session.userId],
          )
          if (result.rows[0]?.status !== 'active') {
            throw new APIError('FORBIDDEN', {
              code: 'USER_DISABLED',
              message: '账号已停用，请联系管理员',
            })
          }
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    maxPasswordLength: AUTH_MAX_PASSWORD_LENGTH,
    minPasswordLength: AUTH_MIN_PASSWORD_LENGTH,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ url, user }) => {
      const template = createPasswordResetTemplate({ actionUrl: url })
      await sendAuthEmail({
        ...template,
        to: user.email,
      })
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ url, user }) => {
      const template = createEmailVerificationTemplate({ actionUrl: url })
      await sendAuthEmail({
        ...template,
        to: user.email,
      })
    },
  },
  hooks: {
    before: createAuthMiddleware(async (context) => {
      if (context.path === '/sign-up/email' || context.path === '/sign-in/email') {
        await assertPublicMathCaptcha(context.headers ?? context.request?.headers)
        const email = readAuthEmail(context.body)
        await assertPublicEmailAccess(email, context.path === '/sign-up/email')
        if (context.path === '/sign-up/email') {
          assertAuthPassword(context.body, 'password')
          await assertPublicRegistrationEmailReady()
        }
      }
      if (context.path === '/change-password' || context.path === '/reset-password' || context.path === '/set-password') {
        assertAuthPassword(context.body, 'newPassword')
      }
      if (context.path === '/update-user') {
        throw new APIError('BAD_REQUEST', {
          code: 'ACCOUNT_PROFILE_ENDPOINT_REQUIRED',
          message: '请通过用户中心更新个人资料',
        })
      }
    }),
  },
  rateLimit: {
    customRules: {
      '/request-password-reset': { max: 3, window: 15 * 60 },
      '/send-verification-email': { max: 3, window: 15 * 60 },
      '/sign-in/email': { max: 5, window: 60 },
      '/sign-up/email': { max: 3, window: 60 * 60 },
    },
    enabled: true,
    max: 100,
    storage: 'database',
    window: 60,
  },
  secret: getAuthSecret(),
  trustedOrigins: [optionalServerEnv('NEXT_PUBLIC_APP_URL'), optionalServerEnv('BETTER_AUTH_URL')]
    .filter((value): value is string => Boolean(value)),
  user: {
    additionalFields: {
      avatarFileId: {
        input: false,
        required: false,
        type: 'string',
      },
      bio: {
        input: false,
        required: false,
        type: 'string',
      },
      canAnswer: {
        defaultValue: true,
        input: false,
        required: true,
        type: 'boolean',
      },
      canAsk: {
        defaultValue: true,
        input: false,
        required: true,
        type: 'boolean',
      },
      canComment: {
        defaultValue: true,
        input: false,
        required: true,
        type: 'boolean',
      },
      canPublishWorks: {
        defaultValue: true,
        input: false,
        required: true,
        type: 'boolean',
      },
      canUpload: {
        defaultValue: true,
        input: false,
        required: true,
        type: 'boolean',
      },
      role: {
        defaultValue: 'user',
        input: false,
        required: true,
        type: ['user', 'admin'],
      },
      status: {
        defaultValue: 'active',
        input: false,
        required: true,
        type: ['active', 'disabled'],
      },
      website: {
        input: false,
        required: false,
        type: 'string',
      },
    },
  },
})

export type AuthSession = typeof auth.$Infer.Session

function assertAuthPassword(body: unknown, field: 'newPassword' | 'password') {
  const password = typeof body === 'object' && body && field in body
    ? (body as Record<string, unknown>)[field]
    : null
  if (typeof password !== 'string' || !isStrongPassword(password)) {
    throw new APIError('BAD_REQUEST', {
      code: 'PASSWORD_POLICY_FAILED',
      message: `密码长度应为 ${AUTH_MIN_PASSWORD_LENGTH}–${AUTH_MAX_PASSWORD_LENGTH} 个字符，且必须包含大小写字母和数字`,
    })
  }
}

async function assertPublicEmailAccess(email: string, registration: boolean) {
  try {
    await assertEmailAccessAllowedFresh(email, { registration })
  }
  catch (error) {
    if (error instanceof RegistrationPolicyError) {
      if (error.code === 'REGISTRATION_DISABLED') {
        throw new APIError('FORBIDDEN', {
          code: REGISTRATION_DISABLED_SENTINEL,
          message: error.message,
        })
      }
      if (error.code === 'EMAIL_NOT_ALLOWED') {
        if (!registration) {
          throw new APIError('UNAUTHORIZED', {
            code: 'INVALID_EMAIL_OR_PASSWORD',
            message: '邮箱、密码或访问权限不正确',
          })
        }
        throw new APIError('FORBIDDEN', {
          code: EMAIL_NOT_ALLOWED_SENTINEL,
          message: error.message,
        })
      }
    }
    throw new APIError('SERVICE_UNAVAILABLE', {
      code: 'ACCESS_POLICY_UNAVAILABLE',
      message: '登录策略暂不可用',
    })
  }
}

async function assertPublicMathCaptcha(headers: Headers | undefined) {
  try {
    await verifyMathCaptcha({
      answer: headers?.get('x-hillm-captcha-answer') ?? null,
      id: headers?.get('x-hillm-captcha-id') ?? null,
    })
  }
  catch (error) {
    if (error instanceof MathCaptchaInvalidError) {
      throw new APIError('BAD_REQUEST', {
        code: error.code,
        message: error.message,
      })
    }
    if (error instanceof MathCaptchaUnavailableError) {
      throw new APIError('SERVICE_UNAVAILABLE', {
        code: error.code,
        message: error.message,
      })
    }
    throw new APIError('SERVICE_UNAVAILABLE', {
      code: 'MATH_CAPTCHA_UNAVAILABLE',
      message: '验证码服务暂时不可用，请稍后重试',
    })
  }
}

async function assertPublicRegistrationAllowed() {
  try {
    await assertRegistrationAllowedFresh()
  }
  catch (error) {
    if (error instanceof RegistrationPolicyError && error.code === 'REGISTRATION_DISABLED') {
      throw new APIError('FORBIDDEN', {
        code: REGISTRATION_DISABLED_SENTINEL,
        message: '注册暂未开放',
      })
    }
    throw new APIError('SERVICE_UNAVAILABLE', {
      code: 'ACCESS_POLICY_UNAVAILABLE',
      message: '注册服务暂不可用',
    })
  }
}

async function assertPublicRegistrationEmailReady() {
  try {
    await assertAuthEmailReady()
  }
  catch {
    throw new APIError('SERVICE_UNAVAILABLE', {
      code: 'EMAIL_NOT_READY',
      message: '注册暂不可用，请先配置邮件服务',
    })
  }
}

function readAuthEmail(body: unknown) {
  if (typeof body !== 'object' || !body || !('email' in body) || typeof body.email !== 'string') {
    throw new APIError('BAD_REQUEST', {
      code: 'EMAIL_REQUIRED',
      message: '请输入邮箱地址',
    })
  }
  return body.email.trim().toLowerCase()
}
