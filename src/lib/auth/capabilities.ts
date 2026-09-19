import 'server-only'

import { getControlPool } from '@/lib/db/control'

export type AccountCapability = 'answer' | 'ask' | 'comment' | 'publish-work' | 'upload'

interface CapabilityRow {
  canAnswer: boolean
  canAsk: boolean
  canComment: boolean
  canPublishWorks: boolean
  canUpload: boolean
  role: 'admin' | 'user'
  status: 'active' | 'disabled'
}

const CAPABILITY_COLUMNS: Record<AccountCapability, keyof Pick<CapabilityRow, 'canAnswer' | 'canAsk' | 'canComment' | 'canPublishWorks' | 'canUpload'>> = {
  'answer': 'canAnswer',
  'ask': 'canAsk',
  'comment': 'canComment',
  'publish-work': 'canPublishWorks',
  'upload': 'canUpload',
}

const CAPABILITY_MESSAGES: Record<AccountCapability, string> = {
  'answer': '回答权限已被管理员关闭',
  'ask': '提问权限已被管理员关闭',
  'comment': '评论权限已被管理员关闭',
  'publish-work': '作品发布权限已被管理员关闭',
  'upload': '图片上传权限已被管理员关闭',
}

export class AccountCapabilityError extends Error {
  constructor(message: string, readonly status = 403, readonly code = 'ACCOUNT_CAPABILITY_DENIED') {
    super(message)
  }
}

export async function requireAccountActive(userId: string) {
  const account = await readCapabilities(userId)
  if (!account || account.status !== 'active')
    throw new AccountCapabilityError('账号不可用，请联系管理员', 403, 'ACCOUNT_DISABLED')
  return account
}

export async function requireAccountCapability(userId: string, capability: AccountCapability) {
  const account = await requireAccountActive(userId)
  if (account.role === 'admin')
    return account
  if (!account[CAPABILITY_COLUMNS[capability]])
    throw new AccountCapabilityError(CAPABILITY_MESSAGES[capability])
  return account
}

async function readCapabilities(userId: string) {
  const result = await getControlPool().query<CapabilityRow>(`
    select
      role,
      status,
      "canAsk" as "canAsk",
      "canAnswer" as "canAnswer",
      "canComment" as "canComment",
      "canPublishWorks" as "canPublishWorks",
      "canUpload" as "canUpload"
    from auth."user"
    where id = $1
  `, [userId])
  return result.rows[0] ?? null
}
